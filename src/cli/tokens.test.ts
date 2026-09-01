import { describe, it, expect } from "vitest";
import { compacto, formatearTokens, formatearTope } from "./tokens.js";

describe("el formato compacto compartido", () => {
  it("las dos pieles dan la MISMA cifra: sin decimales de cortesía (.0 se cae)", () => {
    // El bug que fija esto: la sidebar tenía su propio `compacto` con toFixed(1)
    // fijo («200.0K») y stdio redondeaba («200K») — dos pieles, dos cifras.
    expect(compacto(200_000)).toBe("200K");
    expect(formatearTokens(200_000)).toBe("200K tokens");
    expect(formatearTokens(200_000).replace(" tokens", "")).toBe(compacto(200_000));
  });

  it("un decimal cuando hace falta, tokens pelados bajo mil, M a partir del millón", () => {
    expect(compacto(0)).toBe("0");
    expect(compacto(999)).toBe("999");
    expect(compacto(12_800)).toBe("12.8K");
    expect(compacto(1_500_000)).toBe("1.5M");
    expect(formatearTokens(500)).toBe("500 tokens");
  });

  it("el tope va redondeado (131K, 1M): es una ventana, no una medida", () => {
    expect(formatearTope(131_072)).toBe("131K");
    expect(formatearTope(1_000_000)).toBe("1M");
    // Y coincide con compacto cuando la cifra cae redonda: dos pieles, una cifra.
    expect(formatearTope(200_000)).toBe(compacto(200_000));
  });
});
