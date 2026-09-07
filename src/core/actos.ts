/**
 * Un acto del transcript: lo que ya no cambia y se pinta por su tipo.
 *
 * Vivía en `cli/tui/store.ts` porque solo lo usaba la TUI. Ahora lo usan DOS pieles —la
 * TUI y la web—, y el servidor web no puede importar de `cli/tui/` sin romper la frontera
 * de Ink. Así que baja a `core/`, que es donde vive lo que comparten las pieles.
 *
 * Ningún acto lleva argumentos de tool: `herramientas.lineas` son líneas YA resumidas por
 * `agent/resumenDeTool.ts`, con la lista blanca de campos por nombre de tool. Lo que se
 * añadió después (`detalles`) tampoco los lleva: es el NOMBRE de la tool y su error, que
 * el evento ya traía y el acto tiraba al componer la línea.
 */

/**
 * Lo que se sabe de la línea i-ésima de un acto de herramientas.
 *
 * Existe porque el evento `tool` lleva `{nombre, detalle, error}` y hasta ahora llegaba al
 * cliente como UNA cadena ya compuesta: la piel podía pintarla, pero no distinguir una
 * lectura de una escritura ni una llamada que falló de una que fue bien. No expone nada
 * nuevo — `detalle` sigue sin viajar aquí, y el nombre de la tool ya iba dentro del texto.
 *
 * `nombre` es OPCIONAL y su ausencia significa algo: por `Piel.linea` no llegan solo tools.
 * También pasan por ahí las líneas de plan, de tarea y de verificación (`core/turno.ts` las
 * escribe con el mismo `escribirLinea`), y esas no son una llamada a nada. Marcarlas como
 * tool sería la misma mentira que un contador inventado; sin nombre, quien pinte sabe que
 * es un paso del motor y no una herramienta.
 */
export interface DetalleDeLinea {
  /** La tool que produjo la línea. Ausente = la línea no vino de una tool. */
  nombre?: string;
  /** El motivo, si la llamada falló. Un error nunca se colapsa con la racha. */
  error?: string;
}
export type Acto =
  | { tipo: "usuario"; texto: string }
  | { tipo: "asistente"; texto: string }
  /**
   * El razonamiento del modelo, si lo publica. Es un acto APARTE de `asistente` porque no
   * es la respuesta: se pinta distinto (apagado, plegable) y quien lea el transcript tiene
   * que poder distinguir lo que el modelo pensó de lo que dijo.
   */
  | { tipo: "razonamiento"; texto: string }
  /**
   * Las líneas de tool CONSECUTIVAS de un turno, en un solo acto: son paisaje, y el
   * transcript enseña solo las últimas. Una línea del asistente (o de sistema) cierra el
   * grupo; la siguiente tool abre otro.
   */
  /**
   * `detalles` corre EN PARALELO a `lineas`, misma longitud y mismo orden. Es opcional
   * porque las sesiones guardadas antes de que existiera no lo traen: ausente significa
   * «esta sesión es anterior», no «ninguna línea vino de una tool», y quien pinte tiene que
   * poder distinguirlo — por eso no se rellena con un array de vacíos al leer del disco.
   */
  | { tipo: "herramientas"; lineas: string[]; detalles?: DetalleDeLinea[] }
  | { tipo: "sistema"; texto: string }
  /**
   * Un artefacto que el agente dejó escrito: un diagrama, un panel, una captura
   * (`core/artefactos.ts`). Es un acto propio y no una línea de `herramientas` porque es lo
   * único del turno que se escribió SIN pasar por la aprobación humana —no es del proyecto—
   * y eso hay que poder decirlo, y porque desde él se abre el fichero.
   *
   * Lleva metadatos y NUNCA el contenido: por aquí pasa lo que se guarda en el `.jsonl` y
   * viaja por el cable, y un panel de `artifacts-builder` son cientos de kilobytes.
   */
  | { tipo: "artefacto"; ruta: string; nombre: string; bytes: number; mime?: string }
  /**
   * `fase` es el valor del enum (`core/events.ts#Fase`), que el acto tiraba al quedarse
   * solo con su texto en español. Opcional por lo mismo que `detalles`: las sesiones
   * viejas no lo traen. Sirve para filtrar y agrupar sin re-parsear la prosa, que es lo
   * que habría que hacer si solo estuviera el texto — y una prosa que alguien reescriba
   * rompería el filtro sin que nada avisara.
   */
  | { tipo: "fase"; texto: string; ms: number; fase?: string }
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

/**
 * La misma fusión, sobre las DOS listas a la vez.
 *
 * Los `detalles` van en paralelo a las `lineas`, así que aplicarles la regla por separado
 * es cómo se desincronizan: la sustitución del cierre de una racha quita un elemento de
 * una lista y no de la otra, y a partir de ahí cada línea lleva el detalle de su vecina.
 * Una sola función que devuelva las dos lo hace imposible por construcción.
 */
export function conLlamadaDeTool(
  grupo: { lineas: readonly string[]; detalles?: readonly DetalleDeLinea[] },
  linea: string,
  detalle: DetalleDeLinea
): { lineas: string[]; detalles: DetalleDeLinea[] } {
  const lineas = conLineaDeTool(grupo.lineas, linea);
  // Si `conLineaDeTool` sustituyó, la lista no creció: el detalle nuevo sustituye al
  // último igual que su línea. Si creció, se añade. Se compara por LONGITUD y no
  // repitiendo el `prefijoDeCierre`, para que solo haya una decisión y no dos que puedan
  // discrepar.
  const previos = grupo.detalles ?? grupo.lineas.map(() => ({}));
  const detalles =
    lineas.length === grupo.lineas.length
      ? [...previos.slice(0, -1), detalle]
      : [...previos, detalle];
  return { lineas, detalles };
}
