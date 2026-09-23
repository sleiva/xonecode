/**
 * La memoria de una conversación de TrueForge, en disco: la FOTO del hilo raíz.
 *
 * Sin esto el árbol de hilos vivía en memoria y reabrir una sesión de este motor empezaba de
 * cero, con la interfaz enseñando la conversación de antes como si el modelo la recordara.
 *
 * **Es la foto del RAÍZ, no la capa `agent-session` de TrueForge, y es a propósito.** Esa capa
 * trae su propio registro de sesiones, turnos y eventos —un segundo índice al lado del nuestro,
 * con su propio «de quién es esto»— y su factoría de subagentes SUSTITUYE el primer mensaje del
 * hijo por el encargo pelado. Lo que hace falta para «reabrir continúa» es menos:
 * `AgentThread.toSnapshot()` y su constructor, que aceptan el contexto de vuelta. Los hijos mueren
 * con su turno por diseño, así que no hay nada suyo que guardar.
 *
 * Tres reglas, las mismas que el checkpoint de deepagents:
 * - **Modo 0600 ANTES de tener contenido**: la foto lleva los mensajes enteros —contenido de
 *   ficheros incluido—, igual que `checkpoint.sqlite`.
 * - **Vive en la carpeta de la sesión**, dentro de `.xonecode/`, que no entra en git ni sube.
 * - **Una tool call sin respuesta se SALDA al guardar** (`saldarColgadas`), con una respuesta
 *   que dice la verdad: al modelo le llegaría un mensaje con tool calls sin su respuesta detrás, y
 *   Gemini y OpenAI contestan 400. El `OpenToolCallCloser` de TrueForge no cubre este caso:
 *   se salta a propósito las que crean un hilo (`create_sub_agent`), que es justo la que queda
 *   colgada cuando un turno se corta con un hijo esperando aprobación.
 *
 * **Y la foto lleva VERSIÓN, y se lee de forma ESTRICTA** (`interpretarFoto`). Es un fichero que
 * sobrevive a las subidas de XOneCode y de la librería —que es 0.x y no promete nada entre
 * versiones—, así que lo que no se entiende no se carga a medias: un contexto a medio entender
 * es una conversación que el modelo cree recordar y no recuerda. Fail-closed hacia el lado que
 * NO destruye: una foto que no se entiende no tumba la sesión, se abre SIN memoria y se DICE
 * (`textoDeMemoriaDescartada`), y la foto se APARTA con otro nombre (`apartarMemoria`) en vez de
 * borrarse — o el primer guardado del turno siguiente la pisaría.
 */
