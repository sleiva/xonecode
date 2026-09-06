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
  ficheros,
}: {
  actos: readonly Acto[];
  pestana: Pestana;
  /** Las dos van al Chat tal cual: la relectura y el cronómetro del turno en vuelo. */
  historica?: boolean;
  segundosEnVuelo?: number;
  /**
   * La vista de ficheros, ya montada por `App`. Va como ranura y no como cinco props
   * sueltas porque lo que aporta este componente es ELEGIR la vista, no conocer los datos
   * de cada una; y como el elemento solo se monta cuando se pinta, la petición al servidor
   * que lleva dentro no sale hasta que alguien abre la pestaña.
   */
  ficheros?: ReactNode;
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
          />
        ) : pestana === "trazas" ? (
          <Trazas actos={actos} />
        ) : (
          ficheros
        )}
      </div>
    </div>
  );
}
