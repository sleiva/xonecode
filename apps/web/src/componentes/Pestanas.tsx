import clsx from "clsx";
import conversacion from "../../estilos/ConversationRoot.module.css";
import estilos from "./Pestanas.module.css";

export type Pestana = "chat" | "ficheros" | "revision" | "artefactos" | "tareas" | "ejecutar" | "trazas";

/**
 * La tira de pestañas: Chat, Tareas, Ficheros, Revisión y Trazas — más Artefactos, si la
 * sesión dejó alguno.
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
 *
 * **«Tareas» NO se condiciona a que haya alguna (Task 15), y eso matiza la regla de
 * `hayArtefactos` de aquí abajo — no la contradice.** Un artefacto es el REGISTRO de algo
 * que el agente ya dibujó, así que una pestaña de artefactos vacía es el control sin dato
 * detrás que este proyecto no se permite en ninguna parte: bien escondida. Una tarea es lo
 * contrario — es donde se ACTÚA —, y antes de esta tarea la pestaña de Tareas SÍ se
 * condicionaba igual que Artefactos: la consecuencia medida fue que, con proyecto abierto,
 * la única puerta para crear la primera tarea de ese proyecto era volver al escritorio (la
 * marca «xonecode»), y la pestaña que enseñaría cómo hacerlo desaparecía justo cuando hacía
 * falta. El criterio que queda, y que no hay que volver a decidir: **una pestaña de
 * REGISTRO existe si hay registro; una pestaña de ACCIÓN existe siempre, y su estado vacío
 * dice cómo se empieza** (ver `TareasDelProyecto.tsx`, que es quien pinta ese estado vacío).
 *
 * **Y por eso Tareas se sienta junto a Chat, no al final.** Chat y Tareas son las dos
 * primeras pestañas de ACCIÓN —una habla con el agente ahora mismo, la otra le manda un
 * encargo para que trabaje solo—; Ficheros, Revisión y Artefactos son de REGISTRO —enseñan
 * lo que YA pasó, y por eso siguen agrupadas donde estaban—, y Trazas es de otro destinatario
 * (quien depura el harness, no quien desarrolla la app), así que sigue cerrando la tira.
 *
 * **«Ejecutar» es la TERCERA de ACCIÓN, y va justo detrás de Tareas (Task 10).** Cierra el
 * viaje entero del harness en un aparato —el agente escribe, el verificador mira, y esto
 * ARRANCA la app—, que hasta ahora era el terminal, la skill y `adb` a mano. Existe siempre
 * por el mismo criterio que Tareas: es donde se ACTÚA, y su estado vacío dice cómo se
 * empieza, así que condicionarla a que haya una medida sería volver al defecto que aquel
 * criterio vino a arreglar. **Y su recorrido —fase, tiempo y la cola del log— vive DENTRO**,
 * no en una pestaña de historial aparte: un lanzamiento se lee donde se lanzó, que es donde
 * está el botón que lo provoca y el aparato al que fue.
 *
 * **La sincronización con CloudStudio NO es una pestaña: vive dentro de Revisión**, como una
 * banda arriba. Tenía la suya —era la tercera de ACCIÓN y existía siempre, con el mismo
 * criterio que Tareas— y se fue de aquí el día que se miró lo que contesta: «cuánto queda por
 * subir» es la MISMA pregunta que contesta Revisión —qué ha cambiado— medida contra otra
 * referencia, la rama de la bajada en vez de la foto de la sesión. Dos pestañas para dos
 * referencias del mismo diff obligaban a ir y volver para cuadrar los dos números, y el que
 * se lee primero —«3 ficheros por subir»— no tenía por qué estar a un clic del que explica
 * de dónde salen. Lo que NO cambia por mudarse: sigue existiendo siempre (Revisión existe
 * siempre), y sus dos botones siguen mandando la INTENCIÓN por el lazo, con el plan, la
 * guarda de árbol sucio y la aprobación del terminal.
 */
export function Pestanas({
  pestana,
  alElegirPestana,
  hayArtefactos,
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
}) {
  const pestanas: { id: Pestana; etiqueta: string }[] = [
    { id: "chat", etiqueta: "Chat" },
    // Junto al Chat, y no al final: las dos son de ACCIÓN (ver el comentario del componente,
    // más arriba). La cola de tareas en background es del proyecto ABIERTO, no de la máquina
    // entera — el kanban global ya vive en el escritorio. SIEMPRE presente, a propósito.
    { id: "tareas", etiqueta: "Tareas" },
    // La tercera de ACCIÓN, y por eso va aquí y no con las de registro: es el verbo que
    // cierra el viaje —lanzar la app en un aparato—, no la foto de lo que ya pasó. SIEMPRE
    // presente, por el mismo criterio que Tareas: su estado vacío dice cómo se empieza.
    { id: "ejecutar", etiqueta: "Ejecutar" },
    // El árbol del proyecto en el que se trabaja, con visor de solo lectura.
    { id: "ficheros", etiqueta: "Ficheros" },
    // Lo que ESTA sesión ha tocado, con su diff: la única vista que responde a «¿qué me ha
    // cambiado el agente?» sin salir a un terminal. Y lleva dentro la banda de CloudStudio
    // —cuánto queda por subir—, que es la misma pregunta contra otra referencia.
    { id: "revision", etiqueta: "Revisión" },
    // Lo que el agente DIBUJÓ, que no es del proyecto y por eso no está en las dos de
    // arriba. Solo si hay alguno.
    ...(hayArtefactos === true ? [{ id: "artefactos" as const, etiqueta: "Artefactos" }] : []),
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
