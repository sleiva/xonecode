import type { Acto } from "../tipos.js";
import estilos from "./MirarTarea.module.css";

/**
 * Lo que está haciendo el turno de una tarea de fondo, EN VIVO.
 *
 * **Es el transcript de su sesión y no un registro nuevo** (decisión 3 del diseño): lo que
 * se pinta son los mismos actos que `volcar()` escribe en su `.jsonl`, así que cuando la
 * tarea acabe, abrir su conversación enseña esto mismo. Un segundo registro sería otra
 * fuente que puede contradecir a la conversación que se lee al lado — la misma regla que la
 * lista de artefactos, que sale de los actos y nunca del disco.
 *
 * **Y es de SOLO lectura, que es una decisión y no un hueco** (decisión 2): no hay
 * compositor. Esa consola es de la tarea, y darle a alguien una caja de texto ahí
 * prometería una conversación que el turno no va a leer — el turno corre con
 * `crearConsolaDeTarea`, que no tiene de dónde sacar líneas. Lo que sí existe para
 * intervenir es aparcar con feedback, y vive en la tarjeta. La ausencia se DICE: una caja
 * que falta se lee igual que un fallo de la interfaz.
 *
 * **No es el `Chat`, a propósito.** Ese componente monta el estado vacío de una sesión
 * nueva («pide algo en la caja de abajo»), el aviso de relectura y el plegado del pulso al
 * terminar el turno — tres cosas escritas para una conversación que se puede seguir. Aquí no
 * hay ninguna, y lo que hace falta es densidad: qué está haciendo, ahora. Lo que sí se copia
 * es el criterio de qué se lee y qué es paisaje — el pulso en gris y en una línea— y que el
 * `fin` no se pinta: es el cierre del registro con su duración, un dato de la Trayectoria.
 */
export function MirarTarea({
  titulo,
  actos,
  alCerrar,
}: {
  /** El título de la tarea, para saber de cuál es este transcript. */
  titulo: string;
  actos: readonly Acto[];
  alCerrar: () => void;
}) {
  return (
    <section className={estilos.panel} aria-label={`Lo que hace: ${titulo}`}>
      <div className={estilos.cabecera}>
        <h3 className={estilos.titulo}>Lo que hace: {titulo}</h3>
        <button type="button" className={estilos.cerrar} onClick={alCerrar}>
          Cerrar
        </button>
      </div>
      <p className={estilos.nota}>
        Es <strong>su conversación</strong>, la misma que se lee al abrir la sesión cuando
        acabe — no un registro aparte. De <strong>solo lectura</strong>: para intervenir,
        contéstale con el feedback de su tarjeta cuando la tarea lo pida.
      </p>
      {actos.length === 0 ? (
        // Distinto de «se ha colgado»: la tarea corre y todavía no ha pintado nada. Decirlo
        // es lo que evita que un tramo callado —el modelo pensando— se lea como un cuelgue.
        <p className={estilos.vacio}>Todavía no ha pintado nada. En cuanto empiece, aparecerá aquí.</p>
      ) : (
        <ul className={estilos.transcript}>
          {actos.map((acto, indice) => (
            // El índice como clave: los actos no tienen id y esta lista solo crece por el
            // final o sustituye su último elemento (`store.ts`, el `case "mirada"`).
            <li key={indice}>
              <Linea acto={acto} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Linea({ acto }: { acto: Acto }) {
  switch (acto.tipo) {
    case "usuario":
      return <p className={estilos.usuario}>{acto.texto}</p>;
    case "asistente":
      return <p className={estilos.asistente}>{acto.texto}</p>;
    case "razonamiento":
      // Plegado, como en el chat: puede ser larguísimo y no es la respuesta. `<details>`
      // nativo, sin una línea de JavaScript.
      return (
        <details className={estilos.razonamiento}>
          <summary>Razonamiento</summary>
          <p className={estilos.razonamientoTexto}>{acto.texto}</p>
        </details>
      );
    case "herramientas":
      return (
        <p className={estilos.pulso}>
          {acto.lineas.join("\n")}
        </p>
      );
    case "fase":
      return <p className={estilos.pulso}>{acto.texto}</p>;
    case "sistema":
      // Los actos de sistema SE VEN, y esto es lo que más falta hace aquí: por ese canal
      // pasan el aviso de las escrituras que la tarea autorizó sin que nadie las aprobara y
      // el motivo con el que se aparca. Esconderlos en una pestaña de depuración es
      // exactamente el aviso que nadie lee.
      return <p className={estilos.sistema}>{acto.texto}</p>;
    case "error":
      return <p className={estilos.error}>{acto.texto}</p>;
    case "artefacto":
      // Nombre y peso, sin enlace: abrir un artefacto se hace desde la sesión, que es quien
      // resuelve la ruta (`GET /artefacto`). Prometerlo aquí sería un botón sin nada detrás.
      return (
        <p className={estilos.artefacto}>
          Artefacto: {acto.nombre} ({acto.bytes} B)
        </p>
      );
    case "fin":
      // El cierre del registro con su duración: un dato de la Trayectoria, no una línea de
      // conversación. Mismo criterio que el chat.
      return null;
  }
}
