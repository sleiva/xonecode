import type { ReactNode } from "react";
import type { Acto } from "../tipos.js";
import type { Pestana } from "./Pestanas.js";
import { Chat } from "./Chat.js";
import { Trazas } from "./Trazas.js";
import conversacion from "../../estilos/ConversationRoot.module.css";

/**
 * La vista elegida, dentro de las cajas que la hoja copiada da a la banda de debajo de
 * la cabecera (`estilos/ConversationRoot.module.css`): `.body` es la banda y `.viewArea`
 * la vista.
 *
 * Ya no lleva las pestañas ni el `useState` que decidía cuál. Se fueron a `Cabecera.tsx`
 * —que es donde viven en el original, dentro del mismo `<header>` que pinta la línea de
 * separación— y el estado subió a `App.tsx`, con la misma vida útil de antes: muere con
 * la página, no se persiste en ningún sitio.
 */
export function Transcript({
  actos,
  pestana,
  turnoEnVuelo,
  historica,
  segundosEnVuelo,
  proyecto,
  modelo,
  sesion,
  ficheros,
  revision,
}: {
  actos: readonly Acto[];
  pestana: Pestana;
  /** Van al Chat tal cual: la relectura, el cronómetro del turno en vuelo, y el proyecto y
   *  el modelo para el estado vacío de una sesión nueva. */
  historica?: boolean;
  segundosEnVuelo?: number;
  proyecto?: string;
  modelo?: string;
  /** El id de la sesión abierta. Solo para componer la ruta de un artefacto en el Chat. */
  sesion?: string;
  /**
   * Las vistas de Ficheros y de Revisión, ya montadas por `App`. Van como ranuras y no como
   * props sueltas porque lo que aporta este componente es ELEGIR la vista; y como el
   * elemento solo se monta cuando se pinta, la petición al servidor que cada una lleva
   * dentro no sale hasta que alguien abre su pestaña.
   */
  ficheros?: ReactNode;
  revision?: ReactNode;
  /** Hay turno corriendo. Solo lo usa el Chat, para saber si el último mensaje sigue
   *  llegando — y con él, si toca resaltar el código o esperar al cierre. */
  turnoEnVuelo?: boolean;
}) {
  return (
    <div className={conversacion.body}>
      <div className={conversacion.viewArea}>
        {pestana === "chat" ? (
          <Chat
            actos={actos}
            turnoEnVuelo={turnoEnVuelo === true}
            historica={historica === true}
            {...(segundosEnVuelo === undefined ? {} : { segundosEnVuelo })}
            {...(proyecto === undefined ? {} : { proyecto })}
            {...(modelo === undefined ? {} : { modelo })}
            {...(sesion === undefined ? {} : { sesion })}
          />
        ) : pestana === "trazas" ? (
          <Trazas actos={actos} />
        ) : pestana === "revision" ? (
          revision
        ) : (
          ficheros
        )}
      </div>
    </div>
  );
}
