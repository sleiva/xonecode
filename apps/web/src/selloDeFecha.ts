/**
 * Cuándo se tocó una sesión, para pintarlo a la derecha de su fila en la barra.
 *
 * Tres decisiones, y las tres las impone la columna de 280 px que comparte con el título y
 * con el menú «…»:
 * - **El año solo si NO es el actual.** Repetido en todas las filas no distingue ninguna, y
 *   omitido siempre haría que un «7 sept» del año pasado se leyera como de anteayer.
 * - **Sin segundos.** No sirven para reconocer una conversación y cuestan tres caracteres.
 * - **Lo que no es una fecha no se pinta.** Un «Invalid Date» en la barra es peor que una
 *   fila sin sello, que es lo que se ve si el índice trae una entrada rara.
 *
 * `ahora` entra por parámetro para que el resultado no dependa del reloj de la máquina que
 * corre los tests — la misma razón por la que el reloj de la piel web entra por parámetro.
 */
export function selloDeFecha(iso: string, ahora: Date = new Date()): string | undefined {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return undefined;
  const dia = new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
    ...(fecha.getFullYear() === ahora.getFullYear() ? {} : { year: "numeric" }),
  }).format(fecha);
  const hora = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", hour12: false }).format(fecha);
  return `${dia} ${hora}`;
}
