import { describe, it, expect } from "vitest";
import { BORDE_BARRA, barra } from "./barra.js";

describe("la barra izquierda de los bloques", () => {
  it("es la vertical gruesa de cajas «┃», que las fuentes dibujan continua entre filas", () => {
    // MEDIDO en terminal real: `▌` (medio bloque) no llena la celda en vertical con la
    // fuente del usuario y la barra salía a trozos. `┃` es el glifo de OpenCode
    // (packages/tui/src/ui/border.ts) y está diseñado para empalmar.
    expect(BORDE_BARRA.left).toBe("┃");
    expect(barra("#000").borderStyle.left).toBe("┃");
  });

  it("solo pinta el lado izquierdo: ni arriba, ni abajo, ni derecha", () => {
    const b = barra("#000");
    expect(b.borderTop).toBe(false);
    expect(b.borderBottom).toBe(false);
    expect(b.borderRight).toBe(false);
    expect(BORDE_BARRA.top).toBe("");
  });
});
