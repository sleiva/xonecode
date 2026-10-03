import { describe, expect, it } from "vitest";
import { metadatosDelFichero, tipoDeFichero } from "./tipoDeFichero.js";
import type { FicheroDelProyecto } from "./tipos.js";

describe("tipoDeFichero", () => {
  it("decide por la EXTENSIÓN, sin distinguir mayúsculas", () => {
    expect(tipoDeFichero("collections/Calculadora.xne")).toBe("xne");
    expect(tipoDeFichero("scripts/util.JS")).toBe("js");
    expect(tipoDeFichero("css/base.css")).toBe("css");
    expect(tipoDeFichero("app.xml")).toBe("xml");
    expect(tipoDeFichero("license.ini")).toBe("config");
    expect(tipoDeFichero("package.json")).toBe("config");
    expect(tipoDeFichero("README.md")).toBe("markdown");
    expect(tipoDeFichero("bd/gestion.db")).toBe("bd");
    expect(tipoDeFichero("bd/datos.sqlite")).toBe("bd");
    expect(tipoDeFichero("fonts/Inter.woff2")).toBe("fuente");
    expect(tipoDeFichero("fonts/Roboto.TTF")).toBe("fuente");
  });

  it("las imágenes, el SVG incluido (es texto, pero se abre como dibujo)", () => {
    for (const r of ["a.png", "a.jpg", "a.jpeg", "a.gif", "a.webp", "icons/menu.svg"]) expect(tipoDeFichero(r)).toBe("imagen");
  });

  it("lo que no está en la tabla, un fichero sin extensión o uno oculto es «otro»", () => {
    expect(tipoDeFichero("notas.txt")).toBe("otro");
    expect(tipoDeFichero("Makefile")).toBe("otro");
    expect(tipoDeFichero(".gitignore")).toBe("otro");
    // `constructor` no es una extensión que la tabla conozca, por mucho que exista en un objeto.
    expect(tipoDeFichero("raro.constructor")).toBe("otro");
  });
});

const fichero = (f: Partial<FicheroDelProyecto> & { ruta: string }): FicheroDelProyecto => ({
  recortado: false,
  binario: false,
  bytes: 0,
  ...f,
});

describe("metadatosDelFichero", () => {
  it("un .xne en UTF-8 con LF: lenguaje, líneas, codificación y finales", () => {
    const f = fichero({ ruta: "c/Calculadora.xne", texto: "<coll>\n  <x/>\n</coll>\n", codificacion: "utf-8" });
    expect(metadatosDelFichero(f.ruta, f)).toEqual(["XML de XOne", "3 líneas", "UTF-8", "LF"]);
  });

  it("CRLF y latin1 se dicen como son; una sola línea va en singular", () => {
    const f = fichero({ ruta: "s.js", texto: "var a = 1;\r\n", codificacion: "latin1" });
    expect(metadatosDelFichero(f.ruta, f)).toEqual(["JavaScript", "1 línea", "Latin-1", "CRLF"]);
  });

  it("la última línea sin salto también cuenta", () => {
    const f = fichero({ ruta: "a.css", texto: "a{}\nb{}", codificacion: "utf-8" });
    expect(metadatosDelFichero(f.ruta, f)).toEqual(["CSS", "2 líneas", "UTF-8", "LF"]);
  });

  it("sin ningún salto de línea NO se afirma un final de línea", () => {
    const f = fichero({ ruta: "a.json", texto: "{}", codificacion: "utf-8" });
    expect(metadatosDelFichero(f.ruta, f)).toEqual(["JSON", "1 línea", "UTF-8"]);
  });

  it("recortado: no se cuentan líneas (la cuenta sería la del trozo)", () => {
    const f = fichero({ ruta: "a.md", texto: "uno\ndos\n", recortado: true, codificacion: "utf-8" });
    expect(metadatosDelFichero(f.ruta, f)).toEqual(["Markdown", "UTF-8", "LF"]);
  });

  it("sin codificación que conste, no se dice ninguna", () => {
    const f = fichero({ ruta: "x.ini", texto: "a=1\n" });
    expect(metadatosDelFichero(f.ruta, f)).toEqual(["INI", "1 línea", "LF"]);
  });

  it("lo que no tiene lenguaje propio es «Texto»; un .xml es «XML» a secas", () => {
    expect(metadatosDelFichero("n.txt", fichero({ ruta: "n.txt", texto: "" }))).toEqual(["Texto", "0 líneas"]);
    expect(metadatosDelFichero("app.xml", fichero({ ruta: "app.xml", texto: "<a/>" }))).toEqual(["XML", "1 línea"]);
  });

  it("sin texto (una imagen, un binario) no hay línea: lo que es ya lo dice el visor de debajo", () => {
    expect(metadatosDelFichero("i.png", fichero({ ruta: "i.png", binario: true, mime: "image/png", base64: "AA==" }))).toEqual([]);
    expect(metadatosDelFichero("b.db", fichero({ ruta: "b.db", binario: true }))).toEqual([]);
  });

  it("con un error o sin contenido todavía, nada", () => {
    expect(metadatosDelFichero("a.xne", undefined)).toEqual([]);
    expect(metadatosDelFichero("a.xne", fichero({ ruta: "a.xne", error: "no se puede leer" }))).toEqual([]);
  });

  it("editando, el final de línea es el del fichero (el editor ya normalizó el texto a «\\n»)", () => {
    const f = fichero({ ruta: "a.xne", texto: "uno\r\ndos\r\n", codificacion: "utf-8" });
    expect(metadatosDelFichero(f.ruta, f, "\r\n")).toEqual(["XML de XOne", "2 líneas", "UTF-8", "CRLF"]);
  });
});
