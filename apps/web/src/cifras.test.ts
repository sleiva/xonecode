import { describe, it, expect } from "vitest";
import { abreviar } from "./cifras.js";

describe("abreviar", () => {
  it("por debajo de mil, el número entero: ahí cada token se ve", () => {
    expect(abreviar(0)).toBe("0");
    expect(abreviar(999)).toBe("999");
  });

  it("de mil en adelante, una cifra decimal: 1,2k y 1,9k se distinguen y 1.234 de 1.235 no", () => {
    expect(abreviar(1234)).toBe("1,2k");
    expect(abreviar(12_345)).toBe("12,3k");
    expect(abreviar(2_500_000)).toBe("2,5M");
  });

  it("un `,0` NO se escribe: es el mismo número con dos caracteres de más", () => {
    // El tope de contexto se enseña en cada turno, y era justo ahí donde se leía «1,0M».
    // La regla es una y no un caso especial del millón: se formatea y se tira el `,0`.
    expect(abreviar(1000)).toBe("1k");
    expect(abreviar(1_000_000)).toBe("1M");
    expect(abreviar(3_000_000)).toBe("3M");
  });

  it("lo que no es un número no rompe la fila", () => {
    // Viene de un `JSON.parse` de la red: un NaN dejaría el contador ilegible.
    expect(abreviar(Number.NaN)).toBe("0");
    expect(abreviar(-5)).toBe("0");
    expect(abreviar(Number.POSITIVE_INFINITY)).toBe("0");
  });
});
