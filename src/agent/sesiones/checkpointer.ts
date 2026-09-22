import { closeSync, existsSync, mkdirSync, openSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { SqliteSaver } from "../../vendor/sqliteSaver.js";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { debePodar, type ResultadoDePoda } from "../../core/podaDeCheckpoint.js";

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
 * - **WAL viene de serie** (medido contra `better-sqlite3` 13.0.3: `journal_mode` es `wal`
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

/**
 * Las filas que hacen falta para que un hilo siga reanudando, y **son solo dos por espacio**.
 *
 * Sale de leer qué pide de verdad este harness, no de adivinar:
 *
 * - **xonecode le pide al checkpointer EXACTAMENTE dos cosas** —`getTuple({ thread_id })` y
 *   `deleteThread`— y este fichero es su único llamador. Ni `list()`, ni historial, ni viaje
 *   en el tiempo. Y `getTuple` sin `checkpoint_id` resuelve a
 *   `ORDER BY checkpoint_id DESC LIMIT 1` (`vendor/sqliteSaver.ts#prepareSql`): **el último y
 *   nada más**. Todo lo anterior es peso muerto.
 * - **Y su PADRE, que es la parte que no se ve.** La subconsulta `pending_sends` del mismo
 *   `prepareSql` lee los `writes` del `parent_checkpoint_id` (canal de tareas). Quitar los
 *   writes del padre es la forma sutil de romper esto: la consulta no falla, devuelve vacío.
 *
 * Por espacio (`checkpoint_ns`) y no solo del hilo: cada delegación abre el suyo (`tools:*`)
 * y el orquestador vive en `''`. Medido, los subagentes eran el 70 % del fichero.
 */
const SQL_CONSERVAR = `
WITH ultimo AS (
  SELECT thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id
  FROM checkpoints c
  WHERE checkpoint_id = (
    SELECT MAX(checkpoint_id) FROM checkpoints x
    WHERE x.thread_id = c.thread_id AND x.checkpoint_ns = c.checkpoint_ns)
)
SELECT thread_id, checkpoint_ns, checkpoint_id FROM ultimo
UNION
SELECT thread_id, checkpoint_ns, parent_checkpoint_id FROM ultimo
WHERE parent_checkpoint_id IS NOT NULL`;

/**
 * Lo que ocupa esto en disco, o `undefined` si no hay base todavía.
 *
 * **Y el `-wal` CUENTA, que es la trampa.** Este checkpointer corre en modo WAL —viene de
 * serie y es lo que deja que la web y el terminal no se pisen—, así que lo recién escrito
 * vive en `checkpoint.sqlite-wal` hasta que SQLite lo consolida. Mirando solo el fichero
 * principal, una base con cientos de MB todavía en el WAL contesta que ocupa 4 KB y la cota
 * no dispara nunca: la regla queda escrita y muerta, con todo en verde. Se descubrió porque
 * el test que exige que el fichero ENCOJA daba `4096` antes y después.
 *
 * El `-shm` no entra: son 32 KB de índice compartido, no datos.
 */
export function tamanoDelCheckpointer(raiz: string): number | undefined {
  const ruta = rutaDelCheckpointer(raiz);
  let total: number | undefined;
  try {
    total = statSync(ruta).size;
  } catch {
    return undefined;
  }
  try {
    total += statSync(`${ruta}-wal`).size;
  } catch {
    // Sin WAL no hay nada que sumar: es el caso de una base recién consolidada.
  }
  return total;
}

/**
 * Adelgaza el `checkpoint.sqlite` de un proyecto: borra lo que ya no reanuda y compacta.
 *
 * Cuatro decisiones, y ninguna es de conveniencia:
 *
 * - **Sobre la conexión que YA existe**, la de `crearCheckpointerDeProyecto`. Abrir una
 *   segunda sería competir con nosotros mismos por un lock exclusivo que `VACUUM` necesita.
 * - **El borrado va en una transacción y el `VACUUM` FUERA**, porque SQLite no lo admite
 *   dentro de una. Si el `VACUUM` no entra, el borrado ya está hecho y el fichero encoge en
 *   el siguiente — lo que se pierde es la devolución del espacio, no la corrección.
 * - **Fail-soft con el cerrojo.** `VACUUM` reescribe el fichero entero y en este repo puede
 *   haber dos procesos sobre el mismo proyecto (la web y el terminal). Un `SQLITE_BUSY` no
 *   es un error que contar: esto es mantenimiento, y la vuelta siguiente llega al cerrar el
 *   turno que viene. Por eso NUNCA lanza.
 * - **No comprueba la cota**: eso es `debePodar` y vive en `core/`. Aquí solo se ejecuta,
 *   para que la regla se pueda probar sin una base delante.
 *
 * Medido sobre el fichero real de 879 MB: 2.794 checkpoints → 44, y 20,9 MB, en 2,5 s. El
 * hilo sigue vivo en los dos sentidos —se relee igual y admite un `put` nuevo—.
 */
export function podarCheckpointer(
  checkpointer: BaseCheckpointSaver | undefined,
  raiz: string,
): ResultadoDePoda | undefined {
  const db = (checkpointer as { db?: DbDePoda } | undefined)?.db;
  if (db === undefined) return undefined;
  const antes = tamanoDelCheckpointer(raiz);
  if (antes === undefined) return undefined;
  let checkpointsBorrados = 0;
  let writesBorrados = 0;
  try {
    db.transaction(() => {
      checkpointsBorrados = db
        .prepare(`DELETE FROM checkpoints WHERE (thread_id, checkpoint_ns, checkpoint_id) NOT IN (${SQL_CONSERVAR})`)
        .run().changes;
      writesBorrados = db
        .prepare(`DELETE FROM writes WHERE (thread_id, checkpoint_ns, checkpoint_id) NOT IN (${SQL_CONSERVAR})`)
        .run().changes;
    })();
  } catch {
    // Ni el borrado se pudo hacer: no hay nada que contar y no se toca el `VACUUM`.
    return undefined;
  }
  try {
    db.prepare("VACUUM").run();
    /**
     * **Y se CONSOLIDA el WAL, o el espacio no vuelve al disco.** El `VACUUM` reconstruye la
     * base, pero en modo WAL lo reconstruido se queda en `checkpoint.sqlite-wal` hasta que
     * alguien lo pasa al fichero principal. Sin esto, la poda funciona y el disco sigue
     * igual de lleno — que es el único resultado que a quien lo pidió le importa.
     */
    db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").run();
  } catch {
    // Cerrojo de otro proceso. El borrado ya está hecho; el fichero encoge en la siguiente.
  }
  return {
    antes,
    despues: tamanoDelCheckpointer(raiz) ?? antes,
    checkpointsBorrados,
    writesBorrados,
  };
}

/** Lo justo de `better-sqlite3` que esto usa. Tipado a mano: el vendor no lo exporta. */
interface DbDePoda {
  prepare(sql: string): { run(): { changes: number }; get(): unknown };
  transaction(fn: () => void): () => void;
}

/**
 * ¿Hay trabajo del grafo a medias en cualquier parte de la base?
 *
 * **La señal son los `writes` colgados del ÚLTIMO checkpoint de un espacio.** Un `write` es
 * el resultado de un paso que todavía no se ha doblado en un checkpoint nuevo, así que sobre
 * el último significa que el grafo se paró ahí: típicamente un subagente esperando una
 * aprobación, que es justo el caso que no se puede podar. Los miles de `writes` de una sesión
 * cerrada cuelgan de checkpoints ANTERIORES y no cuentan.
 *
 * Se pregunta por la base ENTERA y no por el hilo del turno que acaba de cerrar: en un
 * proyecto hay varias sesiones y una puede estar parada en una aprobación mientras otra
 * trabaja. Si algo está pendiente en cualquier sitio, no se poda nada y se vuelve a intentar
 * al cerrar el turno siguiente — esto es mantenimiento, no una operación que urja.
 *
 * **Un fallo al preguntar contesta `true`**, o sea «no se poda»: es la dirección conservadora,
 * la misma de `hayCheckpoint` por el otro lado.
 */
export function hayPendientesEnLaBase(checkpointer: BaseCheckpointSaver | undefined): boolean {
  const db = (checkpointer as { db?: DbDePoda } | undefined)?.db;
  if (db === undefined) return true;
  try {
    const fila = db
      .prepare(
        `SELECT COUNT(*) AS n FROM writes w WHERE w.checkpoint_id = (
           SELECT MAX(checkpoint_id) FROM checkpoints c
           WHERE c.thread_id = w.thread_id AND c.checkpoint_ns = w.checkpoint_ns)`,
      )
      .get() as { n?: number } | undefined;
    return (fila?.n ?? 1) > 0;
  } catch {
    return true;
  }
}

/**
 * La poda de MANTENIMIENTO: mira la cota y poda solo si toca. Es lo que se engancha al cierre
 * del turno.
 *
 * **El orden importa y es el barato primero**: un `statSync` (microsegundos) decide el caso
 * normal, y solo si pasa de la cota se le pregunta a la base si hay algo a medias. Al revés,
 * cada turno pagaría una consulta para tirarla.
 *
 * Nunca lanza: esto corre en el `finally` de un turno, y un mantenimiento que reviente el
 * cierre es peor que un fichero grande.
 */
export function mantenimientoDelCheckpointer(
  checkpointer: BaseCheckpointSaver | undefined,
  raiz: string,
): ResultadoDePoda | undefined {
  try {
    const bytes = tamanoDelCheckpointer(raiz);
    if (bytes === undefined) return undefined;
    // La cota primero: sin ella, esto no llega a tocar la base.
    if (!debePodar({ bytes, hayPendientes: false })) return undefined;
    if (!debePodar({ bytes, hayPendientes: hayPendientesEnLaBase(checkpointer) })) return undefined;
    return podarCheckpointer(checkpointer, raiz);
  } catch {
    return undefined;
  }
}
