/**
 * Las tools de fichero del motor TrueForge, sobre NUESTRO backend.
 *
 * TrueForge no trae tools de fichero: el `ToolSource` que se le pasa es el que lee y escribe.
 * Así que aquí se hacen las seis de deepagents —`ls`, `read_file`, `write_file`, `edit_file`,
 * `glob`, `grep`—, con sus mismos nombres y argumentos, para que un prompt que las nombra valga
 * con los dos motores, y **delegando en el mismo backend** (`backendDeAgente`): con eso las
 * guardas que viven en su pila de Proxies —el confinamiento virtual, las vistas aplanadas, los
 * artefactos y descargas fuera del proyecto, las escrituras en serie por fichero, la validación
 * del contenido, los montajes de `/skills/`, `/artefactos/`, `/adjuntos/`— van gratis.
 *
 * **Lo que NO va gratis es `permisosDe`**: en deepagents es middleware, no Proxy, así que aquí
 * nadie denegaría `/.env`, `/.git`, `/.xonecode` ni escribir en `/skills/` o `/adjuntos/`. Se
 * evalúan las MISMAS reglas (`perfiles.ts#permisosDe`, que las compone) con la misma semántica
 * que la librería —la primera que casa decide, y si no casa ninguna se permite— y con el mismo
 * `micromatch` y opciones. No es una segunda copia de la regla: la regla sigue siendo la lista
 * de `permisosDe`; esto solo la evalúa donde el middleware no llega.
 *
 * Un rechazo se DEVUELVE como resultado de error y nunca se lanza: el modelo lo lee y reintenta,
 * que es la regla de las guardas del backend.
 */
import { posix } from "node:path";
import micromatch from "micromatch";
import { toolResultResponse } from "./trueforge.js";
import { REGLA_DE_ESCRITURAS_EN_PARALELO } from "../../../core/serieDeEscrituras.js";
import { desalojarSiGrande, MAXIMO_DE_COINCIDENCIAS, truncarSiLargo } from "./recortes.js";
import { motivoDeTasksInaceptable, RUTA_DE_TASKS } from "../../../core/tareasDelPlan.js";
import { motivoDeComandoRechazado } from "../../../core/shellDeAgente.js";

/** El backend de deepagents en su versión nueva, en lo que se usa. */
export interface BackendDeFicheros {
  ls(ruta: string): unknown;
  read(ruta: string, offset?: number, limit?: number): unknown;
  write(ruta: string, contenido: string): unknown;
  edit(ruta: string, viejo: string, nuevo: string, todas?: boolean): unknown;
  glob(patron: string, ruta?: string): unknown;
  grep(patron: string, ruta?: string | null, glob?: string | null): unknown;
}

/** Una regla de `permisosDe`, tal cual la escribe. */
export interface ReglaDeRuta {
  operations: readonly ("read" | "write")[];
  paths: readonly string[];
  mode?: "allow" | "deny";
}

/** La misma decisión que `decidePathAccess` de deepagents: primera que casa, y permitir por
 *  omisión. Con `micromatch` y `dot: true`, que es como la librería compara. */
export function decidirAccesoDeRuta(reglas: readonly ReglaDeRuta[], operacion: "read" | "write", ruta: string): "allow" | "deny" {
  for (const regla of reglas) {
    if (!regla.operations.includes(operacion)) continue;
    if (regla.paths.some((p) => micromatch.isMatch(ruta, p, { dot: true }))) return regla.mode ?? "allow";
  }
  return "allow";
}

/** Las seis tools y lo que cada una toca, para decidir el permiso antes de llamar al backend. */
export const TOOLS_DE_FICHERO = ["ls", "read_file", "write_file", "edit_file", "glob", "grep"] as const;
export type ToolDeFichero = (typeof TOOLS_DE_FICHERO)[number];

/** Las que ESCRIBEN: son las que piden aprobación, igual que el HITL de deepagents. */
export const TOOLS_QUE_ESCRIBEN: readonly ToolDeFichero[] = ["write_file", "edit_file"];

