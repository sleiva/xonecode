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

/** Valores escalares que una traza local puede conservar sin volcar contenido. */
export type ParametrosSeguros = Record<string, string | number | boolean>;

/**
 * Campos permitidos por tool. Es una lista blanca deliberada: ni `content`,
 * ni `old_string`/`new_string`, ni la descripción de `task` llegan a disco.
 *
 * Los parámetros de paginación y acotación son justo los que necesitamos para
 * detectar una lectura masiva o una búsqueda mal afinada.
 */
const CAMPOS_SEGUROS: Record<string, readonly string[]> = {
  read_file: ["file_path", "offset", "limit"],
  write_file: ["file_path"],
  edit_file: ["file_path"],
  ls: ["path"],
  glob: ["pattern", "path"],
  grep: ["pattern", "path", "glob", "max_count", "output_mode"],
  regex_search: ["pattern", "path", "glob", "flags", "max_count"],
};

function objetoDeArgs(args: unknown): Record<string, unknown> | undefined {
  let objeto: unknown = args;
  if (typeof args === "string") {
    try {
      objeto = JSON.parse(args);
    } catch {
      return undefined;
    }
  }
  return objeto && typeof objeto === "object" && !Array.isArray(objeto)
    ? objeto as Record<string, unknown>
    : undefined;
}

/** Argumentos acotados y seguros para la traza opt-in de diagnóstico. */
export function parametrosDe(nombre: string, args: unknown): ParametrosSeguros | undefined {
  const campos = CAMPOS_SEGUROS[nombre];
  const objeto = objetoDeArgs(args);
  if (campos === undefined || objeto === undefined) return undefined;

  const salida: ParametrosSeguros = {};
  for (const campo of campos) {
    const valor = objeto[campo];
    if (typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean") {
      salida[campo] = valor;
    }
  }
  return Object.keys(salida).length > 0 ? salida : undefined;
}

/**
 * El `detalle` de una llamada, o `undefined` si no hay nada permitido que contar.
 *
 * Los argumentos llegan como objeto o como cadena JSON (así viajan en las
 * `tool_calls`); un JSON roto es una tool rota, no una excepción que tumbe el turno.
 */
export function detalleDe(nombre: string, args: unknown): string | undefined {
  const parametros = parametrosDe(nombre, args);
  const campo = nombre === "read_file" || nombre === "write_file" || nombre === "edit_file"
    ? "file_path"
    : nombre === "ls"
      ? "path"
      : nombre === "glob" || nombre === "grep" || nombre === "regex_search"
        ? "pattern"
        : undefined;
  if (campo === undefined || parametros === undefined) return undefined;
  const valor = parametros[campo];
  // Una cadena vacía no describe nada, y un tipo raro (`file_path: 42`) tampoco:
  // sin detalle es una respuesta válida.
  return typeof valor === "string" && valor !== "" ? valor : undefined;
}
