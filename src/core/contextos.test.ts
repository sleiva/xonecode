import { describe, it, expect } from "vitest";
import { topeDeContexto, topeDeSalida, topeResuelto } from "./contextos.js";

describe("topeDeContexto", () => {
  it("las familias conocidas tienen tope, emparejadas por prefijo", () => {
    expect(topeDeContexto("anthropic", "claude-sonnet-4-5-20250929")).toBe(200_000);
    expect(topeDeContexto("gemini", "gemini-2.5-flash")).toBe(1_000_000);
    expect(topeDeContexto("openai", "gpt-4o")).toBe(128_000);
    expect(topeDeContexto("openai", "gpt-4o-mini")).toBe(128_000);
    expect(topeDeContexto("openai", "gpt-4.1")).toBe(1_000_000);
  });

  /**
   * La generación de Claude que lleva 1M de ventana. La tabla decía «claude → 200.000»
   * para TODO, y al emparejar por prefijo eso le daba 200k a `claude-opus-5`: la barra
   * calculaba el porcentaje sobre una quinta parte de la ventana real y reportaba ~5 veces
   * más ocupación de la que había. Es justo la «mentira con forma de cifra» contra la que
   * avisa la cabecera de este fichero, y por dentro del mismo fichero.
   */
  it("la generación de 1M de Claude tiene 1M, no los 200k de la tabla vieja", () => {
    expect(topeDeContexto("anthropic", "claude-opus-5")).toBe(1_000_000);
    expect(topeDeContexto("anthropic", "claude-sonnet-5")).toBe(1_000_000);
    expect(topeDeContexto("anthropic", "claude-opus-4-8")).toBe(1_000_000);
    expect(topeDeContexto("anthropic", "claude-opus-4-7")).toBe(1_000_000);
    expect(topeDeContexto("anthropic", "claude-opus-4-6")).toBe(1_000_000);
    expect(topeDeContexto("anthropic", "claude-sonnet-4-6")).toBe(1_000_000);
    expect(topeDeContexto("anthropic", "claude-fable-5-1")).toBe(1_000_000);
  });

  it("y lo que NO son 1M sigue en 200k: haiku y todo lo anterior a 4.6", () => {
    // El orden de la tabla es lo que sostiene esto: `find` se queda con el PRIMER
    // prefijo que casa, así que las filas específicas van antes que el `claude` de
    // reserva — el mismo patrón que `gpt-4.1` antes de `gpt-4`.
    expect(topeDeContexto("anthropic", "claude-haiku-4-5")).toBe(200_000);
    expect(topeDeContexto("anthropic", "claude-opus-4-5")).toBe(200_000);
    expect(topeDeContexto("anthropic", "claude-sonnet-4-5-20250929")).toBe(200_000);
    expect(topeDeContexto("anthropic", "claude-3-5-haiku")).toBe(200_000);
  });

  it("ollama NO tiene tope a propósito: cada modelo local trae el suyo", () => {
    // Inventar un tope haría que el porcentaje de la barra mienta — y una cifra
    // que miente es peor que una cifra que no está.
    expect(topeDeContexto("ollama", "glm-5.3-flash:cloud")).toBeUndefined();
    expect(topeDeContexto("ollama", "llama3")).toBeUndefined();
  });

  it("un modelo que no calza en ninguna familia conocida: sin tope", () => {
    expect(topeDeContexto("anthropic", "mystery")).toBeUndefined();
  });

  it("el override de config gana a la tabla, por id completo", () => {
    const overrides = { "anthropic/claude-sonnet-4-5-20250929": 500_000 };
    expect(topeDeContexto("anthropic", "claude-sonnet-4-5-20250929", overrides)).toBe(500_000);
  });

  it("el override sirve justo donde la tabla no llega: el modelo local", () => {
    const overrides = { "ollama/glm-5.3-flash:cloud": 131_072 };
    expect(topeDeContexto("ollama", "glm-5.3-flash:cloud", overrides)).toBe(131_072);
    // Y no se aplica a otros modelos del mismo proveedor.
    expect(topeDeContexto("ollama", "llama3", overrides)).toBeUndefined();
  });
});
describe("topeResuelto", () => {
  it("el override del proyecto gana al global, y dice de dónde salió", () => {
    const r = topeResuelto("anthropic", "claude-3", {
      proyecto: { "anthropic/claude-3": 100_000 },
      global: { "anthropic/claude-3": 50_000 },
    });
    expect(r).toEqual({ tope: 100_000, origen: "proyecto" });
  });

  it("el override global vale cuando el proyecto no trae ese id", () => {
    expect(
      topeResuelto("ollama", "local", { proyecto: {}, global: { "ollama/local": 131_072 } })
    ).toEqual({ tope: 131_072, origen: "global" });
  });

  it("sin overrides, la tabla — y el origen lo dice", () => {
    expect(topeResuelto("gemini", "gemini-2.5", {})).toEqual({ tope: 1_000_000, origen: "tabla" });
  });

  it("nadie sabe: undefined, sin disfrazarlo de cero", () => {
    expect(topeResuelto("ollama", "desconocido", {})).toBeUndefined();
  });
});

describe("topeDeSalida", () => {
  /**
   * El fallo medido de `@langchain/anthropic` 1.5.2: su tabla de `max_tokens` por omisión
   * empareja por prefijo, y un id que no conoce cae en su `FALLBACK_MAX_OUTPUT_TOKENS`
   * (4096) sin decir nada. `claude-sonnet-5` es el caso: `claude-sonnet-4` no es prefijo
   * suyo. En un harness que escribe ficheros eso no da error — corta a media escritura.
   */
  it("Claude lleva tope explícito, para no heredar el 4096 silencioso de la dependencia", () => {
    expect(topeDeSalida("anthropic", "claude-sonnet-5")).toBe(16_384);
    expect(topeDeSalida("anthropic", "claude-opus-5")).toBe(16_384);
    // Y uno que su tabla tampoco conoce todavía: el nuestro no depende de esa lista.
    expect(topeDeSalida("anthropic", "claude-loquesea-9")).toBe(16_384);
  });

  it("los demás proveedores NO llevan tope: no tienen ese fallo", () => {
    // Fijarles uno a ciegas sería recortarles la salida por una razón que no existe.
    expect(topeDeSalida("openai", "gpt-4o")).toBeUndefined();
    expect(topeDeSalida("gemini", "gemini-2.5-flash")).toBeUndefined();
    expect(topeDeSalida("ollama", "llama3")).toBeUndefined();
  });
});
