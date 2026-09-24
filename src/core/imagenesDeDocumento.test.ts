import { describe, expect, it } from "vitest";
import { conImagenesIncrustadas, enlacesDeImagen, imagenEnProyecto } from "./imagenesDeDocumento.js";

describe("las imágenes que enlaza un documento", () => {
  it("encuentra los enlaces en markdown y en html, sin repetir", () => {
    const md = [
      "![Login](img/login.png)",
      '![Menú](img/menu.png "El menú")',
      "![Con espacios](<img/mi captura.png>)",
      "![Login otra vez](img/login.png)",
      '<img src="img/logo.svg" alt="logo">',
      "[un enlace, no una imagen](img/no.png)",
    ].join("\n");
    expect(enlacesDeImagen(md)).toEqual(["img/login.png", "img/menu.png", "img/mi captura.png", "img/logo.svg"]);
  });

  it("resuelve la ruta respecto a la carpeta del DOCUMENTO, y la virtual desde la raíz", () => {
    expect(imagenEnProyecto("doc/manual-usuario.md", "img/login.png")).toBe("doc/img/login.png");
    expect(imagenEnProyecto("doc/manual-usuario/03-acceso.md", "../img/login.png")).toBe("doc/img/login.png");
    expect(imagenEnProyecto("doc/manual.md", "/doc/img/login.png")).toBe("doc/img/login.png");
    expect(imagenEnProyecto("doc/manual.md", "img/mi%20captura.png?v=2#x")).toBe("doc/img/mi captura.png");
  });

  it("lo que no es una imagen del proyecto no se toca: URLs, datos y lo que se sale de la raíz", () => {
    for (const enlace of ["https://x.com/a.png", "data:image/png;base64,AAAA", "file:///Users/a/x.png", "//cdn/x.png", "../../fuera.png"]) {
      expect(imagenEnProyecto("doc/manual.md", enlace), enlace).toBeUndefined();
    }
  });

  it("sustituye solo lo que se pudo incrustar, en las dos sintaxis, y deja el resto igual", () => {
    const md = '![Login](img/login.png "t")\n![Rota](img/rota.png)\n<img src="img/login.png">\n![Esp](<img/a b.png>)';
    const incrustadas = new Map([
      ["img/login.png", "data:image/png;base64,AAA"],
      ["img/a b.png", "data:image/png;base64,BBB"],
    ]);
    expect(conImagenesIncrustadas(md, incrustadas)).toBe(
      '![Login](data:image/png;base64,AAA "t")\n![Rota](img/rota.png)\n<img src="data:image/png;base64,AAA">\n![Esp](data:image/png;base64,BBB)'
    );
  });
});
