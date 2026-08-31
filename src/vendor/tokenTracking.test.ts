/**
 * Tests del middleware de conteo de tokens: se le pasa un estado como el que
 * LangGraph le entrega a `afterModel` y se comprueba que el tracker refleja
 * los acumulados de la sesión y el contexto de la ÚLTIMA llamada.
 *
 * No hay modelo, ni red, ni proceso: el estado es un objeto pelado con la
 * forma de un mensaje AIMessage (usage_metadata es lo estándar de LangChain).
 */

import { describe, it, expect } from "vitest";
import { createTokenTracker, createTokenTrackingMiddleware } from "./tokenTracking.js";

/** El estado que `afterModel` espera: mensajes, y el último con usage_metadata. */
function estadoConUsage(input: number, output: number, cacheRead = 0) {
  return {
    messages: [
      { role: "human", content: "hola" },
      {
        role: "ai",
        content: " respuesta",
        usage_metadata: { input_tokens: input, output_tokens: output, input_token_details: { cache_read: cacheRead } },
      },
    ],
  };
}

/**
 * El tipo de `afterModel` de LangChain es una unión «función | {hook}», pero
 * `createMiddleware` devuelve la función TAL CUAL se la dimos (así pasan estos
 * tests): el cast solo le devuelve la llamabilidad al compilador.
 */
function despuesDelModelo(mw: ReturnType<typeof createTokenTrackingMiddleware>): (state: unknown) => void {
  return mw.afterModel as unknown as (state: unknown) => void;
}

describe("createTokenTrackingMiddleware", () => {
  it("acumula input, output y caché de cada llamada", () => {
    const tracker = createTokenTracker();
    const mw = createTokenTrackingMiddleware(tracker);

    despuesDelModelo(mw)(estadoConUsage(100, 20));
    despuesDelModelo(mw)(estadoConUsage(50, 5, 30));

    expect(tracker.input).toBe(150);
    expect(tracker.output).toBe(25);
    expect(tracker.cache).toBe(30);
    expect(tracker.calls).toBe(2);
  });

  it("el contexto es el input de la ÚLTIMA llamada, no la suma", () => {
    const tracker = createTokenTracker();
    const mw = createTokenTrackingMiddleware(tracker);

    despuesDelModelo(mw)(estadoConUsage(1000, 10));
    despuesDelModelo(mw)(estadoConUsage(1500, 10));
    despuesDelModelo(mw)(estadoConUsage(1200, 10));

    // input acumula las tres; contexto dice cuánto ocupa AHORA la ventana.
    expect(tracker.input).toBe(3700);
    expect(tracker.contexto).toBe(1200);
  });

  it("arranca en cero, incluso el contexto, antes de cualquier llamada", () => {
    expect(createTokenTracker()).toEqual({ input: 0, output: 0, cache: 0, calls: 0, contexto: 0 });
  });

  it("lee response_metadata.token_usage cuando no hay usage_metadata", () => {
    const tracker = createTokenTracker();
    const mw = createTokenTrackingMiddleware(tracker);

    despuesDelModelo(mw)({
      messages: [
        {
          role: "ai",
          content: " respuesta",
          response_metadata: {
            token_usage: {
              prompt_tokens: 700,
              completion_tokens: 40,
              prompt_tokens_details: { cached_tokens: 600 },
            },
          },
        },
      ],
    });

    expect(tracker.input).toBe(700);
    expect(tracker.output).toBe(40);
    expect(tracker.cache).toBe(600);
    expect(tracker.contexto).toBe(700);
  });
});