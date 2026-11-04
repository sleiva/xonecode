import { describe, expect, it } from "vitest";
import { nombraUnaMaqueta } from "./maquetaDelTurno.js";

describe("¿parte el trabajo de una maqueta?", () => {
  it("con /diseno/, una imagen, Stitch o «maqueta», sí; una opción de menú que abre una web, no", () => {
    expect(nombraUnaMaqueta("Crea esta calculadora siguiendo la maqueta de Stitch que tienes en /diseno/ (screen.png)")).toBe(true);
    expect(nombraUnaMaqueta("hazla como /adjuntos/login.jpg")).toBe(true);
    expect(nombraUnaMaqueta("Crea una opción en UTILIDADES con la etiqueta «Contacto» que abra www.xone.es")).toBe(false);
  });
});
