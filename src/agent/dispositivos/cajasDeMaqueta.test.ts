import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cajasDeMaqueta, medidaDelDom, medidasDeImagen, viewportDeMaqueta } from "./cajasDeMaqueta.js";

const html = (cuerpo = "<button>7</button>") => {
  const d = mkdtempSync(join(tmpdir(), "xc-maqueta-"));
  const ruta = join(d, "code.html");
  writeFileSync(ruta, `<html><head><script src="https://cdn.tailwindcss.com"></script></head><body>${cuerpo}</body></html>`);
  return ruta;
};
const dom = (medida: object) => `<html><body><pre id="__xonecode_cajas">${JSON.stringify(medida).replace(/"/g, "&quot;")}</pre></body></html>`;

describe("cajasDeMaqueta", () => {
  it("renderiza con Chrome sin ventana, SIN permiso de leer ficheros, y devuelve las cajas", async () => {
    let args: readonly string[] = [];
    const r = await cajasDeMaqueta(html(), 390, 746, {
      navegador: "/chrome",
      volcar: async (_n, a) => {
        args = a;
        return dom({ ancho: 390, alto: 746, tailwind: true, pideTailwind: true, elementos: [{ texto: "7", caja: { x: 24, y: 426, ancho: 77, alto: 64 } }] });
      },
    });
    expect(r).toEqual({ ancho: 390, alto: 746, elementos: [{ texto: "7", caja: { x: 24, y: 426, ancho: 77, alto: 64 } }] });
    expect(args).toContain("--headless=new");
    expect(args.join(" ")).not.toContain("allow-file-access");
  });

  it("si la maqueta pide Tailwind y no lo cargó (sin red), NO da cajas: serían de una página sin estilos", async () => {
    const r = await cajasDeMaqueta(html("<button>8</button>"), 390, 746, {
      navegador: "/chrome",
      volcar: async () => dom({ ancho: 390, alto: 746, tailwind: false, pideTailwind: true, elementos: [{ texto: "8", caja: { x: 0, y: 0, ancho: 10, alto: 10 } }] }),
    });
    expect(r).toEqual({ motivo: "la maqueta no cargó sus estilos (Tailwind, de un CDN): ¿hay red?" });
  });

  it("sin navegador o sin medida lo dice, nunca lanza", async () => {
    expect(await cajasDeMaqueta(html("<button>9</button>"), 390, 746, { navegador: "/chrome", volcar: async () => "<html></html>" })).toEqual({
      motivo: "el navegador no devolvió la medida de la maqueta",
    });
    expect(await cajasDeMaqueta("/no/existe/code.html", 390, 746)).toEqual({ motivo: "no pude leer el code.html de la maqueta" });
  });

  it("una maqueta exportada a 2x o 3x se mide a su tamaño en puntos", () => {
    expect(viewportDeMaqueta(390, 746)).toEqual({ ancho: 390, alto: 746 });
    expect(viewportDeMaqueta(780, 1492)).toEqual({ ancho: 390, alto: 746 });
    expect(viewportDeMaqueta(1170, 2532)).toEqual({ ancho: 390, alto: 844 });
  });

  it("las medidas de un PNG y de un JPEG salen de su cabecera", () => {
    const png = Buffer.alloc(24);
    png[0] = 0x89;
    png[1] = 0x50;
    png.writeUInt32BE(390, 16);
    png.writeUInt32BE(746, 20);
    expect(medidasDeImagen(png)).toEqual({ ancho: 390, alto: 746 });
    expect(medidaDelDom("sin nada")).toBeUndefined();
  });
});
