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
