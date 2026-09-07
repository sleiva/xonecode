import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { dirname, join } from "node:path";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";

/**
 * El checkpointer PERSISTENTE de un proyecto: la memoria del agente entre arranques.
 *
 * Hasta aquí el hilo vivía en un `MemorySaver` que moría con el proceso, así que reabrir
 * una sesión era RELEER —la conversación a la vista y el agente sin recordar nada—, y la
 * interfaz lo decía con el aviso de «conversación reabierta». Con esto el hilo sobrevive.
 *
 * Seis decisiones, y ninguna es de conveniencia:
 *
 * - **Uno por PROYECTO, no por sesión**, particionado por `thread_id`. Es la forma que la
 *   librería asume —`deleteThread(threadId)` existe justamente para eso— y evita tener
 *   tantos ficheros y tantas conexiones abiertas como conversaciones guardadas.
 * - **El `thread_id` ES el id de la sesión.** Sin esa igualdad no hay nada que reanudar: al
 *   reabrir hay que preguntar por la misma cadena con la que se escribió. Por eso el id de
 *   sesión pasa a decidirse al ABRIR (`web/servidor/vestibulo.ts`) y no en el primer
 *   volcado — lo que sigue siendo perezoso es la entrada del índice, que es lo que
 *   ensuciaría la barra con sesiones vacías.
 * - **Dentro de `.xonecode/`**, que está denegada al agente (`permisosDe`), excluida del
 *   diff de Revisión y no sube nunca a CloudStudio. No es cosmético: un checkpoint lleva la
 *   lista de mensajes ENTERA —los argumentos de cada tool, el contenido de cada
 *   `write_file`, la respuesta de cada tool remota—, o sea justo lo que el transcript de
 *   `sesiones.ts` no puede llevar por construcción. Este fichero es de la misma clase que
 *   `auth.json` y por eso se crea con modo **0600**.
 * - **WAL viene de serie** (medido contra `better-sqlite3` 12.11.1: `journal_mode` es `wal`
 *   nada más abrir), que es lo que hace que dos procesos sobre el mismo proyecto —una
 *   consola de terminal y la web— no se pisen. Con `MemorySaver` el problema no existía
 *   porque cada proceso tenía el suyo.
 * - **La consola de TERMINAL no lo usa.** Su hilo es un uuid nuevo en cada arranque y no hay
 *   índice de sesiones donde reanudarlo, así que persistirlo solo dejaría hilos que nadie
 *   puede volver a abrir engordando el fichero. Persistir es de quien tiene identidad que
 *   reanudar; ahí sigue el `MemorySaver`, que además es la omisión de `construirAgente`.
 * - **Un fallo al abrirlo no puede tumbar el turno.** Devuelve `undefined` y quien llama
 *   cae al checkpointer en memoria: se pierde la memoria entre arranques, que es lo que ya
 *   pasaba, y se dice — nunca se pierde la conversación en curso.
 *
 * Y dos cosas MEDIDAS, no deducidas, que cambian lo que hay que hacer:
 *
 * - **Una aprobación que se quedó sin contestar rompía el primer mensaje tras reabrir**, y
 *   la primera medida no lo vio porque usaba la forma de grafo equivocada. Con un grafo de
 *   un nodo, donde `START` va al nodo interrumpido, llegar con un mensaje humano normal
 *   reejecuta ese nodo y vuelve a preguntar: inofensivo. El grafo del agente no tiene esa
 *   forma —`START` va al MODELO y el nodo parado es el de tools—, así que lo que le llegaba
 *   al modelo era `human → ai(tool_calls) → human`, con un `AIMessage` de llamadas y ningún
 *   `ToolMessage` detrás: Gemini y OpenAI rechazan exactamente eso. Lo arregla
 *   `turnoReal.ts#saldarAprobacionesHuerfanas` al abrir, no una guarda aquí: marcar como
 *   histórico un hilo con tareas pendientes sería negar una sesión que sí puede continuar.
 * - **Los acompañantes heredan el modo, y eso está comprobado.** SQLite escribe además
 *   `checkpoint.sqlite-wal` y `-shm`, que crea él y no nosotros: medido sobre un proyecto
 *   de verdad, los dos salen `-rw-------` como el fichero principal, porque los crea con
 *   los permisos de la base. Así que poner el modo ANTES de abrir vale también para ellos —
 *   con el `chmod` de después habrían salido a 0644.
 */
