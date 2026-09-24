/**
 * El contrato de una sesión de turno real, que cumplen LOS DOS motores —deepagents
 * (`turnoReal.ts#abrirSesionReal`) y TrueForge (`motores/trueforge/sesionTrueforge.ts`)—.
 *
 * Vive aparte, y no en `turnoReal.ts`, porque los dos lo necesitan y `turnoReal.ts` es quien
 * elige el motor: si el contrato viviera allí, TrueForge tendría que importar a quien lo importa
 * a él, que es el ciclo que había (`src/ciclos.test.ts` lo vigila).
 */
import type { Piel } from "../../core/turno.js";
import type { Bitacora } from "../../core/bitacora.js";
import type { ConsumoDeSesionPorCuenta, ModelosPort } from "../../core/ports.js";
import type { ResultadoDeTurno } from "../../core/entrega.js";
import type { TokenTracker } from "../../vendor/tokenTracking.js";
import type { Cambio } from "./instantanea.js";

/**
 * Una sesión de turno real: varios turnos sobre el MISMO agente y el MISMO hilo.
 *
 * Es la extracción de `correrReal` (`cli/run.ts`), reescrita de disparo único a reutilizable:
 * el agente, el checkpointer, el tracker y el `thread_id` viven en el cierre de
 * `abrirSesionReal` y se conservan entre llamadas. Lo que cada `turno()` renueva es la foto
 * del ANTES, porque el diff es del TURNO y no de la sesión: si la foto fuese una por sesión,
 * el turno 3 reportaría también lo que escribió el turno 1.
 */
export interface SesionReal {
  /**
   * Un turno. Devuelve la bitácora, los cambios que dejó en el proyecto y **lo que hay que
   * saber para decidir si el trabajo se puede dar por bueno** (`ResultadoDeTurno`).
   *
   * Esas tres últimas cosas —cómo acabó el verificador, cuántas escrituras quedaron sin
   * aplicar y los hallazgos— no estaban, y su ausencia era una deuda MEDIDA: con las
   * tareas de fondo aplicando escrituras solas, un turno se cortó por el tope de rondas
   * con cuatro ficheros escritos, una escritura abandonada, el verificador sin correr ni
   * una vez… y el kanban diciendo «terminada». La bitácora no sirve para esto: `corrio`
   * responde si un nodo pasó, no con qué veredicto.
   */
  turno(
    peticion: string,
    piel: Piel
  ): Promise<
    ResultadoDeTurno & {
      bitacora: Bitacora;
      cambios: Cambio[];
      /** Se agotó el tope de rondas con aprobaciones sin resolver. */
      cortadoPorTope: boolean;
    }
  >;
  /** Rehace el agente con modelos nuevos, CONSERVANDO el hilo. Para `/modelo`. */
  cambiarModelos(modelos: ModelosPort): Promise<void>;
  /** Abre un hilo nuevo. Para `/nuevo`. */
  /**
   * Abre un hilo nuevo. **Acepta el id** porque quien lo pide puede ya tener uno.
   *
   * Sin el parámetro había DOS ids para un mismo hilo: la consola generaba el suyo en su
   * `/nuevo` y la sesión otro aquí, así que `/hilo` enseñaba un `thread_id` que no era el
   * que usaba el grafo. Un identificador que no identifica es peor que no darlo.
   */
  nuevoHilo(id?: string): void;
  /** Aborta de inmediato la llamada al modelo que está en curso, si la hay. */
  cancelar(): void;
  /** Lo que lleva consumido la sesión, en sus DOS cuentas (ver `ConsumoDeSesionPorCuenta`). */
  consumo(): ConsumoDeSesionPorCuenta;
  /** Se avisa en cada cambio de cualquiera de las dos. Devuelve cómo dejar de escuchar. */
  alCambiarConsumo(oyente: () => void): () => void;
  /**
   * Termina la sesión: aborta lo que esté en curso y la deja inservible.
   *
   * Hace falta para CAMBIAR de proyecto (`web/servidor/vestibulo.ts`): la consola web abre
   * una consola de proyecto a la vez, y cerrar la anterior es agotar sus `lineas` para que
   * `correrConsola` retorne. Sin esto, un turno en vuelo mantendría el lazo dentro del
   * `await` durante minutos y la apertura del proyecto siguiente se quedaría esperando.
   *
   * Qué libera y qué no, dicho entero porque una fuga callada es peor que una declarada:
   * el `MemorySaver`, el agente construido y el tracker viven en el CIERRE de
   * `abrirSesionReal` y no exponen ningún `close()` —no hay sockets ni descriptores, el
   * cliente del modelo es por llamada—, así que se recogen con la referencia a la sesión
   * en cuanto quien la abrió la suelta. Lo único que hay que soltar activamente es la
   * llamada en curso, y eso es exactamente `cancelar()`. La bandera de cerrada existe para
   * que un `turno()` tardío falle en vez de revivir un hilo que ya nadie mira.
   */
  cerrar(): void;
  readonly tracker: TokenTracker;
  /** El `thread_id` ACTUAL: tras `nuevoHilo()` cambia, y hay que leerlo, no cachearlo. */
  readonly hilo: string;
}
