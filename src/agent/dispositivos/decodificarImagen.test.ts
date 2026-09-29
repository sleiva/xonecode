import { describe, expect, it } from "vitest";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { decodificarImagen, MAX_LADO } from "./decodificarImagen.js";

function png(ancho: number, alto: number, rgb: [number, number, number]): Buffer {
  const p = new PNG({ width: ancho, height: alto });
  for (let i = 0; i < ancho * alto; i++) {
    p.data[i * 4] = rgb[0]; p.data[i * 4 + 1] = rgb[1]; p.data[i * 4 + 2] = rgb[2]; p.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(p);
}

describe("decodificarImagen", () => {
  it("un PNG da sus dimensiones y sus píxeles", () => {
    const i = decodificarImagen(png(20, 10, [10, 20, 30]));
    expect([i.ancho, i.alto]).toEqual([20, 10]);
    expect([i.datos[0], i.datos[1], i.datos[2]]).toEqual([10, 20, 30]);
  });

  it("un JPEG también", () => {
    const datos = new Uint8Array(16 * 16 * 4).fill(200);
    const i = decodificarImagen(Buffer.from(jpeg.encode({ width: 16, height: 16, data: datos }, 90).data));
    expect([i.ancho, i.alto]).toEqual([16, 16]);
    expect(Math.abs(i.datos[0]! - 200)).toBeLessThan(8);
  });

  it("lo que no es una imagen se rechaza con un motivo", () => {
    expect(() => decodificarImagen(Buffer.from("hola mundo, no soy una imagen"))).toThrow(/ni un JPEG/);
    expect(() => decodificarImagen(Buffer.alloc(0))).toThrow();
  });

  /**
   * La bomba: unos cientos de bytes que DECLARAN un lado enorme. Se rechaza mirando la cabecera,
   * sin decodificar nada, y por eso el test no reserva memoria.
   */
  it("un PNG que declara un tamaño enorme se rechaza ANTES de decodificar", () => {
    const b = png(8, 8, [0, 0, 0]);
    b.writeUInt32BE(60_000, 16);
    b.writeUInt32BE(60_000, 20);
    expect(() => decodificarImagen(b)).toThrow(/tope/);
    const c = png(8, 8, [0, 0, 0]);
    c.writeUInt32BE(MAX_LADO + 1, 16);
    expect(() => decodificarImagen(c)).toThrow(/tope/);
  });

  it("un PNG dañado no filtra el mensaje de la librería", () => {
    const b = png(8, 8, [1, 2, 3]);
    const roto = Buffer.concat([b.subarray(0, 40), Buffer.alloc(30, 7)]);
    expect(() => decodificarImagen(roto)).toThrow(/dañada/);
  });
});
