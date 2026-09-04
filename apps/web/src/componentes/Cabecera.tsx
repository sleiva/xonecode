import clsx from "clsx";
import { IconBranchOutline16 } from "@deepseek-ai/dsh-client-ui-primitives";
import conversacion from "../../estilos/ConversationRoot.module.css";
import pastilla from "../../estilos/AgentPresetLabel.module.css";
import estilos from "./Cabecera.module.css";

export type Pestana = "chat" | "trayectoria";

/**
 * La cabecera de la sesión, con el CSS de deepseek
 * (`estilos/ConversationRoot.module.css`): fila de título con las migas a la izquierda,
 * el modo al lado, la acción a la derecha, y DEBAJO la tira de pestañas — todo dentro
 * del mismo `<header>`, que es lo que hace que la línea de separación quede bajo las
 * pestañas y no entre el título y ellas.
 *
 * **Las pestañas viven aquí y no en `Transcript`**, que es donde estaban. No es un
 * capricho de organización: en la hoja copiada, `.tabs` es hija de `.header` y la
 * hairline la pinta `.header::after`; dejarlas fuera obligaba a repartir esa cabecera
 * entre dos cajas y a repintar la línea a mano. Cuál está elegida lo decide ahora
 * `App.tsx` (un `useState`, misma vida útil que antes: muere con la página).
 *
 * Las migas son UNA sola —no hay jerarquía de subagentes que recorrer— y va como el
 * `<button disabled>` que el original usa para la última: mismo elemento, mismo estado,
 * misma clase `.crumbCurrent`.
 */
export function Cabecera({ titulo, modo, conectado, pestana, alElegirPestana }: {
  titulo: string;
  /**
   * El modo del proyecto abierto (`.xonecode/config.json`), tal cual lo manda el
   * servidor. Ausente = el servidor no lo sabe (no hay proyecto abierto, o su config no
   * se pudo leer) y entonces NO se pinta pastilla: una que dijera «offline» sin haberlo
   * leído sería un dato inventado, que es justo lo que este repo no consiente.
   */
  modo?: "offline" | "cloud";
  conectado: boolean;
  pestana: Pestana;
  alElegirPestana: (pestana: Pestana) => void;
}) {
  return (
    <header className={conversacion.header}>
      <div className={conversacion.titleRow}>
        <div className={conversacion.titleCluster}>
          <nav className={conversacion.crumbs} aria-label="dónde estás">
            <span className={conversacion.crumbSeg}>
              <button
                type="button"
                className={clsx(conversacion.crumb, conversacion.crumbCurrent)}
                disabled
              >
                {titulo}
              </button>
            </span>
          </nav>
          <div className={conversacion.headerActions}>
            {modo === undefined ? null : (
              <span className={pastilla.label}>
                {/*
                  El original monta aquí `IconAgentPresetOutline16`, que el paquete
                  publicado (`@deepseek-ai/dsh-client-ui-primitives@0.0.1-rc.1`, el que
                  hay instalado) NO exporta — medido: no está en su lista de exports, y
                  usarlo montaba `undefined` y React reventaba con «Element type is
                  invalid». De los que SÍ exporta, la rama es la que dice la verdad de
                  este dato: el modo es si el proyecto se sincroniza con CloudStudio, y
                  esa sincronización ES una rama (`agent/gitSync.ts`).
                */}
                <IconBranchOutline16 className={pastilla.icon} size={16} />
                {modo === "cloud" ? "modo cloud" : "modo offline"}
              </span>
            )}
          </div>
        </div>
        {/*
          El asiento de la derecha. En la referencia lo ocupa «Session log», que aquí no
          existe —no hay descarga de la sesión que ofrecer—, así que lo ocupa lo único
          que de verdad hay que saber en esa esquina: si el cable sigue vivo. Inventar el
          botón de ellos para rellenar el hueco sería prometer una descarga que no pasa.
        */}
        <div className={conversacion.headerUtilities}>
          <span className={clsx(estilos.estado, conectado ? estilos.conectado : estilos.desconectado)}>
            <span className={estilos.punto} aria-hidden="true" />
            {conectado ? "conectado" : "sin conexión"}
          </span>
        </div>
      </div>

      <div className={conversacion.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={pestana === "chat"}
          className={clsx(conversacion.tab, pestana === "chat" && conversacion.tabActive)}
          onClick={() => alElegirPestana("chat")}
        >
          Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pestana === "trayectoria"}
          className={clsx(conversacion.tab, pestana === "trayectoria" && conversacion.tabActive)}
          onClick={() => alElegirPestana("trayectoria")}
        >
          Trayectoria
        </button>
      </div>
    </header>
  );
}
