import { describe, expect, it } from "vitest";
import {
  codificacionDeclarada,
  codificacionParaEscribir,
  codificar8Bits,
  decodificar8Bits,
  decodificarComoTexto,
  esUtf8Valido,
  tablaDeLosBytes,
} from "./codificacion.js";

const ascii = (t: string): number[] => Array.from(new TextEncoder().encode(t));

describe.each(["windows-1252", "iso-8859-15"] as const)("tabla %s: el codificador es el inverso EXACTO del decodificador", (tabla) => {
  it("la ida y vuelta de los 256 bytes es exacta, incluidos los C1", () => {
    const todos = Uint8Array.from({ length: 256 }, (_, i) => i);
    const vuelta = codificar8Bits(decodificar8Bits(todos, tabla), tabla);
    expect("bytes" in vuelta && Array.from(vuelta.bytes)).toEqual(Array.from(todos));
  });
});

describe("las dos tablas", () => {
  it("windows-1252 decodifica como la lectura: 0x80 es «€», 0xF1 es «ñ» y 0x81 queda en U+0081", () => {
    expect(decodificar8Bits(Uint8Array.of(0x80, 0xf1, 0x81), "windows-1252")).toBe("€ñ\u0081");
  });

  it("ISO-8859-15 tiene el € en 0xA4, y 0x80 es un control", () => {
    expect(decodificar8Bits(Uint8Array.of(0xa4, 0xf1, 0x80), "iso-8859-15")).toBe("€ñ\u0080");
    const r = codificar8Bits("€", "iso-8859-15");
    expect("bytes" in r && Array.from(r.bytes)).toEqual([0xa4]);
    // «¤» existe en windows-1252 (0xA4) y no en ISO-8859-15, que puso ahí el euro.
    expect(codificar8Bits("¤", "iso-8859-15")).toEqual({ caracter: "¤", linea: 1 });
  });

  it("codifica las tildes, la ñ y el € en un byte cada uno", () => {
    const r = codificar8Bits("Tamaño acción €", "windows-1252");
    expect("bytes" in r && Array.from(r.bytes)).toEqual([...ascii("Tama"), 0xf1, ...ascii("o acci"), 0xf3, ...ascii("n "), 0x80]);
  });

  it("un carácter que no cabe NO se sustituye: dice cuál y en qué línea (desde 1)", () => {
    expect(codificar8Bits("uno\ndos\ntres 😀 fin", "windows-1252")).toEqual({ caracter: "😀", linea: 3 });
    expect(codificar8Bits("a\u0080", "windows-1252")).toEqual({ caracter: "\u0080", linea: 1 });
    expect(codificar8Bits("Ω", "iso-8859-15")).toEqual({ caracter: "Ω", linea: 1 });
  });
});

describe("codificacionDeclarada: el prólogo XML, como `XmlParser.detectEncoding` de xone-linter", () => {
  it("reconoce las declaraciones de 8 bits y la de UTF-8", () => {
    expect(codificacionDeclarada('<?xml version="1.0" encoding="iso-8859-15"?>\n<coll/>')).toBe("iso-8859-15");
    expect(codificacionDeclarada('<?xml version="1.0" encoding="ISO-8859-1"?>')).toBe("windows-1252");
    expect(codificacionDeclarada("<?xml version='1.0' encoding='windows-1252'?>")).toBe("windows-1252");
    expect(codificacionDeclarada('﻿<?xml version="1.0" encoding="UTF-8"?>')).toBe("utf-8");
  });

  it("sin prólogo, sin `encoding` o con uno desconocido, no hay declaración", () => {
    expect(codificacionDeclarada("<coll/>")).toBeUndefined();
    expect(codificacionDeclarada('<?xml version="1.0"?>')).toBeUndefined();
    expect(codificacionDeclarada('<?xml version="1.0" encoding="shift_jis"?>')).toBeUndefined();
    expect(codificacionDeclarada('<coll a="1"/>\n<?xml encoding="iso-8859-15"?>')).toBeUndefined();
  });
});

