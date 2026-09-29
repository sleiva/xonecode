import { describe, expect, it } from "vitest";
import { CAMPOS_SEGUROS, detalleDe } from "../turno/resumenDeTool.js";
import { crearGenerarFondoSvg, NOMBRE_GENERAR_FONDO, recibeGenerarFondo } from "./generarFondoSvg.js";

const llamar = (entrada: Record<string, unknown>): Promise<string> =>
  crearGenerarFondoSvg().invoke(entrada as never) as Promise<string>;
const valida = { tipo: "degradado-lineal", nombre: "boton_azul", ancho: 972, alto: 103, colores: ["#2196f3", "#0d47a1"] };

describe("generar_fondo_svg", () => {
  it("devuelve el SVG, la ruta donde escribirlo y cómo usarlo, con el nombre a secas", async () => {
    const r = await llamar(valida);
    expect(r).toContain("/icons/bg_boton_azul.svg");
    expect(r).not.toContain('="icons/');
    expect(r).toContain("<svg");
    expect(r).toContain("border-corner-radius no recorta");
  });

  /**
   * Medido: en un `type="B"`, `imgbk` (atributo o clase CSS) se IGNORA y sale el botón nativo; el
   * fondo de un botón va en `img`. En un frame sí vale `imgbk`. La respuesta tiene que decir las dos.
   */
  it("dice que en un FRAME va imgbk y en un BOTÓN va img, porque imgbk se ignora en los botones", async () => {
    const r = await llamar(valida);
    expect(r).toContain('imgbk="bg_boton_azul.svg"');
    expect(r).toContain('img="bg_boton_azul.svg"');
    expect(r).toMatch(/en un botón\s+imgbk se ignora/);
  });

  it("acepta las medidas como en el XML (90% y 60p) y avisa de que son una estimación", async () => {
    const r = await llamar({ ...valida, ancho: "90%", alto: "60p" });
    expect(r).toContain("<svg");
    expect(r).toContain("ESTIMACIÓN");
    expect(r).toContain("1080");
    // En píxeles reales no hay nada que estimar.
    expect(await llamar({ ...valida, ancho: 972, alto: 60 })).not.toContain("ESTIMACIÓN");
  });

  it("el % en el alto se rechaza con su motivo, sin SVG", async () => {
    const r = await llamar({ ...valida, ancho: "90%", alto: "100%" });
    expect(r).not.toContain("<svg");
    expect(r).toMatch(/alto en %/);
  });

  it("un rechazo se DEVUELVE como texto, sin SVG", async () => {
    for (const mal of [
      { ...valida, colores: ["azul", "rojo"] },
      { ...valida, nombre: "../x" },
      { ...valida, ancho: 10, alto: 1000 },
      { ...valida, colores: ["#000000"] },
    ]) {
      const r = await llamar(mal);
      expect(r, JSON.stringify(mal)).not.toContain("<svg");
      expect(r.length).toBeGreaterThan(10);
    }
  });

  it("el esquema real rechaza un tipo inventado", async () => {
    await expect(llamar({ ...valida, tipo: "blur" })).rejects.toThrow();
  });

  it("solo llega la proporción: el mismo control a otra escala da el mismo SVG", async () => {
    const a = await llamar(valida);
    const b = await llamar({ ...valida, ancho: 486, alto: 51.5 });
    expect(a.split("\n").at(-1)).toBe(b.split("\n").at(-1));
  });

  it("el detalle de la línea es el tipo, y el SVG no cruza", () => {
    expect(CAMPOS_SEGUROS[NOMBRE_GENERAR_FONDO]).toBeDefined();
    expect(detalleDe(NOMBRE_GENERAR_FONDO, { tipo: "sombra", nombre: "x", ancho: 1, alto: 1 })).toBe("sombra");
  });

  it("la reciben quienes escriben el proyecto, y nadie más", () => {
    expect(recibeGenerarFondo({ soloLectura: false, ejecucion: false, escribeEn: [] })).toBe(true);
    expect(recibeGenerarFondo({ soloLectura: true, ejecucion: false, escribeEn: [] })).toBe(false);
    expect(recibeGenerarFondo({ soloLectura: false, ejecucion: true, escribeEn: [] })).toBe(false);
    expect(recibeGenerarFondo({ soloLectura: false, ejecucion: false, escribeEn: ["/doc/"] })).toBe(false);
  });
});
