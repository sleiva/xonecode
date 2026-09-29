import clsx from "clsx";
import conversacion from "../../estilos/ConversationRoot.module.css";
import estilos from "./Pestanas.module.css";

export type Pestana = "ficheros" | "revision" | "colecciones" | "planes" | "artefactos" | "ejecutar" | "trazas";

/**
 * La tira de pestañas del PANEL: Ejecutar, Ficheros, Revisión, Colecciones y Trazas — más
 * Planes y Artefactos, si el proyecto o la sesión dejaron alguno —, con la salida del panel
 * delante.
 *
 * **«Chat» ya no es una pestaña, y eso es el cambio.** Era la primera de la tira y significaba
 * «devuélveme la conversación», o sea que las otras seis se leían como sus alternativas: para
 * mirar un fichero había que dejar de ver lo que el agente estaba escribiendo. Desde que el
 * panel puede vivir a la DERECHA del chat (`repartoDeColumnas.ts`), la conversación no es una
 * vista más — es la columna que se queda —, así que lo que estas pestañas eligen no es «qué
 * veo» sino «qué abro al lado». Volver al chat a secas es CERRAR el panel, y por eso el sitio
 * que ocupaba «Chat» lo ocupa ahora una «×».
 *
 * Es la cuarta casa que tiene la tira —estuvo en `Transcript`, luego en `Cabecera`, luego en
 * el panel central— y esta vez la mudanza no la decide una hoja de estilos: la tira es del
 * PANEL, se mueva el panel a donde se mueva. En una ventana ancha eso es la columna derecha y
 * en una estrecha el centro, y este componente no se entera de la diferencia.
 *
 * No recuerda nada: cuál está elegida lo sabe `App`, que es quien también decide qué pintar
 * debajo. Este componente solo dice qué se ha pulsado.
 *
 * **«Tareas» ya NO es una pestaña de aquí.** Vivió aquí como pestaña de ACCIÓN —siempre
 * presente, sin condicionarse a que hubiera alguna, a diferencia de Artefactos— hasta que se
 * movió al panel DEL PROYECTO (`PanelDelProyecto.tsx`, pestaña Tareas, delante de las
 * pendientes del gestor): son tareas del proyecto y no de la sesión, y viven donde vive lo
 * demás del proyecto. Lo que queda de aquella regla sigue valiendo para lo que sí está aquí:
 * **una pestaña de REGISTRO existe si hay registro (Artefactos, Planes); una pestaña de
 * ACCIÓN existe siempre, y su estado vacío dice cómo se empieza.**
 *
 * **Ejecutar abre la tira porque es la de ACCIÓN**: arranca la app en un aparato. Ficheros,
 * Revisión, Colecciones y Artefactos son de REGISTRO —enseñan lo que YA pasó— y van detrás;
 * Trazas es de otro destinatario (quien depura el harness, no quien desarrolla la app), así
 * que sigue cerrando la tira. **Y su recorrido —fase, tiempo y la cola del log— vive DENTRO de
 * Ejecutar**, no en una pestaña de historial aparte: un lanzamiento se lee donde se lanzó, que
 * es donde está el botón que lo provoca y el aparato al que fue.
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
  alCerrar,
  hayArtefactos,
  hayPlanes,
}: {
  pestana: Pestana;
  alElegirPestana: (pestana: Pestana) => void;
  /**
   * Cerrar el panel. **No es opcional**, a diferencia de casi todo lo demás de esta consola:
   * es la única salida del panel cuando ocupa el centro —ahí no hay chat a la vista al que
   * volver con el ratón—, así que una tira sin esto sería una vista de la que no se sale.
   */
  alCerrar: () => void;
  /**
   * ¿Ha dejado esta sesión algún artefacto? Su pestaña solo existe entonces.
   *
   * No es cosmética: casi todas las conversaciones no dibujan nada, y una pestaña
   * «Artefactos» siempre presente sería el control sin dato detrás que este proyecto no se
   * permite en ninguna otra parte. Lo sabe `App` mirando los actos, que ya traen la lista.
   */
  hayArtefactos?: boolean;
  /**
   * ¿Tiene el proyecto algún plan en `.xonecode/planes/`? Su pestaña solo existe entonces: es de
   * REGISTRO como Artefactos —enseña lo que el analista dejó escrito—, y casi ningún proyecto
   * tiene uno. Lo sabe `App` por el mensaje `planes`.
   */
  hayPlanes?: boolean;
}) {
  const pestanas: { id: Pestana; etiqueta: string }[] = [
    // La de ACCIÓN abre la tira: es el verbo que cierra el viaje —lanzar la app en un aparato—,
    // no la foto de lo que ya pasó. SIEMPRE presente: su estado vacío dice cómo se empieza.
    // (Las tareas en background del proyecto ya NO van aquí: son del PANEL DEL PROYECTO, pestaña
    // Tareas, encima de las del gestor — a petición suya, «son del proyecto, no de la sesión».)
    { id: "ejecutar", etiqueta: "Ejecutar" },
    // El árbol del proyecto en el que se trabaja, con visor de solo lectura.
    { id: "ficheros", etiqueta: "Ficheros" },
    // Lo que ESTA sesión ha tocado, con su diff: la única vista que responde a «¿qué me ha
    // cambiado el agente?» sin salir a un terminal. Y lleva dentro la banda de CloudStudio
    // —cuánto queda por subir—, que es la misma pregunta contra otra referencia.
    { id: "revision", etiqueta: "Revisión" },
    // El MODELO XOne del proyecto —colecciones, campos y quién apunta a quién—, del mismo
    // índice que `xone_navegacion`: lo que ve el agente, para que lo vea una persona. De
    // REGISTRO como Ficheros, y como ella SIEMPRE presente: todo proyecto XOne tiene modelo, y
    // uno sin colecciones lo dice en su estado vacío.
    { id: "colecciones", etiqueta: "Colecciones" },
    // Lo que el analista dejó PLANIFICADO, con sus tareas según el plan. Solo si hay alguno.
    ...(hayPlanes === true ? [{ id: "planes" as const, etiqueta: "Planes" }] : []),
    // Lo que el agente DIBUJÓ, que no es del proyecto y por eso no está en las dos de
    // arriba. Solo si hay alguno.
    ...(hayArtefactos === true ? [{ id: "artefactos" as const, etiqueta: "Artefactos" }] : []),
    // Para depurar el HARNESS, no para trabajar en una app XOne: por eso va la última.
    { id: "trazas", etiqueta: "Trazas" },
  ];
  return (
    <div className={estilos.cabecera}>
      {/*
        La «×» va FUERA del `tablist` y antes que él en el DOM, no dentro: un `tablist` solo
        admite `tab`s, y colar ahí un botón que no es una pestaña rompe el recorrido que
        anuncia a quien navega con el teclado («pestaña 7 de 7» para algo que no lleva a
        ninguna vista). Delante porque cerrar es lo contrario de elegir: es la salida, y
        ponerla al final de una tira que además puede desplazarse la escondería justo en el
        panel estrecho, que es donde más falta hace.
      */}
      <button
        type="button"
        className={estilos.cerrar}
        onClick={alCerrar}
        aria-label="Cerrar el panel"
        title="Cerrar el panel"
      >
        <span aria-hidden="true">×</span>
      </button>
      <div className={clsx(conversacion.tabs, estilos.tira)} role="tablist">
        {pestanas.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={pestana === p.id}
            className={clsx(conversacion.tab, estilos.pestana, pestana === p.id && conversacion.tabActive)}
            onClick={() => alElegirPestana(p.id)}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>
    </div>
  );
}
