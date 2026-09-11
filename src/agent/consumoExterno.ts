/**
 * Qué ha consumido un agente EXTERNO, leído de lo que él mismo reporta.
 *
 * Los dos motores lo dicen, y las dos formas están MEDIDAS contra sus contratos reales y no
 * deducidas:
 * - **Claude Code**: el mensaje `result` trae `modelUsage`, un mapa por modelo. Su propia
 *   documentación dice que es «the correct field for token/cost accounting», por encima de
 *   `usage` — que es solo del bucle principal y se deja fuera los subagentes del hijo.
 * - **Codex**: manda `thread/tokenUsage/updated` con `tokenUsage.total`. Estaba en la lista
 *   de RUIDO de `subagenteCodex.ts`, o sea que el dato llevaba llegando desde el principio y
 *   se tiraba.
 *
 * **Los dos son ACUMULADOS, así que se lee el último y no se suman.** Lo dicen los dos
 * contratos con esas palabras («each result carries the running total so far, so read the
 * latest result rather than summing») y es la diferencia entre contar bien y contar el doble.
 * Entre ejecuciones distintas sí se suma: cada `correr` es otra sesión del producto.
 */

import type { ConsumoDeSesion, ConsumoExterno } from "../core/ports.js";

/** Un número que puede no venir, o venir como cualquier cosa. Ausente cuenta CERO, no NaN. */
const entero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/**
 * Lo que consumió un `query()` de Claude Code, sumando TODOS sus modelos.
 *
 * Se suma por modelo porque un hijo puede usar más de uno en la misma ejecución (su
 * compactación y sus propios subagentes corren en otro), y aquí la pregunta es cuánto ha
 * costado el especialista entero, no cada pieza.
 *
 * La CACHÉ va aparte de la entrada, igual que en `vendor/tokenTracking.ts`: son tokens que
 * se leyeron pero no se pagaron igual, y meterlos en «entrada» inflaría la cifra que se
 * enseña. Que existan los dos campos es lo que permite decir la verdad sin elegir cuál.
 */
export function consumoDeClaude(resultado: unknown): { entrada: number; salida: number; cache: number } {
  const uso = (resultado as { modelUsage?: unknown } | null | undefined)?.modelUsage;
  if (typeof uso !== "object" || uso === null) return { entrada: 0, salida: 0, cache: 0 };
  let entrada = 0;
  let salida = 0;
  let cache = 0;
  for (const porModelo of Object.values(uso as Record<string, unknown>)) {
    if (typeof porModelo !== "object" || porModelo === null) continue;
    const m = porModelo as Record<string, unknown>;
    entrada += entero(m["inputTokens"]);
    salida += entero(m["outputTokens"]);
    cache += entero(m["cacheReadInputTokens"]) + entero(m["cacheCreationInputTokens"]);
  }
  return { entrada, salida, cache };
}

/**
 * Lo que lleva consumido un hilo de Codex, de su `thread/tokenUsage/updated`.
 *
 * Se lee `total` y no `last`: `last` es el de la última llamada —lo que ocupa la ventana—, y
 * aquí la pregunta es cuánto lleva el hilo. Son las dos preguntas que
 * `vendor/tokenTracking.ts` ya separa con `contexto` y los acumulados.
 *
 * `reasoningOutputTokens` NO se suma a la salida: por el esquema del propio binario va
 * dentro de `outputTokens`, así que sumarlo sería contarlo dos veces.
 */
export function consumoDeCodex(params: unknown): { entrada: number; salida: number; cache: number } | undefined {
  const total = (params as { tokenUsage?: { total?: unknown } } | null | undefined)?.tokenUsage?.total;
  if (typeof total !== "object" || total === null) return undefined;
  const t = total as Record<string, unknown>;
  return {
    entrada: entero(t["inputTokens"]),
    salida: entero(t["outputTokens"]),
    cache: entero(t["cachedInputTokens"]) + entero(t["cacheWriteInputTokens"]),
  };
}

/** Suma de consumos, para acumular entre ejecuciones. */
export function sumarConsumo(a: ConsumoDeSesion, b: { entrada: number; salida: number; cache: number }): ConsumoDeSesion {
  return { entrada: a.entrada + b.entrada, salida: a.salida + b.salida, cache: a.cache + b.cache };
}

export const SIN_CONSUMO: ConsumoDeSesion = { entrada: 0, salida: 0, cache: 0 };

export type { ConsumoDeSesion, ConsumoExterno };