export function rutaDelCheckpointer(raiz: string): string {
  return join(raiz, ".xonecode", "checkpoint.sqlite");
}

/**
 * Los abiertos, por RUTA. Que la fábrica devuelva la MISMA instancia para el mismo proyecto
 * no es una optimización: `arranque.ts` la llama en cada reapertura y en cada borrado de
 * sesión, y sin esto cada llamada abriría una conexión nueva que nadie cierra —y borrar un
 * hilo mientras su propia sesión está viva serían dos escritores distintos sobre el mismo
 * fichero—. Con una sola conexión por proyecto, el `deleteThread` y el turno en vuelo
 * comparten handle. Un fallo NO se cachea: la carpeta puede aparecer más tarde.
 */
const abiertos = new Map<string, BaseCheckpointSaver>();

export function crearCheckpointerDeProyecto(raiz: string): BaseCheckpointSaver | undefined {
  const ruta = rutaDelCheckpointer(raiz);
  const yaAbierto = abiertos.get(ruta);
  if (yaAbierto !== undefined) return yaAbierto;
  try {
    mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
    // El fichero se crea AQUÍ y con el modo puesto, no después de abrirlo: medido, SQLite
    // lo crea ya en `fromConnString` y con el modo por omisión (0644), así que un `chmod`
    // posterior deja una ventana —corta, pero real— en la que el checkpoint es legible por
    // cualquiera. `openSync(…, "a")` sobre uno que ya existe no lo toca ni le cambia el modo.
    if (!existsSync(ruta)) closeSync(openSync(ruta, "a", 0o600));
    const saver = SqliteSaver.fromConnString(ruta);
    abiertos.set(ruta, saver);
    return saver;
  } catch {
    // El motivo NO se propaga: puede llevar la ruta absoluta del home del usuario, y de
    // aquí sale un aviso que viaja por el cable. Quien llama dice QUÉ pasó, no dónde.
    return undefined;
  }
}

/**
 * ¿Hay algo guardado de ese hilo?
 *
 * Es lo que convierte `historica` en un hecho comprobado en vez de en «se reabrió»: una
 * sesión con checkpoint continúa de verdad, y una sin él —la de antes de que esto
 * existiera, o una cuyo primer turno nunca llegó a correr— sigue siendo una relectura y se
 * dice. Un fallo al preguntar se responde `false`, que es el lado conservador: enseñar el
 * aviso de más es peor que prometer una memoria que no está.
 */
export async function hayCheckpoint(
  checkpointer: BaseCheckpointSaver | undefined,
  hilo: string,
): Promise<boolean> {
  if (checkpointer === undefined) return false;
  try {
    return (await checkpointer.getTuple({ configurable: { thread_id: hilo } })) !== undefined;
  } catch {
    return false;
  }
}

/**
 * Olvida el hilo de una sesión borrada. Sin esto, borrar una conversación dejaría su
 * memoria entera —con el contenido de los ficheros que se escribieron en ella— viva en el
 * fichero del proyecto para siempre, invisible desde la interfaz.
 */
export async function olvidarHilo(
  checkpointer: BaseCheckpointSaver | undefined,
  hilo: string,
): Promise<void> {
  const conBorrado = checkpointer as { deleteThread?: (id: string) => Promise<void> } | undefined;
  if (conBorrado?.deleteThread === undefined) return;
  try {
    await conBorrado.deleteThread(hilo);
  } catch {
    // Que no se pueda olvidar no puede impedir borrar la sesión: el índice y su transcript
    // sí se van, y lo que quede aquí es un hilo huérfano que nadie puede reabrir.
  }
}