import { chmodSync, existsSync, mkdirSync, openSync, closeSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { VERSION_DE_TRUEFORGE } from "./trueforge.js";

/** Lo que se guarda de un hilo: lo que su constructor sabe recibir de vuelta. */
export interface FotoDeHilo {
  context: unknown[];
  current_context_usage?: unknown;
  capability_state?: Record<string, unknown> | null;
  /**
   * La pregunta del orquestador (`ask_user_question`) que espera respuesta. Va CON la foto porque
   * sin ella, al reabrir, la respuesta de la persona entraría como un mensaje nuevo y la pregunta
   * se quedaría saldada como incompleta. Mientras esté, su tool call NO se salda.
   */
  pregunta_pendiente?: PreguntaPendiente;
}

/** La pregunta en espera: en qué hilo, qué tool call contesta y con qué opciones. */
export interface PreguntaPendiente {
  hilo: string;
  id: string;
  args: Record<string, unknown>;
}

/** Un id de sesión que se puede usar como nombre de carpeta: segmento llano y nada más. */
const ID_VALIDO = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/** Dónde vive la memoria de la sesión `hilo`, o `undefined` si el id no es un segmento llano. */
export function rutaDeMemoria(raiz: string, hilo: string): string | undefined {
  if (!ID_VALIDO.test(hilo)) return undefined;
  return join(raiz, ".xonecode", "sesiones", hilo, "memoria-trueforge.json");
}

/** El texto con que se salda una tool call que el turno no llegó a contestar. */
export const RESPUESTA_A_UNA_COLGADA =
  "No se completó: el turno se cortó antes (quedó sin aprobar, se canceló o se agotó el tope). " +
  "Si sigue haciendo falta, vuelve a pedirlo.";

type MensajeDelContexto = { role?: string; tool_calls?: { id?: string }[]; tool_call_id?: string };

/**
 * El contexto con las tool calls del ÚLTIMO mensaje del asistente que no tienen respuesta,
 * saldadas. Solo el último: una anterior sin respuesta ya habría roto la conversación antes.
 * Puro: no toca el contexto que recibe.
 */
export function saldarColgadas(context: readonly unknown[], excepto?: string): unknown[] {
  const mensajes = context as readonly MensajeDelContexto[];
  let ultimo = -1;
  for (let i = mensajes.length - 1; i >= 0; i -= 1) {
    const m = mensajes[i];
    if (m?.role === "assistant" && (m.tool_calls?.length ?? 0) > 0) {
      ultimo = i;
      break;
    }
  }
  if (ultimo === -1) return [...context];
  const pedidas = new Set((mensajes[ultimo]!.tool_calls ?? []).map((t) => t.id).filter((id): id is string => typeof id === "string"));
  for (const m of mensajes.slice(ultimo + 1)) if (m?.role === "tool" && m.tool_call_id !== undefined) pedidas.delete(m.tool_call_id);
  // La que espera la respuesta de la persona no está colgada: está esperando, y saldarla la mataría.
  if (excepto !== undefined) pedidas.delete(excepto);
  return [...context, ...[...pedidas].map((id) => ({ role: "tool", tool_call_id: id, content: RESPUESTA_A_UNA_COLGADA }))];
}

/** La foto lista para guardar o para rehacer el hilo: con las colgadas saldadas. */
export function fotoSaneada(foto: FotoDeHilo): FotoDeHilo {
  const pregunta = foto.pregunta_pendiente;
  return { ...foto, context: saldarColgadas(foto.context, pregunta?.id) };
}

// ── La versión del FORMATO, y cómo se llega a ella ────────────────────────────────────────────

/**
 * La versión del formato de la foto en disco. Sube cuando cambia lo que se escribe, y cada subida
 * trae su entrada en `MIGRACIONES`: una foto de antes se MIGRA al leerla, nunca se descarta por
 * vieja. Es NUESTRA, no la de la librería: la de la librería va aparte, en `trueforge`.
 *
 * El formato v1, entero —y nada más, que es lo que hace estricta la lectura—:
 *
 * ```json
 * { "version": 1, "trueforge": "0.2.1", "context": [...],
 *   "current_context_usage": {...}, "capability_state": {...} | null,
 *   "pregunta_pendiente": { "hilo": "...", "id": "...", "args": {...} } }
 * ```
 *
 * Solo `version` y `context` son obligatorios. `trueforge` es la versión de la librería que
 * escribió el `toSnapshot()`: se APUNTA, no se exige —rechazar por ella tiraría todas las
 * conversaciones en cada subida de la librería—, y está para que una migración futura sepa de
 * dónde parte. Falta en una foto MIGRADA desde v0, porque no se inventa lo que no consta; el
 * guardado siguiente la sella.
 */
export const VERSION_DE_MEMORIA = 1;

/** Lo que se lee de disco antes de entenderlo: un objeto JSON cualquiera. */
type FotoCruda = Record<string, unknown>;

/**
 * De cada versión a la SIGUIENTE: devuelve la foto migrada o el MOTIVO por el que no se puede.
 * Puras, y se encadenan (`interpretarFoto`), así que una foto de hace tres versiones pasa por
 * las tres. Una migración no valida el resultado final: eso lo hace UNA vez `validarV1`.
 */
export const MIGRACIONES: Readonly<Record<number, (foto: FotoCruda) => FotoCruda | string>> = {
  /**
   * v0 → v1. La v0 es la foto de antes de versionar: `toSnapshot()` del raíz tal cual, más
   * `pregunta_pendiente`. Traía cuatro campos que el constructor del raíz no recibe de vuelta
   * (`thread_id`, `parent`, `agent_info`, `completion`) y aquí se retiran — pero solo con el valor
   * que tiene un RAÍZ: un `parent` o una `completion` puestos serían la foto de un hijo, y
   * retirarlos en silencio sería cargarla a medias.
   */
  0: (foto) => {
    const { thread_id, parent, agent_info, completion, ...resto } = foto;
    if (thread_id !== undefined && typeof thread_id !== "string") return "la foto sin versión trae un `thread_id` que no es texto";
    for (const [campo, valor] of [
      ["parent", parent],
      ["agent_info", agent_info],
      ["completion", completion],
    ] as const) {
      if (valor !== undefined && valor !== null) return `la foto sin versión trae \`${campo}\`: no es la de un hilo raíz`;
    }
    return { ...resto, version: 1 };
  },
};

/** Lo que devuelve leer la memoria: no hay, se entiende, o hay y no se entiende (con el porqué). */
export type LecturaDeMemoria =
  | { estado: "sin-memoria" }
  | { estado: "ok"; foto: FotoDeHilo }
  | { estado: "incompatible"; motivo: string };

const esObjeto = (v: unknown): v is FotoCruda => typeof v === "object" && v !== null && !Array.isArray(v);

/** Un nombre de campo que sale del FICHERO, recortado: el motivo viaja a la pantalla. */
const nombreDeCampo = (k: string): string => (k.length > 40 ? `${k.slice(0, 40)}…` : k);

const CAMPOS_V1 = new Set(["version", "trueforge", "context", "current_context_usage", "capability_state", "pregunta_pendiente"]);

/**
 * La foto v1, comprobada campo a campo, o el motivo. **Un campo que no se conoce es un NO**, no
 * un campo que se ignora: la v1 la escribe `guardarMemoria` con una lista cerrada, así que uno de
 * más significa que no la escribió este código. Y **un campo conocido y mal formado se lleva la
 * foto ENTERA**: soltar solo la pregunta pendiente, por ejemplo, dejaría una conversación que
 * espera una respuesta que ya nadie sabe a qué va.
 *
 * **Límite declarado**: de cada mensaje del contexto se mira que sea un objeto con `role` o `type`
 * de texto, y no más. Su esquema entero es de la librería (zod, dentro de ella), y repetirlo aquí
 * sería un segundo sitio donde decidir qué es un mensaje.
 */
function validarV1(foto: FotoCruda): FotoDeHilo | string {
  for (const k of Object.keys(foto)) if (!CAMPOS_V1.has(k)) return `campo desconocido «${nombreDeCampo(k)}»`;
  if (foto.version !== 1) return "la migración no dejó la versión 1";
  if (foto.trueforge !== undefined && typeof foto.trueforge !== "string") return "`trueforge` no es texto";
  const { context, current_context_usage, capability_state, pregunta_pendiente } = foto;
  if (!Array.isArray(context)) return "falta el contexto, o no es una lista";
  const roto = context.findIndex((m) => !esObjeto(m) || (typeof m.role !== "string" && typeof m.type !== "string"));
  if (roto !== -1) return `el mensaje ${roto} del contexto no tiene forma de mensaje`;
  if (current_context_usage !== undefined && !esObjeto(current_context_usage)) return "`current_context_usage` no es un objeto";
  if (capability_state !== undefined && capability_state !== null && !esObjeto(capability_state)) return "`capability_state` no es un objeto";
  let pregunta: PreguntaPendiente | undefined;
  if (pregunta_pendiente !== undefined) {
    const p = pregunta_pendiente;
    if (
      !esObjeto(p) ||
      typeof p.hilo !== "string" ||
      typeof p.id !== "string" ||
      !esObjeto(p.args) ||
      Object.keys(p).some((k) => k !== "hilo" && k !== "id" && k !== "args")
    ) {
      return "la pregunta pendiente está mal formada";
    }
    pregunta = { hilo: p.hilo, id: p.id, args: p.args };
  }
  return {
    context,
    ...(current_context_usage === undefined ? {} : { current_context_usage }),
    ...(capability_state === undefined ? {} : { capability_state: capability_state as Record<string, unknown> | null }),
    ...(pregunta === undefined ? {} : { pregunta_pendiente: pregunta }),
  };
}

/**
 * El TEXTO de una foto, entendido: migrado hasta la versión actual y validado, o el motivo por el
 * que no. Pura, y es toda la regla de la lectura. El motivo nunca repite el contenido —un error de
 * `JSON.parse` cita un trozo del fichero, que lleva mensajes enteros— ni ninguna ruta.
 */
export function interpretarFoto(texto: string): Exclude<LecturaDeMemoria, { estado: "sin-memoria" }> {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return { estado: "incompatible", motivo: "no es JSON válido" };
  }
  if (!esObjeto(crudo)) return { estado: "incompatible", motivo: "no es un objeto JSON" };
  // Ausente es v0; `null` NO: no lo escribe nadie, y leerlo como v0 sería adivinar.
  const v = crudo.version === undefined ? 0 : crudo.version;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) return { estado: "incompatible", motivo: "la versión no es un entero" };
  if (v > VERSION_DE_MEMORIA) {
    return { estado: "incompatible", motivo: `la escribió un XOneCode más nuevo (versión ${v}; este lee hasta la ${VERSION_DE_MEMORIA})` };
  }
  let foto: FotoCruda = crudo;
  for (let desde = v; desde < VERSION_DE_MEMORIA; desde += 1) {
    const migrar = MIGRACIONES[desde];
    if (migrar === undefined) return { estado: "incompatible", motivo: `no hay migración desde la versión ${desde}` };
    const r = migrar(foto);
    if (typeof r === "string") return { estado: "incompatible", motivo: r };
    foto = r;
  }
  const validada = validarV1(foto);
  return typeof validada === "string" ? { estado: "incompatible", motivo: validada } : { estado: "ok", foto: validada };
}

