import type { Acto } from "../tipos.js";
import { Chat } from "./Chat.js";
import conversacion from "../../estilos/ConversationRoot.module.css";

/**
 * La conversación, dentro de las cajas que la hoja copiada da a la banda de debajo de la
 * cabecera (`estilos/ConversationRoot.module.css`): `.body` es la banda y `.viewArea` la
 * vista.
 *
 * **Ya no despacha entre vistas, y esa es la mudanza.** Llevaba dentro las pestañas, luego
 * solo el despacho —chat, trazas, ficheros, revisión…—, y el chat era una de las opciones:
 * abrir un fichero era dejar de ver lo que el agente estaba escribiendo. Desde que el panel
 * de vistas vive al lado (`Panel.tsx`, `repartoDeColumnas.ts`), la conversación no compite
 * con nada — es la columna que se queda —, así que aquí no queda nada que elegir.
 *
 * Lo que se lleva consigo: **este componente ya no monta Trazas**, que era la única vista que
 * no llegaba por ranura, y con ella se va el único motivo que tenía para conocer más actos
 * que los de la conversación.
 */
export function Transcript({
  actos,
  turnoEnVuelo,
  historica,
  sinAprobacion,
  trabajoAlAbrir,
  segundosEnVuelo,
  proyecto,
  modelo,
  sesion,
  alAbrirArtefacto,
}: {
  actos: readonly Acto[];
  /** Van al Chat tal cual: la relectura, el cronómetro del turno en vuelo, y el proyecto y
   *  el modelo para el estado vacío de una sesión nueva. */
  historica?: boolean;
  /** El proyecto escribe sin pedir aprobación. Va al Chat, que lo dice con palabras. */
  sinAprobacion?: boolean;
  /** Lo que ya estaba sin commitear al abrir. Ver `Chat`. */
  trabajoAlAbrir?: { ficheros: string[]; total: number };
  segundosEnVuelo?: number;
  proyecto?: string;
  modelo?: string;
  /** El id de la sesión abierta. Solo para componer la ruta de un artefacto en el Chat. */
  sesion?: string;
  /** Abrir un artefacto desde su tarjeta del Chat. Lo resuelve `App`, que es quien decide
   *  si eso abre el panel de al lado o lo pone en el centro. */
  alAbrirArtefacto?: (ruta: string) => void;
  /** Hay turno corriendo. Lo usa el Chat, para saber si el último mensaje sigue llegando —y
   *  con él, si toca resaltar el código o esperar al cierre. */
  turnoEnVuelo?: boolean;
}) {
  return (
    <div className={conversacion.body}>
      <div className={conversacion.viewArea}>
        <Chat
          actos={actos}
          turnoEnVuelo={turnoEnVuelo === true}
          historica={historica === true}
          sinAprobacion={sinAprobacion === true}
          {...(trabajoAlAbrir === undefined ? {} : { trabajoAlAbrir })}
          {...(segundosEnVuelo === undefined ? {} : { segundosEnVuelo })}
          {...(proyecto === undefined ? {} : { proyecto })}
          {...(modelo === undefined ? {} : { modelo })}
          {...(sesion === undefined ? {} : { sesion })}
          {...(alAbrirArtefacto === undefined ? {} : { alAbrirArtefacto })}
        />
      </div>
    </div>
  );
}
