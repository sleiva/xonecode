import { describe, expect, it } from "vitest";
import {
  buscarEnCatalogo, esTrueType, estilosLegibles, familiasDelCatalogo, motivoDeFamiliaInaceptable, motivoDePesoInaceptable,
  nombreDeFicheroDeFuente, recibeFuentes, rutaDeFuente, urlDeCss, urlDeTtfEnCss,
} from "./fuentes.js";

describe("el nombre del fichero sigue la convención de los estáticos de Google", () => {
  it.each([
    ["Inter", 400, false, "Inter-Regular.ttf"],
    ["Inter", 700, false, "Inter-Bold.ttf"],
    ["Roboto Mono", 600, false, "RobotoMono-SemiBold.ttf"],
    ["Roboto Mono", 400, true, "RobotoMono-Italic.ttf"],
    ["Roboto Mono", 700, true, "RobotoMono-BoldItalic.ttf"],
    ["Lato", 100, false, "Lato-Thin.ttf"],
    ["Lato", 900, false, "Lato-Black.ttf"],
  ] as const)("%s %d cursiva=%s → %s", (familia, peso, cursiva, nombre) => {
    expect(nombreDeFicheroDeFuente(familia, peso, cursiva)).toBe(nombre);
  });

  it("la ruta virtual va en fonts/", () => {
    expect(rutaDeFuente("Inter", 700, false)).toBe("/fonts/Inter-Bold.ttf");
  });
});

describe("lo que se acepta como familia y peso", () => {
  it.each(["Inter", "Roboto Mono", "M PLUS 1p", "Noto Sans JP"])("«%s» vale", (f) => {
    expect(motivoDeFamiliaInaceptable(f)).toBeUndefined();
  });
  it.each(["", " Inter", "Inter ", "Roboto  Mono", "../x", "Inter&x=1", "Inter:wght@1", "a/b"])("«%s» no vale", (f) => {
    expect(motivoDeFamiliaInaceptable(f)).toBeDefined();
  });
  it("pesos de cien en cien, de 100 a 900", () => {
    expect(motivoDePesoInaceptable(400)).toBeUndefined();
    for (const p of [0, 1, 450, 1000]) expect(motivoDePesoInaceptable(p)).toBeDefined();
  });
});

describe("la URL de css2 y la del .ttf que devuelve", () => {
  it("compone el eje como lo pide la API (medido)", () => {
    expect(urlDeCss("Inter", 700, false)).toBe("https://fonts.googleapis.com/css2?family=Inter:wght@700");
    expect(urlDeCss("Roboto Mono", 700, true)).toBe("https://fonts.googleapis.com/css2?family=Roboto+Mono:ital,wght@1,700");
  });

  const css = (url: string, formato = "truetype"): string =>
    `@font-face {\n  font-family: 'Inter';\n  src: url(${url}) format('${formato}');\n}`;

  it("acepta un truetype de fonts.gstatic.com", () => {
    const u = "https://fonts.gstatic.com/s/inter/v20/abc.ttf";
    expect(urlDeTtfEnCss(css(u))).toBe(u);
  });
  it("rechaza otro host, http y otro formato", () => {
    expect(urlDeTtfEnCss(css("https://evil.example/x.ttf"))).toBeUndefined();
    expect(urlDeTtfEnCss(css("https://fonts.gstatic.com.evil.example/x.ttf"))).toBeUndefined();
    expect(urlDeTtfEnCss(css("http://fonts.gstatic.com/x.ttf"))).toBeUndefined();
    expect(urlDeTtfEnCss(css("https://fonts.gstatic.com/x.woff2", "woff2"))).toBeUndefined();
    expect(urlDeTtfEnCss("")).toBeUndefined();
  });
});

describe("esTrueType mira la FIRMA", () => {
  const con = (cabeza: number[]): Uint8Array => new Uint8Array([...cabeza, ...new Array(12).fill(0)]);
  it("00 01 00 00 y «true» lo son; OTTO, HTML y lo corto no", () => {
    expect(esTrueType(con([0, 1, 0, 0]))).toBe(true);
    expect(esTrueType(con([0x74, 0x72, 0x75, 0x65]))).toBe(true);
    expect(esTrueType(con([0x4f, 0x54, 0x54, 0x4f]))).toBe(false);
    expect(esTrueType(new TextEncoder().encode("<!doctype html><html>"))).toBe(false);
    expect(esTrueType(new Uint8Array([0, 1, 0, 0]))).toBe(false);
  });
});

describe("el catálogo y la búsqueda", () => {
  const cuerpo = {
    familyMetadataList: [
      { family: "Roboto", category: "Sans Serif", popularity: 4, fonts: { "400": {}, "700": {}, "400i": {} } },
      { family: "Roboto Mono", category: "Monospace", popularity: 20, fonts: { "400": {}, "700i": {} } },
      { family: "Roboto Flex", category: "Sans Serif", popularity: 9, fonts: { "1": {}, "400": {}, "1000": {} } },
      { family: "Inter", category: "Sans Serif", popularity: 5, fonts: { "400": {} } },
      { family: "../malo", fonts: { "400": {} } },
      { family: "Sin Pesos", fonts: { "1": {} } },
      "basura",
    ],
  };

  it("se queda con las familias con forma y con los pesos de 100 a 900", () => {
    const fs = familiasDelCatalogo(cuerpo);
    expect(fs.map((f) => f.familia)).toEqual(["Roboto", "Roboto Mono", "Roboto Flex", "Inter"]);
    expect(fs.find((f) => f.familia === "Roboto Flex")!.estilos).toEqual(["400"]);
    expect(familiasDelCatalogo(null)).toEqual([]);
    expect(familiasDelCatalogo({ familyMetadataList: 3 })).toEqual([]);
  });

  it("la exacta primero (sin espacios ni mayúsculas), luego las que contienen, por popularidad", () => {
    const fs = familiasDelCatalogo(cuerpo);
    expect(buscarEnCatalogo(fs, "robotomono", 5).map((f) => f.familia)).toEqual(["Roboto Mono"]);
    expect(buscarEnCatalogo(fs, "Roboto", 5).map((f) => f.familia)).toEqual(["Roboto", "Roboto Flex", "Roboto Mono"]);
    expect(buscarEnCatalogo(fs, "roboto", 2)).toHaveLength(2);
    expect(buscarEnCatalogo(fs, "  ", 5)).toEqual([]);
    expect(buscarEnCatalogo(fs, "Roboto", 1)[0]).not.toHaveProperty("popularidad");
  });

  it("los estilos se leen en cristiano", () => {
    expect(estilosLegibles(["700", "400i", "400"])).toBe("400, 700, 400 cursiva");
  });
});

describe("recibeFuentes: quien puede dejar el .ttf en fonts/", () => {
  it("el desarrollador (proyecto entero) y el diseñador (con fonts/ en escribeEn)", () => {
    expect(recibeFuentes({ soloLectura: false })).toBe(true);
    expect(recibeFuentes({ soloLectura: false, escribeEn: ["/icons/", "/fonts/"] })).toBe(true);
    expect(recibeFuentes({ soloLectura: false, escribeEn: ["/fonts"] })).toBe(true);
  });
  it("no: solo icons/, el documentador, quien ejecuta, quien solo lee", () => {
    expect(recibeFuentes({ soloLectura: false, escribeEn: ["/icons/"] })).toBe(false);
    expect(recibeFuentes({ soloLectura: false, escribeEn: ["/doc/"] })).toBe(false);
    expect(recibeFuentes({ soloLectura: false, ejecucion: true })).toBe(false);
    expect(recibeFuentes({ soloLectura: true })).toBe(false);
  });
});
