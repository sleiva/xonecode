/**
 * Las FINALIZADAS como árbol: una continuación (`TareaDelCable.continuaDe`, «Reencolar lo pendiente») cuelga de la tarea
 * de la que sigue, y la de una continuación, de esa. Idea suya: ver las reencoladas como hijas de su tarea.
 *
 * - Una que continúa a otra que NO está en la lista (borrada, o todavía en curso) es raíz: no se esconde.
 * - Las hijas, en el orden en que se crearon. Las familias, por su ÚLTIMA entrega —la de cualquiera de sus miembros—, la
 *   más reciente arriba: acabar una continuación sube a su familia.
 * - Un ciclo (no lo produce el servidor, pero el cable es un dato) no cuelga a nadie de nadie dos veces.
 */
import type { TareaDelCable } from "./tipos.js";

export interface NodoDeTarea {
  tarea: TareaDelCable;
  hijas: NodoDeTarea[];
}

export function arbolDeFinalizadas(finalizadas: readonly TareaDelCable[]): NodoDeTarea[] {
  const porId = new Map(finalizadas.map((t) => [t.id, t]));
  const hijasDe = new Map<string, TareaDelCable[]>();
  const raices: TareaDelCable[] = [];
  for (const t of finalizadas) {
    const padre = t.continuaDe;
    if (padre !== undefined && padre !== t.id && porId.has(padre)) {
      hijasDe.set(padre, [...(hijasDe.get(padre) ?? []), t]);
    } else raices.push(t);
  }
  const colocadas = new Set<string>();
  const nodo = (t: TareaDelCable): NodoDeTarea => {
    colocadas.add(t.id);
    const hijas = (hijasDe.get(t.id) ?? [])
      .filter((h) => !colocadas.has(h.id))
      .sort((a, b) => a.creada.localeCompare(b.creada))
      .map(nodo);
    return { tarea: t, hijas };
  };
  const arbol = raices.map(nodo);
  // Lo que un ciclo dejó sin colocar sale como raíz: nada desaparece de la lista.
  for (const t of finalizadas) if (!colocadas.has(t.id)) arbol.push(nodo(t));
  const ultima = (n: NodoDeTarea): string => [n.tarea.acabada ?? "", ...n.hijas.map(ultima)].reduce((a, b) => (b > a ? b : a), "");
  return arbol.sort((a, b) => ultima(b).localeCompare(ultima(a)));
}
