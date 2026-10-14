import type { Acto } from "../tipos.js";
import { Transcript } from "./Transcript.js";
import estilos from "./LecturaDeSesion.module.css";

/**
 * Por qué esta conversación se LEE y no se escribe, decidido ahora mismo por quien la monta:
 * - `tarea`: una tarea de fondo escribe en su proyecto (IXCODE-36);
 * - `trabajando`: el proyecto trabaja en OTRA conversación tuya;
 * - `atencion`: la tarea se ha parado a esperar TU respuesta: es el único momento en que hace falta
 *   la caja, y se ofrece ir a contestar;
 * - `libre`: ya no hay nada que lo impida, y se ofrece abrirla para escribir.
 */
export type MotivoDeLectura = "tarea" | "atencion" | "trabajando" | "libre";

const TEXTO: Record<MotivoDeLectura, string> = {
  tarea:
    "Solo lectura: una tarea está trabajando en este proyecto. No se puede escribir aquí ni empezar otra conversación hasta que termine o la pares (pestaña Tareas del proyecto).",
  atencion: "La tarea necesita tu respuesta.",
  trabajando:
    "Solo lectura: este proyecto está trabajando en otra conversación, y dos a la vez se pisarían los ficheros. Podrás escribir aquí cuando termine.",
  libre: "Ya no hay nada trabajando en este proyecto: puedes abrir esta conversación para seguir en ella.",
};

/**
 * Una conversación ABIERTA PARA LEER (IXCODE-36): su historial, sin caja de chat.
 *
 * Antes, una conversación en la que no se podía escribir —la de un proyecto donde trabaja una tarea,
 * o una que no es la que está trabajando— no se abría: el clic se rechazaba y había que esperar para
 * ver qué contenía. Leer no compite con nadie, así que se enseña, y en el sitio del compositor va
 * una banda que dice por qué no se puede escribir. No se abre ninguna consola: los actos vienen del
 * disco (`leerSesion`) o, si es la de una tarea en marcha, en vivo (`mirar`).
 *
 * `actos` ausente = todavía no han llegado; `error` = el servidor se negó, y se dice.
 */
export function LecturaDeSesion({
  actos,
  error,
  vivo,
  motivo,
  pregunta,
  alAbrirParaEscribir,
  alIrALaQueTrabaja,
  alCerrar,
}: {
  actos?: readonly Acto[];
  error?: string;
  /** Llega en vivo: es la conversación de una tarea que está trabajando ahora. */
  vivo: boolean;
  motivo: MotivoDeLectura;
  /** Con `atencion`: lo que la tarea pregunta (su motivo de aparcar). */
  pregunta?: string;
  /** Con `libre` o `atencion`: abrirla de verdad, con la caja. */
  alAbrirParaEscribir: () => void;
  /** Con `trabajando`: ir a la conversación que trabaja. Ausente = no se sabe cuál. */
  alIrALaQueTrabaja?: () => void;
  alCerrar: () => void;
}) {
  return (
    <>
      {error !== undefined ? (
        <p className={estilos.error} role="alert">{`No se pudo leer esta conversación: ${error}`}</p>
      ) : actos === undefined ? (
        <p className={estilos.cargando}>Leyendo la conversación…</p>
      ) : (
        <Transcript actos={actos} turnoEnVuelo={vivo} />
      )}
      <div className={estilos.banda} role="note">
        <p className={estilos.texto}>
          {TEXTO[motivo]}
          {motivo === "atencion" && pregunta !== undefined ? <span className={estilos.pregunta}>{pregunta}</span> : null}
        </p>
        <div className={estilos.acciones}>
          {motivo === "atencion" ? (
            <button type="button" className={estilos.principal} onClick={alAbrirParaEscribir}>
              Responder
            </button>
          ) : motivo === "libre" ? (
            <button type="button" className={estilos.principal} onClick={alAbrirParaEscribir}>
              Abrir para escribir
            </button>
          ) : null}
          {motivo === "trabajando" && alIrALaQueTrabaja !== undefined ? (
            <button type="button" className={estilos.boton} onClick={alIrALaQueTrabaja}>
              Ir a la que trabaja
            </button>
          ) : null}
          <button type="button" className={estilos.boton} onClick={alCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </>
  );
}
