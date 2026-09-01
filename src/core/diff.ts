/**
 * El diff de líneas para la aprobación: el ANTES contra el DESPUÉS de una escritura
 * pendiente, como datos — quien pinta decide colores y presupuesto de líneas.
 *
 * Es PURO a propósito: quién aprueba y de dónde sale el antes y el después no son
 * cosa de este módulo. El algoritmo es el LCS clásico por programación dinámica,
 * con un GUARDIÁN de tamaño: dos ficheros de mil líneas serían un millón de celdas
 * por el precio de un diff bonito, y el fallback (entero reescrito: todo quitado y
 * todo añadido) sigue contando la verdad, solo que sin deduplicar lo que se mantiene.
 */

export type LineaDeDiff = { tipo: "igual" | "anadido" | "quitado"; texto: string };

/** Por encima de este producto, ni LCS ni nada: fallback lineal. */
const MAX_CELDAS = 250_000;

function lineasDe(texto: string): string[] {
  const lineas = texto.split("\n");
  // El salto final de un fichero normal no es una línea vacía.
  if (lineas.length > 0 && lineas[lineas.length - 1] === "") lineas.pop();
  return lineas;
}

export function diffDeLineas(antes: string, despues: string): LineaDeDiff[] {
  const a = lineasDe(antes);
  const b = lineasDe(despues);

  if (a.length * b.length > MAX_CELDAS) {
    return [
      ...a.map((texto): LineaDeDiff => ({ tipo: "quitado", texto })),
      ...b.map((texto): LineaDeDiff => ({ tipo: "anadido", texto })),
    ];
  }

  // dp[i][j] = LCS de a[0..i) y b[0..j)
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Se recorre hacia atrás y se da la vuelta; en el empate se come primero de `b`
  // (añadido), para que al dar la vuelta el QUITADO quede delante del AÑADIDO —
  // el orden en que los diffs se leen: qué se quita, qué se pone.
  const salida: LineaDeDiff[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      salida.push({ tipo: "igual", texto: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      salida.push({ tipo: "anadido", texto: b[j - 1] });
      j--;
    } else {
      salida.push({ tipo: "quitado", texto: a[i - 1] });
      i--;
    }
  }
  return salida.reverse();
}

/**
 * Solo las líneas que importan para decidir: los cambios y `contexto` líneas alrededor
 * de cada uno. Las rachas largas de «igual» se recortan por VENTANAS solapadas (dos
 * cambios cercanos comparten el contexto), no por trozos fijos.
 */
export function conContexto(d: LineaDeDiff[], contexto: number): LineaDeDiff[] {
  const mantener = new Set<number>();
  d.forEach((l, idx) => {
    if (l.tipo === "igual") return;
    for (let k = Math.max(0, idx - contexto); k <= Math.min(d.length - 1, idx + contexto); k++) {
      mantener.add(k);
    }
  });
  return d.filter((_, idx) => mantener.has(idx));
}

/** El techo de líneas del bloque de diff, con la cuenta honesta de lo que no cabe. */
export function recortar(d: LineaDeDiff[], tope: number): { lineas: LineaDeDiff[]; recortadas: number } {
  return { lineas: d.slice(0, tope), recortadas: Math.max(0, d.length - tope) };
}