/**
 * Escribe la foto, en el formato ACTUAL: la versión y la de la librería las SELLA aquí quien
 * escribe, no quien llama, y los campos van por lista cerrada —lo que `toSnapshot()` traiga de más
 * no llega a disco, y así la lectura estricta no rechaza lo que este mismo código escribió—.
 * El fichero se CREA con 0600 antes de tener contenido y se reemplaza con `renameSync`, para que
 * un corte a mitad no deje media conversación ni un JSON roto.
 */
export function guardarMemoria(raiz: string, hilo: string, foto: FotoDeHilo): void {
  const ruta = rutaDeMemoria(raiz, hilo);
  if (ruta === undefined) return;
  const saneada = fotoSaneada(foto);
  const pregunta = saneada.pregunta_pendiente;
  const enDisco = {
    version: VERSION_DE_MEMORIA,
    trueforge: VERSION_DE_TRUEFORGE,
    context: saneada.context,
    ...(saneada.current_context_usage === undefined ? {} : { current_context_usage: saneada.current_context_usage }),
    ...(saneada.capability_state === undefined ? {} : { capability_state: saneada.capability_state }),
    ...(pregunta === undefined ? {} : { pregunta_pendiente: { hilo: pregunta.hilo, id: pregunta.id, args: pregunta.args } }),
  };
  mkdirSync(dirname(ruta), { recursive: true });
  const temporal = `${ruta}.${process.pid}.tmp`;
  closeSync(openSync(temporal, "w", 0o600));
  chmodSync(temporal, 0o600);
  writeFileSync(temporal, JSON.stringify(enDisco), { mode: 0o600 });
  renameSync(temporal, ruta);
}

