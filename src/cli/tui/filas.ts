/**
 * Partir un texto en filas de una anchura dada, por caracteres.
 *
 * La Entrada pinta su fondo fila a fila (Ink 5.2.1 solo da fondo a `Text`, no a `Box`),
 * así que necesita saber DÓNDE se parte el texto en vez de dejar que Ink lo envuelva.
 * Se cuenta por puntos de código (`Array.from`), no por bytes ni por unidades UTF-16: una
 * «ñ» o un emoji es UN carácter. Un emoji ancho ocupa dos celdas en el terminal y aquí
 * cuenta una; el relleno de esa fila queda una celda corto y nada más — para una línea
 * de prompt es un desajuste asumible frente a traer `string-width`.
 *
 * TypeScript puro, sin ink: se prueba como función.
 */
export function filasDe(texto: string, ancho: number): string[] {
  if (ancho <= 0) return [texto];
  const letras = Array.from(texto);
  if (letras.length === 0) return [""];
  const filas: string[] = [];
  for (let i = 0; i < letras.length; i += ancho) filas.push(letras.slice(i, i + ancho).join(""));
  return filas;
}
