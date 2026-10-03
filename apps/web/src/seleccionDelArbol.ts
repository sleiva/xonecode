import type { NodoDelArbol } from "./arbolDeRutas.js";

/**
 * La selección de un árbol de ficheros con casillas: lo que marca el diálogo de la subida.
 *
 * **Lo que se GUARDA son las hojas**, nunca las carpetas: el estado de una carpeta se DERIVA
 * de sus hojas cada vez. Así la regla de las dos direcciones sale sola —marcar una carpeta
 * marca todo lo de dentro, y desmarcar el último hijo deja la carpeta desmarcada— sin un
 * segundo estado que mantener al día y que pueda contradecir al primero.
 */

/** Las rutas de todas las hojas que cuelgan de este nodo (él mismo, si es hoja). */
export function hojasDe(nodo: NodoDelArbol): string[] {
  if (nodo.hijos === undefined) return [nodo.ruta];
  return nodo.hijos.flatMap(hojasDe);
}

/** Las hojas de un bosque entero: lo que marca «Seleccionar todo». */
export function todasLasHojas(nodos: readonly NodoDelArbol[]): string[] {
  return nodos.flatMap(hojasDe);
}

export type EstadoDeCasilla = "todas" | "ninguna" | "algunas";

/**
 * El estado de la casilla de un nodo. Una carpeta sin hojas sale «ninguna»: no hay nada que
 * subir debajo, y pintarla marcada afirmaría lo contrario.
 */
export function estadoDeCasilla(nodo: NodoDelArbol, marcadas: ReadonlySet<string>): EstadoDeCasilla {
  const hojas = hojasDe(nodo);
  const cuantas = hojas.filter((ruta) => marcadas.has(ruta)).length;
  if (cuantas === 0) return "ninguna";
  return cuantas === hojas.length ? "todas" : "algunas";
}

/**
 * Pulsar la casilla de un nodo. Una carpeta a medias se MARCA entera: es lo que hace un
 * explorador de ficheros, y la otra lectura —vaciarla— borraría de un clic lo que la persona
 * acaba de elegir dentro.
 */
export function alternarCasilla(nodo: NodoDelArbol, marcadas: ReadonlySet<string>): Set<string> {
  const siguientes = new Set(marcadas);
  const marcar = estadoDeCasilla(nodo, marcadas) !== "todas";
  for (const ruta of hojasDe(nodo)) {
    if (marcar) siguientes.add(ruta);
    else siguientes.delete(ruta);
  }
  return siguientes;
}
