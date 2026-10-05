import { describe, expect, it } from "vitest";
import { codificarWindows1252, decodificarComoTexto, decodificarWindows1252, esUtf8Valido } from "./codificacion.js";

describe("windows-1252: el codificador es el inverso EXACTO del decodificador de la lectura", () => {
  it("la ida y vuelta de los 256 bytes es exacta, incluidos los C1 que windows-1252 no define", () => {
    const todos = Uint8Array.from({ length: 256 }, (_, i) => i);
    const texto = decodificarWindows1252(todos);
    const vuelta = codificarWindows1252(texto);
    expect("bytes" in vuelta && Array.from(vuelta.bytes)).toEqual(Array.from(todos));
  });

  it("decodifica como la lectura: 0x80 es «€», 0xF1 es «ñ» y 0x81 queda en U+0081", () => {
    expect(decodificarWindows1252(Uint8Array.of(0x80, 0xf1, 0x81))).toBe("€ñ\u0081");
  });

  it("codifica las tildes, la ñ y el € en un byte cada uno", () => {
    const r = codificarWindows1252("Tamaño acción €");
    expect("bytes" in r && Array.from(r.bytes)).toEqual([
      ...Array.from(Buffer.from("Tama", "ascii")), 0xf1, ...Array.from(Buffer.from("o acci", "ascii")), 0xf3,
      ...Array.from(Buffer.from("n ", "ascii")), 0x80,
    ]);
  });

  it("un carácter que no cabe NO se sustituye: dice cuál y en qué línea (desde 1)", () => {
    expect(codificarWindows1252("uno\ndos\ntres 😀 fin")).toEqual({ caracter: "😀", linea: 3 });
    // U+0080 no es «€»: en windows-1252 0x80 ya es el euro, así que U+0080 no tiene byte.
    expect(codificarWindows1252("a\u0080")).toEqual({ caracter: "\u0080", linea: 1 });
    expect(codificarWindows1252("Ω")).toEqual({ caracter: "Ω", linea: 1 });
  });
});

describe("esUtf8Valido", () => {
  it("distingue UTF-8 de Latin-1", () => {
    expect(esUtf8Valido(new TextEncoder().encode("Tamaño €"))).toBe(true);
    expect(esUtf8Valido(Uint8Array.of(0x54, 0xf1, 0x6f))).toBe(false);
    expect(esUtf8Valido(new Uint8Array())).toBe(true);
  });
});

describe("decodificarComoTexto", () => {
  it("UTF-8 con su BOM dentro (como `readFile(…, \"utf8\")`), y si no, windows-1252", () => {
    expect(decodificarComoTexto(Uint8Array.of(0xef, 0xbb, 0xbf, 0x61))).toBe("\uFEFFa");
    expect(decodificarComoTexto(new TextEncoder().encode("Año €"))).toBe("Año €");
    expect(decodificarComoTexto(Uint8Array.of(0x41, 0xf1, 0x6f, 0x20, 0x80))).toBe("Año €");
  });
});
