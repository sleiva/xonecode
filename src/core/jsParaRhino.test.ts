import { describe, expect, it } from "vitest";
import { comprobarJs } from "./jsParaRhino.js";

/**
 * La matriz MEDIDA ejecutando en el emulador (Rhino 1.7.12-1.7.13, `runScript` del hotswap): lo que
 * el motor lee y lo que rechaza. Un caso fuera de aquí es una suposición, no una medida.
 */
const LEE = [
  "var a = function (x) { return x + 1; };",
  "var f = (x) => x * 2; var g = x => { return x; };",
  "let a = 1; const b = 2;",
  "var [x, y] = arr; var {a, b} = o;",
  "for (var v of lista) {}",
  "var o = { m() { return 1; }, get g() { return 2; }, set s(v) {} };",
  "var s = Symbol('a'); var it = o[Symbol.iterator];",
];
const RECHAZA: [string, RegExp][] = [
  ["var s = `a${b}`;", /template literal/],
  ["function f(a = 1) {}", /valor por defecto/],
  ["function f(...r) {}", /rest/],
  ["g(...a);", /spread/],
  ["function* g() {}", /generador/],
  ["class A {}", /class/],
  ["var o = {a};", /abreviada/],
  ["var o = {[k]: v};", /clave calculada/],
  ["async function f() {}", /más nueva/],
  ["var x = 2 ** 3;", /más nueva/],
  ["function f(a, b,) {}", /más nueva/],
  ["var x = o?.a;", /más nueva/],
  ["var x = a ?? b;", /más nueva/],
  ["var x = 1n;", /más nueva/],
  ["var {a = 1} = o;", /valor por defecto/],
  ["var [a, ...r] = arr;", /rest/],
  ["if (len('a') = 0) {}", /error de sintaxis/],
];

describe("comprobarJs", () => {
  it.each(LEE)("Rhino lo lee: %s", (codigo) => {
    expect(comprobarJs(codigo)).toEqual({ ok: true });
  });

  it.each(RECHAZA)("Rhino lo rechaza: %s", (codigo, motivo) => {
    const r = comprobarJs(codigo);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(motivo);
  });

  it("dice dónde, con la línea y la columna desde 1", () => {
    expect(comprobarJs("var a = 1;\nvar s = `x`;\n")).toMatchObject({ ok: false, linea: 2, columna: 9 });
    expect(comprobarJs("var a = ;")).toMatchObject({ ok: false, linea: 1 });
  });
});
