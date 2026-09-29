import type { TareaDelCable } from "./tipos.js";

/**
 * ¿Se puede abrir la conversación de esta tarea desde su fila?
 *
 * Hace falta `sesion` —sin ella la tarea no ha corrido y no hay nada que abrir— y que NO esté
 * `en-proceso`: el servidor declina abrir la sesión de una tarea en curso (compara `sesion` e
 * `idDeHilo`, porque dos consolas sobre el mismo hilo se pisarían), así que ofrecerlo ahí era
 * un botón que no hace nada. Mientras corre, lo que se ofrece es «Ver lo que hace».
 *
 * Una sola función para el kanban del escritorio y el resumen del proyecto: es la MISMA regla, y
 * dos copias de ella acaban discrepando.
 */
export function sePuedeAbrirLaTarea(t: Pick<TareaDelCable, "sesion" | "estado">): boolean {
  return t.sesion !== undefined && t.estado !== "en-proceso";
}
