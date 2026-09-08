import clsx from "clsx";
import conversacion from "../../estilos/ConversationRoot.module.css";
import estilos from "./Pestanas.module.css";

export type Pestana = "chat" | "ficheros" | "revision" | "artefactos" | "tareas" | "trazas";

/**
 * La tira de pestañas: Chat, Ficheros, Revisión y Trazas.
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
  hayArtefactos,
  hayTareas,
}: {
  pestana: Pestana;
  alElegirPestana: (pestana: Pestana) => void;
  /**
   * ¿Ha dejado esta sesión algún artefacto? Su pestaña solo existe entonces.
   *
   * No es cosmética: casi todas las conversaciones no dibujan nada, y una pestaña
   * «Artefactos» siempre presente sería el control sin dato detrás que este proyecto no se
   * permite en ninguna otra parte. Lo sabe `App` mirando los actos, que ya traen la lista.
   */
  hayArtefactos?: boolean;
  /**
   * ¿Tiene el proyecto ABIERTO alguna tarea en background? Su pestaña solo existe entonces
   * — la misma regla que `hayArtefactos`: un control sin dato detrás es la misma mentira
   * que una lista vacía rellenada. `App` la calcula filtrando `estado.tareas.lista` por el
   * proyecto activo, no pidiendo nada nuevo al servidor.
   */
  hayTareas?: boolean;
}) {
  const pestanas: { id: Pestana; etiqueta: string }[] = [
    { id: "chat", etiqueta: "Chat" },
    // El árbol del proyecto en el que se trabaja, con visor de solo lectura.
    { id: "ficheros", etiqueta: "Ficheros" },
    // Lo que ESTA sesión ha tocado, con su diff: la única vista que responde a «¿qué me ha
    // cambiado el agente?» sin salir a un terminal.
    { id: "revision", etiqueta: "Revisión" },
    // Lo que el agente DIBUJÓ, que no es del proyecto y por eso no está en las dos de
    // arriba. Solo si hay alguno.
    ...(hayArtefactos === true ? [{ id: "artefactos" as const, etiqueta: "Artefactos" }] : []),
    // La cola de tareas en background del proyecto ABIERTO, no de la máquina entera — el
    // kanban global ya vive en el escritorio. Solo si hay alguna.
    ...(hayTareas === true ? [{ id: "tareas" as const, etiqueta: "Tareas" }] : []),
    // Para depurar el HARNESS, no para trabajar en una app XOne: por eso va la última.
    { id: "trazas", etiqueta: "Trazas" },
  ];
  return (
    <div className={clsx(conversacion.tabs, estilos.tira)} role="tablist">
      {pestanas.map((p) => (
        <button
          key={p.id}
          type="button"
          role="tab"
          aria-selected={pestana === p.id}
          className={clsx(conversacion.tab, pestana === p.id && conversacion.tabActive)}
          onClick={() => alElegirPestana(p.id)}
        >
          {p.etiqueta}
        </button>
      ))}
    </div>
  );
}
