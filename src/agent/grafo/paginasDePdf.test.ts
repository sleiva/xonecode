import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { pdf } from "../../core/__pruebas__/pdf.js";
import { aPng, imagenDePagina, LADO_MAXIMO_DE_PAGINA, paginasDePdf } from "./paginasDePdf.js";

describe("las páginas de un PDF (IXCODE-76)", () => {
  it("cada página dice lo que es: con texto, escaneada (sin texto y con imagen) o en blanco", async () => {
    expect(await paginasDePdf(pdf(["Hola", { escaneada: [10, 10] }, ""]))).toEqual([
      { numero: 1, texto: "Hola" },
      { numero: 2, escaneada: true },
      { numero: 3, enBlanco: true },
    ]);
  });

  it("la imagen de una página escaneada sale en PNG, en GRIS y reducida a su lado máximo", async () => {
    const r = await imagenDePagina(pdf(["portada", { escaneada: [2000, 3000] }]), 2);
    if (!("png" in r)) throw new Error(r.motivo);
    const png = PNG.sync.read(r.png);
    expect([png.width, png.height]).toEqual([Math.round((2000 * LADO_MAXIMO_DE_PAGINA) / 3000), LADO_MAXIMO_DE_PAGINA]);
    expect(r.png[25]).toBe(0); // colorType del IHDR: 0 = gris
  });

  it("una página que no existe, o sin imagen, da el motivo; nunca lanza", async () => {
    const bytes = pdf(["solo texto"]);
    expect(await imagenDePagina(bytes, 4)).toEqual({ motivo: "el PDF tiene 1 página: la 4 no existe" });
    expect(await imagenDePagina(bytes, 1)).toEqual({ motivo: "la página 1 no tiene ninguna imagen" });
    expect(await imagenDePagina(new Uint8Array([1, 2, 3]), 1)).toEqual({ motivo: expect.stringContaining("no se pudo abrir el PDF") });
  });

  it("reducir PROMEDIA cada bloque: un trazo fino no desaparece", () => {
    // 4×1 en gris, un píxel negro entre blancos, reducido a 2×1 por la escala: saltando píxeles podría perderse.
    const datos = new Uint8ClampedArray(3200 * 2).fill(255);
    datos[1] = 0;
    const png = PNG.sync.read(aPng(datos, 3200, 2, 1));
    expect(png.width).toBe(LADO_MAXIMO_DE_PAGINA);
    expect(png.data[0]).toBeLessThan(255);
  });
});
