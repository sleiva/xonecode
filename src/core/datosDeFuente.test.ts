import { describe, expect, it } from "vitest";
import { datosDeFuente, esFuenteLegible, textoDeFuente } from "./datosDeFuente.js";
import { fuente } from "./__pruebas__/fuente.js";

/** Medido en la prueba de la calculadora: el diseñador leía once `.ttf` y recibía el binario como texto. */
describe("los datos de una fuente", () => {
  it("familia, estilo y peso de sus tablas, no el binario", () => {
    expect(datosDeFuente(fuente("JetBrains Mono", "SemiBold", 600))).toEqual({ familia: "JetBrains Mono", estilo: "SemiBold", peso: 600, cursiva: false });
    expect(datosDeFuente(fuente("Roboto", "Bold Italic", 700, true))).toMatchObject({ cursiva: true, peso: 700 });
  });

  it("lo que no es una fuente TrueType/OpenType se dice, sin lanzar", () => {
    expect(datosDeFuente(Buffer.from("wOF2 comprimida, no se lee así"))).toMatchObject({ motivo: expect.stringContaining("no es una fuente") });
    expect(datosDeFuente(Buffer.alloc(3))).toMatchObject({ motivo: expect.any(String) });
  });

  it("el texto para el agente dice el peso con su nombre y que no hace falta abrir el binario", () => {
    const t = textoDeFuente("/fonts/x.ttf", { familia: "Space Grotesk", estilo: "Medium", peso: 500, cursiva: false });
    expect(t).toContain("familia: Space Grotesk");
    expect(t).toContain("peso: 500 (Medium)");
    expect(esFuenteLegible("/fonts/a.TTF")).toBe(true);
    expect(esFuenteLegible("/fonts/a.woff2")).toBe(false);
  });
});
