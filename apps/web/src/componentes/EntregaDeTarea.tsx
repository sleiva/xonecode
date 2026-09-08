import type { TareaDelCable } from "../tipos.js";
import estilos from "./EntregaDeTarea.module.css";

/**
 * Cómo llegó a «Terminada» una tarea, UNA sola pieza para el kanban del escritorio
 * (`Kanban.tsx`) y la lista del proyecto (`TareasDelProyecto.tsx`) — el mismo patrón que
 * `AccionesDeTarea.tsx` y por el mismo motivo: dos copias de lo que una tarjeta AFIRMA es
 * cómo una de las dos acaba afirmando otra cosa.
 *
 * **De dónde sale (F1 de la revisión final).** «Terminada» se puede alcanzar por cuatro
 * caminos y hasta ahora los cuatro se pintaban IGUAL: proyecto, título, hora y descartar.
 * Las tareas 9-11 construyeron la puerta de entrega para que «terminada» no pudiera mentir
 * —tres condiciones que mide el CÓDIGO más el veredicto de un juez— y, para el único caso
 * en que una condición no aplica, eligieron a propósito el canal `veredicto.salvedad`
 * «porque el `motivo` de una tarea terminada no existe: `conEstado` lo borra»
 * (`core/entrega.ts`). Ese canal se quedaba en el host: no viajaba por el cable y ningún
 * componente lo pintaba. Así que la frase de `core/entrega.ts` —«una entrega con una
 * condición menos no puede parecer una entrega normal»— era falsa en la pantalla, y el
 * «Dar por bueno» de la Task 13 añadió una CUARTA forma de llegar ahí —sin verificador y
 * sin juez— justo cuando el único campo que podía distinguirla no viajaba.
 *
 * Las cuatro situaciones y qué se dice de cada una:
 *  - **La aprobó el juez**, con el verificador en verde y nada pendiente: se dice, con sus
 *    palabras, que son las que explican QUÉ se dio por bueno.
 *  - **Se entregó con una condición de MENOS** (`salvedad`): además de lo anterior, cuál.
 *    Hoy la única es la tarea que no cambió ningún fichero, donde el verificador no tiene
 *    dominio y el juez se queda como la única condición de contenido.
 *  - **La dio por buena una PERSONA** (`terminadaAMano`): se dice, y la marca GANA a
 *    cualquier veredicto guardado — una tarea puede llegar a ese botón con un verde ya
 *    escrito (la puerta la aprobó y la escritura del estado final reventó), y atribuírselo
 *    al juez sería contar la aprobación de un modelo como la de una persona… o al revés.
 *    Si pisó un rojo, lo que el juez había dicho se lee al lado: es lo único que explica
 *    qué se decidió ignorar.
 *  - **No consta**: sin veredicto y sin marca no se afirma ninguna de las dos cosas. Son
 *    las tareas de antes de que la puerta existiera; inventarles un «la aprobó el juez»
 *    sería la mentira que este campo existe para cerrar.
 *
 * **Solo en `terminada`, y eso es una decisión.** En los otros tres estados el `motivo` ya
 * lleva las palabras del juez cuando fue él quien la aparcó (`corredorDeTareas.ts` compone
 * «el juez de QA dijo «rojo»: …»), y repetir la misma frase dos veces en una tarjeta de 280
 * px enseña a no leerla. Lo que aquí no se puede leer de ninguna otra forma es lo que pasa
 * cuando el `motivo` YA NO EXISTE, que es exactamente el caso de una tarea entregada.
 */
export function EntregaDeTarea({ tarea: t }: { tarea: TareaDelCable }) {
  if (t.estado !== "terminada") return null;
  const v = t.veredicto;
  const aMano = t.terminadaAMano === true;
  const hallazgos = v?.hallazgos ?? [];
  return (
    <div className={estilos.entrega}>
      {aMano ? (
        <p className={estilos.frase} data-via="persona">
          La dio por buena una persona, sin verificador y sin juez.
        </p>
      ) : v === undefined ? (
        <p className={estilos.frase} data-via="sin-constancia">
          No consta ningún veredicto de esta entrega.
        </p>
      ) : v.veredicto === "verde" ? (
        <p className={estilos.frase} data-via="juez">
          El juez de QA la aprobó: {v.resumen}
        </p>
      ) : (
        // Terminada con un veredicto que no es verde y sin marca de persona: la puerta no
        // pudo entregarla así (`decisionDeEntrega` exige el verde), así que no se explica
        // cómo llegó — y eso es lo que se dice, en vez de elegir una de las dos versiones.
        <p className={estilos.frase} data-via="raro">
          Terminada, pero el juez de QA había dicho «{v.veredicto}»: {v.resumen}
        </p>
      )}
      {aMano && v !== undefined ? (
        <p className={estilos.detalle}>
          El juez de QA había dicho «{v.veredicto}»: {v.resumen}
        </p>
      ) : null}
      {v?.salvedad === undefined ? null : (
        <p className={estilos.salvedad}>Se entregó con una condición menos: {v.salvedad}</p>
      )}
      {hallazgos.length === 0 ? null : (
        <ul className={estilos.hallazgos}>
          {hallazgos.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
