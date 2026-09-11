/**
 * Con qué código está corriendo esto, dicho al arrancar.
 *
 * **Existe por tres rondas perdidas el 11-09-2026.** Un cambio del servidor no se ve hasta
 * parar y volver a arrancar el proceso, mientras que el cliente se lee del DISCO en cada
 * petición (`web/servidor/servidor.ts`) y por tanto se actualiza con solo recargar la
 * página. Así que una consola puede enseñar a la vez lo nuevo del cliente y lo viejo del
 * servidor — que es exactamente lo que pasó, y ni quien miraba la pantalla ni quien leía el
 * código tenían forma de saber qué había vivo dentro de ese proceso. Un identificador al
 * arrancar lo contesta de un vistazo.
 *
 * Es la misma disciplina que el resto: se dice lo que consta y no se rellena lo que no.
 */

export interface VersionEnMarcha {
  /** La del `package.json`. Siempre hay. */
  version: string;
  /** El commit corto, si esto es una copia de git. Ausente en un paquete instalado. */
  commit?: string;
  /**
   * Había cambios sin commitear al arrancar.
   *
   * Importa más que el commit: con el árbol sucio, el commit por sí solo MIENTE sobre lo que
   * está corriendo. Ausente es «no se pudo mirar», que no es lo mismo que «estaba limpio» —
   * la distinción de siempre, y aquí decide si la línea puede afirmar algo o no.
   */
  sucio?: boolean;
}

/**
 * La línea que se imprime. Pura, para poder probar los cuatro casos sin git.
 *
 * Sin commit no se inventa ninguno: un paquete instalado no tiene, y decir «desconocido»
 * sería ruido. Con el árbol sucio se DICE, porque entonces el commit no describe lo que
 * corre; y si no se pudo mirar, se dice eso y no «limpio».
 */
export function lineaDeVersion(v: VersionEnMarcha): string {
  if (v.commit === undefined) return `xonecode ${v.version}`;
  const estado =
    v.sucio === true
      ? " + cambios sin commitear"
      : v.sucio === undefined
        ? " (no se pudo mirar si hay cambios sin commitear)"
        : "";
  return `xonecode ${v.version} · ${v.commit}${estado}`;
}