const cadena = { type: "string" } as const;
const ESQUEMAS: Record<ToolDeFichero, { descripcion: string; propiedades: Record<string, unknown>; obligatorias: string[] }> = {
  ls: { descripcion: "Lists files and directories in a directory (non-recursive).", propiedades: { path: cadena }, obligatorias: ["path"] },
  read_file: {
    descripcion: "Reads a file. Returns its lines numbered. Use offset/limit to page through long files.",
    propiedades: { file_path: cadena, offset: { type: "number" }, limit: { type: "number" } },
    obligatorias: ["file_path"],
  },
  write_file: {
    descripcion: `Writes a NEW file with the given content. An existing .xne, .js or .css is refused: change it with edit_file. ${REGLA_DE_ESCRITURAS_EN_PARALELO}`,
    propiedades: { file_path: cadena, content: cadena },
    obligatorias: ["file_path", "content"],
  },
  edit_file: {
    descripcion: `Replaces old_string with new_string in a file. old_string must match exactly. ${REGLA_DE_ESCRITURAS_EN_PARALELO}`,
    propiedades: { file_path: cadena, old_string: cadena, new_string: cadena, replace_all: { type: "boolean" } },
    obligatorias: ["file_path", "old_string", "new_string"],
  },
  glob: { descripcion: "Finds files matching a glob pattern.", propiedades: { pattern: cadena, path: cadena }, obligatorias: ["pattern"] },
  grep: { descripcion: "Searches file contents for a literal pattern.", propiedades: { pattern: cadena, path: cadena, glob: cadena }, obligatorias: ["pattern"] },
};

/**
 * La ruta VIRTUAL que el backend entiende, desde lo que escriba el modelo. Medido en la primera
 * sesión real: el modelo pidió `ls .` y `read_file MEMORIA_PROYECTO.md`, sin la barra, y el
 * backend —que solo sabe de rutas absolutas del espacio virtual— contestó «no existe» sobre un
 * fichero que sí está; el agente acabó barriendo los `.xne` a mano. Vacía o `.` es la raíz, y
 * lo relativo cuelga de ella.
 *
 * **Se normaliza ANTES de evaluar los permisos**, y es lo que importa: las reglas de `permisosDe`
 * están escritas sobre rutas absolutas (`/.env`), así que una relativa (`.env`) no casaría con
 * ninguna y pasaría. Y una que se sale de la raíz con `..` no es una ruta del proyecto: `undefined`,
 * que quien llama rechaza — lo mismo que hace deepagents.
 */
export function normalizarRuta(bruta: string): string | undefined {
  const limpia = bruta.trim();
  if (limpia === "" || limpia === ".") return "/";
  const absoluta = limpia.startsWith("/") ? limpia : `/${limpia.replace(/^\.\//, "")}`;
  if (absoluta.split("/").includes("..")) return undefined;
  const normal = posix.normalize(absoluta);
  return normal.length > 1 && normal.endsWith("/") ? normal.slice(0, -1) : normal;
}

/** La ruta de la que habla cada tool, y si es para leer o para escribir. */
function objetivoDe(nombre: ToolDeFichero, args: Record<string, unknown>): { ruta: string; operacion: "read" | "write" } {
  const texto = (v: unknown, omision = "/"): string => (typeof v === "string" && v !== "" ? v : omision);
  switch (nombre) {
    case "ls":
      return { ruta: texto(args.path), operacion: "read" };
    case "read_file":
      return { ruta: texto(args.file_path, ""), operacion: "read" };
    case "write_file":
    case "edit_file":
      return { ruta: texto(args.file_path, ""), operacion: "write" };
    case "glob":
    case "grep":
      return { ruta: texto(args.path), operacion: "read" };
  }
}

/** El contenido de un fichero, numerado como lo numera deepagents (6 de ancho y un tabulador). */
function numerado(contenido: string, desde: number): string {
  const lineas = contenido.split("\n");
  if (lineas.length > 0 && lineas[lineas.length - 1] === "") lineas.pop();
  return lineas.map((l, i) => `${String(i + desde).padStart(6)}\t${l}`).join("\n");
}

type Resultado = { error?: string; [k: string]: unknown };

/**
 * Las líneas que devuelve un `read_file` sin `limit`, y el tope de caracteres que las acota. Eran 100, el valor de
 * deepagents copiado al adaptador, y medido en una pasada real (calc10): un fichero de 450 líneas se leía en tres o
 * cuatro páginas, y las lecturas por página eran la mayoría de las «relecturas» de la traza. opencode devuelve hasta
 * 2.000 líneas o 50 KB; aquí lo mismo, y lo que no cabe se DICE con el `offset` por donde seguir.
 */
