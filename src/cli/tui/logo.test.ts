import { describe, it, expect } from "vitest";
import { LOGO_XONE } from "./logo.js";

describe("el logotipo XONE", () => {
  it("es un bloque rectangular que cabe en el contenido de la sidebar (38 columnas)", () => {
    expect(LOGO_XONE.length).toBe(5);
    const anchos = new Set(LOGO_XONE.map((fila) => fila.length));
    expect(anchos.size, "todas las filas miden lo mismo").toBe(1);
    expect(Math.max(...LOGO_XONE.map((f) => f.length))).toBeLessThanOrEqual(28);
    // Solo bloques y espacios: nada que un terminal pueda medir como doble ancho.
    for (const fila of LOGO_XONE) expect(fila).toMatch(/^[█ ]+$/);
  });

});
