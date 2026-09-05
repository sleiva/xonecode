import { useEffect, type RefObject } from "react";

/**
 * Cierra un menú al pulsar fuera de él, y con Escape.
 *
 * Vivía dentro de `PastillaDeModelo.tsx`, que fue el primero que lo necesitó. Se sacó aquí
 * al aparecer el segundo menú (el «…» de cada sesión en la barra): un menú que solo se
 * cierra volviendo a pulsar su disparador tapa lo que hay debajo y no es lo que hace ningún
 * menú. Copiarlo habría sido la tercera versión del mismo lazo, y la que se quedaría vieja.
 *
 * Dos decisiones que no son evidentes, las dos medidas en su sitio original:
 *
 * - **`mousedown` y no `click`**: con `click` se cierra DESPUÉS de que el navegador haya
 *   decidido dónde cayó la pulsación, así que un clic sobre otro botón acababa haciendo las
 *   dos cosas — cerrar este menú y activar aquello.
 * - **Solo se escucha con el menú ABIERTO**: registrar el documento entero mientras está
 *   cerrado es trabajo por nada en cada pulsación de la aplicación.
 */
export function useCerrarAlPulsarFuera(
  abierto: boolean,
  envoltura: RefObject<HTMLElement | null>,
  cerrar: () => void
): void {
  useEffect(() => {
    if (!abierto) return;
    const fuera = (evento: MouseEvent): void => {
      const nodo = envoltura.current;
      if (nodo !== null && evento.target instanceof Node && !nodo.contains(evento.target)) {
        cerrar();
      }
    };
    const escape = (evento: KeyboardEvent): void => {
      if (evento.key === "Escape") cerrar();
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto, envoltura, cerrar]);
}
