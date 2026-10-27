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
  // `max_input_tokens` (`agent/config/catalogoModelos.ts`), que es la verdad para el modelo
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
  /**
   * DeepSeek publica 1M de contexto para los dos modelos que ofrece hoy (`deepseek-flash` y
   * `deepseek-v4-pro`), así que un solo prefijo los cubre y también los alias antiguos que
   * siguen aceptando (`deepseek-v4-flash`).
   *
   * La cifra sale de su tabla de precios, no de la memoria de nadie: el tope de contexto es
   * lo que decide el porcentaje de la barra, y uno inventado es una mentira con forma de
   * cifra. Su tope de SALIDA (384K) no entra aquí a propósito: `construirCompatibleOpenAi`
   * no pasa `maxTokens`, así que una tabla con ese dato no la leería nadie.
   */
  deepseek: [["deepseek", 1_000_000]],
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
 * Cuándo se COMPACTA el contexto del raíz en TrueForge, según la ventana del modelo.
 *
 * Era un 32.000 fijo heredado de deepagents, puesto por Ollama —sin tope que leer y con la
 * compresión llegando tarde—. Con DeepSeek, que tiene un millón de ventana, eso es compactar al
 * 3 %: medido en soporte, cada dos o tres lecturas de fichero, y la compactación de TrueForge
 * SUSTITUYE el contexto entero, así que el agente releía lo que acababa de leer (13
 * compactaciones en un turno de 30 min). Ahora: un cuarto de la ventana conocida, nunca menos
 * del 32.000 de antes (que se queda para lo que no tiene tope, Ollama) y nunca más de 128.000,
 * porque compactar también limita lo que cuesta cada llamada.
 */
export const UMBRAL_DE_COMPACTACION_MINIMO = 32_000;
export const UMBRAL_DE_COMPACTACION_MAXIMO = 128_000;
export const FRACCION_DE_LA_VENTANA_PARA_COMPACTAR = 0.25;

export function umbralDeCompactacion(tope: number | undefined): number {
  if (tope === undefined || !Number.isFinite(tope) || tope <= 0) return UMBRAL_DE_COMPACTACION_MINIMO;
  const cuarto = Math.floor(tope * FRACCION_DE_LA_VENTANA_PARA_COMPACTAR);
  return Math.min(UMBRAL_DE_COMPACTACION_MAXIMO, Math.max(UMBRAL_DE_COMPACTACION_MINIMO, cuarto));
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
 * **El turno pide `TOPE_DE_SALIDA_DEL_TURNO` (32.768), nunca más que el techo del modelo.**
 * Con 16.384 un analista de Sonnet 5.5 se cortó 30 veces seguidas escribiendo el mismo
 * `TASKS.md` (soporte de Maset, 27-10-2026). Cada modelo tiene su techo de salida en la API
 * —128K la familia actual, 64K Haiku/Sonnet/Opus 4.5, 4K-8K la 3.x— y pedir por encima es
 * un 400, por eso la tabla va por prefijo de modelo (el primero que casa gana).
 *
 * **Las llamadas SIN streaming se quedan en `TOPE_DE_SALIDA_SIN_STREAMING` (16.384).** El
 * modelo construido se comparte entre el turno (que STREAMEA: su `_streamResponseChunks`
 * mete `stream: true` sea cual sea la bandera del constructor) y las llamadas sueltas con
 * `.invoke()` —el juez, el aumentador, el juez visual—, que no streamean: el SDK de Anthropic
 * LANZA «Streaming is required…» si una petición sin streaming pide más de ~21.333
 * (`calculateNonstreamingTimeout`). El recorte lo hace `ChatAnthropicConRazonamiento` en
 * `agent/config/modelos.ts`.
 *
 * Solo `anthropic` tiene fila, como `ollama` no tiene fila en la tabla de contexto: los
 * demás clientes no tienen este fallo, y fijarles un tope a ciegas sería recortarles la
 * salida por una razón que no existe.
 */
export const TOPE_DE_SALIDA_DEL_TURNO = 32_768;
export const TOPE_DE_SALIDA_SIN_STREAMING = 16_384;

/** El techo de salida de cada modelo en la API, por prefijo; el primero que casa gana. */
const TECHOS_DE_SALIDA: Partial<Record<Proveedor, Array<[prefijo: string, techo: number]>>> = {
  anthropic: [
    ["claude-haiku-4-5", 64_000],
    ["claude-sonnet-4-5", 64_000],
    ["claude-opus-4-5", 64_000],
    ["claude-opus-4-1", 32_000],
    ["claude-opus-4-2", 32_000], // claude-opus-4-20250514
    ["claude-sonnet-4-2", 64_000], // claude-sonnet-4-20250514
    ["claude-3-7", 64_000],
    ["claude-3-5", 8_192],
    ["claude-3-", 4_096],
    ["claude", 128_000],
  ],
};

export function topeDeSalida(proveedor: Proveedor, modelo: string): number | undefined {
  const techo = TECHOS_DE_SALIDA[proveedor]?.find(([prefijo]) => modelo.startsWith(prefijo))?.[1];
  return techo === undefined ? undefined : Math.min(TOPE_DE_SALIDA_DEL_TURNO, techo);
}
