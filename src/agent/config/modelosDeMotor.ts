/**
 * Qué modelos ofrece cada MOTOR de subagente.
 *
 * Un subagente corre de cuatro formas —dentro de xonecode, en Claude Code, en Codex o en
 * OpenCode— y el modelo se elige distinto en cada una. Este módulo contesta la pregunta «¿entre
 * qué puedo elegir?» para las tres externas; la del motor `modelo` ya la contesta el catálogo de
 * proveedores de siempre (`agent/catalogoModelos.ts`), y duplicarla aquí sería una segunda
 * lista que diverge.
 *
 * **Ninguna de las listas está inventada, y esa es la regla del fichero.** La de Claude Code
 * son los ALIAS que documenta su propio SDK; las de Codex y OpenCode se les preguntan a ellos. Un
 * desplegable con cinco nombres escritos a mano se queda viejo en la siguiente versión del
 * producto, y el síntoma sería un modelo que el usuario elige y el hijo rechaza.
 */
import { spawn } from "node:child_process";

/**
 * Los alias de Claude Code, tal como los documenta su SDK instalado:
 * «Model alias (e.g. 'fable', 'opus', 'sonnet', 'haiku') or full model ID».
 *
 * Alias y no ids pinchados: es lo que el producto ofrece justamente para que sobrevivan a
 * sus versiones. Un `claude-opus-4-8` escrito aquí hoy se queda viejo solo, y el campo sigue
 * aceptando un id entero para quien quiera fijar uno.
 */
export const ALIAS_DE_CLAUDE_CODE = ["opus", "sonnet", "haiku", "fable"] as const;

/** Cómo se lee un modelo por el cable: lo justo para elegirlo. */
export interface ModeloDeMotor {
  id: string;
  /** Para leer. Sin él se usa el id: un nombre inventado sería peor que ninguno. */
  nombre: string;
}

/** Cuánto se espera a que Codex conteste su lista antes de darlo por no disponible. */
export const TOPE_DE_MODELOS_MS = 15_000;

export interface DependenciasDeModelos {
  /** Se le pregunta a Codex. Entra por parámetro: `npm test` no lanza procesos. */
  preguntarACodex?: () => Promise<ModeloDeMotor[]>;
  /** Y a OpenCode, por lo mismo. */
  preguntarAOpencode?: () => Promise<ModeloDeMotor[]>;
}

