import type { ReactNode } from "react";
import { Splash } from "./Splash.js";
import estilos from "./PantallaDeArranque.module.css";

/**
 * Las tres capas del primer arranque, apiladas: el LIENZO (`Splash`, todo el viewport,
 * de fondo) y la INTERFAZ (`children` — el aviso de conexión y la ÚNICA tarjeta del alta,
 * `TarjetaDeAlta`, con la bienvenida y el paso que falte dentro; `App.tsx` decide qué
 * pasa por aquí) encima. Separar quién pinta de quién apila es lo que hace que rediseñar
 * el splash algún día sea tocar `Splash.tsx`/`Splash.module.css` y nada de esto.
 */
export function PantallaDeArranque({ children }: { children: ReactNode }) {
  return (
    <div className={estilos.envoltura}>
      <Splash />
      <div className={estilos.contenido}>{children}</div>
    </div>
  );
}
