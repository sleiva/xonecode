import { describe, expect, it } from "vitest";
import type { Acto } from "../tipos.js";
import { lineasDeSalida, problemasDe } from "./PanelDeSalida.js";

describe("la salida de la sesión", () => {
  it("una línea por suceso, sin la conversación del asistente ni el razonamiento", () => {
    const actos: Acto[] = [
      { tipo: "usuario", texto: "haz   la\nlista" },
      { tipo: "razonamiento", texto: "pienso" },
      { tipo: "herramientas", lineas: ["leyó Lista.xne", "editó Lista.xne"] },
      { tipo: "asistente", texto: "hecho" },
      { tipo: "sistema", texto: "cuidado", clase: "aviso" },
      { tipo: "fin", ms: 2500, modelo: "m" },
    ];
    expect(lineasDeSalida(actos)).toEqual([
      { origen: "tú", texto: "haz la lista" },
      { origen: "tool", texto: "leyó Lista.xne" },
      { origen: "tool", texto: "editó Lista.xne" },
      { origen: "aviso", texto: "cuidado" },
      { origen: "fin", texto: "turno en 2.5 s · m" },
    ]);
  });

  it("Problemas: sin verificación es «no consta», no cero; con varias, la última", () => {
    expect(problemasDe([{ tipo: "usuario", texto: "x" }])).toBeUndefined();
    const h = { code: "A", severidad: "error" as const, mensaje: "m" };
    expect(problemasDe([{ tipo: "verificacion", verde: false, errores: 1, avisos: 0, hallazgos: [h] }, { tipo: "verificacion", verde: true, errores: 0, avisos: 0 }])).toEqual([]);
  });
});
