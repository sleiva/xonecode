import type { ReactNode } from "react";
import { Splash } from "./Splash.js";
import { Marca } from "./Marca.js";
import estilos from "./PantallaDeArranque.module.css";

/**
 * Las tres capas del primer arranque, apiladas: el LIENZO (`Splash`, todo el viewport, de
 * fondo), la MARCA (`Marca` — el logotipo «xonecode») y la INTERFAZ (`children` — el aviso
 * de conexión, la fase del arranque y la ÚNICA tarjeta del alta, `TarjetaDeAlta`, con la
 * bienvenida y el paso que falte dentro; `App.tsx` decide qué pasa por aquí). Separar quién
 * pinta, quién es marca y quién es interfaz variable es lo que hace que rediseñar el lienzo
 * algún día sea tocar `Splash.tsx`/`splash.css`, la marca sea tocar `Marca.tsx`, y ninguno
 * de los dos toque esto.
 *
 * **Y la marca tiene DOS sitios, según con quién compita por el centro óptico.**
 *
 * Con la tarjeta del alta delante va arriba, a tamaño de logotipo: el centro es de la
 * tarjeta, que es lo que hay que leer y contestar. Pero cuando el lienzo está SOLO —el
 * arranque preparando la sesión MCP, sin nada que dar de alta— no hay con quién competir, y
 * ahí la marca se centra y crece, que es lo que el usuario pidió al ver la maqueta del
 * launch screen. No son dos diseños: es la misma marca ocupando el centro solo cuando está
 * vacío.
 *
 * Centrada, la marca entra DENTRO de `.contenido` en vez de ser una fila propia. Es la única
 * forma limpia de que el grupo entero quede en el centro óptico: con la marca como fila fija
 * fuera, el centrado de `.contenido` se calcula en el hueco que ella deja, así que el
 * conjunto queda descentrado hacia abajo. Y no se arregla desde esta hoja porque el nombre de
 * clase de `Marca` va HASHEADO en su propio módulo: no se puede estilar desde aquí.
 */
export function PantallaDeArranque({
  children,
  centrada,
}: {
  children: ReactNode;
  /** `true` cuando el lienzo está solo (sin tarjeta del alta): la marca se centra y crece. */
  centrada?: boolean;
}) {
  return (
    <div className={estilos.envoltura}>
      <Splash />
      {centrada === true ? (
        <div className={estilos.contenido}>
          <Marca grande />
          {children}
        </div>
      ) : (
        <>
          <Marca />
          <div className={estilos.contenido}>{children}</div>
        </>
      )}
    </div>
  );
}
