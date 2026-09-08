import { useState } from "react";
import type { TareaDelCable } from "../tipos.js";
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
 */
export function TareasDelProyecto({
  tareas,
  alReintentar,
  alDescartar,
  alTerminar,
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
}) {
  return (
    <section className={estilos.lista} aria-label="Tareas del proyecto">
      <ul className={estilos.filas}>
        {tareas.map((t) => (
          <Fila
            key={t.id}
            tarea={t}
            {...(alReintentar === undefined ? {} : { alReintentar })}
            {...(alDescartar === undefined ? {} : { alDescartar })}
            {...(alTerminar === undefined ? {} : { alTerminar })}
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
}: {
  tarea: TareaDelCable;
  alReintentar?: (id: string) => void;
  alDescartar?: (id: string) => void;
  alTerminar?: (id: string) => void;
}) {
  // Confirmación EN LA FILA, no un modal: es una fila, no una ventana. Vive aquí y no en
  // el padre porque es de ESTA tarea y de ninguna otra — confirmar una no puede dejar la
  // fila de al lado con el botón a medio pulsar.
  const [confirmando, setConfirmando] = useState(false);
  const puedeDescartar = t.estado !== "en-proceso" && alDescartar !== undefined;
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
        {t.estado === "requiere-atencion" && alReintentar !== undefined ? (
          <button type="button" className={estilos.boton} onClick={() => alReintentar(t.id)}>
            Reintentar
          </button>
        ) : null}
        {t.estado === "requiere-atencion" && alTerminar !== undefined ? (
          <button type="button" className={estilos.boton} onClick={() => alTerminar(t.id)}>
            Dar por bueno
          </button>
        ) : null}
        {!puedeDescartar ? null : confirmando ? (
          <>
            <span className={estilos.avisoDescarte}>¿Borrar la tarea?</span>
            <button
              type="button"
              className={estilos.botonPeligro}
              onClick={() => {
                alDescartar(t.id);
                setConfirmando(false);
              }}
            >
              Sí, descartar
            </button>
            <button type="button" className={estilos.boton} onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" className={estilos.boton} onClick={() => setConfirmando(true)}>
            Descartar
          </button>
        )}
      </div>
    </li>
  );
}