/**
 * La memoria de la sesión, con su estado. No tener fichero es `sin-memoria`, no un fallo; uno que
 * existe y no se puede leer es `incompatible` con el `code` de Node y nada más (su mensaje lleva
 * la ruta absoluta). NO aparta ni borra nada: esto lo llama también quien solo PREGUNTA
 * (`hayMemoria`, la web al reabrir), y preguntar no puede mover ficheros.
 */
export function cargarMemoria(raiz: string, hilo: string): LecturaDeMemoria {
  const ruta = rutaDeMemoria(raiz, hilo);
  if (ruta === undefined || !existsSync(ruta)) return { estado: "sin-memoria" };
  let texto: string;
  try {
    texto = readFileSync(ruta, "utf8");
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    return { estado: "incompatible", motivo: `no se pudo leer${typeof code === "string" ? ` (${code})` : ""}` };
  }
  return interpretarFoto(texto);
}

/** La foto guardada y entendida, o `undefined` si no hay o no se entiende (ver `cargarMemoria`). */
export function leerMemoria(raiz: string, hilo: string): FotoDeHilo | undefined {
  const lectura = cargarMemoria(raiz, hilo);
  return lectura.estado === "ok" ? lectura.foto : undefined;
}

/**
 * ¿Hay una conversación de TrueForge que continuar en esta sesión? Solo si la foto se ENTIENDE:
 * una incompatible no se va a cargar, y decir que sí haría que la web presentara como continuada
 * una sesión que empieza de cero.
 */
