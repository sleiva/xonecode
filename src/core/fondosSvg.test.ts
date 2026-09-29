import { describe, expect, it } from "vitest";
import { motivoDeSvgInaceptable } from "./iconos.js";
import {
  colorDeXoneASvg, generarFondo, medidaEnPixeles, motivoDeColorDeXoneInaceptable, motivoDeNombreDeFondoInaceptable, motivoDePeticionInaceptable, rutaDeFondo,
  TIPOS_DE_FONDO, type PeticionDeFondo,
} from "./fondosSvg.js";

const base = (c: Partial<PeticionDeFondo> = {}): PeticionDeFondo => ({
  tipo: "degradado-lineal",
  ancho: 972,
  alto: 103,
  colores: ["#8b5cf6", "#ec4899"],
  ...c,
});
const de = (tipo: PeticionDeFondo["tipo"]): PeticionDeFondo =>
  tipo === "sombra" ? base({ tipo, colores: ["#1e3a8a"] }) : tipo === "glow" ? base({ tipo, colores: ["#3b82f6"] }) : base({ tipo });

describe("fondos SVG: lo que sale es un SVG bueno", () => {
  it.each(TIPOS_DE_FONDO)("%s: pasa la misma criba que un icono y no lleva ningún filtro", (tipo) => {
    const { svg } = generarFondo(de(tipo));
    expect(motivoDeSvgInaceptable(svg)).toBeUndefined();
    // Los filtros se IGNORAN en XOne (medido): ni uno solo.
    expect(svg).not.toMatch(/<filter|filter=|feGaussianBlur|feDropShadow/);
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
  });

  it.each(TIPOS_DE_FONDO)("%s: cada url(#id) tiene su id", (tipo) => {
    const { svg } = generarFondo(de(tipo));
    for (const [, id] of svg.matchAll(/url\(#([^)]+)\)/g)) expect(svg).toContain(`id="${id}"`);
  });

  it("el viewBox lleva la proporción del control: alto 100 y ancho ancho/alto·100", () => {
    const { svg, anchoDelViewBox } = generarFondo(base({ ancho: 972, alto: 103 }));
    expect(anchoDelViewBox).toBeCloseTo(943.69, 1);
    expect(svg).toContain(`viewBox="0 0 ${anchoDelViewBox} 100"`);
    // Y solo cuenta la proporción: el doble de píxeles da el mismo SVG.
    expect(generarFondo(base({ ancho: 1944, alto: 206 })).svg).toBe(svg);
  });

  it("la esquina va DIBUJADA (el radio del control no recorta): rx en el rectángulo", () => {
    expect(generarFondo(base({ radio: 25 })).svg).toContain('rx="25"');
    expect(generarFondo(base({ radio: 50 })).svg).toContain('rx="50"');
    expect(generarFondo(base({ radio: 0 })).svg).not.toContain("rx=");
  });
});

describe("fondos SVG: cada tipo", () => {
  it("lineal: las paradas se reparten y el ángulo 0 va de izquierda a derecha", () => {
    const { svg, anchoDelViewBox: W } = generarFondo(base({ angulo: 0, colores: ["#ff0000", "#00ff00", "#0000ff"] }));
    expect(svg).toContain('offset="0%" stop-color="#ff0000"');
    expect(svg).toContain('offset="50%" stop-color="#00ff00"');
    expect(svg).toContain('offset="100%" stop-color="#0000ff"');
    const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map((a) => Number(new RegExp(`${a}="([^"]+)"`).exec(svg)![1]));
    expect(x1).toBeCloseTo(0, 1);
    expect(x2).toBeCloseTo(W, 1);
    expect(y1).toBeCloseTo(50, 1);
    expect(y2).toBeCloseTo(50, 1);
  });

  it("lineal: por omisión va de arriba abajo, de borde a borde", () => {
    const svg = generarFondo(base()).svg;
    const [y1, y2] = ["y1", "y2"].map((a) => Number(new RegExp(`${a}="([^"]+)"`).exec(svg)![1]));
    expect(y1).toBeCloseTo(0, 1);
    expect(y2).toBeCloseTo(100, 1);
  });

  it("radial: circular, con el radio al borde del lado más largo", () => {
    const { svg, anchoDelViewBox: W } = generarFondo(de("degradado-radial"));
    expect(svg).toContain(`r="${Number((W / 2).toFixed(2))}"`);
  });

  it("sombra: 7 capas translúcidas y la tarjeta encima, todo dentro de la caja", () => {
    const { svg, anchoDelViewBox: W } = generarFondo(de("sombra"));
    expect(svg.match(/fill-opacity=/g)).toHaveLength(7);
    expect(svg.trimEnd().endsWith('fill="#1e3a8a"/></svg>')).toBe(true);
    for (const [, x, y, w, h] of svg.matchAll(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)) {
      expect(Number(x)).toBeGreaterThanOrEqual(0);
      expect(Number(y)).toBeGreaterThanOrEqual(0);
      expect(Number(x) + Number(w)).toBeLessThanOrEqual(W + 0.01);
      expect(Number(y) + Number(h)).toBeLessThanOrEqual(100.01);
    }
  });

  it("sombra: la intensidad cambia la opacidad de las capas", () => {
    const op = (i: "suave" | "fuerte") => Number(/fill-opacity="([^"]+)"/.exec(generarFondo({ ...de("sombra"), intensidad: i }).svg)![1]);
    expect(op("fuerte")).toBeGreaterThan(op("suave"));
  });

  it("glow: acaba TRANSPARENTE, y el fondo es opcional", () => {
    const sin = generarFondo(de("glow")).svg;
    expect(sin).toMatch(/stop-opacity="0"/);
    expect(sin).not.toContain("<rect");
    expect(generarFondo({ ...de("glow"), fondo: "#111827" }).svg).toContain('fill="#111827"');
  });
});

describe("fondos SVG: lo que se rechaza", () => {
  it("colores que no son hexadecimales", () => {
    for (const c of ["red", "currentColor", "#12", "url(#x)"]) {
      expect(motivoDePeticionInaceptable(base({ colores: [c, "#000000"] })), c).toBeDefined();
    }
    expect(motivoDePeticionInaceptable({ ...de("glow"), fondo: "blue" })).toBeDefined();
  });

  it("el número de colores de cada tipo", () => {
    expect(motivoDePeticionInaceptable(base({ colores: ["#000000"] }))).toBeDefined();
    expect(motivoDePeticionInaceptable(base({ colores: ["#000", "#111", "#222", "#333", "#444"] }))).toBeDefined();
    expect(motivoDePeticionInaceptable({ ...de("sombra"), colores: ["#000", "#111"] })).toBeDefined();
  });

  it("una proporción que no cabe, y medidas absurdas", () => {
    expect(motivoDePeticionInaceptable(base({ ancho: 10, alto: 100 }))).toMatch(/proporción/);
    expect(motivoDePeticionInaceptable(base({ ancho: 100000, alto: 100 }))).toMatch(/proporción/);
    expect(motivoDePeticionInaceptable(base({ ancho: 0 }))).toBeDefined();
    expect(motivoDePeticionInaceptable(base({ radio: 80 }))).toMatch(/radio/);
  });

  it("generar lanza si no es válida: quien llama comprueba antes", () => {
    expect(() => generarFondo(base({ colores: ["red", "blue"] }))).toThrow();
  });

  it("el nombre es un slug y el fichero cae en icons/ con el prefijo bg_", () => {
    expect(motivoDeNombreDeFondoInaceptable("menu_inicio")).toBeUndefined();
    for (const mal of ["Menu", "a/b", "../x", "1a", "a.svg", "a b", ""]) expect(motivoDeNombreDeFondoInaceptable(mal), mal).toBeDefined();
    expect(rutaDeFondo("menu_inicio")).toBe("/icons/bg_menu_inicio.svg");
  });
});

describe("fondos SVG: los colores de XOne se convierten a SVG", () => {
  /**
   * XOne pone el alfa PRIMERO (`#AARRGGBB`, como Android: `fillcolor: "#7F00FF00"` es un verde
   * semitransparente) y HTML/SVG lo ponen al FINAL (`#RRGGBBAA`). Sin convertir, ese verde se leería
   * como rojo 7F, azul FF y alfa 0: transparente y del color equivocado, sin ningún error.
   */
  it("#AARRGGBB de XOne → #RRGGBB + opacidad, con el alfa del PRIMER byte", () => {
    expect(colorDeXoneASvg("#7F00FF00")).toEqual({ hex: "#00FF00", opacidad: 0.5 });
    expect(colorDeXoneASvg("#FF2196F3")).toEqual({ hex: "#2196F3", opacidad: 1 });
    expect(colorDeXoneASvg("#00000000")).toEqual({ hex: "#000000", opacidad: 0 });
    // Y NO como lo leería HTML: el último byte no es el alfa.
    expect(colorDeXoneASvg("#7F00FF00").hex).not.toBe("#7F00FF");
  });

  it("#RRGGBB y #RGB pasan opacos", () => {
    expect(colorDeXoneASvg("#8b5cf6")).toEqual({ hex: "#8b5cf6", opacidad: 1 });
    expect(colorDeXoneASvg("#fa0")).toEqual({ hex: "#ffaa00", opacidad: 1 });
  });

  it("el degradado lleva el alfa en stop-opacity y ni un #RRGGBBAA", () => {
    // #FFFF0000 = alfa FF, rojo. #0000FF00 = alfa 00, VERDE (no azul: el alfa es el primer byte).
    const { svg } = generarFondo(base({ colores: ["#FFFF0000", "#0000FF00"] }));
    expect(svg).toContain('offset="0%" stop-color="#FF0000"/>');
    expect(svg).toContain('offset="100%" stop-color="#00FF00" stop-opacity="0"/>');
    expect(svg).not.toMatch(/stop-color="#[0-9a-fA-F]{8}"/);
  });

  it("la tarjeta de la sombra y el fondo del glow llevan fill-opacity si traen alfa", () => {
    expect(generarFondo({ ...de("sombra"), colores: ["#801E3A8A"] }).svg).toMatch(/fill="#1E3A8A" fill-opacity="0\.5"/);
    expect(generarFondo({ ...de("glow"), fondo: "#80111827" }).svg).toMatch(/fill="#111827" fill-opacity="0\.5"/);
  });

  it("el alfa del color multiplica el del glow, que acaba siempre transparente", () => {
    const { svg } = generarFondo({ ...de("glow"), colores: ["#80FF0000"] });
    expect(svg).toContain('stop-color="#FF0000" stop-opacity="0.45"');
    expect(svg).toContain('stop-opacity="0"');
  });

  it("un color que no es de XOne se rechaza con el motivo", () => {
    for (const mal of ["red", "currentColor", "#12", "#12345", "#1234567", "rgba(0,0,0,.5)"]) {
      expect(motivoDeColorDeXoneInaceptable(mal), mal).toBeDefined();
    }
    expect(motivoDePeticionInaceptable(base({ colores: ["#7F00FF00", "#000000"] }))).toBeUndefined();
  });
});

describe("fondos SVG: las medidas se dan como en el XML de XOne", () => {
  /** Medido en el árbol de controles: `90%` × `90p` salieron 972×103 en un aparato de 1080 px. */
  it("90% y 90p dan lo medido: 972 y ~103 píxeles", () => {
    const ancho = medidaEnPixeles("90%", "ancho") as { px: number };
    const alto = medidaEnPixeles("90p", "alto") as { px: number };
    expect(ancho.px).toBeCloseTo(972, 0);
    expect(alto.px).toBeCloseTo(103, 0);
  });

  it("acepta px, un número y la coma decimal, y % solo en el ancho", () => {
    expect(medidaEnPixeles("120px", "alto")).toEqual({ px: 120 });
    expect(medidaEnPixeles(120, "alto")).toEqual({ px: 120 });
    expect(medidaEnPixeles("60,5", "alto")).toEqual({ px: 60.5 });
    expect(medidaEnPixeles("100%", "alto")).toHaveProperty("motivo");
  });

  it("rechaza lo que no es una medida", () => {
    for (const mal of ["", "abc", "90 %%", "-5p", "0p", "p90", "10em"]) expect(medidaEnPixeles(mal, "ancho"), mal).toHaveProperty("motivo");
    expect(medidaEnPixeles(-3, "ancho")).toHaveProperty("motivo");
  });

  it("el SVG lleva preserveAspectRatio=none explícito", () => {
    expect(generarFondo(base()).svg).toContain('preserveAspectRatio="none"');
  });
});
