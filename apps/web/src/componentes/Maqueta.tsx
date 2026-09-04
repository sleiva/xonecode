import type { ReactNode } from "react";
import estilos from "./Maqueta.module.css";

/**
 * Una fila de dos columnas: el centro es lo ÚNICO elástico y la barra tiene ancho fijo.
 * La barra va a la DERECHA (en deepseek está a la izquierda); es lo que pidió el usuario.
 */
export function Maqueta({ centro, barra }: { centro: ReactNode; barra: ReactNode }) {
  return (
    <div className={estilos.maqueta}>
      <div className={estilos.centro}>{centro}</div>
      <aside className={estilos.barra}>{barra}</aside>
    </div>
  );
}