export function hayMemoria(raiz: string, hilo: string): boolean {
  return cargarMemoria(raiz, hilo).estado === "ok";
}

/** Cómo se llama una foto apartada: la de siempre, con la marca y la hora. */
const APARTADA = /^memoria-trueforge\.incompatible-\d+(?:-\d+)?\.json$/;

/**
 * Aparta la foto que no se entiende, con otro nombre y en la MISMA carpeta, y devuelve ese nombre
 * (solo el nombre: viaja a la pantalla). Apartar y no borrar, porque no la entendemos y puede que
 * un XOneCode más nuevo sí; y apartar y no dejarla, porque el guardado del primer turno la pisaría.
 * Un nombre que ya existe nunca se pisa. Si no se puede, devuelve `undefined` y quien llama lo
 * DICE: la foto se queda donde estaba y el siguiente guardado la sustituirá.
 */
export function apartarMemoria(raiz: string, hilo: string, ahora: number = Date.now()): string | undefined {
  const ruta = rutaDeMemoria(raiz, hilo);
  if (ruta === undefined || !existsSync(ruta)) return undefined;
  try {
    let nombre = `memoria-trueforge.incompatible-${ahora}.json`;
    for (let n = 1; existsSync(join(dirname(ruta), nombre)); n += 1) nombre = `memoria-trueforge.incompatible-${ahora}-${n}.json`;
    renameSync(ruta, join(dirname(ruta), nombre));
    return basename(nombre);
  } catch {
    return undefined;
  }
}

/**
 * El aviso de una memoria que no se cargó, con el motivo y con lo que se hizo con la foto. Se
 * emite UNA vez, en el primer turno: es cuando importa, porque es el turno en que el modelo no
 * recuerda lo que la pantalla enseña. Solo con una foto que EXISTÍA: sin foto no ha pasado nada.
 */
export function textoDeMemoriaDescartada(motivo: string, apartada: string | undefined): string {
  return (
    `⚠ la memoria guardada de esta sesión no se pudo cargar (${motivo}): este turno empieza sin la conversación anterior. ` +
    (apartada === undefined
      ? "No se pudo apartar la foto, y el próximo guardado la sustituirá."
      : `La foto no se ha borrado: queda apartada como «${apartada}» en la carpeta de la sesión.`)
  );
}

/** Borra la memoria de la sesión, las fotos apartadas incluidas: lo llama el borrado de una sesión. */
export function olvidarMemoria(raiz: string, hilo: string): void {
  const ruta = rutaDeMemoria(raiz, hilo);
  if (ruta === undefined) return;
  rmSync(ruta, { force: true });
  let nombres: string[] = [];
  try {
    nombres = readdirSync(dirname(ruta));
  } catch {
    return;
  }
  for (const n of nombres) if (APARTADA.test(n)) rmSync(join(dirname(ruta), n), { force: true });
}
