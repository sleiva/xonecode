import { useEffect, useRef } from "react";

/**
 * Cuánto se puede haber separado del fondo y seguir contando como «abajo».
 *
 * No es cero: el navegador redondea `scrollHeight`/`clientHeight` a subpíxeles, y con un
 * umbral exacto un scroller que ESTÁ abajo puede dar 0.5 y desengancharse solo. 48 px es
 * poco más de una línea: quien ha subido a leer, ha subido más que eso.
 */
const UMBRAL = 48;

/**
 * Mantiene un scroller pegado al fondo mientras llega contenido — pero solo si ya estaba
 * abajo.
 *
 * Esa condición es todo el asunto. Bajar SIEMPRE es lo que hace que no se pueda leer nada
 * mientras el agente escribe: subes a mirar lo que hizo hace dos tools y el siguiente
 * parcial te devuelve al fondo. Y no bajar nunca es lo que había: el modelo escribía y el
 * texto crecía fuera de la vista.
 *
 * `dependencia` es lo que cambia cuando hay contenido nuevo (la lista de actos): el efecto
 * corre después de que React haya pintado, que es cuando `scrollHeight` ya vale lo nuevo.
 */
export function usarPegadoAbajo(dependencia: unknown): {
  nodo: React.RefObject<HTMLDivElement>;
  alDesplazar: () => void;
} {
  // `as` porque React tipa un `useRef(null)` como `RefObject<T | null>` y el `ref` de un
  // elemento espera `RefObject<T>`: el nodo existe desde el primer pintado y el propio
  // efecto comprueba el `null` antes de tocarlo.
  const nodo = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
  /** Empieza en `true`: una conversación recién abierta se lee desde el final. */
  const pegado = useRef(true);

  useEffect(() => {
    const elemento = nodo.current;
    if (elemento === null || !pegado.current) return;
    elemento.scrollTop = elemento.scrollHeight;
  }, [dependencia]);

  return {
    nodo,
    alDesplazar: () => {
      const elemento = nodo.current;
      if (elemento === null) return;
      pegado.current = elemento.scrollHeight - elemento.scrollTop - elemento.clientHeight <= UMBRAL;
    },
  };
}
