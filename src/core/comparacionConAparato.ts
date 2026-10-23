/**
 * Qué ficheros del proyecto son DISTINTOS de los que ya tiene el aparato: la regla de «Copiar solo
 * los modificados» (pestaña Ejecutar), pura.
 *
 * «Modificado» se mide contra el APARATO, no contra git ni contra la sesión: lo que importa es qué
 * le falta a la app que corre allí, y eso solo lo sabe el aparato. Se pregunta con el comando
 * `getFileChecksum` del canal de hotswap (CRC32 por fichero), el mismo que usa
 * `skills/xone-hotswap/scripts/xone-recargar-android`, y de él salen las dos reglas de aquí:
 *
 * - **Un fichero que el aparato no tiene hace FALLAR la petición entera**, con un `ENOENT` que
 *   nombra su ruta. Se saca de la petición, se cuenta como NUEVO y se vuelve a preguntar.
 * - **Ese bucle es de un viaje por fichero nuevo, así que lleva tope** (`TOPE_DE_NUEVOS`): con
 *   muchos nuevos —una app que nunca se desplegó— lo que toca es copiar todos.
 */

/** Cuántos ficheros nuevos se persiguen uno a uno antes de mandar a copiar todos. El del script. */
export const TOPE_DE_NUEVOS = 25;

/** El motivo de rendirse por tope: dice qué pasó y qué hacer. */
export const MOTIVO_DEMASIADOS_NUEVOS =
  "el aparato no tiene muchos de estos ficheros (¿la app no está desplegada?): usa «Copiar todos los ficheros»";

/**
 * La ruta, relativa a la app, del fichero que falta según el mensaje de un `getFileChecksum`
 * fallido. `undefined` si el fallo es otro. La forma es la medida en el script:
 * `…/app_<nombre>/<ruta>: open failed: ENOENT…`.
 */
export function ficheroQueFaltaEnElAparato(mensaje: string): string | undefined {
  const ruta = /app_[^/\\]+[/\\](.+?): open failed/.exec(mensaje)?.[1];
  return ruta === undefined ? undefined : ruta.replaceAll("\\", "/");
}

/**
 * Lo que hay que subir: lo NUEVO, más lo que el aparato tiene con otro CRC. El orden es el de
 * `locales`. Un fichero que el aparato no nombra en su respuesta también va: no saber no es «igual».
 */
export function ficherosDistintos(
  locales: ReadonlyMap<string, number>,
  remotos: Readonly<Record<string, unknown>>,
  nuevos: ReadonlySet<string>
): string[] {
  const distintos: string[] = [];
  for (const [ruta, crc] of locales) {
    if (nuevos.has(ruta) || String(remotos[ruta]) !== String(crc)) distintos.push(ruta);
  }
  return distintos;
}
