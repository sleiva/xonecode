import { describe, expect, it } from "vitest";
import {
  compararPantallas, informeDeCambio, informeDeComparacion, medirCambio, medirPantalla, FRANJAS_DE_COLUMNAS, FRANJAS_DE_FILAS,
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

  /**
   * El fallo real: teclas grandes que ocupan MÁS superficie que el fondo. El color más frecuente de toda
   * la imagen sería el de las teclas; el fondo, en cambio, se ve en los márgenes laterales.
   */
  it("detecta el fondo aunque las teclas ocupen más superficie que él", () => {
    const grandes: Caja[] = [];
    for (let f = 0; f < 4; f++) grandes.push({ x0: 0.06, x1: 0.94, y0: 0.3 + f * 0.17, y1: 0.3 + f * 0.17 + 0.16, color: GRIS });
    const m = medirPantalla(pantalla(400, 800, grandes, [16, 16, 20]));
    expect(m.fondo).toEqual([16, 16, 20]);
    // Y por eso la barra de arriba, vacía, NO cuenta como contenido.
    expect(m.filas[0]).toBeLessThan(0.05);
    expect(m.filas[1]).toBeLessThan(0.05);
  });

  it("cae al color más frecuente si el contenido va a sangre y el borde no es fiable", () => {
    const aSangre: Caja[] = [{ x0: 0, x1: 1, y0: 0, y1: 1, color: GRIS }, { x0: 0, x1: 0.02, y0: 0, y1: 0.4, color: [200, 30, 30] }];
    expect(medirPantalla(pantalla(400, 800, aSangre, [16, 16, 20])).fondo).toEqual([60, 60, 68]);
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

describe("medirCambio: ¿cambió esta zona?", () => {
  const base = () => pantalla(400, 800, teclado(0.4, 0.95));
  const conNumero = (): ImagenRgba => {
    const cajas: Caja[] = [...teclado(0.4, 0.95), { x0: 0.6, x1: 0.9, y0: 0.1, y1: 0.16, color: [230, 230, 235] }];
    return pantalla(400, 800, cajas);
  };
  const DISPLAY = { x: 0, y: 0.05, ancho: 1, alto: 0.25 };

  it("una zona donde aparece un número CAMBIÓ, y dice dónde", () => {
    const c = medirCambio(base(), conNumero(), DISPLAY);
    expect(c.veredicto).toBe("cambio");
    expect(c.cajaDelCambio!.x).toBeGreaterThan(0.55);
    expect(c.cajaDelCambio!.y).toBeLessThan(0.2);
  });

  it("la misma zona sin diferencias es IGUAL, y el informe da las dos explicaciones", () => {
    const c = medirCambio(base(), base(), DISPLAY);
    expect(c.veredicto).toBe("igual");
    const texto = informeDeCambio(c).join("\n");
    expect(texto).toMatch(/no repinta/);
    expect(texto).toMatch(/antes del repintado/);
    expect(texto).toMatch(/cacheada/);
  });

  /** Lo que un `md5` no puede decir: la imagen ENTERA cambió, pero no la zona que importaba. */
  it("un cambio FUERA de la zona no cuenta: es lo que un md5 distinto no distingue", () => {
    const fuera = pantalla(400, 800, [...teclado(0.4, 0.95), { x0: 0.1, x1: 0.5, y0: 0.7, y1: 0.8, color: [230, 60, 60] }]);
    expect(medirCambio(base(), fuera, DISPLAY).veredicto).toBe("igual");
    expect(medirCambio(base(), fuera).veredicto).toBe("cambio");
  });

  it("un parpadeo minúsculo no llega al umbral", () => {
    const cursor = pantalla(400, 800, [...teclado(0.4, 0.95), { x0: 0.5, x1: 0.503, y0: 0.1, y1: 0.12, color: [0, 220, 240] }]);
    expect(medirCambio(base(), cursor, DISPLAY).veredicto).toBe("igual");
  });

  it("tamaños distintos y zonas absurdas se rechazan con su motivo", () => {
    expect(() => medirCambio(base(), pantalla(200, 400, []))).toThrow(/mismo tamaño/);
    for (const mala of [{ x: -0.1, y: 0, ancho: 1, alto: 1 }, { x: 0, y: 0, ancho: 0, alto: 1 }, { x: 0.5, y: 0, ancho: 0.8, alto: 1 }, { x: NaN, y: 0, ancho: 1, alto: 1 }]) {
      expect(() => medirCambio(base(), base(), mala)).toThrow(/fracciones/);
    }
  });
});
