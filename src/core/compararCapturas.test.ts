import { describe, expect, it } from "vitest";
import {
  compararPantallas, informeDeComparacion, medirPantalla, FRANJAS_DE_COLUMNAS, FRANJAS_DE_FILAS,
  type ImagenRgba,
} from "./compararCapturas.js";

/** Una pantalla sintética: fondo oscuro liso y, encima, rectángulos claros dados en FRACCIONES. */
type Caja = { x0: number; y0: number; x1: number; y1: number; color?: [number, number, number] };
function pantalla(ancho: number, alto: number, cajas: Caja[], fondo: [number, number, number] = [16, 16, 20], ruido = 0): ImagenRgba {
  const datos = new Uint8Array(ancho * alto * 4);
  let semilla = 7;
  const azar = (): number => ((semilla = (semilla * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 2 * ruido;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const c = cajas.find((b) => x >= b.x0 * ancho && x < b.x1 * ancho && y >= b.y0 * alto && y < b.y1 * alto);
      const rgb = c?.color ?? fondo;
      const i = (y * ancho + x) * 4;
      datos[i] = Math.max(0, Math.min(255, rgb[0] + azar()));
      datos[i + 1] = Math.max(0, Math.min(255, rgb[1] + azar()));
      datos[i + 2] = Math.max(0, Math.min(255, rgb[2] + azar()));
      datos[i + 3] = 255;
    }
  }
  return { ancho, alto, datos };
}
const GRIS: [number, number, number] = [60, 62, 68];
/** Un teclado que llena la pantalla: filas de cuatro teclas de arriba abajo. */
const teclado = (desde: number, hasta: number): Caja[] => {
  const cajas: Caja[] = [];
  const filas = 5;
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < 4; c++) {
      const alto = (hasta - desde) / filas;
      cajas.push({ x0: 0.05 + c * 0.235, x1: 0.05 + c * 0.235 + 0.2, y0: desde + f * alto + alto * 0.1, y1: desde + (f + 1) * alto - alto * 0.1, color: GRIS });
    }
  }
  return cajas;
};

describe("medirPantalla", () => {
  it("detecta el fondo aunque tenga ruido de JPEG", () => {
    const m = medirPantalla(pantalla(200, 400, [], [12, 12, 16], 3));
    expect(Math.abs(m.fondo[0] - 12)).toBeLessThanOrEqual(4);
    expect(m.finDelContenido).toBe(0);
  });

  it("dice hasta dónde llega el contenido y da una ocupación por franja", () => {
    const m = medirPantalla(pantalla(200, 400, teclado(0.5, 0.95)));
    expect(m.filas).toHaveLength(FRANJAS_DE_FILAS);
    expect(m.columnas).toHaveLength(FRANJAS_DE_COLUMNAS);
    expect(m.inicioDelContenido).toBeGreaterThan(0.3);
    expect(m.finDelContenido).toBeGreaterThan(0.8);
    expect(m.filas[0]).toBe(0);
  });

  it("rechaza lo que no se puede medir, sin lanzar cosas raras", () => {
    expect(() => medirPantalla({ ancho: 2, alto: 2, datos: new Uint8Array(16) })).toThrow(/pequeña/);
    expect(() => medirPantalla({ ancho: 100, alto: 100, datos: new Uint8Array(10) })).toThrow(/incompleta/);
  });
});

describe("compararPantallas: lo que ocurrió con la calculadora", () => {
  const maqueta = () => pantalla(390, 746, teclado(0.28, 0.98));

  it("la misma estructura a OTRA resolución es parecida: se compara en porcentajes", () => {
    const c = compararPantallas(maqueta(), pantalla(1080, 2400, teclado(0.28, 0.98)));
    expect(c.veredicto).toBe("parecida");
    expect(c.hallazgos).toEqual([]);
  });

  it("un teclado que ocupa un tercio deja una banda vacía y se dice con números", () => {
    const corto = pantalla(1080, 2400, teclado(0.28, 0.55));
    const c = compararPantallas(maqueta(), corto);
    expect(c.veredicto).toBe("distinta");
    const texto = c.hallazgos.join("\n");
    expect(texto).toMatch(/banda vacía/);
    expect(texto).toMatch(/casi nada/);
  });

  it("«casi nada» solo cuando lo es: la mitad de ocupación se dice «bastante menos»", () => {
    const tenue = pantalla(390, 746, teclado(0.28, 0.98).map((b) => ({ ...b, x1: b.x0 + (b.x1 - b.x0) * 0.5 })));
    // Solo las franjas del ALTO: las de ancho sí quedan casi vacías, porque las teclas se estrechan.
    const deAlto = compararPantallas(maqueta(), tenue).hallazgos.filter((h) => /del alto/.test(h)).join("\n");
    expect(deAlto).toMatch(/bastante menos contenido/);
    expect(deAlto).not.toMatch(/casi nada/);
  });

  it("las diferencias horizontales también se señalan (todo pegado a la izquierda)", () => {
    const izquierda: Caja[] = teclado(0.28, 0.98).map((b) => ({ ...b, x0: b.x0 / 3, x1: b.x1 / 3 }));
    const c = compararPantallas(maqueta(), pantalla(390, 746, izquierda));
    expect(c.veredicto).toBe("distinta");
    expect(c.hallazgos.join("\n")).toMatch(/del ancho/);
  });

  it("es DETERMINISTA: las mismas imágenes dan el mismo informe", () => {
    const a = informeDeComparacion(compararPantallas(maqueta(), pantalla(1080, 2400, teclado(0.28, 0.55)))).join("\n");
    const b = informeDeComparacion(compararPantallas(maqueta(), pantalla(1080, 2400, teclado(0.28, 0.55)))).join("\n");
    expect(a).toBe(b);
  });

  it("el informe dice lo que NO mide, para que un «parecida» no se lea como «se ve bien»", () => {
    const informe = informeDeComparacion(compararPantallas(maqueta(), pantalla(390, 746, teclado(0.28, 0.98)))).join("\n");
    expect(informe).toMatch(/PARECIDA/);
    expect(informe).toMatch(/no ve texto cortado/);
    expect(informe).toMatch(/xone_critica_visual/);
  });
});
