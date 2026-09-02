/**
 * Una fila de tarjeta: fondo sólido de lado a lado.
 *
 * La comparten la Entrada y las tarjetas de usuario del transcript (la forma de
 * OpenCode: barra izquierda, aire arriba, texto, aire abajo, todo con fondo). Vive
 * aparte para que las dos no puedan divergir.
 *
 * Ink 5.2.1 solo da fondo a `Text`, y un Text pinta fondo solo bajo sus caracteres,
 * así que la fila se rellena de espacios hasta `ancho`. Una celda de aire a la
 * izquierda (y la que sobre a la derecha) hace de padding lateral. `visible` es lo que
 * ocupa `children`, en puntos de código.
 */
import { Text } from "ink";
import type { ReactNode } from "react";
import { temaInk } from "./temaInk.js";

export function Fila({
  ancho,
  visible,
  color,
  children,
}: {
  ancho: number;
  visible: number;
  color?: string;
  children?: ReactNode;
}): ReactNode {
  return (
    <Text backgroundColor={temaInk.fondoInput} color={color}>
      {" "}
      {children}
      {" ".repeat(Math.max(0, ancho - 1 - visible))}
    </Text>
  );
}