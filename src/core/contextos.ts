/**
 * El tope de la ventana de contexto de cada modelo, con toda la honestidad de
 * la que es capaz una tabla.
 *
 * **Lo que NO hay aquí es tan deliberado como lo que hay:**
 *
 * - `ollama` no aparece a propósito. Cada modelo local trae el suyo (y a veces
 *   lo recorta el `num_ctx` del Modelfile), así que cualquier tope sería
 *   inventado — y un porcentaje calculado sobre un tope inventado no es un
 *   indicador: es una mentira con forma de cifra.
 * - Las familias de la tabla se emparejan por PREFIJO (`gpt-4o-mini` calza con
 *   `gpt-4o`), porque los ids son `familia-variante-fecha`.
 *
 * Para lo que la tabla no sabe, está el override de `config.json`
 * («contextos»: {«proveedor/modelo»: tope}): el usuario sabe más de SU modelo
 * que esta tabla, y se lo cree.
 */

import type { Proveedor } from "./modelos.js";

/** Familias conocidas por proveedor, emparejadas por prefijo del id del modelo. */
const TOPES: Partial<Record<Proveedor, Array<[prefijo: string, tope: number]>>> = {
  // Claude va por VERSIÓN y no por familia, porque dentro de la misma familia la ventana
  // cambió: la generación 4.6 y posteriores lleva 1M, y lo anterior (más Haiku 4.5, que
  // sigue en 200k) se queda en 200.000. Fue una sola fila «claude → 200.000», y al
  // emparejar por prefijo le daba 200k a `claude-opus-5`: la barra calculaba el porcentaje
  // sobre una quinta parte de la ventana real. El orden importa —`find` se queda con el
  // PRIMER prefijo que casa—, así que lo específico va antes que el `claude` de reserva,
  // igual que `gpt-4.1` va antes que `gpt-4` aquí abajo.
  //
  // La tabla sigue siendo el último recurso: el catálogo vivo de Anthropic ya devuelve
  // `max_input_tokens` (`agent/catalogoModelos.ts`), que es la verdad para el modelo
  // concreto; lo que todavía no está es ese valor llegando a la barra, que hoy resuelve
  // por aquí.
  anthropic: [
    ["claude-fable", 1_000_000],
    ["claude-mythos", 1_000_000],
    ["claude-opus-5", 1_000_000],
    ["claude-opus-4-8", 1_000_000],
    ["claude-opus-4-7", 1_000_000],
    ["claude-opus-4-6", 1_000_000],
    ["claude-sonnet-5", 1_000_000],
    ["claude-sonnet-4-6", 1_000_000],
    ["claude", 200_000],
  ],
  gemini: [["gemini", 1_000_000]],
  openai: [
    ["gpt-4.1", 1_000_000],
    ["gpt-4o", 128_000],
    ["gpt-4-turbo", 128_000],
    ["gpt-4", 128_000],
  ],
};

/**
 * El tope de contexto de un modelo, o `undefined` si no se sabe.
 *
 * El override se mira ANTES que la tabla y va por id completo
 * («proveedor/modelo»): un tope fijado a mano describe a ESE modelo, no a la
 * familia.
 */
export function topeDeContexto(
  proveedor: Proveedor,
  modelo: string,
  overrides: Record<string, number> = {}
): number | undefined {
  const porId = overrides[`${proveedor}/${modelo}`];
  if (typeof porId === "number") return porId;

  return TOPES[proveedor]?.find(([prefijo]) => modelo.startsWith(prefijo))?.[1];
}

/**
 * El tope con su ORIGEN, para `/config`: lo que el usuario fijó a mano (proyecto gana
 * a global, igual que con los modelos), la tabla como último recurso — o nada, que es
 * una respuesta válida y se distingue del cero.
 */
export function topeResuelto(
  proveedor: Proveedor,
  modelo: string,
  configs: { proyecto?: Record<string, number>; global?: Record<string, number> }
): { tope: number; origen: "proyecto" | "global" | "tabla" } | undefined {
  const id = `${proveedor}/${modelo}`;
  if (configs.proyecto?.[id] !== undefined) return { tope: configs.proyecto[id]!, origen: "proyecto" };
  if (configs.global?.[id] !== undefined) return { tope: configs.global[id]!, origen: "global" };
  const deTabla = topeDeContexto(proveedor, modelo);
  return deTabla !== undefined ? { tope: deTabla, origen: "tabla" } : undefined;
}
/**
 * El tope de SALIDA que le fijamos a un modelo, o `undefined` para dejarlo en manos del
 * cliente.
 *
 * Existe por un fallo MEDIDO de la dependencia, no por gusto de configurar:
 * `@langchain/anthropic` 1.5.2 resuelve su propio `max_tokens` por omisión con una tabla
 * emparejada por prefijo, y un id que su tabla no conoce cae en su
 * `FALLBACK_MAX_OUTPUT_TOKENS = 4096` **en silencio**. Comprobado reproduciendo su función
 * con sus datos: `claude-sonnet-5` no casa con ninguna de sus claves —`claude-sonnet-4` no
 * es prefijo de `claude-sonnet-5`— y sale con 4096, mientras `claude-opus-5`,
 * `claude-opus-4-8` y `claude-fable-5-1` salen con 16384. En un harness que escribe
 * ficheros, un tope de 4096 no da error: corta la respuesta a media escritura.
 *
 * **16.384 y no más, y el motivo es de qué camino lo usa.** El modelo construido se
 * comparte entre el turno (que STREAMEA: su `_streamResponseChunks` mete `stream: true` en
 * el payload sea cual sea la bandera del constructor) y las llamadas sueltas con `.invoke()`
 * —el juez, el aumentador—, que no streamean y donde un tope grande se lleva por delante el
 * plazo HTTP del SDK. 16.384 es además el valor que la propia dependencia da a la familia
 * actual, así que para los modelos que SÍ conoce esto no cambia nada: solo tapa el 4096.
 *
 * Solo `anthropic` tiene fila, como `ollama` no tiene fila en la tabla de contexto: los
 * demás clientes no tienen este fallo, y fijarles un tope a ciegas sería recortarles la
 * salida por una razón que no existe.
 */
const TOPES_DE_SALIDA: Partial<Record<Proveedor, Array<[prefijo: string, tope: number]>>> = {
  anthropic: [["claude", 16_384]],
};

export function topeDeSalida(proveedor: Proveedor, modelo: string): number | undefined {
  return TOPES_DE_SALIDA[proveedor]?.find(([prefijo]) => modelo.startsWith(prefijo))?.[1];
}
