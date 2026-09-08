import type { TareaDelCable } from "../tipos.js";
import { AccionesDeTarea } from "./AccionesDeTarea.js";
import estilos from "./TareasDelProyecto.module.css";

const ETIQUETA_DE_ESTADO: Record<TareaDelCable["estado"], string> = {
  nuevo: "Nuevo",
  "en-proceso": "En proceso",
  // La MISMA etiqueta que `Kanban.tsx` usa para esta columna, y por el mismo motivo que
  // documenta ahí: el identificador del enum no se toca, pero lo que la interfaz DICE es
  // «esperando feedback» desde §0 del diseño, y dos etiquetas para el mismo estado en dos
  // pestañas de la misma app sería la misma mentira que un color repetido a mano.
  "requiere-atencion": "Esperando feedback",
  terminada: "Terminada",
};

/**
 * La lista de tareas en background del proyecto ABIERTO, como pestaña.
 *
 * «Solo existe si hay dato detrás» (`Pestanas.tsx#hayArtefactos`, la misma regla): quien
 * monta esto ya filtró por proyecto y decide si la pestaña aparece — este componente pinta
 * lo que le llega, sin volver a preguntarse si está vacío.
 *
 * No pide nada al servidor: la cola entera viaja en `{clase:"tareas"}` y ya está en el
 * store (`App.tsx` filtra por `proyecto`), así que aquí no hay ningún `useEffect` de red.
 *
 * **Las cuatro acciones son de `AccionesDeTarea.tsx`**, la misma pieza que monta
 * `Kanban.tsx`: antes esta lista ofrecía reintentar/terminar/descartar y no feedback, así
 * que una tarea aparcada solo se podía atender desde el kanban del escritorio (Task 13).
 * `conectado` se reenvía tal cual: sin cable, esos controles se apagan y lo dicen — la
 * misma regla que ya siguen Ficheros, Revisión y Artefactos.
 */
export function TareasDelProyecto({
  tareas,
  alReintentar,
  alDescartar,
  alTerminar,
  alEnviarFeedback,
  conectado,
}: {
  tareas: readonly TareaDelCable[];
  /** `nuevo → en-proceso` se salta desde aquí: reintentar es lo que devuelve una tarea
   *  aparcada a la cola. Ausente = no se ofrece. */
  alReintentar?: (id: string) => void;
  /** Borra la tarea, con su carpeta de adjuntos. Irreversible, y por eso confirma en la
   *  propia fila antes de mandarlo. Ausente = no se ofrece. */
  alDescartar?: (id: string) => void;
  /** «La persona da el trabajo por bueno»: `requiere-atencion → terminada` sin pasar por
   *  un reintento. Ausente = no se ofrece. */
  alTerminar?: (id: string) => void;
  /** «Se edita la tarea y se agrega el feedback del usuario»: la devuelve al lazo, en su
   *  mismo hilo. Ausente = no se ofrece — la aparcada cae a la pista de siempre. */
  alEnviarFeedback?: (id: string, texto: string) => void;
  /** Si el cable está vivo: apaga en `AccionesDeTarea` lo que manda algo al servidor y
   *  dice por qué. Ausente = se asume conectado. */
  conectado?: boolean;
}) {
  return (
    <section className={estilos.lista} aria-label="Tareas del proyecto">
      <ul className={estilos.filas}>
        {tareas.map((t) => (
          <Fila
            key={t.id}
            tarea={t}
            conectado={conectado}
            {...(alReintentar === undefined ? {} : { alReintentar })}
            {...(alDescartar === undefined ? {} : { alDescartar })}
            {...(alTerminar === undefined ? {} : { alTerminar })}
            {...(alEnviarFeedback === undefined ? {} : { alEnviarFeedback })}
          />
        ))}
      </ul>
    </section>
  );
}

function Fila({
  tarea: t,
  alReintentar,
  alDescartar,
  alTerminar,
  alEnviarFeedback,
  conectado,
}: {
  tarea: TareaDelCable;
  alReintentar?: (id: string) => void;
  alDescartar?: (id: string) => void;
  alTerminar?: (id: string) => void;
  alEnviarFeedback?: (id: string, texto: string) => void;
  conectado?: boolean;
}) {
  return (
    <li className={estilos.fila} data-estado={t.estado}>
      <span className={estilos.punto} aria-hidden="true" />
      <div className={estilos.cuerpo}>
        <div className={estilos.cabecera}>
          <span className={estilos.titulo}>{t.titulo}</span>
          <span className={estilos.etiquetaEstado}>{ETIQUETA_DE_ESTADO[t.estado]}</span>
        </div>
        {/* Ausente = no consta ningún motivo; nunca se inventa uno para rellenar la fila. */}
        {t.motivo === undefined ? null : <p className={estilos.motivo}>{t.motivo}</p>}
      </div>
      <div className={estilos.acciones}>
        <AccionesDeTarea
          tarea={t}
          conectado={conectado}
          alReintentar={alReintentar}
          alDescartar={alDescartar}
          alTerminar={alTerminar}
          alEnviarFeedback={alEnviarFeedback}
        />
      </div>
    </li>
  );
}
