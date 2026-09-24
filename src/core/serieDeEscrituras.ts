/**
 * Una cola por CLAVE: dos tareas con la misma clave nunca se solapan; con claves distintas
 * corren a la vez.
 *
 * **Por qué hace falta.** `write` y `edit` de un backend de ficheros son
 * leer-modificar-escribir: leen el fichero entero, sustituyen y lo escriben entero. Dos a la
 * vez sobre el MISMO fichero se pisan, y el modo de fallo es el peor que hay — las dos
 * devuelven «bien» y una de las dos no está en el disco. Reproducido contra el backend real:
 * cuatro `edit` concurrentes sobre un fichero, cuatro resultados sin error, **una** aplicada.
 *
 * **Y serializar SÍ basta, que era la duda razonable.** La objeción es que la segunda edición
 * se resolvió contra un contenido que la primera acaba de cambiar, así que su `old_string`
 * podría no valer ya. Cierto, y por eso esto va DEBAJO de quien edita y no encima: el backend
 * vuelve a leer el fichero y vuelve a buscar el `old_string` cuando le toca su turno, así que
 * el ancla se comprueba contra lo que hay. Medido con el backend de verdad:
 *
 * | | en paralelo | en serie |
 * |---|---|---|
 * | cuatro ediciones independientes | 1 aplicada, 0 errores | 4 aplicadas, 0 errores |
 * | dos que se pisan | — | 1 aplicada, **1 error** |
 *
 * O sea que la edición que ya no encaja **falla en voz alta** en vez de perderse en silencio,
 * y el modelo recibe su error y reintenta, que es el camino que este harness ya tiene.
 *
 * **Puro a propósito**: no sabe de ficheros ni de backends, solo de claves y de promesas. Así
 * se prueba sin disco (`npm test` no toca la casa de nadie) y el mismo mecanismo sirve el día
 * que haya otro recurso que no admita dos a la vez.
 */

/** Encola `tarea` detrás de lo que ya haya pendiente para `clave`. */
export type EnSerie = <T>(clave: string, tarea: () => Promise<T>) => Promise<T>;

/**
 * Crea un serializador con su propia cola.
 *
 * Tres decisiones que no son de forma:
 *
 *  - **Un fallo NO envenena la cola.** La siguiente se encadena al resultado *saldado* de la
 *    anterior, no a su promesa cruda: si la primera rechaza, la segunda corre igual. Lo
 *    contrario convertiría un error de una escritura en el bloqueo de todas las siguientes
 *    sobre ese fichero, que es un fallo mucho peor que el que esto viene a arreglar.
 *  - **La entrada se RETIRA cuando se vacía**, comparando que la cola siga siendo la suya.
 *    Sin eso el mapa crece con una entrada por fichero tocado y no se vacía nunca, en un
 *    proceso que vive lo que dure la consola.
 *  - **Devuelve lo que devuelva la tarea, y relanza lo que lance.** Esto es un turno de espera,
 *    no un envoltorio que decide: si además cambiara el resultado, cada sitio que lo use
 *    habría que volver a medirlo.
 */
export function crearSerieDeEscrituras(): EnSerie {
  const colas = new Map<string, Promise<unknown>>();

  return <T>(clave: string, tarea: () => Promise<T>): Promise<T> => {
    const anterior = colas.get(clave) ?? Promise.resolve();
    // `.then(() => …, () => …)` y no `.finally`: hay que SALDAR el rechazo de la anterior para
    // que no se propague a ésta. Con `.catch` encadenado el valor sería el del catch.
    const mia = anterior.then(
      () => tarea(),
      () => tarea(),
    );
    // Lo que se guarda como «la cola» es la versión SALDADA: si `mia` rechaza y nadie más la
    // observa, un rechazo sin manejar tumbaría el proceso en Node.
    const saldada = mia.then(
      () => undefined,
      () => undefined,
    );
    colas.set(clave, saldada);
    void saldada.then(() => {
      if (colas.get(clave) === saldada) colas.delete(clave);
    });
    return mia;
  };
}

/**
 * Lo que se le DICE al modelo sobre escribir en paralelo, en la descripción de `write_file` y
 * `edit_file` de los dos motores —una sola frase para los dos, para que no diverjan—.
 *
 * La cola de arriba hace que dos escrituras al mismo fichero no se pisen: es la CORRECCIÓN, y no
 * depende de que el modelo obedezca. Esto es la otra mitad, la EFICIENCIA: sin decírselo, un
 * modelo que agrupa `tool_calls` —DeepSeek lo hace, medido— pide cinco ediciones del mismo HTML
 * en una respuesta; en fila, las que ya no encajan fallan y hay que reintentarlas. Lo que sí
 * puede ir a la vez se dice también: prohibir el paralelismo entero tiraría lo que sí vale.
 */
export const REGLA_DE_ESCRITURAS_EN_PARALELO =
  "Lo independiente puede ir en paralelo —leer varios ficheros, editar ficheros DISTINTOS—. " +
  "Pero varias escrituras del MISMO fichero NO las pidas a la vez: se aplican en fila y la que ya " +
  "no encaje falla. Júntalas en una sola edición, o hazlas una detrás de otra.";

