/**
 * Un acto del transcript: lo que ya no cambia y se pinta por su tipo.
 *
 * Vivía en `cli/tui/store.ts` porque solo lo usaba la TUI. Ahora lo usan DOS pieles —la
 * TUI y la web—, y el servidor web no puede importar de `cli/tui/` sin romper la frontera
 * de Ink. Así que baja a `core/`, que es donde vive lo que comparten las pieles.
 *
 * Ningún acto lleva argumentos de tool: `herramientas.lineas` son líneas YA resumidas por
 * `agent/resumenDeTool.ts`, con la lista blanca de campos por nombre de tool.
 */
export type Acto =
  | { tipo: "usuario"; texto: string }
  | { tipo: "asistente"; texto: string }
  /**
   * Las líneas de tool CONSECUTIVAS de un turno, en un solo acto: son paisaje, y el
   * transcript enseña solo las últimas. Una línea del asistente (o de sistema) cierra el
   * grupo; la siguiente tool abre otro.
   */
  | { tipo: "herramientas"; lineas: string[] }
  | { tipo: "sistema"; texto: string }
  | { tipo: "fase"; texto: string; ms: number }
  /** El cierre del turno: duración y, si la piel lo sabe, el modelo que lo corrió. */
  | { tipo: "fin"; ms: number; modelo?: string }
  | { tipo: "error"; texto: string };

/**
 * Una línea de cierre de racha del colapsador del motor (`core/notify.ts`): «→ lee ×3 — …».
 * Devuelve su prefijo icono+verbo («→ lee»), o undefined si no es un cierre.
 */
function prefijoDeCierre(linea: string): string | undefined {
  const m = /^(\S+ \S+) ×\d+/.exec(linea);
  return m?.[1];
}

/**
 * Añadir una línea de tool al grupo: si es el cierre de la racha cuya apertura es la
 * última línea, la SUSTITUYE. El colapsador escribe apertura y cierre porque stdio solo
 * añade; una piel que repinta (TUI, web) no puede permitirse dos líneas para la misma
 * racha. Pura, y vivía en `cli/tui/store.ts` hasta que la web empezó a necesitarla
 * también: dos copias de esta sutileza es cómo divergen.
 */
export function conLineaDeTool(lineas: readonly string[], linea: string): string[] {
  const prefijo = prefijoDeCierre(linea);
  const ultima = lineas.at(-1);
  if (prefijo !== undefined && ultima !== undefined && (ultima === prefijo || ultima.startsWith(`${prefijo} `))) {
    return [...lineas.slice(0, -1), linea];
  }
  return [...lineas, linea];
}