export const LINEAS_POR_LECTURA = 2_000;
export const CARACTERES_POR_LECTURA = 50_000;

/**
 * Los ficheros de CÓDIGO del proyecto que `write_file` no reescribe si ya existen: se cambian con `edit_file`.
 *
 * Medido en calc10: `MenuPrincipal.xne` se reescribió ENTERO cinco veces, alternando el diseñador y el desarrollador,
 * y cada vez quien reescribía lo había leído entero antes —así que «leer antes de escribir» no habría parado ninguna—.
 * Reescribir es volver a teclear lo que puso el otro, y lo que se cae por el camino no da error. Es el reparto del editor
 * de aider (`editor-diff`), de Codex (`apply_patch`) y de Claude Code (`Edit` por ancla). Solo el código: un SVG, un plan
 * o un artefacto se regeneran enteros con razón, y `/artefactos/`, `/planes/`, `/hotswap/` no son del proyecto.
 */
const EXTENSIONES_QUE_SE_EDITAN = /\.(xne|js|css)$/i;
const FUERA_DEL_PROYECTO = /^\/(artefactos|planes|hotswap|large_tool_results|conversation_history)\//;

export function seReescribeConEdit(ruta: string): boolean {
  return EXTENSIONES_QUE_SE_EDITAN.test(ruta) && !FUERA_DEL_PROYECTO.test(ruta);
}

export function textoDeReescrituraRechazada(ruta: string): string {
  return (
    `write_file solo crea ficheros nuevos, y ${ruta} ya existe: reescribirlo entero se llevaría lo que otro haya cambiado. ` +
    "Cámbialo con edit_file: old_string copiado EXACTO del fichero actual (reléelo si no lo tienes delante) y new_string; " +
    "para varios cambios, varias ediciones."
  );
}

/** ¿Existe ya? Se pregunta al MISMO backend, con una lectura de una línea: un error es que no (y si era otra cosa, la escritura lo dirá). */
async function existe(backend: BackendDeFicheros, ruta: string): Promise<boolean> {
  try {
    const r = (await backend.read(ruta, 0, 1)) as Resultado;
    return r.error === undefined;
  } catch {
    return false;
  }
}

/** El contenido numerado, cortado por una LÍNEA entera si pasa del tope de caracteres, diciendo por dónde seguir. */
export function lecturaAcotada(contenido: string, desde: number, tope = CARACTERES_POR_LECTURA): string {
  const texto = numerado(contenido, desde);
  if (texto.length <= tope) return texto;
  const corte = texto.lastIndexOf("\n", tope);
  const cabe = corte > 0 ? texto.slice(0, corte) : texto.slice(0, tope);
  const lineas = cabe.split("\n").length;
  return `${cabe}\n... [lectura cortada a ${tope} caracteres: sigue con offset=${desde - 1 + lineas}]`;
}

