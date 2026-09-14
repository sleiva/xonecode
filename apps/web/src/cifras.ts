/**
 * Cómo se abrevia un número de tokens. UN solo sitio, para que no puedan divergir.
 *
 * Vivía dentro de `ContadorDeTokens.tsx` y de ahí salían dos formatos para la MISMA cifra:
 * el contador abreviaba (`3,3k`) y la barra de estado escribía el número pelado
 * (`3269/1000000`) porque `formatearContexto` no la conocía. Dos formatos para un dato es
 * cómo el usuario aprende a desconfiar de los dos, así que la función sube aquí y los dos
 * la importan.
 *
 * La regla del decimal: **una cifra decimal mientras ayuda a distinguir, y ninguna cuando
 * solo ocupa sitio.** Entre 1,2k y 1,9k la diferencia importa; entre `1,0M` y `1M` no hay
 * ninguna —es el mismo número— y el `,0` era justo lo que hacía ilegible el tope de
 * contexto, que se enseña en cada turno. Por eso se formatea y luego se tira el `,0` final,
 * que es una regla y no un caso especial del millón.
 *
 * Por debajo de mil se enseña el número entero: ahí cada token se ve, y un «0,8k» sería más
 * largo y menos exacto.
 */
export function abreviar(n: number): string {
  // No finito o negativo es «no consta», y devolver `0` es lo que ya hacía: quien pinte
  // decide si un cero se pinta. Lo que NO se hace es enseñar `NaN` o `-5`.
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(Math.round(n));
  const [cifra, sufijo] = n < 1_000_000 ? [n / 1000, "k"] : [n / 1_000_000, "M"];
  const texto = cifra.toFixed(1).replace(".", ",").replace(/,0$/, "");
  return `${texto}${sufijo}`;
}
