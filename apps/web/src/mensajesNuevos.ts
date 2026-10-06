import { useRef } from "react";
import type { Acto } from "./tipos.js";

/**
 * Cuántos mensajes han llegado desde que se dejó de estar al final del chat: la bola del botón
 * «Ir al final».
 *
 * **Cuenta lo que se PINTA como un elemento propio, no un tipo de acto a secas**, y por eso la
 * decisión de qué se ve entra por `seVe`, que monta `Chat` con las MISMAS piezas con que pinta:
 * una respuesta que solo era la pregunta de una tarjeta no se pinta (y no suma), una tarjeta que
 * no se puede pintar tampoco. Una bola que dice «1» y al bajar no hay nada nuevo sería peor que
 * no tenerla. Se recalcula en cada render: una respuesta que llega vacía y se llena por
 * `sustitucion` suma en cuanto se ve.
 */
export function contarMensajesNuevos(
  actos: readonly Acto[],
  desde: number,
  seVe: (acto: Acto, indice: number) => boolean
): number {
  let cuenta = 0;
  for (let i = Math.max(0, desde); i < actos.length; i++) {
    if (seVe(actos[i]!, i)) cuenta++;
  }
  return cuenta;
}

/**
 * Desde qué índice se cuenta: la MARCA de lo leído.
 *
 * - Al final, la marca sigue a la lista: no hay nada nuevo.
 * - Al dejar el final, se congela: cuenta lo que se AÑADA después. Lo que crece por
 *   `sustitucion` (el streaming de una respuesta ya empezada) no cambia la longitud y no suma.
 * - Con OTRA sesión, la marca salta al final de la lista nueva. Se mira el id de la sesión y no
 *   los objetos: una reconexión de la misma sesión (`reemision`) trae objetos nuevos con los
 *   mismos índices y tiene que conservar la cuenta, y otra sesión más larga no puede hacer pasar
 *   su final por mensajes nuevos.
 */
export function usarMarcaDeLeido(longitud: number, alFinal: boolean, sesion: string | undefined): number {
  const marca = useRef(longitud);
  const sesionDeLaMarca = useRef(sesion);
  if (alFinal || sesion !== sesionDeLaMarca.current) {
    marca.current = longitud;
    sesionDeLaMarca.current = sesion;
  }
  // Red de seguridad: una lista más corta que la marca no deja la marca fuera de ella.
  if (marca.current > longitud) marca.current = longitud;
  return marca.current;
}