/** Lo que el backend contestó, en el texto que ve el modelo. */
async function ejecutar(backend: BackendDeFicheros, nombre: ToolDeFichero, args: Record<string, unknown>): Promise<{ texto: string; error: boolean }> {
  const s = (v: unknown): string => (typeof v === "string" ? v : "");
  switch (nombre) {
    case "ls": {
      const r = (await backend.ls(s(args.path) || "/")) as Resultado & { files?: { path: string; is_dir?: boolean }[] };
      if (r.error !== undefined) return { texto: r.error, error: true };
      return { texto: truncarSiLargo((r.files ?? []).map((f) => (f.is_dir === true ? `${f.path}/` : f.path)).join("\n")) || "(vacío)", error: false };
    }
    case "read_file": {
      const offset = typeof args.offset === "number" && args.offset > 0 ? Math.floor(args.offset) : 0;
      const limit = typeof args.limit === "number" && args.limit > 0 ? Math.floor(args.limit) : LINEAS_POR_LECTURA;
      const r = (await backend.read(s(args.file_path), offset, limit)) as Resultado & { content?: unknown };
      if (r.error !== undefined) return { texto: r.error, error: true };
      if (typeof r.content !== "string") return { texto: "fichero binario: no se puede leer como texto", error: true };
      return { texto: lecturaAcotada(r.content, offset + 1), error: false };
    }
    case "write_file": {
      if (seReescribeConEdit(s(args.file_path)) && (await existe(backend, s(args.file_path)))) {
        return { texto: textoDeReescrituraRechazada(s(args.file_path)), error: true };
      }
      // Un TASKS.md sin casillas no se escribe: sin ellas no hay nada que marcar al comprobar (`motivoDeTasksInaceptable`).
      if (RUTA_DE_TASKS.test(s(args.file_path))) {
        const motivo = motivoDeTasksInaceptable(s(args.content));
        if (motivo !== undefined) return { texto: motivo, error: true };
      }
      const r = (await backend.write(s(args.file_path), s(args.content))) as Resultado;
      if (r.error !== undefined) return { texto: r.error, error: true };
      return { texto: `Successfully wrote to ${s(args.file_path)}`, error: false };
    }
    case "edit_file": {
      const r = (await backend.edit(s(args.file_path), s(args.old_string), s(args.new_string), args.replace_all === true)) as Resultado & {
        occurrences?: number;
      };
      if (r.error !== undefined) return { texto: r.error, error: true };
      return { texto: `Successfully replaced ${r.occurrences ?? 1} occurrence(s) in ${s(args.file_path)}`, error: false };
    }
    case "glob": {
      const r = (await backend.glob(s(args.pattern), s(args.path) || "/")) as Resultado & { files?: { path: string }[] };
      if (r.error !== undefined) return { texto: r.error, error: true };
      return { texto: truncarSiLargo((r.files ?? []).map((f) => f.path).join("\n")) || "(ninguno)", error: false };
    }
    case "grep": {
      const r = (await backend.grep(s(args.pattern), s(args.path) || "/", s(args.glob) || null)) as Resultado & {
        matches?: { path: string; line: number; text: string }[];
      };
      if (r.error !== undefined) return { texto: r.error, error: true };
      // El tope de coincidencias y el truncado de deepagents (`recortes.ts`): sin ellos un `grep`
      // sobre la raíz metía cientos de líneas que se reenviaban en cada llamada siguiente.
      const todas = r.matches ?? [];
      const lineas = todas.slice(0, MAXIMO_DE_COINCIDENCIAS).map((m) => `${m.path}:${m.line}: ${m.text}`);
      const resto = todas.length > MAXIMO_DE_COINCIDENCIAS ? `\n... [${todas.length - MAXIMO_DE_COINCIDENCIAS} coincidencias más: afina el patrón o la ruta]` : "";
      return { texto: truncarSiLargo(lineas.join("\n") + resto) || "(sin coincidencias)", error: false };
    }
  }
}

/**
 * El `ToolSource` de TrueForge con las seis tools. La aprobación NO se decide aquí: la pone el
 * `ToolSet` que lo envuelve (`requireApprovalForTools`), y la tool solo corre tras el «sí».
 */
export function fuenteDeFicheros(opciones: {
  backend: BackendDeFicheros;
  reglas: readonly ReglaDeRuta[];
  /** Cuáles se ofrecen. Ausente = las seis. El `device-controller` no escribe ficheros: ejecuta. */
  tools?: readonly ToolDeFichero[];
}) {
  const ofrecidas = opciones.tools ?? TOOLS_DE_FICHERO;
  const esDeFichero = (n: string): n is ToolDeFichero => (ofrecidas as readonly string[]).includes(n);
  return {
    name: "xone",
    id: "xone",
    listTools: async () => ({
      result: {
        tools: ofrecidas.map((n) => ({
          name: n,
          description: ESQUEMAS[n].descripcion,
          inputSchema: { type: "object" as const, properties: ESQUEMAS[n].propiedades, required: ESQUEMAS[n].obligatorias },
          preload: true,
        })),
      },
      wasInitialized: undefined,
    }),
    callTool: async (params: { name: string; arguments?: Record<string, unknown> }) => {
      if (!esDeFichero(params.name)) return toolResultResponse({ text: `tool desconocida: ${params.name}`, isError: true });
      const crudos = params.arguments ?? {};
      const { ruta: bruta, operacion } = objetivoDe(params.name, crudos);
      if (bruta === "") return toolResultResponse({ text: "falta la ruta del fichero", isError: true });
      const ruta = normalizarRuta(bruta);
      if (ruta === undefined) {
        return toolResultResponse({ text: `ruta fuera del proyecto: ${bruta}`, isError: true });
      }
      // Los argumentos que llegan al backend llevan la ruta YA normalizada: la misma que se
      // acaba de autorizar, y no otra.
      const campo = params.name === "ls" || params.name === "glob" || params.name === "grep" ? "path" : "file_path";
      const args = { ...crudos, [campo]: ruta };
      if (decidirAccesoDeRuta(opciones.reglas, operacion, ruta) === "deny") {
        return toolResultResponse({ text: `permission denied: ${operacion} ${ruta}`, isError: true });
      }
      try {
        const { texto, error } = await ejecutar(opciones.backend, params.name, args);
        return toolResultResponse({ text: texto, isError: error });
      } catch (e) {
        // Un backend que LANZA no tumba el turno: se le devuelve al modelo, como las guardas.
        return toolResultResponse({ text: e instanceof Error ? e.message : String(e), isError: true });
      }
    },
    toolCallInfo: async (params: { name: string }) => ({
      type: "mcp" as const,
      mcp_server_id: "xone",
      mcp_server_name: "xone",
      original_tool_name: params.name,
    }),
  };
}


