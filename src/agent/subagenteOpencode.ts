/**
 * OpenCode como subagente: un turno contra `opencode acp`.
 *
 * **Todo lo de aquí está MEDIDO contra el binario real (opencode 1.18.27, 11-09-2026), no
 * deducido.** De las tres superficies que ofrece —`run --format json`, el servidor HTTP de
 * `serve`, y ACP— se usa **ACP** (Agent Client Protocol): es JSON-RPC 2.0 por línea sobre
 * stdio, o sea el mismo molde que `subagenteCodex.ts`, y es la única de las tres que da un
 * portón de permiso por stdio. `run` no lo tiene y `serve` es otro transporte entero.
 *
 * El baile: `initialize` → `session/new {cwd, mcpServers}` → `session/prompt {sessionId,
 * prompt:[{type:"text"}]}`. Por el camino llegan `session/update` con el razonamiento, el
 * texto, las tools y el consumo, y el agente nos hace peticiones —`session/request_permission`
 * y las `fs/*`—.
 *
 * **Y da MÁS que los otros dos motores**: su petición de permiso trae la ruta y el antes y el
 * después en el MISMO mensaje, así que no hace falta ni registro de items (Codex manda solo un
 * `itemId`) ni parser de hunks. La traducción vive en `escrituraDeOpencode.ts`.
 *
 * ## Las TRES puertas por las que el proyecto podía mandar, y cómo se cierran
 *
 * Esto es lo que decide si esta integración se puede tener, y las tres están medidas contra un
 * proyecto que las llevaba a la vez:
 *
 * 1. **Un `opencode.json` DEL PROYECTO pisa nuestra configuración.** Medido: leyó el `.env` y
 *    soltó el secreto, corrió shell y escribió con CERO peticiones de permiso. Ese fichero
 *    puede venir de CloudStudio — es la misma amenaza que `settingSources: ["user"]` cierra
 *    para Claude Code.
 * 2. **Un PLUGIN del proyecto** (`.opencode/plugin/*.ts`) **ejecuta código arbitrario** dentro
 *    del proceso de opencode, y desde ahí engancha sus hooks. Medido con su control: sin la
 *    variable corre; con ella, no.
 * 3. **La configuración GLOBAL del usuario también nos pisa**, así que `OPENCODE_CONFIG` es el
 *    eslabón débil y no se puede sostener nada encima: alguien con `edit: "allow"` en su
 *    `~/.config` mataría la aprobación en silencio.
 *
 * Las tres se cierran con `OPENCODE_CONFIG_DIR` apuntando a una carpeta NUESTRA (que pasa a
 * ser «la global», y por eso gana) más `OPENCODE_DISABLE_PROJECT_CONFIG=1`. Las credenciales
 * del usuario siguen resolviendo: su `auth.json` vive en el directorio de DATOS y no en el de
 * configuración, así que mudar éste no le desautentica. **`OPENCODE_CONFIG` no se usa**, a
 * propósito: es el que pierde.
 *
 * ## Lo que NO se puede guardar, y está declarado
 *
 * **La LECTURA se guarda por PATRÓN y no por código**, que es más flojo que en Claude Code. El
 * motivo está medido: la petición de permiso de un `kind: "read"` llega con `locations: []` y
 * `rawInput: {}` —sin ruta—, así que no hay nada que pasarle a una guarda; la ruta solo aparece
 * en el `tool_call_update` posterior, cuando el permiso ya se concedió. Con `edit` no pasa: ése
 * sí trae ruta y diff. Así que queda entre los otros dos: mejor que Codex, que no puede guardar
 * la lectura de ninguna forma, y peor que Claude Code, donde la decide `veredictoDeLectura`.
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PeticionExterna, PoliticaDeEscrituraExterna } from "../core/ports.js";
import { consumoDeOpencode } from "./consumoExterno.js";
import { decisionDeEscrituraDeOpencode } from "./escrituraDeOpencode.js";

/** El binario. `OPENCODE_BIN` gana, igual que `CODEX_BIN` en el otro motor. */
export function binarioDeOpencode(): string {
  const puesto = process.env["OPENCODE_BIN"];
  return puesto !== undefined && puesto.trim() !== "" ? puesto : "opencode";
}

/** La carpeta de configuración que gobernamos. Fuera del proyecto, a propósito. */
export function carpetaDeConfigDeOpencode(base?: string): string {
  return join(base ?? join(homedir(), ".xonecode"), "opencode");
}

/** Diez minutos, igual que Codex, y por lo mismo: un hijo colgado colgaría el turno. */
const TOPE_MS = 10 * 60 * 1000;

