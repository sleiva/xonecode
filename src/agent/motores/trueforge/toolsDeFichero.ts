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
import micromatch from "micromatch";
import { toolResultResponse } from "@truefoundry/trueforge-core/core";

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
  write_file: { descripcion: "Writes a NEW file with the given content.", propiedades: { file_path: cadena, content: cadena }, obligatorias: ["file_path", "content"] },
  edit_file: {
    descripcion: "Replaces old_string with new_string in a file. old_string must match exactly.",
    propiedades: { file_path: cadena, old_string: cadena, new_string: cadena, replace_all: { type: "boolean" } },
    obligatorias: ["file_path", "old_string", "new_string"],
  },
  glob: { descripcion: "Finds files matching a glob pattern.", propiedades: { pattern: cadena, path: cadena }, obligatorias: ["pattern"] },
  grep: { descripcion: "Searches file contents for a literal pattern.", propiedades: { pattern: cadena, path: cadena, glob: cadena }, obligatorias: ["pattern"] },
};

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

/** Lo que el backend contestó, en el texto que ve el modelo. */
async function ejecutar(backend: BackendDeFicheros, nombre: ToolDeFichero, args: Record<string, unknown>): Promise<{ texto: string; error: boolean }> {
  const s = (v: unknown): string => (typeof v === "string" ? v : "");
  switch (nombre) {
    case "ls": {
      const r = (await backend.ls(s(args.path) || "/")) as Resultado & { files?: { path: string; is_dir?: boolean }[] };
      if (r.error !== undefined) return { texto: r.error, error: true };
      return { texto: (r.files ?? []).map((f) => (f.is_dir === true ? `${f.path}/` : f.path)).join("\n") || "(vacío)", error: false };
    }
    case "read_file": {
      const offset = typeof args.offset === "number" && args.offset > 0 ? Math.floor(args.offset) : 0;
      const limit = typeof args.limit === "number" && args.limit > 0 ? Math.floor(args.limit) : 100;
      const r = (await backend.read(s(args.file_path), offset, limit)) as Resultado & { content?: unknown };
      if (r.error !== undefined) return { texto: r.error, error: true };
      if (typeof r.content !== "string") return { texto: "fichero binario: no se puede leer como texto", error: true };
      return { texto: numerado(r.content, offset + 1), error: false };
    }
    case "write_file": {
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
      return { texto: (r.files ?? []).map((f) => f.path).join("\n") || "(ninguno)", error: false };
    }
    case "grep": {
      const r = (await backend.grep(s(args.pattern), s(args.path) || "/", s(args.glob) || null)) as Resultado & {
        matches?: { path: string; line: number; text: string }[];
      };
      if (r.error !== undefined) return { texto: r.error, error: true };
      return { texto: (r.matches ?? []).map((m) => `${m.path}:${m.line}: ${m.text}`).join("\n") || "(sin coincidencias)", error: false };
    }
  }
}

/**
 * El `ToolSource` de TrueForge con las seis tools. La aprobación NO se decide aquí: la pone el
 * `ToolSet` que lo envuelve (`requireApprovalForTools`), y la tool solo corre tras el «sí».
 */
export function fuenteDeFicheros(opciones: { backend: BackendDeFicheros; reglas: readonly ReglaDeRuta[] }) {
  const esDeFichero = (n: string): n is ToolDeFichero => (TOOLS_DE_FICHERO as readonly string[]).includes(n);
  return {
    name: "xone",
    id: "xone",
    listTools: async () => ({
      result: {
        tools: TOOLS_DE_FICHERO.map((n) => ({
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
      const args = params.arguments ?? {};
      const { ruta, operacion } = objetivoDe(params.name, args);
      if (ruta === "") return toolResultResponse({ text: "falta la ruta del fichero", isError: true });
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
