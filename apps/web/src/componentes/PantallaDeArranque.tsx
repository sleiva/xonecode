import type { ReactNode } from "react";
import { Splash } from "./Splash.js";
import { Marca } from "./Marca.js";
import estilos from "./PantallaDeArranque.module.css";

/**
 * Las tres capas del primer arranque, apiladas: el LIENZO (`Splash`, todo el viewport, de
 * fondo), la MARCA (`Marca` — el logotipo «xonecode», cabecera fija del lienzo) y la
 * INTERFAZ (`children` — el aviso de conexión y la ÚNICA tarjeta del alta,
 * `TarjetaDeAlta`, con la bienvenida y el paso que falte dentro; `App.tsx` decide qué
 * pasa por aquí), que ocupa el resto y se centra en él. La marca no compite por el
 * centro óptico con la tarjeta —el usuario lo pidió así—: va arriba, a tamaño de
 * logotipo, y dentro de esta misma envoltura pero como fila propia, con
 * `flex-shrink: 0` para que un wizard largo no la recorte y `.contenido` sea lo único
 * que crece (`PantallaDeArranque.module.css`). Separar quién pinta, quién es marca fija
 * y quién es interfaz variable es lo que hace que rediseñar el lienzo algún día sea
 * tocar `Splash.tsx`/`splash.css`, la marca sea tocar `Marca.tsx`, y ninguno de los dos
 * toque esto.
 */
export function PantallaDeArranque({ children }: { children: ReactNode }) {
  return (
    <div className={estilos.envoltura}>
      <Splash />
      <Marca />
      <div className={estilos.contenido}>{children}</div>
    </div>
  );
}
