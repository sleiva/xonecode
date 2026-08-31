import { describe, it, expect } from "vitest";
import { topeDeContexto } from "./contextos.js";

describe("topeDeContexto", () => {
  it("las familias conocidas tienen tope, emparejadas por prefijo", () => {
    expect(topeDeContexto("anthropic", "claude-sonnet-4-5-20250929")).toBe(200_000);
    expect(topeDeContexto("gemini", "gemini-2.5-flash")).toBe(1_000_000);
    expect(topeDeContexto("openai", "gpt-4o")).toBe(128_000);
    expect(topeDeContexto("openai", "gpt-4o-mini")).toBe(128_000);
    expect(topeDeContexto("openai", "gpt-4.1")).toBe(1_000_000);
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