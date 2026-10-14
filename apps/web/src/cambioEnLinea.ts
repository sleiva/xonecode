import type { LineaDeDiff } from "./plegarIguales.js";

/**
 * QUÉ cambió dentro de una línea modificada, para resaltarlo en el diff de la aprobación.
 *
 * Existe por una captura suya: una línea de un `.xne` cambiaba al FINAL —un atributo tras ciento
 * cincuenta caracteres de `<prop …>` igual— y en la tarjeta se veían dos líneas casi idénticas,
 * una roja y una verde, sin poder decir qué había cambiado. Con el trozo resaltado se ve sin leer
 * las dos enteras.
 *
 * La regla es la más simple que contesta eso: el prefijo y el sufijo COMUNES de las dos líneas
 * no cambian, y lo de en medio sí. Se ajusta a límites de palabra para no partir un nombre por la
 * mitad («MAP_VER|SIONAPP»). No es un diff por palabras: dos cambios lejanos en la misma línea
 * resaltan todo lo de entre medias, que sigue siendo verdad —todo eso está entre dos cambios— y
 * nunca esconde uno.
 */
export interface TrozoDeLinea {
  texto: string;
  /** Este trozo es el que cambió. */
  cambia: boolean;
}

const DE_PALABRA = /[\p{L}\p{N}_-]/u;

/** Qué parte de la línea más larga tiene que quedar igual para leer el par como UNA línea
 *  modificada y resaltar el trozo que cambió. */
export const PARECIDO_MINIMO = 0.5;

/** Los trozos de la línea de ANTES y la de DESPUÉS, con lo que cambió marcado en cada una. */
export function trozosDelCambio(antes: string, despues: string): { antes: TrozoDeLinea[]; despues: TrozoDeLinea[] } {
  const corta = Math.min(antes.length, despues.length);
  let inicio = 0;
  while (inicio < corta && antes[inicio] === despues[inicio]) inicio++;
  let fin = 0;
  while (fin < corta - inicio && antes[antes.length - 1 - fin] === despues[despues.length - 1 - fin]) fin++;
  // Al límite de palabra por los dos lados: se retrocede mientras se esté dentro de una palabra.
  while (inicio > 0 && DE_PALABRA.test(antes[inicio - 1]!) && DE_PALABRA.test(antes[inicio] ?? " ")) inicio--;
  while (fin > 0 && DE_PALABRA.test(antes[antes.length - fin]!) && DE_PALABRA.test(antes[antes.length - fin - 1] ?? " ")) fin--;
  const partir = (texto: string): TrozoDeLinea[] =>
    [
      { texto: texto.slice(0, inicio), cambia: false },
      { texto: texto.slice(inicio, texto.length - fin), cambia: true },
      { texto: texto.slice(texto.length - fin), cambia: false },
    ].filter((t) => t.texto !== "");
  return { antes: partir(antes), despues: partir(despues) };
}

/**
 * Los resaltes de un tramo de líneas: cada racha de líneas QUITADAS seguida de una de AÑADIDAS se
 * empareja línea a línea (la primera quitada con la primera añadida…), que es como el LCS de
 * `core/diff.ts` deja una modificación. Lo que no tiene pareja —una línea solo añadida— no se
 * resalta por dentro: entera es el cambio, y su fondo ya lo dice.
 */
export function resaltesDelTramo(lineas: readonly LineaDeDiff[]): Map<number, TrozoDeLinea[]> {
  const resaltes = new Map<number, TrozoDeLinea[]>();
  let i = 0;
  while (i < lineas.length) {
    if (lineas[i]!.tipo !== "quitado") {
      i++;
      continue;
    }
    const desdeQuitadas = i;
    while (i < lineas.length && lineas[i]!.tipo === "quitado") i++;
    const desdeAnadidas = i;
    while (i < lineas.length && lineas[i]!.tipo === "anadido") i++;
    const parejas = Math.min(desdeAnadidas - desdeQuitadas, i - desdeAnadidas);
    for (let k = 0; k < parejas; k++) {
      const vieja = lineas[desdeQuitadas + k]!.texto;
      const nueva = lineas[desdeAnadidas + k]!.texto;
      const { antes, despues } = trozosDelCambio(vieja, nueva);
      // Dos líneas que apenas se parecen («</frame>» por «<prop …/>») no son una modificación:
      // resaltar «todo» no dice nada que el fondo no diga ya. Solo si lo que se queda igual es,
      // al menos, `PARECIDO_MINIMO` de la más larga.
      const igual = antes.filter((t) => !t.cambia).reduce((n, t) => n + t.texto.length, 0);
      if (igual < PARECIDO_MINIMO * Math.max(vieja.length, nueva.length)) continue;
      resaltes.set(desdeQuitadas + k, antes);
      resaltes.set(desdeAnadidas + k, despues);
    }
  }
  return resaltes;
}
