/**
 * Un tiempo en milisegundos, para leerlo: «1.8 s» a partir del segundo, «340 ms» por
 * debajo. Compartido por el pie y por las Trazas: el pie decía «116.0 s» y la misma fila
 * de Trazas «116021 ms», que es la misma cifra escrita para una máquina.
 */
export function formatearMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}
