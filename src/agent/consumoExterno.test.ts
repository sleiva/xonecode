import { describe, it, expect } from "vitest";
import { consumoDeClaude, consumoDeCodex, sumarConsumo, SIN_CONSUMO } from "./consumoExterno.js";

describe("lo que consumió Claude Code, de su `modelUsage`", () => {
  it("suma TODOS sus modelos: el hijo usa más de uno en la misma ejecución", () => {
    // Su compactación y sus propios subagentes corren en otro modelo, y la pregunta aquí es
    // cuánto costó el especialista entero. Por eso se usa `modelUsage` y no `usage`, que por
    // su propia documentación es «MAIN AGENT LOOP ONLY».
    expect(
      consumoDeClaude({
        modelUsage: {
          "claude-sonnet-5": { inputTokens: 100, outputTokens: 20, cacheReadInputTokens: 5, cacheCreationInputTokens: 1 },
          "claude-haiku-4-5": { inputTokens: 7, outputTokens: 3, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
        },
      })
    ).toEqual({ entrada: 107, salida: 23, cache: 6 });
  });

  it("sin `modelUsage`, o con basura, cuenta CERO y no NaN", () => {
    // Un `result` de arranque fallido «may carry zeroed values», y lo que llega es de otro
    // proceso: un NaN se propagaría a la cifra que se enseña y la volvería ilegible.
    for (const malo of [undefined, null, {}, { modelUsage: null }, { modelUsage: { x: "no" } }]) {
      expect(consumoDeClaude(malo)).toEqual(SIN_CONSUMO);
    }
    expect(consumoDeClaude({ modelUsage: { x: { inputTokens: "500", outputTokens: -3 } } })).toEqual(SIN_CONSUMO);
  });
});

describe("lo que lleva consumido un hilo de Codex", () => {
  const aviso = {
    threadId: "t1",
    turnId: "u1",
    tokenUsage: {
      last: { inputTokens: 9, outputTokens: 1, cachedInputTokens: 0, reasoningOutputTokens: 0, totalTokens: 10 },
      total: {
        inputTokens: 200,
        outputTokens: 50,
        cachedInputTokens: 30,
        cacheWriteInputTokens: 4,
        reasoningOutputTokens: 40,
        totalTokens: 280,
      },
      modelContextWindow: 272000,
    },
  };

  it("lee `total` y no `last`: son dos preguntas distintas", () => {
    // `last` es lo que ocupa la VENTANA ahora; `total` es lo que lleva el hilo. Es la misma
    // separación que `vendor/tokenTracking.ts` hace entre `contexto` y los acumulados.
    expect(consumoDeCodex(aviso)).toEqual({ entrada: 200, salida: 50, cache: 34 });
  });

  it("no suma el razonamiento a la salida: por su esquema ya va DENTRO", () => {
    // Sumarlo sería contar 40 tokens dos veces. Lo dice el esquema que genera el propio
    // binario (`codex app-server generate-json-schema`).
    expect(consumoDeCodex(aviso)!.salida).toBe(50);
  });

  it("lo que no trae `total` no es un consumo de cero: es que no se sabe", () => {
    // Por eso devuelve `undefined` y no ceros: un cero se acumularía como un dato y pisaría
    // el último total bueno.
    for (const malo of [undefined, null, {}, { tokenUsage: {} }, { tokenUsage: { total: 3 } }]) {
      expect(consumoDeCodex(malo)).toBeUndefined();
    }
  });
});

describe("acumular entre ejecuciones", () => {
  it("suma, porque cada `correr` es otra sesión del producto", () => {
    // DENTRO de una ejecución los dos contratos son acumulados y se lee el último; entre
    // ejecuciones distintas sí se suma, que es lo que hace esta función.
    expect(sumarConsumo({ entrada: 10, salida: 2, cache: 1 }, { entrada: 5, salida: 1, cache: 0 })).toEqual({
      entrada: 15,
      salida: 3,
      cache: 1,
    });
  });
});
