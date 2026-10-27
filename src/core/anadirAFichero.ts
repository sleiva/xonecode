/**
 * `write_file` con `append`: escribir un documento LARGO por partes.
 *
 * **Existe por una medida** (Maset, 27-10-2026): el analista mandó 30 veces el mismo `TASKS.md` entero en un solo
 * `write_file`, y cada vez se cortó en el tope de salida. Escribir un fichero largo de una vez es apostar a que quepa
 * en una respuesta; por partes, cada llamada lleva una fase o una sección y ninguna se acerca al tope. `edit_file` ya
 * permitía añadir, pero con un ancla que el modelo tiene que copiar exacta del final del fichero.
 *
 * Puro: las dos reglas las comparten la tool (`agent/motores/trueforge/toolsDeFichero.ts`) y la tarjeta de aprobación
 * (`agent/turno/interrupts.ts#cambioDe`), para que lo que se aprueba sea exactamente lo que se escribe.
 */

/**
 * ¿Admite `append` esta ruta? Solo DOCUMENTOS: un `.md`, o lo que cuelga de `/planes/` o `/doc/`. El código del
 * proyecto se cambia con `edit_file`, que dice QUÉ cambia; añadir al final de un `.xne` daría un XML con dos raíces.
 */
export function admiteAnadir(ruta: string): boolean {
  return /\.md$/i.test(ruta) || ruta.startsWith("/planes/") || ruta.startsWith("/doc/");
}

/** Lo que queda tras añadir `trozo`: lo que había, un salto de línea si no acababa en uno, y el trozo. */
export function conTrozoAnadido(antes: string, trozo: string): string {
  return antes === "" || antes.endsWith("\n") ? `${antes}${trozo}` : `${antes}\n${trozo}`;
}
