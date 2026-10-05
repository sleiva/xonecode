import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compararConMaqueta, controlesDelArbol, type GeometriaDelAparato, type MaquetaMedida } from "./geometriaDePantalla.js";
import { htmlComoAparato, interpretarDescripcion, lineasDeEstilo, maquetaDeLaDescripcion, type MaquetaDescrita } from "./maquetaDescrita.js";

const geo = JSON.parse(readFileSync(new URL("./__oro__/geometria/calculadora.geometria.json", import.meta.url), "utf8"));
const html: MaquetaMedida = JSON.parse(readFileSync(new URL("./__oro__/geometria/calculadora.maqueta.json", import.meta.url), "utf8"));
const aparato: GeometriaDelAparato = { pantalla: geo.pantalla, barras: geo.barras, controles: controlesDelArbol(geo.arbol) };

/** Lo que un modelo describe de `screen.png` de la calculadora, mirándola SOLA (escrito a mano, como lo pide el prompt). */
const fila = (...textos: string[]) => textos.map((texto) => ({ texto, unidades: 1 }));
const descrita: MaquetaDescrita = {
  filas: [
    fila("[arrastrar]", "[historial]"),
    [{ texto: "0" }],
    fila("• DEG", "COPY", "Tape"),
    fila("(", ")", "√", "x²", "π", "±"),
    fila("AC", "±", "%", "÷"),
    fila("7", "8", "9", "×"),
    fila("4", "5", "6", "−"),
    fila("1", "2", "3", "+"),
    fila("0", ".", "[borrar]", "="),
  ],
  estilo: [{ texto: "=", forma: "pildora", relleno: "#FF7A59", letra: "grande" }],
};

describe("la maqueta DESCRITA contra el aparato medido (solo un PNG, sin code.html)", () => {
  const h = compararConMaqueta(maquetaDeLaDescripcion(descrita), aparato, { aproximada: true });

  it("encuentra lo que costó diez rondas: la «=» en otra fila y el «0» el doble de ancho", () => {
    expect(h.diferencias).toContain("En la maqueta «0», «.», «=» van en la MISMA fila; en el aparato «=» va en otra.");
    expect(h.diferencias).toContain("«0» mide 1,9 veces el ancho de las de su fila; en la maqueta, 1,0.");
  });

  it("y NUNCA es bloqueante: lo de la maqueta lo dijo un modelo, no se midió", () => {
    expect(h.bloqueantes).toEqual([]);
    // «√» es una imagen en el aparato: se dice con la duda, no se afirma que falte.
    expect(h.diferencias.find((d) => d.includes("«√»"))).toMatch(/puede ser una imagen/);
    expect(h.diferencias.join("\n")).not.toMatch(/PROPORCIÓN|«7»|«AC»/);
  });

  it("los datos de ejemplo de un visor no son «no lo encuentro»: solo una nota (descripción REAL de un modelo)", () => {
    const real: MaquetaDescrita = { ...descrita, filas: [[{ texto: "[historial]", unidades: 1 }, { texto: "1,240 × 15% + 450 = 636", unidades: 6 }, { texto: "ANS", unidades: 1 }], ...descrita.filas] };
    const hr = compararConMaqueta(maquetaDeLaDescripcion(real), aparato, { aproximada: true });
    expect(hr.diferencias.join("\n")).not.toMatch(/1,240|ANS/);
    expect(hr.notas.find((n) => n.includes("1,240"))).toMatch(/datos de ejemplo/);
    // «√» sí: su fila existe en el aparato.
    expect(hr.diferencias.join("\n")).toContain("«√»");
  });

  it("sin unidades no compara anchos", () => {
    const sin: MaquetaDescrita = { ...descrita, filas: descrita.filas.map((f) => f.map((c) => ({ texto: c.texto }))) };
    const hs = compararConMaqueta(maquetaDeLaDescripcion(sin), aparato, { aproximada: true });
    expect(hs.diferencias.join("\n")).not.toContain("veces el ancho");
    expect(hs.diferencias).toContain("En la maqueta «0», «.», «=» van en la MISMA fila; en el aparato «=» va en otra.");
  });
});

describe("la imagen de la maqueta contra su code.html", () => {
  const nombres = { maqueta: "la imagen de la maqueta", aparato: "su code.html" };

  it("si cuentan lo mismo, no dice nada", () => {
    const h = compararConMaqueta(maquetaDeLaDescripcion(descrita, false), htmlComoAparato(html), { aproximada: true, nombres });
    expect(h.diferencias.filter((d) => !d.includes("no lo encuentro"))).toEqual([]);
  });

  it("si no, lo dice con los dos nombres", () => {
    const otra: MaquetaDescrita = { ...descrita, filas: [...descrita.filas.slice(0, -2), fila("1", "2", "3", "+", "="), fila("0", ".", "[borrar]")] };
    const h = compararConMaqueta(maquetaDeLaDescripcion(otra, false), htmlComoAparato(html), { aproximada: true, nombres });
    expect(h.diferencias).toContain("En la imagen de la maqueta «1», «2», «3», «+», «=» van en la MISMA fila; en su code.html «=» va en otra.");
  });
});

describe("interpretarDescripcion", () => {
  it("tira lo que no está en el vocabulario y no inventa unidades", () => {
    const d = interpretarDescripcion({
      filas: [[{ texto: "AC", unidades: 1 }, { texto: "=", unidades: 99 }, { texto: "" }, "suelto"], "no es fila", []],
      estilo: [
        { texto: "AC", forma: "pildora", relleno: "#ff7a59", letra: "grande" },
        { texto: "=", forma: "hexagono", relleno: "naranja" },
      ],
    });
    expect(d).toEqual({ filas: [[{ texto: "AC", unidades: 1 }, { texto: "=" }]], estilo: [{ texto: "AC", forma: "pildora", relleno: "#FF7A59", letra: "grande" }] });
  });

  it("sin filas no hay descripción", () => {
    expect(interpretarDescripcion({ filas: [] })).toBeUndefined();
    expect(interpretarDescripcion(undefined)).toBeUndefined();
  });

  it("el estilo se lee en castellano", () => {
    expect(lineasDeEstilo(descrita)).toEqual(["«=»: forma píldora, fondo #FF7A59, letra grande"]);
  });
});
