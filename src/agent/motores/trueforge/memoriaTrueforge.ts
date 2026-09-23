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
 */
import { chmodSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

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

/**
 * Escribe la foto. El fichero se CREA con 0600 antes de tener contenido y se reemplaza con
 * `renameSync`, para que un corte a mitad no deje media conversación ni un JSON roto.
 */
export function guardarMemoria(raiz: string, hilo: string, foto: FotoDeHilo): void {
  const ruta = rutaDeMemoria(raiz, hilo);
  if (ruta === undefined) return;
  mkdirSync(dirname(ruta), { recursive: true });
  const temporal = `${ruta}.${process.pid}.tmp`;
  closeSync(openSync(temporal, "w", 0o600));
  chmodSync(temporal, 0o600);
  writeFileSync(temporal, JSON.stringify(fotoSaneada(foto)), { mode: 0o600 });
  renameSync(temporal, ruta);
}

/**
 * La foto guardada, o `undefined` si no hay o no se puede leer. Una foto ilegible NO tumba la
 * sesión: se empieza de cero, y quien lo dice es `hayMemoria` —la interfaz marca la sesión como
 * sin memoria en vez de fingir que continúa—.
 */
export function leerMemoria(raiz: string, hilo: string): FotoDeHilo | undefined {
  const ruta = rutaDeMemoria(raiz, hilo);
  if (ruta === undefined || !existsSync(ruta)) return undefined;
  try {
    const foto = JSON.parse(readFileSync(ruta, "utf8")) as FotoDeHilo;
    return Array.isArray(foto?.context) ? foto : undefined;
  } catch {
    return undefined;
  }
}

/** ¿Hay una conversación de TrueForge que continuar en esta sesión? */
export function hayMemoria(raiz: string, hilo: string): boolean {
  return leerMemoria(raiz, hilo) !== undefined;
}

/** Borra la memoria de la sesión: lo llama el borrado de una sesión. */
export function olvidarMemoria(raiz: string, hilo: string): void {
  const ruta = rutaDeMemoria(raiz, hilo);
  if (ruta !== undefined) rmSync(ruta, { force: true });
}
