import { describe, it, expect } from "vitest";
import { selloDeFecha } from "./selloDeFecha.js";

/** Un «ahora» fijo: el sello depende de en qué AÑO estamos, y un test no puede depender
 *  del reloj de la máquina que lo corre. */
const AHORA = new Date("2026-09-09T20:00:00.000Z");

/** El sello se pinta en la hora LOCAL de quien mira, así que las entradas se construyen en
 *  hora local: con un ISO a pelo, este test diría una hora distinta según el huso de la
 *  máquina que lo corre —verde aquí y rojo en un CI en UTC—. */
const local = (a: number, m: number, d: number, h: number, min: number) =>
  new Date(a, m - 1, d, h, min).toISOString();

describe("selloDeFecha", () => {
  it("del año en curso: día, mes y hora, sin año", () => {
    // El año se repetiría en todas las filas de una barra de 280 px sin distinguir ninguna.
    expect(selloDeFecha(local(2026, 9, 9, 8, 23), AHORA)).toBe("9 sept 08:23");
  });

  it("de otro año SÍ lleva el año: sin él, un «7 sept» de 2025 se lee como de anteayer", () => {
    expect(selloDeFecha(local(2025, 9, 7, 12, 8), AHORA)).toBe("7 sept 2025 12:08");
  });

  it("lo que no es una fecha no se pinta, en vez de un «Invalid Date»", () => {
    expect(selloDeFecha("mañana", AHORA)).toBeUndefined();
    expect(selloDeFecha("", AHORA)).toBeUndefined();
  });
});
