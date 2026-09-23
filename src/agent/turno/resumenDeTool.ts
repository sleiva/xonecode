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
export const CAMPOS_SEGUROS: Record<string, readonly string[]> = {
  read_file: ["file_path", "offset", "limit"],
  write_file: ["file_path"],
  edit_file: ["file_path"],
  ls: ["path"],
  glob: ["pattern", "path"],
  grep: ["pattern", "path", "glob", "max_count", "output_mode"],
  regex_search: ["pattern", "path", "glob", "flags", "max_count"],
  /**
   * De `task` sale el NOMBRE del especialista y nada más — nunca su `description`, que es
   * el encargo entero y puede llevar contenido del proyecto dentro (por eso la cabecera de
   * este fichero ya la nombraba como el ejemplo de lo que NO sale).
   *
   * El nombre sí puede: es el de un fichero que escribió el usuario, ya se pinta en Ajustes
   * y ya viaja como `origen` en cada petición de aprobación. Y hace falta: medido en la
   * pantalla del usuario, la línea decía «⚙ task» a secas, así que con un motor externo no
   * había NADA en la interfaz que dijera a quién se delegó — y un hijo de Claude Code son
   * minutos en otro proceso, sin una sola tool que cruce.
   */
  task: ["subagent_type"],
  // La delegación del motor TrueForge: el NOMBRE del subagente y nada más, por lo mismo que
  // `task` — su `input` es el encargo entero y puede llevar contenido del proyecto dentro.
  create_sub_agent: ["name"],
  /**
   * **De la `description` no sale el TEXTO, sale su HUELLA**, y hace falta por una medida.
   *
   * DeepSeek paraleliza: en un turno real, 37 de 69 tools salieron en ráfagas simultáneas, y
   * una de ellas llevaba TRES `task` a la vez —dos al mismo especialista—. Con solo el nombre
   * en la traza no hay forma de saber si eran tres encargos distintos o el mismo repetido, que
   * es justo la diferencia entre paralelismo útil y trabajo tirado.
   *
   * Un hash corto y la longitud lo contestan sin guardar una línea del encargo, así que la
   * regla de arriba no se toca: lo que no puede salir sigue sin salir.
   */
  /**
   * De `xone_navegacion` sale la OPERACIÓN y **no el `nombre`**, que es una colección del
   * proyecto — o sea contenido, y aquí no entra contenido.
   *
   * Hace falta por un fallo de instrumento medido el 19-09-2026: al añadir la operación
   * `estilos` no se pudo comprobar si el modelo llegaba a usarla, porque la traza registraba
   * «xone_navegacion» a secas. Siete operaciones bajo un solo nombre es no poder contestar
   * cuál de las siete se usa, que es justo lo que se quería saber. La operación es un enum
   * cerrado de siete valores: no hay nada del proyecto dentro.
   */
  xone_navegacion: ["operacion"],
  /**
   * **El comando ENTERO**, y es la única entrada de esta tabla que no es una ruta ni un
   * patrón. Está aquí a propósito: a un agente con `ejecucion: true` no se le pregunta antes
   * de cada comando —preguntar cuatro veces por «lanza la app» mata el bucle—, así que lo
   * que sustituye a esa pregunta es VERLO. Un `⚙ execute` sin detalle sería la peor de las
   * dos: ni se pregunta ni se enseña.
   *
   * **Límite declarado, y no se tapa con un filtro**: si el modelo escribe una ruta absoluta
   * en su comando, esa ruta sale en el evento y por tanto por el cable, que es lo que
   * `sinRutas` evita en los demás sitios. Por eso el entorno le da una variable por skill y
   * el `cwd` es la raíz del proyecto: para que no le haga falta escribir ninguna. Un
   * limpiador que adivinara qué trozo de una línea de shell es una ruta fallaría en
   * silencio, que es peor que un límite escrito.
   */
  execute: ["command"],
  /**
   * De un motor externo: QUÉ skill se carga y QUÉ se busca. Nunca los `args` con que se
   * invoca una skill, que pueden llevar contenido del proyecto dentro — el mismo trato que
   * la `description` de `task`.
   */
  Skill: ["skill"],
  ToolSearch: ["query"],
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
/** Huella corta y estable de un texto. No reversible: solo sirve para comparar dos. */
export function huellaDeTexto(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h * 33) ^ texto.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

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
  /**
   * La HUELLA del encargo de un `task`, nunca su texto. Ver la nota de `CAMPOS_SEGUROS.task`:
   * es lo que distingue tres delegaciones simultáneas distintas de la misma repetida tres
   * veces, y sin ella el paralelismo de DeepSeek no se puede diagnosticar.
   */
  if (nombre === "task" && typeof objeto["description"] === "string") {
    const encargo = objeto["description"] as string;
    salida["encargoChars"] = encargo.length;
    salida["encargoHuella"] = huellaDeTexto(encargo);
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
  // El campo es el PRIMERO de la fila de la tabla, no una cadena de `if` paralela.
  //
  // Era esa cadena, y se le habían quedado fuera TRES entradas que sí están en la tabla y
  // con su porqué escrito encima: `execute`, `xone_navegacion` y `Skill`. El resultado no
  // era un error, era silencio — medido en las sesiones reales del usuario, `$ corre ×14`
  // sin un solo comando a la vista, justo lo que el comentario de `execute` declara como
  // la compensación de no preguntar antes de cada uno; y la operación de `xone_navegacion`,
  // que se añadió a la tabla EXPRESAMENTE para poder medir cuál de las siete se usa,
  // tampoco se registraba.
  //
  // Por eso se deriva de la tabla: dos sitios donde decidir lo mismo es la forma en la que
  // esto se rompió. La fila se escribe con el campo que se ENSEÑA delante; los demás son
  // para la traza.
  const campo = CAMPOS_SEGUROS[nombre]?.[0];
  if (campo === undefined || parametros === undefined) return undefined;
  const valor = parametros[campo];
  // Una cadena vacía no describe nada, y un tipo raro (`file_path: 42`) tampoco:
  // sin detalle es una respuesta válida.
  return typeof valor === "string" && valor !== "" ? valor : undefined;
}
