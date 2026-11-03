/**
 * **Lo que ve en cada llamada quien da vueltas, sin arrastrar las vueltas pasadas enteras.**
 *
 * Medido en la calculadora (prueba13, 03-11-2026): el contexto del desarrollador pasó de 26 a 201 mil tokens en un
 * encargo de 127 llamadas, y en la última el 99 % de lo que habían devuelto sus tools tenía más de 10 llamadas de
 * antigüedad —lecturas de versiones que ya había editado, logs y capturas de vueltas superadas—. La memoria de
 * especialistas recorta ENTRE encargos; dentro de uno no había nada.
 *
 * Se aplica en la VISTA que va al modelo (`preLLMEphemeralProcessors`), no en el hilo: lo guardado sigue entero.
 *
 * **Estable entre vueltas, por la CACHÉ**: el proveedor cobra la décima parte de lo que repite el principio de la llamada
 * anterior, y recortar un mensaje viejo en cada llamada rompería ese principio y saldría más caro que no recortar. Por
 * eso solo se toca lo anterior a la ÚLTIMA vuelta (la última recarga o despliegue, `ORDEN_DE_VUELTA`): entre dos vueltas
 * la vista no cambia y la caché se conserva; al empezar una vuelta nueva se paga una llamada sin caché, ya más corta.
 *
 * Qué se recorta de lo anterior a esa vuelta, con la marca que la memoria reducida ya usa (`reducirHistorial`): lo que
 * devolvió cada tool, salvo la lectura de un fichero que NO cambió después (sigue siendo su versión vigente, y recortarla
 * obligaría a releerla). Los argumentos de las llamadas no se tocan: el modelo copia la forma de sus llamadas, y una nota
 * en un argumento acabó escrita dentro de un fichero (medido en Maset). Los ids tampoco. Puro.
 */

/** La orden que abre una vuelta: recargar, desplegar o reiniciar la app en el aparato. */
export const ORDEN_DE_VUELTA = /^\s*xone-(recargar|desplegar|reiniciar)-android\b/;
/** Lo que se conserva de un resultado de una vuelta pasada. */
export const MAX_CARACTERES_DE_VUELTA_PASADA = 300;

const LECTURA = "read_file";
const ESCRITURAS = new Set(["write_file", "edit_file"]);
const ORDENES = new Set(["ejecutar_script", "execute"]);

type Llamada = { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
type Mensaje = { role?: unknown; content?: unknown; tool_calls?: Llamada[]; tool_call_id?: unknown; [k: string]: unknown };

function argumentos(l: Llamada): Record<string, unknown> {
  const a = l.function?.arguments;
  if (typeof a !== "string") return {};
  try {
    const v = JSON.parse(a) as unknown;
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const rutaDe = (args: Record<string, unknown>): string | undefined =>
  typeof args["file_path"] === "string" ? args["file_path"] : typeof args["path"] === "string" ? args["path"] : undefined;

/** ¿Abre una vuelta esta llamada? Una orden del aparato que recarga, despliega o reinicia. */
export function abreVuelta(l: Llamada): boolean {
  const nombre = l.function?.name;
  if (typeof nombre !== "string" || !ORDENES.has(nombre)) return false;
  const orden = argumentos(l)["command"];
  return typeof orden === "string" && ORDEN_DE_VUELTA.test(orden);
}

export function vistaDelEncargo(mensajes: readonly unknown[], max: number = MAX_CARACTERES_DE_VUELTA_PASADA): unknown[] {
  const ms = mensajes as readonly Mensaje[];
  // La última vuelta: el último mensaje del asistente que pidió una recarga o un despliegue.
  let ultimaVuelta = -1;
  ms.forEach((m, i) => {
    if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.some(abreVuelta)) ultimaVuelta = i;
  });
  if (ultimaVuelta < 0) return [...ms];

  // Qué llamada es cada id, y en qué posición se escribió por última vez cada fichero.
  const llamadas = new Map<string, { nombre: string; ruta: string | undefined; posicion: number }>();
  const ultimaEscritura = new Map<string, number>();
  ms.forEach((m, i) => {
    if (m.role !== "assistant" || !Array.isArray(m.tool_calls)) return;
    for (const l of m.tool_calls) {
      const nombre = typeof l.function?.name === "string" ? l.function.name : "";
      const ruta = rutaDe(argumentos(l));
      if (typeof l.id === "string") llamadas.set(l.id, { nombre, ruta, posicion: i });
      if (ESCRITURAS.has(nombre) && ruta !== undefined) ultimaEscritura.set(ruta, i);
    }
  });

  return ms.map((m, i) => {
    if (i >= ultimaVuelta || m.role !== "tool" || typeof m.content !== "string" || m.content.length <= max) return m;
    const l = typeof m.tool_call_id === "string" ? llamadas.get(m.tool_call_id) : undefined;
    // Una lectura de un fichero que no se escribió después sigue siendo su versión vigente: se queda entera.
    if (l?.nombre === LECTURA && l.ruta !== undefined && (ultimaEscritura.get(l.ruta) ?? -1) < l.posicion) return m;
    const motivo = l?.nombre === LECTURA ? "es de una versión del fichero que ya cambiaste" : "es de una vuelta anterior";
    return { ...m, content: `${m.content.slice(0, max)}\n[recortado: eran ${String(m.content.length)} caracteres y ${motivo}; vuelve a leerlo si lo necesitas]` };
  });
}
