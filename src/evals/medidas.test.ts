import { describe, expect, it } from "vitest";
import { comparar, pintarCelda, resumirCelda, type Pasada } from "./medidas.js";

const pasada = (entrada: number, extra: Partial<Pasada> = {}): Pasada => ({
  entrada,
  salida: 100,
  cache: 0,
  llamadas: 5,
  ms: 10_000,
  correcta: true,
  delego: true,
  ...extra,
});

describe("la estadística del banco", () => {
  it("una pasada que reventó NO se promedia: se cuenta aparte", () => {
    // Meterla como un cero abarataría el turno que no llegó a ocurrir; tirarla en silencio
    // escondería que el cambio rompe. Se hace lo tercero: fuera de la media y contada.
    const r = resumirCelda("m", "p", [pasada(1000), pasada(2000), pasada(0, { error: "reventó" })]);
    expect(r.validas).toBe(2);
    expect(r.errores).toBe(1);
    expect(r.entrada?.media).toBe(1500);
  });

  it("la dispersión es el rango sobre la media, y con una sola pasada no significa nada", () => {
    expect(resumirCelda("m", "p", [pasada(1000), pasada(3000)]).entrada).toMatchObject({ media: 2000, min: 1000, max: 3000, dispersion: 1 });
    expect(resumirCelda("m", "p", [pasada(1000)]).entrada?.dispersion).toBe(0);
  });

  it("sin ninguna pasada válida no se inventa una media", () => {
    const r = resumirCelda("m", "p", [pasada(0, { error: "x" })]);
    expect(r.entrada).toBeUndefined();
    expect(pintarCelda(r).join("\n")).toContain("ninguna pasada terminó");
  });

  it("la media NUNCA se pinta sola: lleva su rango y su dispersión", () => {
    // Cifras de cinco dígitos a propósito: en español no se agrupan los millares de cuatro,
    // así que con 1000/3000 este test comprobaría el formato y no la regla.
    const texto = pintarCelda(resumirCelda("m", "p", [pasada(10_000), pasada(30_000)])).join("\n");
    expect(texto).toContain("20.000");
    expect(texto).toContain("10.000–30.000");
    expect(texto).toContain("±100%");
  });

  it("avisa de que una celda dispersa no decide nada", () => {
    const texto = pintarCelda(resumirCelda("m", "p", [pasada(1000), pasada(3000)])).join("\n");
    expect(texto).toContain("NO decide");
  });

  it("una respuesta barata y MALA se marca: no es una mejora", () => {
    const texto = pintarCelda(resumirCelda("m", "p", [pasada(100, { correcta: false }), pasada(110)])).join("\n");
    expect(texto).toContain("INCORRECTAS");
  });

  it("una pasada que no delegó se marca cuando otras sí: es otro camino, no el mismo más barato", () => {
    const texto = pintarCelda(resumirCelda("m", "p", [pasada(1000, { delego: false }), pasada(1100)])).join("\n");
    expect(texto).toContain("sin delegar");
  });

  it("y si NINGUNA delegó no se avisa: ahí no hay dos caminos mezclados", () => {
    const texto = pintarCelda(resumirCelda("m", "p", [pasada(1000, { delego: false }), pasada(1010, { delego: false })])).join("\n");
    expect(texto).not.toContain("sin delegar");
  });
});

describe("comparar dos bancos", () => {
  const celda = (valores: number[], extra: Partial<Pasada> = {}) => resumirCelda("m", "p", valores.map((v) => pasada(v, extra)));

  it("con los rangos solapados NO se afirma nada, por distintas que sean las medias", () => {
    // El error exacto del 17-09-2026: medias de 39.518 y 26.711 con rangos que se pisan.
    const r = comparar(celda([30_000, 40_000]), celda([10_000, 31_000]));
    expect(r.concluyente).toBe(false);
    expect(r.motivo).toContain("ruido");
  });

  it("con los rangos separados sí, y dice en qué dirección", () => {
    const r = comparar(celda([30_000, 32_000]), celda([10_000, 12_000]));
    expect(r.concluyente).toBe(true);
    expect(r.diferencia).toBeLessThan(0);
  });

  it("una mejora con respuestas incorrectas no es una mejora", () => {
    const r = comparar(celda([30_000, 32_000]), celda([1_000, 1_200], { correcta: false }));
    expect(r.concluyente).toBe(false);
    expect(r.motivo).toContain("incorrectas");
  });
});
