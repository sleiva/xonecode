import { useEffect, useState } from "react";

/**
 * El ancho de la ventana, en vivo.
 *
 * Existe porque el reparto de columnas (`repartoDeColumnas.ts`) **desmonta** lo que no cabe,
 * y eso no lo sabe hacer una hoja de estilos: una consulta de medios puede esconder una
 * columna, pero lo escondido sigue siendo tabulable y sus peticiones siguen saliendo. Así
 * que la medida tiene que llegar a React.
 *
 * Dos cosas que no son de forma:
 *
 * - **Se lee también al montar**, no solo al redimensionar. El evento `resize` no se dispara
 *   al abrir la página, así que sin la lectura inicial la primera pintada decidiría con un
 *   cero — y un cero aquí significa «no se pudo medir», que es el lado generoso: se vería un
 *   parpadeo de tres columnas en una ventana que no las admite.
 * - **Sin `window` devuelve cero**, que es lo que `repartoDeColumnas` lee como «no consta» y
 *   resuelve sin esconder nada. No es teórico: los tests del cliente corren en jsdom, que sí
 *   lo tiene, pero esta consola se construye con Vite y nada garantiza que no acabe
 *   ejecutándose una vez fuera del navegador.
 */
export function usarAnchoDeVentana(): number {
  const [ancho, setAncho] = useState(() => (typeof window === "undefined" ? 0 : window.innerWidth));
  useEffect(() => {
    if (typeof window === "undefined") return;
    const medir = (): void => setAncho(window.innerWidth);
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);
  return ancho;
}
