import clsx from "clsx";
import conversacion from "../../estilos/ConversationRoot.module.css";
import estilos from "./Pestanas.module.css";

export type Pestana = "chat" | "trazas" | "ficheros";

/**
 * La tira de pestañas: Chat, Trazas y Ficheros.
 *
 * Vive en el PANEL CENTRAL, no en la barra superior. Es la tercera casa que tiene —estuvo
 * en `Transcript`, luego en `Cabecera`— y esta vez la mudanza la decide una regla y no una
 * hoja de estilos: desde que la barra azul cruza las dos columnas (`Maqueta.tsx`), esa barra
 * es de la APLICACIÓN, y unas pestañas que solo existen con sesión abierta y que solo
 * cambian lo que se ve en el centro no son de la aplicación — son del centro. Puestas
 * arriba, además, quedaban centradas sobre la barra lateral, señalando a una columna que no
 * cambian.
 *
 * Lo que se llevó consigo la mudanza: sobre el azul profundo las pestañas necesitaban
 * colores propios (`Cabecera.module.css` tenía tres reglas para eso). Aquí caen sobre la
 * superficie clara para la que la hoja copiada las diseñó, así que lo único NUESTRO que
 * queda es el acento de la elegida — cian, como en el rediseño y como el resto de acentos
 * de la aplicación.
 *
 * No recuerda nada: cuál está elegida lo sabe `App`, que es quien también decide qué pintar
 * debajo. Este componente solo dice qué se ha pulsado.
 */
export function Pestanas({
  pestana,
  alElegirPestana,
}: {
  pestana: Pestana;
  alElegirPestana: (pestana: Pestana) => void;
}) {
  return (
    <div className={clsx(conversacion.tabs, estilos.tira)} role="tablist">
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
        aria-selected={pestana === "trazas"}
        className={clsx(conversacion.tab, pestana === "trazas" && conversacion.tabActive)}
        onClick={() => alElegirPestana("trazas")}
      >
        Trazas
      </button>
      {/*
        La tercera pestaña: lo que ESTA sesión ha tocado en el disco. No está en el CSS
        copiado —allí son dos— pero es la misma tira y el mismo botón; lo que la justifica
        es que es la única vista que responde a «¿qué me ha cambiado el agente?» sin salir
        a un terminal.
      */}
      <button
        type="button"
        role="tab"
        aria-selected={pestana === "ficheros"}
        className={clsx(conversacion.tab, pestana === "ficheros" && conversacion.tabActive)}
        onClick={() => alElegirPestana("ficheros")}
      >
        Ficheros
      </button>
    </div>
  );
}