/** Las que solo LEEN: las que lleva un subagente que no escribe el proyecto. */
export const TOOLS_DE_LECTURA: readonly ToolDeFichero[] = ["ls", "read_file", "glob", "grep"];

/** Lo que devuelve la shell de deepagents (`ExecuteResponse`), en lo que se usa. */
interface BackendQueEjecuta {
  execute(comando: string): unknown;
  /** Para desalojar una salida grande a `/large_tool_results/`, como deepagents. */
  write(ruta: string, contenido: string): unknown;
}

/**
 * `execute`: la shell del `device-controller`, sobre el MISMO backend que le monta deepagents
 * (`backendDeAgente` con `ejecucion`), así que su entorno —los scripts de las skills en el PATH, sin
 * las claves de API, con el fichero del dispositivo de la sesión— y el anuncio de los artefactos que
 * deje un comando son los de siempre.
 *
 * **Solo la lleva UN agente**, como en deepagents: una shell no pasa por `permisosDe` ni por la
 * aprobación, así que no se le da al que escribe el proyecto. Y no pregunta antes de cada comando:
 * lo que lo compensa es que el comando entero se VE en el chat (`resumenDeTool.ts` lo tiene en su
 * lista blanca).
 */
export function fuenteDeEjecucion(backend: BackendQueEjecuta) {
  return {
    name: "shell",
    id: "shell",
    listTools: async () => ({
      result: {
        tools: [
          {
            name: "execute",
            description:
              "Runs a shell command in the project root and returns its output and exit code. Use the xone-* scripts of your skills.",
            inputSchema: { type: "object" as const, properties: { command: { type: "string" } }, required: ["command"] },
            preload: true,
          },
        ],
      },
      wasInitialized: undefined,
    }),
    callTool: async (params: { name: string; arguments?: Record<string, unknown> }) => {
      const comando = params.arguments?.command;
      if (params.name !== "execute" || typeof comando !== "string" || comando.trim() === "") {
        return toolResultResponse({ text: "execute necesita un `command`", isError: true });
      }
      // Una búsqueda por el disco entero no se lanza (`motivoDeComandoRechazado`): se devuelve el camino bueno.
      const rechazo = motivoDeComandoRechazado(comando);
      if (rechazo !== undefined) return toolResultResponse({ text: rechazo, isError: true });
      try {
        const r = (await backend.execute(comando)) as { output?: string; exitCode?: number | null; truncated?: boolean };
        const salida = `${r.output ?? ""}${r.truncated === true ? "\n[salida truncada]" : ""}`;
        const codigo = r.exitCode ?? 0;
        const texto = await desalojarSiGrande(`${salida}\n[exit code ${codigo}]`, backend);
        return toolResultResponse({ text: texto, isError: codigo !== 0 });
      } catch (e) {
        return toolResultResponse({ text: e instanceof Error ? e.message : String(e), isError: true });
      }
    },
    toolCallInfo: async (params: { name: string }) => ({
      type: "mcp" as const,
      mcp_server_id: "shell",
      mcp_server_name: "shell",
      original_tool_name: params.name,
    }),
  };
}
