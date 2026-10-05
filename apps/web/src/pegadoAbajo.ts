import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cuánto se puede haber separado del fondo y seguir contando como «abajo».
 *
 * No es cero: el navegador redondea `scrollHeight`/`clientHeight` a subpíxeles, y con un
 * umbral exacto un scroller que ESTÁ abajo puede dar 0.5 y desengancharse solo. 48 px es
 * poco más de una línea: quien ha subido a leer, ha subido más que eso.
 */
const UMBRAL = 48;

/**
 * Lo que puede durar, como mucho, la bajada suave de «Ir al final». Mientras dura, los
 * `scroll` intermedios no desenganchan: si no, lo que llegase a mitad de camino se quedaría
 * fuera. Si el navegador no llega a avisar del fondo, el tope lo suelta igual.
 */
const TOPE_DE_BAJADA_MS = 1000;

function distanciaAlFondo(elemento: HTMLElement): number {
  return elemento.scrollHeight - elemento.scrollTop - elemento.clientHeight;
}

/**
 * Mantiene un scroller pegado al fondo mientras llega contenido — pero solo si ya estaba
 * abajo.
 *
 * Esa condición es todo el asunto. Bajar SIEMPRE es lo que hace que no se pueda leer nada
 * mientras el agente escribe: subes a mirar lo que hizo hace dos tools y el siguiente
 * parcial te devuelve al fondo. Y no bajar nunca es lo que había: el modelo escribía y el
 * texto crecía fuera de la vista.
 *
 * `alFinal` dice si se está abajo (lo que decide si se pinta «Ir al final»), y `bajar` lleva
 * al fondo y vuelve a enganchar. `alFinal` es ESTADO, pero solo cambia al cruzar el umbral:
 * cada evento de `scroll` no provoca un render.
 *
 * `dependencia` es lo que cambia cuando hay contenido nuevo (la lista de actos): el efecto
 * corre después de que React haya pintado, que es cuando `scrollHeight` ya vale lo nuevo.
 */
export function usarPegadoAbajo(
  dependencia: unknown,
  opciones: {
    /**
     * Vigilar el TAMAÑO (`ResizeObserver`) para que `alFinal` siga siendo cierto cuando se abre
     * un plegable o cambia la ventana. Solo lo pide quien pinta «Ir al final» —el scroller del
     * chat—: los tramos de trabajo también usan este hook, son uno por turno, y nadie lee su
     * `alFinal`.
     */
    vigilarTamano?: boolean;
  } = {}
): {
  nodo: React.RefObject<HTMLDivElement>;
  alDesplazar: () => void;
  alFinal: boolean;
  bajar: () => void;
} {
  // `as` porque React tipa un `useRef(null)` como `RefObject<T | null>` y el `ref` de un
  // elemento espera `RefObject<T>`: el nodo existe desde el primer pintado y el propio
  // efecto comprueba el `null` antes de tocarlo.
  const nodo = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
  /** Empieza en `true`: una conversación recién abierta se lee desde el final. */
  const pegado = useRef(true);
  const [alFinal, setAlFinal] = useState(true);
  /** Hasta cuándo dura una bajada suave en curso (`0`: ninguna). */
  const bajandoHasta = useRef(0);

  useEffect(() => {
    const elemento = nodo.current;
    if (elemento === null) return;
    if (pegado.current) {
      elemento.scrollTop = elemento.scrollHeight;
      setAlFinal(true);
      return;
    }
    // Despegado y llega algo: el fondo se ha alejado (o la conversación sigue cabiendo entera).
    setAlFinal(distanciaAlFondo(elemento) <= UMBRAL);
  }, [dependencia]);

  // Abrir un plegable o cambiar el tamaño de la ventana mueve el fondo SIN un `scroll`: se
  // vuelve a mirar si se está abajo, sin bajar (eso solo lo hace contenido nuevo, arriba).
  const vigilarTamano = opciones.vigilarTamano === true;
  useEffect(() => {
    const elemento = nodo.current;
    if (!vigilarTamano || elemento === null || typeof ResizeObserver === "undefined") return;
    const mirar = (): void => {
      if (!pegado.current) setAlFinal(distanciaAlFondo(elemento) <= UMBRAL);
    };
    const observador = new ResizeObserver(mirar);
    observador.observe(elemento);
    for (const hijo of Array.from(elemento.children)) observador.observe(hijo);
    return () => observador.disconnect();
  }, [vigilarTamano]);

  const alDesplazar = useCallback(() => {
    const elemento = nodo.current;
    if (elemento === null) return;
    const abajo = distanciaAlFondo(elemento) <= UMBRAL;
    if (bajandoHasta.current !== 0) {
      if (!abajo && Date.now() < bajandoHasta.current) return;
      bajandoHasta.current = 0;
    }
    pegado.current = abajo;
    setAlFinal(abajo);
  }, []);

  const bajar = useCallback(() => {
    const elemento = nodo.current;
    if (elemento === null) return;
    pegado.current = true;
    setAlFinal(true);
    // jsdom no implementa `scrollTo`: sin él, el salto seco de siempre.
    if (typeof elemento.scrollTo === "function") {
      bajandoHasta.current = Date.now() + TOPE_DE_BAJADA_MS;
      elemento.scrollTo({ top: elemento.scrollHeight, behavior: "smooth" });
    } else {
      elemento.scrollTop = elemento.scrollHeight;
    }
  }, []);

  return { nodo, alDesplazar, alFinal, bajar };
}
