import type { ReactNode } from "react";
import estilos from "./Maqueta.module.css";

/**
 * Una fila de dos columnas: el centro es lo ÚNICO elástico y la barra tiene ancho fijo.
 * La barra va a la IZQUIERDA, como en deepseek — cambio de rumbo del usuario: antes iba a
 * la derecha porque él mismo lo pidió así, y ahora pide lo contrario. El `aside` va
 * PRIMERO en el DOM (no solo movido con `order`) porque es lo que hace que el borde que
 * los separa quede en el lado correcto sin depender de flexbox: `.barra` lleva
 * `border-right`, no `border-left` — el borde vive en el lado que de verdad toca al
 * centro, y eso cambia de lado junto con la posición.
 */
export function Maqueta({ centro, barra }: { centro: ReactNode; barra: ReactNode }) {
  return (
    <div className={estilos.maqueta}>
      <aside className={estilos.barra}>{barra}</aside>
      <div className={estilos.centro}>{centro}</div>
    </div>
  );
}