export async function modelosDeMotor(
  motor: string,
  deps: DependenciasDeModelos = {}
): Promise<{ modelos: ModeloDeMotor[]; error?: string }> {
  if (motor === "claude-code") {
    // Sin proceso: la lista es una tabla, y preguntarle al SDK costaría arrancar un hijo
    // para leer algo que sus propios tipos declaran.
    return { modelos: ALIAS_DE_CLAUDE_CODE.map((id) => ({ id, nombre: id })) };
  }
  if (motor !== "codex" && motor !== "opencode") return { modelos: [] };
  const preguntar =
    motor === "opencode"
      ? (deps.preguntarAOpencode ?? preguntarAOpencodeDeVerdad)
      : (deps.preguntarACodex ?? preguntarACodexDeVerdad);
  try {
    return { modelos: await preguntar() };
  } catch (error) {
    // Se dice, y accionable: un desplegable vacío sin motivo se lee como que la ventana
    // está rota, y lo que pasa es que falta instalar Codex o que no contesta.
    return { modelos: [], error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Lo que se guarda de la respuesta de `model/list`, y solo eso.
 *
 * Trae además esfuerzos de razonamiento, modalidades de entrada, tramos de servicio y avisos
 * de crédito de la cuenta. Nada de eso hace falta para elegir un modelo, y arrastrarlo por
 * el cable sería llevar datos de la cuenta de alguien sin ningún motivo — la misma regla con
 * la que `proyectosDeResultado` se queda con dos campos y deja fuera el correo del
 * propietario.
 *
 * Los que el propio Codex marca como `hidden` no se ofrecen: es él quien dice que no son
 * para elegir.
 */
export function modelosDeRespuestaDeCodex(respuesta: unknown): ModeloDeMotor[] {
  const datos = (respuesta as { data?: unknown } | null | undefined)?.data;
  if (!Array.isArray(datos)) return [];
  const salida: ModeloDeMotor[] = [];
  for (const fila of datos) {
    if (typeof fila !== "object" || fila === null) continue;
    const { id, displayName, hidden } = fila as { id?: unknown; displayName?: unknown; hidden?: unknown };
    if (typeof id !== "string" || id === "") continue;
    if (hidden === true) continue;
    salida.push({ id, nombre: typeof displayName === "string" && displayName !== "" ? displayName : id });
  }
  return salida;
}

/**
 * `codex app-server --stdio`, el mismo camino que ya usa el subagente: `initialize` →
 * `initialized` → `model/list`. JSON por línea, y una línea que no lo sea se descarta —el
 * app-server mezcla trazas suyas por stdout en algunas versiones—.
 */
async function preguntarACodexDeVerdad(): Promise<ModeloDeMotor[]> {
  const binario = process.env.CODEX_BIN ?? "codex";
  return new Promise<ModeloDeMotor[]>((resolver, rechazar) => {
    const hijo = spawn(binario, ["app-server", "--stdio"], { stdio: ["pipe", "pipe", "pipe"] });
    let acabado = false;
    const acabar = (fn: () => void): void => {
      if (acabado) return;
      acabado = true;
      clearTimeout(tope);
      hijo.kill();
      fn();
    };
    const tope = setTimeout(() => acabar(() => rechazar(new Error("codex no contestó su lista de modelos"))), TOPE_DE_MODELOS_MS);

    const mandar = (m: unknown): void => void hijo.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...(m as object) })}\n`);
    hijo.on("error", (error: NodeJS.ErrnoException) =>
      acabar(() => rechazar(new Error(error.code === "ENOENT" ? "codex no está instalado" : error.message)))
    );
    hijo.on("close", () => acabar(() => rechazar(new Error("codex terminó sin dar su lista de modelos"))));

    let buffer = "";
    hijo.stdout.on("data", (trozo: Buffer) => {
      buffer += trozo.toString();
      let corte: number;
      while ((corte = buffer.indexOf("\n")) >= 0) {
        const linea = buffer.slice(0, corte);
        buffer = buffer.slice(corte + 1);
        if (linea.trim() === "") continue;
        let m: { id?: number; result?: unknown; error?: { message?: string } };
        try {
          m = JSON.parse(linea) as typeof m;
        } catch {
          continue;
        }
        if (m.error !== undefined) {
          acabar(() => rechazar(new Error(`codex: ${m.error?.message ?? "error sin mensaje"}`)));
          return;
        }
        if (m.id === 1) {
          mandar({ method: "initialized" });
          mandar({ id: 2, method: "model/list", params: {} });
          continue;
        }
        if (m.id === 2) {
          const modelos = modelosDeRespuestaDeCodex(m.result);
          acabar(() => resolver(modelos));
          return;
        }
      }
    });

    mandar({
      id: 1,
      method: "initialize",
      params: {
        clientInfo: { name: "xonecode", title: "xonecode", version: "0.5.0" },
        capabilities: { experimentalApi: false, requestAttestation: false },
      },
    });
  });
}

/**
 * Los modelos de OpenCode: se los pregunta a él con `opencode models`.
 *
 * Una línea por modelo, con la forma `proveedor/id` — que es exactamente lo que su campo
 * `model` de configuración espera, así que no hay que componer nada. Se le pregunta en vez de
 * escribir una tabla por el mismo motivo que a Codex: su catálogo cambia con cada versión y
 * con las credenciales que el usuario tenga, y una lista a mano produciría un modelo que el
 * usuario elige y el hijo rechaza.
 *
 * No hace falta ni servidor ni sesión: es un comando que imprime y termina.
 */
export function modelosDeSalidaDeOpencode(salida: string): ModeloDeMotor[] {
  const vistos = new Set<string>();
  const modelos: ModeloDeMotor[] = [];
  for (const cruda of salida.split("\n")) {
    const linea = cruda.trim();
    // Solo `proveedor/id`: el comando puede imprimir cabeceras o avisos, y una línea que no
    // tenga esa forma no es un modelo que se pueda poner en la configuración.
    if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._:-]+$/.test(linea)) continue;
    if (vistos.has(linea)) continue;
    vistos.add(linea);
    modelos.push({ id: linea, nombre: linea });
  }
  return modelos;
}

async function preguntarAOpencodeDeVerdad(): Promise<ModeloDeMotor[]> {
  const binario = process.env.OPENCODE_BIN ?? "opencode";
  return new Promise<ModeloDeMotor[]>((resolver, rechazar) => {
    let hijo: ReturnType<typeof spawn>;
    try {
      hijo = spawn(binario, ["models"], { stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      rechazar(new Error("opencode no está instalado"));
      return;
    }
    let salida = "";
    let cerrado = false;
    const acabar = (que: () => void): void => {
      if (cerrado) return;
      cerrado = true;
      clearTimeout(tope);
      hijo.kill();
      que();
    };
    const tope = setTimeout(
      () => acabar(() => rechazar(new Error("opencode no contestó su lista de modelos"))),
      TOPE_DE_MODELOS_MS
    );
    hijo.on("error", (error: NodeJS.ErrnoException) =>
      acabar(() => rechazar(new Error(error.code === "ENOENT" ? "opencode no está instalado" : error.message)))
    );
    hijo.stdout?.on("data", (t: Buffer) => {
      salida += t.toString();
    });
    hijo.on("close", () =>
      acabar(() => {
        const modelos = modelosDeSalidaDeOpencode(salida);
        // Una lista vacía se dice, no se devuelve como éxito: un desplegable vacío sin motivo
        // se lee como que la ventana está rota.
        if (modelos.length === 0) rechazar(new Error("opencode no dio ninguna lista de modelos"));
        else resolver(modelos);
      })
    );
  });
}
