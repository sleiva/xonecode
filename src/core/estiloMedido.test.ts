import { describe, expect, it } from "vitest";
import type { ImagenRgba } from "./compararCapturas.js";
import { formaDe, letraDe, medirControl } from "./estiloMedido.js";

/** Un lienzo RGBA de un color, y lo que se pinta encima. */
function lienzo(ancho: number, alto: number, fondo: [number, number, number]): ImagenRgba & { pintar: (dentro: (x: number, y: number) => boolean, c: [number, number, number]) => void } {
  const datos = new Uint8Array(ancho * alto * 4);
  for (let i = 0; i < ancho * alto; i += 1) datos.set([...fondo, 255], i * 4);
  return {
    ancho,
    alto,
    datos,
    pintar: (dentro, c) => {
      for (let y = 0; y < alto; y += 1) for (let x = 0; x < ancho; x += 1) if (dentro(x, y)) datos.set([...c, 255], (y * ancho + x) * 4);
    },
  };
}
const OSCURO: [number, number, number] = [16, 18, 22];
const TECLA: [number, number, number] = [50, 54, 62];
const BLANCO: [number, number, number] = [248, 250, 252];

describe("medirControl", () => {
  it("un CÍRCULO con su texto en medio: forma, fondo, color del texto y sin recorte", () => {
    const img = lienzo(200, 200, OSCURO);
    img.pintar((x, y) => (x - 100) ** 2 + (y - 100) ** 2 <= 60 ** 2, TECLA);
    img.pintar((x, y) => x >= 92 && x <= 108 && y >= 85 && y <= 115, BLANCO);
    const m = medirControl(img, { x: 30, y: 30, ancho: 140, alto: 140 });
    expect(m).toMatchObject({ forma: "circulo", fondo: "#32363E", colorTexto: "#F8FAFC", alineacion: "centro", borde: false });
    expect(m.proporcion).toBeCloseTo(1, 1);
  });

  it("un rectángulo REDONDEADO más ancho que alto no es una píldora ni un círculo", () => {
    const img = lienzo(200, 200, OSCURO);
    const r = 14;
    img.pintar((x, y) => {
      if (x < 40 || x > 160 || y < 50 || y > 150) return false;
      const cx = Math.min(Math.max(x, 40 + r), 160 - r);
      const cy = Math.min(Math.max(y, 50 + r), 150 - r);
      return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    }, TECLA);
    expect(medirControl(img, { x: 30, y: 40, ancho: 140, alto: 120 }).forma).toBe("redondeada");
  });

  it("una ETIQUETA cuyo texto llega al borde de su caja sale RECORTADA; con aire, no", () => {
    const img = lienzo(300, 100, OSCURO);
    img.pintar((x, y) => x >= 100 && x <= 200 && y >= 30 && y <= 80, BLANCO);
    expect(medirControl(img, { x: 50, y: 20, ancho: 200, alto: 40 }).recortado).toBe(true);
    expect(medirControl(img, { x: 50, y: 20, ancho: 200, alto: 70 }).recortado).toBe(false);
  });

  it("una caja con un CONTORNO fino es borde, y el contorno no cuenta como texto recortado", () => {
    const img = lienzo(300, 100, OSCURO);
    img.pintar((x, y) => (x === 20 || x === 279 || y === 10 || y === 89) && x >= 20 && x <= 279 && y >= 10 && y <= 89, [80, 90, 100]);
    img.pintar((x, y) => x >= 200 && x <= 260 && y >= 30 && y <= 70, BLANCO);
    const m = medirControl(img, { x: 20, y: 10, ancho: 260, alto: 80 });
    expect(m).toMatchObject({ borde: true, recortado: false, alineacion: "derecha" });
  });
});

describe("las categorías salen de las cifras", () => {
  it("forma", () => {
    expect(formaDe(0.05, 2)).toBe("recta");
    expect(formaDe(0.25, 1)).toBe("redondeada");
    expect(formaDe(0.5, 1)).toBe("circulo");
    expect(formaDe(0.48, 1.2)).toBe("redondeada");
    expect(formaDe(0.48, 1.56)).toBe("pildora");
  });
  it("letra, en fracción del ancho de la pantalla", () => {
    expect([letraDe(0.02), letraDe(0.04), letraDe(0.054), letraDe(0.09)]).toEqual(["pequena", "normal", "grande", "enorme"]);
  });
});