describe("tablaDeLosBytes", () => {
  it("ISO-8859-15 si el prólogo lo declara; si no, windows-1252", () => {
    expect(tablaDeLosBytes(Uint8Array.from([...ascii('<?xml version="1.0" encoding="iso-8859-15"?>'), 0xa4]))).toBe("iso-8859-15");
    expect(tablaDeLosBytes(Uint8Array.from([...ascii('<?xml version="1.0" encoding="iso-8859-1"?>'), 0x80]))).toBe("windows-1252");
    expect(tablaDeLosBytes(Uint8Array.of(0xf1))).toBe("windows-1252");
  });
});

describe("codificacionParaEscribir: en qué bytes se guarda", () => {
  const ISO15 = '<?xml version="1.0" encoding="iso-8859-15"?>\n';
  it("(i) lo que ya no es UTF-8 sigue en su tabla de 8 bits", () => {
    expect(codificacionParaEscribir(Uint8Array.from([...ascii(ISO15), 0xa4]), "x")).toBe("iso-8859-15");
    expect(codificacionParaEscribir(Uint8Array.of(0xf1), "x")).toBe("windows-1252");
  });
  it("(i) si lo que se escribe CAMBIA la declaración de 8 bits, manda la nueva: es la tabla con que se volverá a leer", () => {
    const W1252 = '<?xml version="1.0" encoding="windows-1252"?>\n';
    // windows-1252 → iso-8859-15, y al revés.
    expect(codificacionParaEscribir(Uint8Array.from([...ascii(W1252), 0x80]), ISO15 + "€")).toBe("iso-8859-15");
    expect(codificacionParaEscribir(Uint8Array.from([...ascii(ISO15), 0xa4]), W1252 + "€")).toBe("windows-1252");
    // Una declaración utf-8, o ninguna, no cambia la tabla de los bytes.
    expect(codificacionParaEscribir(Uint8Array.from([...ascii(ISO15), 0xa4]), '<?xml version="1.0" encoding="utf-8"?>\n')).toBe("iso-8859-15");
    expect(codificacionParaEscribir(Uint8Array.from([...ascii(ISO15), 0xa4]), "sin prólogo")).toBe("iso-8859-15");
  });

  it("(ii) un UTF-8 con algo que no es ASCII se queda en UTF-8, declare lo que declare", () => {
    expect(codificacionParaEscribir(new TextEncoder().encode(ISO15 + "ñ"), ISO15 + "ñ")).toBe("utf-8");
  });
  it("(iii) un ASCII puro o un fichero NUEVO siguen la declaración de lo que se escribe", () => {
    expect(codificacionParaEscribir(new TextEncoder().encode(ISO15), ISO15 + "ñ")).toBe("iso-8859-15");
    expect(codificacionParaEscribir(undefined, ISO15 + "ñ")).toBe("iso-8859-15");
    expect(codificacionParaEscribir(undefined, '<?xml version="1.0" encoding="utf-8"?>\nñ')).toBe("utf-8");
    expect(codificacionParaEscribir(new TextEncoder().encode("hola"), "adiós")).toBe("utf-8");
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
  it("UTF-8 con su BOM dentro (como `readFile(…, \"utf8\")`), y si no, la tabla que declare", () => {
    expect(decodificarComoTexto(Uint8Array.of(0xef, 0xbb, 0xbf, 0x61))).toBe("﻿a");
    expect(decodificarComoTexto(new TextEncoder().encode("Año €"))).toBe("Año €");
    expect(decodificarComoTexto(Uint8Array.of(0x41, 0xf1, 0x6f, 0x20, 0x80))).toBe("Año €");
    expect(decodificarComoTexto(Uint8Array.from([...ascii('<?xml encoding="iso-8859-15"?>'), 0xa4]))).toBe('<?xml encoding="iso-8859-15"?>€');
  });
});
