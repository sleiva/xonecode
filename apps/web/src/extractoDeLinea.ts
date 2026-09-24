/**
 * Las líneas alrededor de una dada, numeradas, para el visor de Ficheros cuando se llega desde un
 * hallazgo del verificador con `fichero:línea`.
 *
 * **Sale del TEXTO y no del DOM del visor**, y esa es la razón de que exista: el `CodeBlock` de la
 * librería solo parte en líneas cuando hay gramática que resaltar —sin ella pinta un `<pre>` de una
 * pieza—, así que un salto que dependiera de encontrar la línea en su DOM fallaría en silencio
 * justo en los ficheros sin resaltado. Esto contesta «qué hay en la línea 12» siempre.
 *
 * `linea` es 1-based, como la da el simulador. Fuera de rango devuelve `undefined`: un extracto de
 * una línea que el fichero no tiene —porque cambió desde el hallazgo— afirmaría algo falso.
 */
export function extractoDeLinea(
  texto: string,
  linea: number,
  radio = 3
): { desde: number; lineas: { numero: number; texto: string; marcada: boolean }[] } | undefined {
  const todas = texto.replace(/\r\n/g, "\n").split("\n");
  // Un fichero que acaba en salto de línea no tiene una línea vacía más al final.
  if (todas.length > 1 && todas[todas.length - 1] === "") todas.pop();
  if (!Number.isInteger(linea) || linea < 1 || linea > todas.length) return undefined;
  const desde = Math.max(1, linea - radio);
  const hasta = Math.min(todas.length, linea + radio);
  const lineas = [];
  for (let n = desde; n <= hasta; n++) lineas.push({ numero: n, texto: todas[n - 1]!, marcada: n === linea });
  return { desde, lineas };
}
