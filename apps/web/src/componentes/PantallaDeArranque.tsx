import type { ReactNode } from "react";
import { Splash } from "./Splash.js";
import estilos from "./PantallaDeArranque.module.css";

/**
 * Las tres capas del primer arranque, apiladas: el LIENZO (`Splash`, todo el viewport,
 * de fondo) y la INTERFAZ (`children` — la bienvenida y los pasos del alta que falten,
 * `App.tsx` decide cuáles) encima. Separar quién pinta de quién apila es lo que hace que
 * rediseñar el splash algún día sea tocar `Splash.tsx`/`Splash.module.css` y nada de esto.
 */
export function PantallaDeArranque({ children }: { children: ReactNode }) {
  return (
    <div className={estilos.envoltura}>
      <Splash />
      <div className={estilos.contenido}>{children}</div>
    </div>
  );
}
