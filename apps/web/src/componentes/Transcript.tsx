import type { Acto } from "../tipos.js";
import type { Pestana } from "./Cabecera.js";
import { Chat } from "./Chat.js";
import { Trayectoria } from "./Trayectoria.js";
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
export function Transcript({ actos, pestana }: { actos: readonly Acto[]; pestana: Pestana }) {
  return (
    <div className={conversacion.body}>
      <div className={conversacion.viewArea}>
        {pestana === "chat" ? <Chat actos={actos} /> : <Trayectoria actos={actos} />}
      </div>
    </div>
  );
}
