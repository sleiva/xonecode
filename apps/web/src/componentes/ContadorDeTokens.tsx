import { abreviar } from "../cifras.js";
import estilos from "./ContadorDeTokens.module.css";

/**
 * Lo que lleva consumido la CONVERSACIÓN: entrada y salida, en tokens.
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
 *
 * Cuatro piezas fueron DOS. Aquí vivían también `ctx usado/tope` y el porcentaje, y el
 * problema no era el formato: eran dos PREGUNTAS distintas en la misma frase —lo que la
 * conversación ha costado (un acumulado, que solo crece) y cuánto ocupa el historial AHORA
 * (un nivel, que sube y baja)—, con dos escalas que se leían como una sola cifra
 * contradictoria. `ctx` se fue a la barra de estado (`BarraDeEstado.tsx`), que es donde se
 * consulta el margen antes de resumir, y aquí quedan los dos totales, que es lo que se mira
 * mientras se escribe.
 */
export interface ConsumoPintable {
  modelo: { entrada: number; salida: number; cache: number };
  externo: { entrada: number; salida: number; cache: number };
  /**
   * Cuánto ocupa la VENTANA ahora, y su tope si se sabe. **No se pinta aquí**: viaja en el
   * mismo mensaje porque cambia en los mismos instantes, y quien lo pinta es la barra de
   * estado. Sigue en el tipo porque el consumidor del cable es el mismo.
   */
  ventana: { usado: number; tope?: number };
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
    `Tokens de esta conversación`,
    `· modelo: ${consumo.modelo.entrada} entrada / ${consumo.modelo.salida} salida`,
    ...(hayExterno
      ? [`· agentes externos: ${consumo.externo.entrada} entrada / ${consumo.externo.salida} salida`]
      : []),
    ...(cache > 0 ? [`· caché leída: ${cache} (no va sumada a la entrada)`] : []),
    ...(hayExterno ? ["Las dos cuentas son de proveedores distintos: se suman TOKENS, no coste."] : []),
    "Se cuentan los turnos anteriores a este, así que sobreviven a cerrar y reabrir la sesión.",
  ].join("\n");

  return (
    <span className={estilos.contador} title={detalle}>
      {/* Los glifos van con `aria-hidden` y el sentido en texto: un lector de pantalla que
          lea «flecha arriba 1,2k» no dice nada, y «entrada» sí. */}
      <span aria-hidden="true">↑</span>
      <span className={estilos.cifra}>{abreviar(entrada)}</span>
      <span className={estilos.rotulo}>entrada</span>
      {/* El punto separa las dos mitades: sin él, «2,1k entrada ↓ 152» se lee como una sola
          cifra con dos partes. Va `aria-hidden` porque para un lector de pantalla los dos
          rótulos ya las separan, y un «punto medio» leído en voz alta es ruido. */}
      <span aria-hidden="true" className={estilos.separador}>
        ·
      </span>
      <span aria-hidden="true">↓</span>
      <span className={estilos.cifra}>{abreviar(salida)}</span>
      <span className={estilos.rotulo}>salida</span>
    </span>
  );
}
