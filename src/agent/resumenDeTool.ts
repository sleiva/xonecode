/**
 * La LISTA BLANCA de la línea de estado: qué argumento de cada tool puede salir como
 * `detalle` del evento `tool`.
 *
 * La regla dura está documentada en `core/events.ts`: ningún evento lleva argumentos de
 * tool crudos, porque `write_file` lleva el contenido del fichero y una tool MCP lleva
 * el bearer — enseñar el progreso no puede ser la forma de filtrar un secreto. Este
 * módulo es la otra mitad de esa regla: no se FILTRA nada, se ELIGE a mano un campo por
 * tool — una ruta o un patrón, nunca contenido — y lo que no está en la tabla no sale.
 * Los nombres de campo son los de las tools de fichero de deepagents, verificados
 * contra su dist (`file_path` con `path` normalizado, `pattern` en glob/grep).
 */

/** El único campo permitido de cada tool. Sin entrada: nada sale. */
const CAMPO_SEGURO: Record<string, string> = {
  read_file: "file_path",
  write_file: "file_path",
  edit_file: "file_path",
  ls: "path",
  glob: "pattern",
  grep: "pattern",
  regex_search: "pattern",
};

/**
 * El `detalle` de una llamada, o `undefined` si no hay nada permitido que contar.
 *
 * Los argumentos llegan como objeto o como cadena JSON (así viajan en las
 * `tool_calls`); un JSON roto es una tool rota, no una excepción que tumbe el turno.
 */
export function detalleDe(nombre: string, args: unknown): string | undefined {
  const campo = CAMPO_SEGURO[nombre];
  if (campo === undefined) return undefined;

  let objeto: unknown = args;
  if (typeof args === "string") {
    try {
      objeto = JSON.parse(args);
    } catch {
      return undefined;
    }
  }
  if (!objeto || typeof objeto !== "object") return undefined;

  const valor = (objeto as Record<string, unknown>)[campo];
  // Una cadena vacía no describe nada, y un tipo raro (`file_path: 42`) tampoco:
  // sin detalle es una respuesta válida.
  return typeof valor === "string" && valor !== "" ? valor : undefined;
}
