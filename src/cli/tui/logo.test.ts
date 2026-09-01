import { describe, it, expect } from "vitest";
import { LOGO_XONE, cabeLogo, ANCHO_MINIMO_PARA_LOGO } from "./logo.js";

describe("el logotipo XONE", () => {
  it("es un bloque rectangular que cabe en la sidebar (30 columnas)", () => {
    expect(LOGO_XONE.length).toBe(5);
    const anchos = new Set(LOGO_XONE.map((fila) => fila.length));
    expect(anchos.size, "todas las filas miden lo mismo").toBe(1);
    expect(Math.max(...LOGO_XONE.map((f) => f.length))).toBeLessThanOrEqual(28);
    // Solo bloques y espacios: nada que un terminal pueda medir como doble ancho.
    for (const fila of LOGO_XONE) expect(fila).toMatch(/^[█ ]+$/);
  });

  it("cabe a partir de 100 columnas de terminal, no antes", () => {
    expect(ANCHO_MINIMO_PARA_LOGO).toBe(100);
    expect(cabeLogo(99)).toBe(false);
    expect(cabeLogo(100)).toBe(true);
    expect(cabeLogo(200)).toBe(true);
  });
});
