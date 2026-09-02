/**
 * El bloque con barra izquierda: la forma de los mensajes del usuario, de la Entrada y
 * de la Pregunta. Solo el lado izquierdo, con `┃` (la vertical gruesa de cajas, la de
 * OpenCode: MEDIDO, `▌` no llena la celda en vertical con la fuente del usuario y salía a
 * trozos entre filas; los glifos de cajas están hechos para empalmar), y NUNCA borde arriba ni abajo: en el
 * transcript un acto es una fila (`ventanaDe` cuenta así), y una caja de tres filas por
 * mensaje se saldría de la pantalla. Vive aparte de los componentes para que las tres
 * cajas no puedan divergir en la barra. La Entrada (entrada.tsx) extiende esta forma: pone
 * `paddingLeft` a 0 y mete el aire dentro de cada fila, con fondo, porque es la tarjeta
 * donde se escribe y tiene que verse; la barra sigue siendo esta.
 *
 * TypeScript puro: son props de Box, pero no importa ink — no hace falta.
 */

/** El estilo de borde: `left` es lo único que se pinta, el resto queda vacío por contrato. */
export const BORDE_BARRA = {
  topLeft: "",
  top: "",
  topRight: "",
  right: "",
  bottomRight: "",
  bottom: "",
  bottomLeft: "",
  left: "┃",
} as const;

/** Las props de un `<Box>` de Ink para un bloque con barra izquierda del color dado. */
export function barra(color: string) {
  return {
    borderStyle: BORDE_BARRA,
    borderTop: false,
    borderRight: false,
    borderBottom: false,
    borderLeft: true,
    borderLeftColor: color,
    paddingLeft: 1,
  } as const;
}
