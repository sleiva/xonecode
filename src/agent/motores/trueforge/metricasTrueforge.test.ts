import { describe, expect, it } from "vitest";
import { diferenciasDelContraste, metricasDeTrueforge } from "./metricasTrueforge.js";

describe("el contraste con las métricas de TrueForge", () => {
  it("traduce la forma de la librería; lo que no es número no consta, y ausente no es cero", () => {
    expect(
      metricasDeTrueforge({
        total_input_tokens: 190, total_output_tokens: 19, total_tokens: 209, total_cache_read_tokens: 20,
        iterations: 4, total_tool_calls: 1, total_summarizations: 0, total_sub_agents: 1, total_cost_in_usd: 0.002,
      })
    ).toEqual({ entrada: 190, salida: 19, cache: 20, iteraciones: 4, tools: 1, subagentes: 1, resumenes: 0, costeUsd: 0.002 });
    const sinCache = metricasDeTrueforge({ total_input_tokens: 1, total_output_tokens: 1, iterations: 1, total_cost_in_usd: "raro" });
    expect(sinCache).not.toHaveProperty("cache");
    expect(sinCache).not.toHaveProperty("costeUsd");
  });

  it("dice CADA diferencia con las dos cifras; iguales, nada", () => {
    const nuestras = { entrada: 190, salida: 19, cache: 20, llamadas: 4 };
    const suyas = { entrada: 190, salida: 19, cache: 20, iteraciones: 4, tools: 1, subagentes: 1, resumenes: 0 };
    expect(diferenciasDelContraste(nuestras, suyas, 0)).toEqual([]);
    expect(diferenciasDelContraste({ ...nuestras, entrada: 150 }, suyas, 0)).toEqual(["entrada: nuestra 150, TrueForge 190"]);
    // La caché ausente en la librería no se compara: no es un cero.
    const { cache: _c, ...sinCache } = suyas;
    expect(diferenciasDelContraste({ ...nuestras, cache: 999 }, sinCache, 0)).toEqual([]);
  });

  it("un hijo EXTERNO es una iteración de la librería y ninguna llamada nuestra: se descuenta", () => {
    // Medido con la librería real: dos llamadas del raíz y un hijo externo dan tres iteraciones.
    const nuestras = { entrada: 120, salida: 11, cache: 20, llamadas: 2 };
    const suyas = { entrada: 120, salida: 11, cache: 20, iteraciones: 3, tools: 0, subagentes: 1, resumenes: 0 };
    expect(diferenciasDelContraste(nuestras, suyas, 1)).toEqual([]);
    expect(diferenciasDelContraste(nuestras, suyas, 0)).toEqual(["llamadas: nuestra 2, TrueForge 3"]);
  });

  it("una COMPACTACIÓN es una llamada nuestra y no una iteración de la librería: se suma", () => {
    // Medido con la librería real: raíz, resumen y raíz dan dos iteraciones y un resumen.
    const nuestras = { entrada: 41_900, salida: 62, cache: 0, llamadas: 3 };
    const suyas = { entrada: 41_900, salida: 62, iteraciones: 2, tools: 1, subagentes: 0, resumenes: 1 };
    expect(diferenciasDelContraste(nuestras, suyas, 0)).toEqual([]);
  });
});
