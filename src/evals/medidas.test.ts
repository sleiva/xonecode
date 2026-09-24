import { describe, expect, it } from "vitest";
import { comparar, compararMotores, pintarCelda, resumirCelda, type Pasada } from "./medidas.js";

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

describe("los motores, comparados", () => {
  it("el efectivo cuenta la caché a un décimo: misma entrada, más caché, menos coste", () => {
    const sin = resumirCelda("m", "p", [pasada(10_000, { cache: 0 }), pasada(10_000, { cache: 0 })]);
    const con = resumirCelda("m", "p", [pasada(10_000, { cache: 9_000 }), pasada(10_000, { cache: 9_000 })]);
    expect(con.efectivo!.media).toBeLessThan(sin.efectivo!.media);
    // Por entrada no se distinguen; por efectivo sí, y concluyente.
    expect(comparar(sin, con).diferencia).toBe(0);
    expect(comparar(sin, con, "efectivo")).toMatchObject({ concluyente: true });
  });

  it("empareja por pregunta y modelo contra la BASE, con los dos campos y las llamadas", () => {
    const da = resumirCelda("ds", "entrypoint", [pasada(10_000), pasada(10_500)]);
    const tf = resumirCelda("ds", "entrypoint", [pasada(20_000), pasada(21_000)]);
    const otra = resumirCelda("ds", "login", [pasada(5_000)]);
    const texto = compararMotores(
      [
        { motor: "deepagents", resumen: da },
        { motor: "trueforge", resumen: tf },
        { motor: "trueforge", resumen: otra },
      ],
      "deepagents"
    ).join("\n");
    expect(texto).toContain("entrypoint · ds: trueforge frente a deepagents");
    expect(texto).toMatch(/entrada {2}\+\d+% — CONCLUYENTE/);
    expect(texto).toMatch(/efectivo \+\d+% — CONCLUYENTE/);
    // Una celda sin pareja en la base no se compara contra nada.
    expect(texto).not.toContain("login");
  });

  it("que uno delegue y el otro no se DICE: es otro camino", () => {
    const da = resumirCelda("ds", "capacidad", [pasada(10_000), pasada(10_000)]);
    const tf = resumirCelda("ds", "capacidad", [pasada(9_000, { delego: false }), pasada(9_000, { delego: false })]);
    const texto = compararMotores([{ motor: "deepagents", resumen: da }, { motor: "trueforge", resumen: tf }], "deepagents").join("\n");
    expect(texto).toContain("⚠ deepagents delegó y trueforge no");
  });
});

describe("con UNA pasada no se concluye nada", () => {
  it("dos puntos distintos no son dos rangos que no se tocan", () => {
    // La primera tirada entre motores dijo «0% — CONCLUYENTE» con una pasada por lado.
    const r = comparar(resumirCelda("m", "p", [pasada(1027)]), resumirCelda("m", "p", [pasada(1026)]));
    expect(r).toMatchObject({ concluyente: false, motivo: "con una sola pasada no hay rango" });
  });
});