/**
 * La configuración con la que corre el hijo. **Es pura y por eso se puede probar entera.**
 *
 * Lo que deniega, y por qué cada uno:
 * - `bash`: medido, no lo deniega — **le quita la tool**: «No tengo un tool de shell en este
 *   entorno». Es el análogo de la lista de tools denegadas del otro motor, y hace falta porque
 *   un comando escribe el proyecto entero sin diff que mirar.
 * - `webfetch` y `websearch`: sacan el proyecto de la máquina.
 * - `external_directory`: escribir o leer fuera de la carpeta. Medido contra `/tmp`.
 * - `task`: un hijo suyo sería una segunda superficie de permisos sin medir. Se abrirá cuando
 *   se mida, no antes.
 * - `question`: pregunta a una persona que aquí no hay.
 * - `read`: una lista de patrones, porque su permiso no trae la ruta (ver la cabecera). Las
 *   **vistas aplanadas entran una a una**, con su ruta, porque «es un `.xml` que tiene un
 *   `.xne` al lado» no se puede escribir como un patrón — y si el agente las ve, edita el
 *   fichero equivocado y el cambio se pierde en la siguiente compilación.
 * - `edit`: `ask`, que es lo que hace que cada escritura pase por `pedirAprobacion`.
 */
export function configuracionDeOpencode(opciones: {
  vistasAplanadas?: readonly string[];
  modelo?: string;
}): string {
  const negadas: Record<string, string> = {
    "**/.env": "deny",
    "**/.env.*": "deny",
    "**/.git/**": "deny",
    "**/.xonecode/**": "deny",
  };
  for (const vista of opciones.vistasAplanadas ?? []) negadas[`**${vista}`] = "deny";
  return `${JSON.stringify(
    {
      $schema: "https://opencode.ai/config.json",
      ...(opciones.modelo === undefined ? {} : { model: opciones.modelo }),
      permission: {
        // El orden importa: lo permitido primero y las denegaciones después, que es como se
        // midió que gana la regla más específica.
        read: { "*": "allow", ...negadas },
        edit: "ask",
        bash: "deny",
        webfetch: "deny",
        websearch: "deny",
        external_directory: "deny",
        task: "deny",
        question: "deny",
      },
    },
    null,
    2
  )}\n`;
}

