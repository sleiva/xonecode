import { describe, expect, it } from "vitest";
import { leerDiagnosticoDeNode } from "./diagnosticoDeNodeDelCable.js";

const BUENO = {
  cuando: "2026-10-16T08:00:00.000Z",
  servidor: { version: "v22", plataforma: "win32", arquitectura: "x64" },
  nodeEnPath: { ok: true, valor: "22.1.0" },
  scripts: { ok: false, cuantos: 0, motivo: "no se detecta ningún script en las skills" },
  simulador: { ok: true, valor: "xone-linter 1.5.0" },
  claudeCode: { ok: true, valor: "2.1.301" },
};

describe("leerDiagnosticoDeNode: lista blanca del cable", () => {
  it("copia lo que tiene la forma, campo a campo, y nada más", () => {
    expect(leerDiagnosticoDeNode({ ...BUENO, ruta: "/Users/x", nodeEnPath: { ...BUENO.nodeEnPath, extra: 1 } })).toEqual(BUENO);
  });

  it("lo que no tiene la forma no se pinta", () => {
    expect(leerDiagnosticoDeNode(undefined)).toBeUndefined();
    expect(leerDiagnosticoDeNode({ ...BUENO, simulador: { valor: "x" } })).toBeUndefined();
    expect(leerDiagnosticoDeNode({ ...BUENO, scripts: { ok: true, cuantos: -1 } })).toBeUndefined();
    expect(leerDiagnosticoDeNode({ ...BUENO, servidor: { version: "v22" } })).toBeUndefined();
  });
});
