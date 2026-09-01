/**
 * El formato compacto de cifras, COMPARTIDO por las dos pieles.
 *
 * Vivía duplicado — `formatearTokens` en `main.ts` y un `compacto` propio en
 * `tui/sidebar.tsx` — y las pieles divergían: la sidebar decía «200.0K» donde stdio
 * decía «200K». Un indicador que da dos cifras según la piel no es un formato, son
 * dos a la espera de desincronizarse; la cifra compacta vive aquí y ninguna piel
 * compone la suya. (No puede vivir en `main.ts` porque `cli/tui/` no lo importa:
 * sería un ciclo.)
 */

/** `999`, `12.8K`, `200K`, `1.5M` — un decimal cuando hace falta, `.0` de cortesía nunca. */
export function compacto(n: number): string {
  if (n < 1000) return `${n}`;
  if (n >= 1_000_000) return `${+((n / 1_000_000).toFixed(1))}M`;
  return `${+((n / 1000).toFixed(1))}K`;
}

/** Token compacto para la línea de estado: `0 tokens` hasta 999, `12.8K tokens` a partir de 1000. */
export function formatearTokens(total: number): string {
  return `${compacto(total)} tokens`;
}

/** El tope de contexto, compacto: `131K`, `200K`, `1M`. Sin decimales de cortesía. */
export function formatearTope(tope: number): string {
  if (tope >= 1_000_000) return `${tope / 1_000_000}M`;
  return `${Math.round(tope / 1000)}K`;
}
