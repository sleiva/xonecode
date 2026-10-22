import { describe, expect, it } from "vitest";
import { ampliarImagen } from "./ampliarImagen.js";
import type { ImagenRgba } from "./compararCapturas.js";

/** 2×1: un píxel negro y uno blanco. */
const dos: ImagenRgba = { ancho: 2, alto: 1, datos: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]) };

describe("ampliarImagen", () => {
  it("multiplica el tamaño por el factor y conserva los extremos", () => {
    const g = ampliarImagen(dos, 2);
    expect([g.ancho, g.alto]).toEqual([4, 2]);
    expect(Array.from(g.datos.slice(0, 4))).toEqual([0, 0, 0, 255]);
    expect(Array.from(g.datos.slice(12, 16))).toEqual([255, 255, 255, 255]);
  });

  it("interpola: entre negro y blanco salen grises, no escalones", () => {
    const g = ampliarImagen(dos, 4);
    const fila = Array.from({ length: g.ancho }, (_, x) => g.datos[x * 4]!);
    expect(fila[0]).toBe(0);
    expect(fila.at(-1)).toBe(255);
    expect(fila.some((v) => v > 0 && v < 255)).toBe(true);
    expect(fila.every((v, i) => i === 0 || v >= fila[i - 1]!)).toBe(true);
  });

  it("con factor 1 (o menos) devuelve la misma imagen", () => {
    expect(ampliarImagen(dos, 1)).toBe(dos);
    expect(ampliarImagen(dos, 0.4)).toBe(dos);
  });
});
