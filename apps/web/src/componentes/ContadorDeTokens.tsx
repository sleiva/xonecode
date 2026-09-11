import estilos from "./ContadorDeTokens.module.css";

/**
 * Lo que lleva consumido la SESIÓN: entrada y salida, en tokens.
 *
 * Tres decisiones, y las tres son la misma disciplina de esta interfaz:
 * - **Son DOS cuentas y se suman los TOKENS, no el coste.** Los del grafo van contra la
 *   clave de API del usuario y los del agente externo contra su suscripción del producto.
 *   Un token es un token, así que sumarlos dice algo cierto; sumar su precio sería la cifra
 *   que miente. El desglose va en el `title`, que es donde cabe sin competir con nada.
 * - **La CACHÉ no se suma a la entrada** (`vendor/tokenTracking.ts` ya las separa): son
 *   tokens que se leyeron pero no se pagaron igual, y meterlos dentro inflaría el número.
 *   Se dice aparte, también en el `title`.
 * - **Sin dato no se pinta.** Ausente es «no consta» —no hay sesión, o el ejecutor es el de
 *   pega—, y un `0 ↑ 0 ↓` que nadie ha medido es un control sin dato detrás.
 */
export interface ConsumoPintable {
  modelo: { entrada: number; salida: number; cache: number };
  externo: { entrada: number; salida: number; cache: number };
}

/**
 * `1234` → `1,2k`. Con una cifra decimal hasta el millón, porque la diferencia entre 1,2k y
 * 1,9k importa y la de 1.234 a 1.235 no. Por debajo de mil se enseña el número entero: ahí
 * cada token se ve, y un «0,8k» sería más largo y menos exacto.
 */
export function abreviar(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(".", ",")}k`;
  return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
}

export function ContadorDeTokens({ consumo }: { consumo?: ConsumoPintable }): React.ReactElement | null {
  if (consumo === undefined) return null;
  const entrada = consumo.modelo.entrada + consumo.externo.entrada;
  const salida = consumo.modelo.salida + consumo.externo.salida;
  const cache = consumo.modelo.cache + consumo.externo.cache;
  // Nada consumido todavía tampoco se pinta: en una sesión recién abierta el contador a
  // cero no dice nada que la ausencia no diga, y ocupa sitio en una fila estrecha.
  if (entrada === 0 && salida === 0) return null;

  const hayExterno = consumo.externo.entrada > 0 || consumo.externo.salida > 0;
  const detalle = [
    `Tokens de esta sesión`,
    `· modelo: ${consumo.modelo.entrada} entrada / ${consumo.modelo.salida} salida`,
    ...(hayExterno
      ? [`· agentes externos: ${consumo.externo.entrada} entrada / ${consumo.externo.salida} salida`]
      : []),
    ...(cache > 0 ? [`· caché leída: ${cache} (no va sumada a la entrada)`] : []),
    ...(hayExterno ? ["Las dos cuentas son de proveedores distintos: se suman TOKENS, no coste."] : []),
  ].join("\n");

  return (
    <span className={estilos.contador} title={detalle}>
      {/* Los glifos van con `aria-hidden` y el sentido en texto: un lector de pantalla que
          lea «flecha arriba 1,2k» no dice nada, y «entrada» sí. */}
      <span aria-hidden="true">↑</span>
      <span className={estilos.cifra}>{abreviar(entrada)}</span>
      <span className={estilos.rotulo}>entrada</span>
      <span aria-hidden="true">↓</span>
      <span className={estilos.cifra}>{abreviar(salida)}</span>
      <span className={estilos.rotulo}>salida</span>
    </span>
  );
}
