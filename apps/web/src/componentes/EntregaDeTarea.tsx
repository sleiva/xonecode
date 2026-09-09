import type { TareaDelCable } from "../tipos.js";
import estilos from "./EntregaDeTarea.module.css";

/**
 * Qué dijo el juez de QA de una tarea, y —si está entregada— por cuál de los cuatro caminos
 * llegó. UNA sola pieza para el kanban del escritorio (`Kanban.tsx`) y la lista del
 * proyecto (`TareasDelProyecto.tsx`) — el mismo patrón que `AccionesDeTarea.tsx` y por el
 * mismo motivo: dos copias de lo que una tarjeta AFIRMA es cómo una de las dos acaba
 * afirmando otra cosa.
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
 * **Entregada**, las cuatro situaciones y qué se dice de cada una:
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
 * **Sin entregar, lo que se enseña son los HALLAZGOS**, y esa es la parte accionable: el
 * `motivo` de una aparcada dice el qué —`corredorDeTareas.ts` lo compone como «el juez de
 * QA dijo «rojo»: <resumen>»— y los hallazgos son la lista de lo que falta, que es lo que
 * una persona necesita para contestar el feedback. Nada de esto es «cómo se entregó»:
 * todavía no se ha entregado, y decirlo ahí sería afirmar un final que no ha llegado.
 *
 * **Y el resumen se pinta UNA vez.** No se esconde el bloque para no repetirlo: se
 * comprueba si el `motivo` ya lo lleva dentro —los dos salen del mismo dato del servidor,
 * así que la comparación es exacta y no una heurística—. Si la aparcó otra cosa (un corte a
 * mitad, con el veredicto del intento anterior guardado), el motivo no habla del juez y
 * entonces el resumen SÍ hace falta: sin él, los hallazgos flotarían sin sujeto.
 */
export function EntregaDeTarea({ tarea: t }: { tarea: TareaDelCable }) {
  const v = t.veredicto;
  const entregada = t.estado === "terminada";
  if (!entregada && v === undefined) return null;
  const aMano = t.terminadaAMano === true;
  const hallazgos = v?.hallazgos ?? [];
  // Los dos vienen del servidor y el motivo del juez se compone con el resumen dentro, así
  // que esto es una comparación exacta: no hay heurística que se pueda quedar corta.
  const resumenYaDicho = v !== undefined && t.motivo !== undefined && t.motivo.includes(v.resumen);
  return (
    <div className={estilos.entrega}>
      {!entregada ? (
        // Sin entregar no se dice ningún «cómo llegó»: no ha llegado. Solo lo que el juez
        // dijo, y solo si no está ya en el motivo que la tarjeta pinta encima.
        resumenYaDicho ? null : (
          <p className={estilos.frase} data-via="juez-pendiente">
            El juez de QA dijo «{v!.veredicto}»: {v!.resumen}
          </p>
        )
      ) : aMano ? (
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
      {entregada && aMano && v !== undefined ? (
        <p className={estilos.detalle}>
          El juez de QA había dicho «{v.veredicto}»: {v.resumen}
        </p>
      ) : null}
      {/* Solo entregada: la salvedad se compone al entregar, pero puede quedar guardada en
          una aparcada por el mismo camino estrecho que deja ahí un verde (la puerta aprueba
          y la escritura del estado revienta) — y decir «se entregó» de algo que no se
          entregó es justo la mentira que esta pieza quita. */}
      {!entregada || v?.salvedad === undefined ? null : (
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
