/**
 * La rúbrica: qué significa «hecho» en ESTE encargo, y qué se hace cuando no lo está.
 *
 * Portado del `RubricMiddleware` de deepagents, que existe en su SDK de **Python** y no en el
 * de JS. El diseño es suyo y es bueno: en la parada natural del agente —el modelo contesta sin
 * pedir más tools— un CALIFICADOR juzga lo hecho contra unos criterios, y si dice que falta
 * algo su comentario vuelve como mensaje y el bucle sigue, con tope de vueltas.
 *
 * ## Qué es esto y qué NO es
 *
 * **No sustituye al verificador** (`turnoReal.ts#conVerificacion`), lo complementa, y la
 * frontera es lo que cada uno puede saber. El simulador contesta lo OBJETIVO —esto parsea, este
 * atributo existe, este JavaScript no revienta— y por eso su veredicto se puede creer. Un
 * calificador contesta lo que el simulador no ve: si el título se lee entero, si se hizo lo que
 * se pidió, si se cambió algo que nadie pidió. Medido hoy: un especialista cambió
 * `editable="false"` por `locked="true"` dentro de un arreglo visual, y ninguna comprobación
 * estática tiene nada que decir de eso.
 *
 * **Y por eso un rojo suyo no es el rojo del verificador.** El del simulador es una medida; éste
 * es la opinión de un modelo sobre un transcript. Se dice con esas palabras donde se enseñe.
 *
 * ## Dos cosas del original que NO se copian
 *
 * - **Terminar sin satisfacer no puede ser mudo.** Ellos documentan que con `failed`,
 *   `max_iterations_reached` o `grader_error` no tocan los mensajes, así que la última respuesta
 *   es la del modelo y quien llama tiene que ir a mirar un campo privado del estado. Eso es el
 *   mismo fallo que el tope de llamadas tenía aquí: trabajo que acaba a medias sin que nadie se
 *   entere. Aquí el estado no satisfecho SE DICE.
 * - **El calificador entra por un PUERTO**, no como un modelo construido dentro. Así esto se
 *   prueba sin red ni clave, que es el invariante que sostiene el diseño de este repo.
 *
 * Puro: aquí está la política. Quién llama al modelo y quién monta el middleware es de `agent/`.
 */

/** Lo que el calificador puede decir. */
export type Veredicto = "satisfecho" | "necesita-revision" | "fallido";

/**
 * Cómo acabó una evaluación. Los dos últimos no los dice el calificador: los dice el harness.
 *
 * `fallido` es «la rúbrica no se puede evaluar» —está mal escrita, o no habla de esto—, y es
 * distinto de `error-del-calificador`, que es que el modelo no contestó. Uno culpa a la rúbrica
 * y el otro al entorno, y mezclarlos manda a arreglar lo que no estaba roto.
 */
export type EstadoDeRubrica = Veredicto | "tope-de-vueltas" | "error-del-calificador";

/** Un estado terminal cierra el bucle; `necesita-revision` es el único que lo continúa. */
export function esTerminal(estado: EstadoDeRubrica): boolean {
  return estado !== "necesita-revision";
}

export interface Calificacion {
  veredicto: Veredicto;
  /** Qué falta, en palabras del calificador. Vacío con `satisfecho`. */
  comentario: string;
}

/**
 * Cuántas vueltas se le dan.
 *
 * Tres es el valor del original. **Aquí importa más que allí**: cada vuelta puede traer
 * escrituras, y cada escritura pasa por una aprobación — así que un tope alto no es solo gasto,
 * son paradas delante de una persona. Y en una tarea de fondo no hay nadie que frene el bucle,
 * que es el mismo argumento por el que existen `TOPE_REPARACIONES` y el tope de tandas.
 */
export const TOPE_DE_VUELTAS = 3;

/**
 * El mensaje con que vuelve el trabajo al agente.
 *
 * Va con voz del HARNESS y no del usuario: quien lo lee tiene que saber que esto no es alguien
 * pidiendo otra cosa, es una comprobación diciendo que lo pedido no está. Si se disfrazara de
 * petición nueva, el agente podría tomarlo por un cambio de encargo y empezar otra cosa.
 *
 * Y dice de qué vuelta va: sin eso, tres mensajes iguales seguidos se leen como un bucle y el
 * modelo no sabe cuánto margen le queda.
 */
export function mensajeDeRevision(comentario: string, vuelta: number, tope: number): string {
  return [
    `[harness] Revisión ${vuelta} de ${tope}: lo que se pidió NO está hecho del todo.`,
    "",
    comentario.trim(),
    "",
    "Arregla eso y nada más. No es un encargo nuevo ni un cambio de opinión: es la misma tarea,",
    "que todavía no cumple. Si crees que ya está y la revisión se equivoca, dilo y explica por qué",
    "en vez de volver a cambiar lo mismo.",
  ].join("\n");
}

/**
 * Lo que se le dice a quien mira cuando el bucle acaba SIN satisfacer.
 *
 * Existe porque el original no lo tiene: allí el estado no satisfecho vive en un campo privado
 * y la última respuesta sigue siendo la del modelo, que puede estar afirmando que terminó. Un
 * trabajo que no cumple y lo dice como si cumpliera es peor que uno que falla.
 */
export function avisoDeNoSatisfecho(estado: EstadoDeRubrica, comentario?: string): string | undefined {
  if (estado === "satisfecho" || estado === "necesita-revision") return undefined;
  const porQue =
    estado === "tope-de-vueltas"
      ? `se agotaron las ${TOPE_DE_VUELTAS} revisiones y seguía sin cumplir`
      : estado === "fallido"
        ? "la rúbrica no se pudo evaluar contra este trabajo"
        : "la revisión no llegó a dar veredicto (fallo del entorno, no del trabajo)";
  const detalle = comentario?.trim();
  return [
    `⚠ revisión NO satisfecha: ${porQue}.`,
    ...(detalle === undefined || detalle === "" ? [] : [`  ${detalle}`]),
    "  Es la opinión de un modelo sobre lo hecho, no una medida como la del verificador.",
  ].join("\n");
}
