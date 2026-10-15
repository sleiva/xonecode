import { describe, expect, it } from "vitest";
import {
  anchoDeMaquetaDeImagen,
  informeDeConversion,
  motivoDeMedidasInaceptables,
  pDeMaqueta,
  resolucionDeAppXml,
  TOPE_DE_MEDIDAS,
} from "./convertirAP.js";

describe("convertir_a_p: la cuenta", () => {
  it("el icono de Maset: 24 px en una maqueta de 420 con resolution-width 1080 son 62p, no 24p", () => {
    expect(pDeMaqueta(24, 1080, 420)).toBe(62);
  });

  it("redondea a la p entera", () => {
    expect(pDeMaqueta(20, 1080, 390)).toBe(55);
    expect(pDeMaqueta(0, 1080, 390)).toBe(0);
  });
});

describe("convertir_a_p: la resolución sale del app.xml", () => {
  it("lee ancho y alto del nodo <app>", () => {
    const texto = '<?xml version="1.0"?>\n<app prefix="gen" resolution-width="1080" resolution-height="1920" entry-point="EntryPoint">';
    expect(resolucionDeAppXml(texto)).toEqual({ ancho: 1080, alto: 1920 });
  });

  it("sin el alto sigue valiendo: la cuenta es del ancho", () => {
    expect(resolucionDeAppXml('<app resolution-width="720">')).toEqual({ ancho: 720 });
  });

  it("-1 no se convierte, y se dice por qué", () => {
    const r = resolucionDeAppXml('<app resolution-width="-1" resolution-height="-1">');
    expect(r).toHaveProperty("motivo");
    expect((r as { motivo: string }).motivo).toContain('resolution-width="-1"');
  });

  it("sin resolution-width, o sin <app>, tampoco", () => {
    expect(resolucionDeAppXml('<app prefix="x">')).toEqual({ motivo: "el app.xml no declara resolution-width" });
    expect(resolucionDeAppXml("<otra/>")).toEqual({ motivo: "el app.xml no tiene un nodo <app>" });
  });

  it("no confunde un atributo que contiene el nombre", () => {
    expect(resolucionDeAppXml('<app max-resolution-width="9" resolution-width="800">')).toEqual({ ancho: 800 });
  });
});

describe("convertir_a_p: el ancho de la maqueta", () => {
  it("las de Stitch a 1× (390, 427) valen tal cual", () => {
    expect(anchoDeMaquetaDeImagen(390, "x")).toEqual({ ancho: 390 });
    expect(anchoDeMaquetaDeImagen(427, "x")).toEqual({ ancho: 427 });
  });

  it("una a 2× no se adivina: se dice con su división y se pide", () => {
    const r = anchoDeMaquetaDeImagen(780, "/artefactos/diseno/screen.png");
    expect(r).toHaveProperty("motivo");
    const motivo = (r as { motivo: string }).motivo;
    expect(motivo).toContain("780");
    expect(motivo).toContain("390 si está a 2×");
    expect(motivo).toContain("ancho_maqueta");
  });
});

describe("convertir_a_p: las medidas y el informe", () => {
  it("rechaza vacías, negativas y demasiadas", () => {
    expect(motivoDeMedidasInaceptables([])).toBeDefined();
    expect(motivoDeMedidasInaceptables([{ nombre: "x", px: -1 }])).toContain("«x»");
    expect(motivoDeMedidasInaceptables(Array.from({ length: TOPE_DE_MEDIDAS + 1 }, (_, i) => ({ nombre: `m${i}`, px: 1 })))).toBeDefined();
    expect(motivoDeMedidasInaceptables([{ nombre: "x", px: 24 }])).toBeUndefined();
  });

  it("el informe dice la cuenta, sus dos datos con su origen, y la tabla", () => {
    const texto = informeDeConversion({
      medidas: [{ nombre: "icono fila", px: 24 }, { nombre: "alto fila", px: 72 }],
      resolucion: { ancho: 1080, alto: 1920 },
      anchoMaqueta: 420,
      origenDelAncho: "lo indicaste tú",
    });
    expect(texto).toContain("p = px × 1080 (resolution-width del app.xml) / 420 (ancho de la maqueta, lo indicaste tú)");
    expect(texto).toContain("| icono fila | 24 px | 62p |");
    expect(texto).toContain("| alto fila | 72 px | 185p |");
    expect(texto).toContain("border-corner-radius");
  });
});
