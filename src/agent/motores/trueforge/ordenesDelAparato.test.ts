import { describe, expect, it } from "vitest";
import { COMANDO_DE_CAPTURA, ORDEN_QUE_RECARGA } from "./sesionTrueforge.js";
import { ORDEN_DE_VUELTA } from "./vistaDelEncargo.js";

/**
 * `xone-probar` hace en una orden lo que antes eran varias: si el harness no lo reconociera, probar con él dejaría de
 * contar vueltas (y saltaría su tope) y la captura no se mediría contra la maqueta.
 */
describe("las órdenes del aparato que el harness reconoce", () => {
  it("captura: las de siempre, y xone-probar solo con --captura", () => {
    expect(COMANDO_DE_CAPTURA.test("xone-captura-android")).toBe(true);
    expect(COMANDO_DE_CAPTURA.test("xone-hotswap shot name=X")).toBe(true);
    expect(COMANDO_DE_CAPTURA.test("xone-probar --abrir Calc --captura click name=K_7")).toBe(true);
    expect(COMANDO_DE_CAPTURA.test("xone-probar --abrir Calc click name=K_7")).toBe(false);
  });

  it("vuelta: recargar y desplegar, y xone-probar solo con --recargar", () => {
    for (const patron of [ORDEN_QUE_RECARGA, ORDEN_DE_VUELTA]) {
      expect(patron.test("xone-recargar-android calc.js")).toBe(true);
      expect(patron.test("xone-desplegar-android")).toBe(true);
      expect(patron.test("xone-probar --recargar calc.js --captura click name=K_7")).toBe(true);
      expect(patron.test("xone-probar --abrir Calc click name=K_7")).toBe(false);
      expect(patron.test("xone-hotswap click name=K_7")).toBe(false);
    }
  });
});