/** ¿Está el binario? Se pregunta lanzándolo, que es la única respuesta que no miente. */
export async function opencodeDisponible(): Promise<boolean> {
  return new Promise((resolver) => {
    let hijo: ReturnType<typeof spawn>;
    try {
      hijo = spawn(binarioDeOpencode(), ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      resolver(false);
      return;
    }
    // El `error` del spawn hay que escucharlo o un binario que no existe se lleva el proceso.
    hijo.on("error", () => resolver(false));
    hijo.on("close", (codigo) => resolver(codigo === 0));
  });
}

/** Cómo se llama aquí cada tool, para que el colapsador la agrupe con las de todos. */
const NOMBRE_CANONICO: Record<string, string> = {
  read: "read_file",
  write: "write_file",
  edit: "edit_file",
  glob: "glob",
  grep: "grep",
  list: "ls",
};

interface Mensaje {
  id?: number | string;
  method?: string;
  result?: unknown;
  error?: { code?: number; message?: string };
  params?: Record<string, unknown>;
}

export async function correrOpencode(
  peticion: PeticionExterna,
  opciones: {
    alConsumir?: (consumo: { entrada: number; salida: number; cache: number }) => void;
    aprobar?: PoliticaDeEscrituraExterna;
    ficheros?: () => ReadonlySet<string>;
    /** Las vistas aplanadas del proyecto, con su ruta VIRTUAL, para denegarles la lectura. */
    vistasAplanadas?: () => readonly string[];
    real?: (ruta: string) => string;
    alUsarTool?: (tool: { nombre: string; detalle?: string }) => void;
    /** La casa de xonecode. Entra por parámetro porque esto escribe en disco. */
    casa?: string;
  } = {}
): Promise<string> {
  const carpeta = carpetaDeConfigDeOpencode(opciones.casa);
  mkdirSync(carpeta, { recursive: true });
  // Se REESCRIBE en cada arranque a propósito: así no puede quedarse una configuración vieja
  // —más permisiva— de una versión anterior de xonecode.
  writeFileSync(
    join(carpeta, "opencode.json"),
    configuracionDeOpencode({
      vistasAplanadas: opciones.vistasAplanadas?.() ?? [],
      ...(peticion.modelo === undefined ? {} : { modelo: peticion.modelo }),
    }),
    { mode: 0o600 }
  );

  const hijo = spawn(binarioDeOpencode(), ["acp", "--cwd", peticion.cwd], {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: peticion.cwd,
    env: {
      ...process.env,
      OPENCODE_CONFIG_DIR: carpeta,
      OPENCODE_DISABLE_PROJECT_CONFIG: "1",
    },
  });

  return new Promise<string>((cumplir, fallar) => {
    let buffer = "";
    let sesion: string | undefined;
    let terminado = false;
    let rechazadas = 0;
    const texto: string[] = [];
    let aprobando = 0;
    let reloj: ReturnType<typeof setTimeout> | undefined;
    /** Lo que cada tool iba a hacer, hasta saber si lo hizo. Se vacía al cerrarla. */
    const enCurso = new Map<string, { nombre: string; detalle?: string }>();

    const pararReloj = (): void => {
      if (reloj !== undefined) clearTimeout(reloj);
      reloj = undefined;
    };
    const armarReloj = (): void => {
      if (terminado || aprobando > 0) return;
      pararReloj();
      reloj = setTimeout(
        () => acabar(new Error(`opencode no terminó en ${Math.round(TOPE_MS / 60000)} minutos`)),
        TOPE_MS
      );
    };

    const mandar = (objeto: unknown): void => {
      if (!terminado) hijo.stdin.write(`${JSON.stringify(objeto)}\n`);
    };

    const acabar = (error?: Error, salida?: string): void => {
      if (terminado) return;
      // `session/cancel` ANTES de matarlo: ACP tiene cancelación y Codex no, así que aquí sí
      // se puede cerrar el turno del hijo en vez de dejarlo a medias.
      if (sesion !== undefined) mandar({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId: sesion } });
      terminado = true;
      pararReloj();
      hijo.kill();
      if (error !== undefined) fallar(error);
      else cumplir(salida ?? "");
    };

    armarReloj();

    hijo.on("error", (e) => acabar(new Error(`no se pudo lanzar opencode: ${e.message}`)));
    hijo.on("close", () => {
      if (!terminado) acabar(new Error("opencode terminó sin devolver ninguna respuesta"));
    });

    hijo.stdout.on("data", (trozo: Buffer) => {
      buffer += trozo.toString();
      let corte: number;
      while ((corte = buffer.indexOf("\n")) >= 0) {
        const linea = buffer.slice(0, corte);
        buffer = buffer.slice(corte + 1);
        if (linea.trim() === "") continue;
        let m: Mensaje;
        try {
          m = JSON.parse(linea) as Mensaje;
        } catch {
          // Una línea que no es JSON se descarta: el binario mezcla trazas suyas por stdout.
          continue;
        }
        atender(m);
      }
    });

    /** Una petición del AGENTE hacia nosotros: lleva `id` **y** `method`. */
    const atenderPeticion = (id: number | string, metodo: string, params: Record<string, unknown> | undefined): void => {
      if (metodo === "session/request_permission") {
        const toolCall = params?.["toolCall"] as { kind?: unknown } | undefined;
        aprobando += 1;
        pararReloj();
        void decisionDeEscrituraDeOpencode({
          cwd: peticion.cwd,
          agente: peticion.agente,
          toolCall,
          ficheros: opciones.ficheros?.() ?? new Set<string>(),
          ...(opciones.real === undefined ? {} : { real: opciones.real }),
          // La primera puerta es el papel del `.md`: a un agente de solo lectura no se le
          // pregunta a nadie, se le dice que no.
          ...(peticion.permitirEscritura && opciones.aprobar !== undefined ? { aprobar: opciones.aprobar } : {}),
        })
          .then(
            ({ concedida }) => {
              if (!concedida) rechazadas += 1;
              // **`always` no se manda NUNCA**: es la pre-aprobación de sesión, y lo que aquí
              // se autoriza es una escritura concreta con su diff delante — la misma regla que
              // `acceptForSession` y `grantRoot` en Codex.
              responderPermiso(id, concedida ? "once" : "reject");
            },
            () => {
              rechazadas += 1;
              responderPermiso(id, "reject");
            }
          )
          .finally(() => {
            aprobando -= 1;
            armarReloj();
          });
        return;
      }
      /**
       * Lo demás que el agente puede pedirnos son las `fs/*`, y no las hacemos.
       *
       * **Y `fs/write_text_file` NO es la escritura, está medido**: rechazándola con un error,
       * el fichero apareció igual. O sea que es un aviso y no un portón — creerse lo contrario
       * habría dejado una guarda que no guarda nada. El único portón es el permiso de arriba.
       *
       * Un error de JSON-RPC es la forma que el propio protocolo tiene de decir «eso no lo
       * hago», así que aquí no se aborta el turno (al contrario que en Codex, donde no había
       * forma medida de contestar que no): medido, el hijo lo encaja y sigue.
       */
      mandar({ jsonrpc: "2.0", id, error: { code: -32601, message: "xonecode no implementa este método" } });
    };

    const responderPermiso = (id: number | string, optionId: "once" | "reject"): void =>
      mandar({ jsonrpc: "2.0", id, result: { outcome: { outcome: "selected", optionId } } });

    const atenderActualizacion = (u: Record<string, unknown>): void => {
      const clase = u["sessionUpdate"];
      if (clase === "agent_message_chunk") {
        const t = (u["content"] as { text?: unknown } | undefined)?.text;
        if (typeof t === "string") texto.push(t);
        return;
      }
      if (clase !== "tool_call_update") return;
      const id = u["toolCallId"];
      if (typeof id !== "string") return;
      /**
       * **El nombre y la ruta se APUNTAN en `in_progress`, y la línea sale en `completed`.**
       *
       * Las dos mitades son medidas. La primera: el `completed` trae `locations: null` y la
       * ruta metida dentro del `title`, así que los datos hay que cogerlos antes. La segunda:
       * **una tool que acaba en `failed` NO se anuncia** — es el invariante de
       * `core/entrelazar.ts`, «solo se cuenta lo que va a ocurrir», porque una línea que diga
       * que el hijo leyó algo que se le denegó afirma un hecho falso. Medido en vivo: con una
       * lectura de `.env` denegada por patrón salía «lee /.env», y el `.env` no se leyó.
       *
       * De aquí sale un evento `tool` NORMAL, con el nombre canónico y la ruta VIRTUAL, para
       * que el colapsador lo agrupe con los demás y ninguna piel sepa que hay dos orígenes.
       */
      if (u["status"] === "in_progress") {
        const titulo = typeof u["title"] === "string" ? u["title"] : "";
        const nombre = NOMBRE_CANONICO[titulo] ?? titulo;
        if (nombre === "") return;
        const sitios = u["locations"];
        const cruda = Array.isArray(sitios) ? (sitios[0] as { path?: unknown } | undefined)?.path : undefined;
        const detalle =
          typeof cruda === "string" && cruda.startsWith(peticion.cwd)
            ? cruda.slice(peticion.cwd.length) || "/"
            : undefined;
        enCurso.set(id, { nombre, ...(detalle === undefined ? {} : { detalle }) });
        return;
      }
      const apuntada = enCurso.get(id);
      if (apuntada === undefined) return;
      enCurso.delete(id);
      if (u["status"] === "completed") opciones.alUsarTool?.(apuntada);
    };

    const atender = (m: Mensaje): void => {
      if (m.id !== undefined && m.method !== undefined) {
        atenderPeticion(m.id, m.method, m.params);
        return;
      }
      if (m.id === 1 && m.result !== undefined) {
        mandar({ jsonrpc: "2.0", id: 2, method: "session/new", params: { cwd: peticion.cwd, mcpServers: [] } });
        return;
      }
      if (m.id === 2) {
        sesion = (m.result as { sessionId?: string } | undefined)?.sessionId;
        if (sesion === undefined) {
          acabar(new Error("opencode abrió la sesión sin devolver su id"));
          return;
        }
        mandar({
          jsonrpc: "2.0",
          id: 3,
          method: "session/prompt",
          params: {
            sessionId: sesion,
            // Las instrucciones van DELANTE de la tarea en el mismo turno: ACP no expone un
            // prompt de sistema por sesión, igual que el app-server de Codex.
            prompt: [
              { type: "text", text: peticion.instrucciones },
              { type: "text", text: peticion.tarea },
            ],
          },
        });
        return;
      }
      if (m.id === 3) {
        if (m.error !== undefined) {
          acabar(new Error(`opencode: ${m.error.message ?? "error sin mensaje"}`));
          return;
        }
        const consumo = consumoDeOpencode((m.result as { usage?: unknown } | undefined)?.usage);
        if (consumo !== undefined) opciones.alConsumir?.(consumo);
        acabar(undefined, respuestaFinal());
        return;
      }
      if (m.method === "session/update") {
        const u = (m.params as { update?: Record<string, unknown> } | undefined)?.update;
        if (u !== undefined) atenderActualizacion(u);
      }
    };

    /**
     * Lo que se devuelve como respuesta del especialista.
     *
     * **Una respuesta vacía tras un rechazo no es un fallo, y tampoco es silencio**: medido,
     * al rechazar una escritura el turno acaba bien (`stopReason: end_turn`) y a veces sin una
     * sola palabra. Devolver `""` la haría pasar por «el especialista no tenía nada que
     * decir», y lanzar tumbaría un turno que fue correcto. Así que se dice lo que pasó, con
     * voz del harness y sin ponerle palabras al agente.
     */
    const respuestaFinal = (): string => {
      const dicho = texto.join("").trim();
      if (dicho !== "") return dicho;
      return rechazadas > 0
        ? `(opencode terminó sin decir nada; se le rechazaron ${rechazadas} escritura(s))`
        : "(opencode terminó sin decir nada)";
    };

    mandar({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: 1,
        // Las dos en `false` y a propósito: no servimos el sistema de ficheros del cliente.
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } },
      },
    });
  });
}
