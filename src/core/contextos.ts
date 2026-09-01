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
  anthropic: [["claude", 200_000]],
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