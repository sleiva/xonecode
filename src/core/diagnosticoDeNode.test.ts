import { describe, expect, it } from "vitest";
import { motivoDeFallo, nombreDeSistema, todoBien, type DiagnosticoDeNode } from "./diagnosticoDeNode.js";

describe("diagnóstico de Node: las reglas puras", () => {
  it("el motivo de un fallo nunca lleva el mensaje de Node (lleva rutas): el code, el tope o el código de salida", () => {
    const enoent = Object.assign(new Error("spawn /Users/x/bin/node ENOENT"), { code: "ENOENT" });
    expect(motivoDeFallo(enoent)).toBe("no se encuentra el programa (ENOENT)");
    expect(motivoDeFallo(Object.assign(new Error("/ruta"), { code: "EACCES" }))).toBe("no se pudo lanzar (EACCES)");
    expect(motivoDeFallo(Object.assign(new Error("/ruta"), { killed: true }))).toBe("no contestó a tiempo");
    expect(motivoDeFallo(Object.assign(new Error("/ruta"), { code: 2 }))).toBe("salió con código 2");
    expect(motivoDeFallo(new Error("/Users/x"))).toBe("falló al lanzarlo");
  });

  it("los sistemas con su nombre de persona", () => {
    expect(nombreDeSistema("win32")).toBe("Windows");
    expect(nombreDeSistema("darwin")).toBe("macOS");
    expect(nombreDeSistema("freebsd")).toBe("freebsd");
  });

  it("todo bien solo si funcionan las cuatro líneas que el agente necesita", () => {
    const d: DiagnosticoDeNode = {
      cuando: "x",
      servidor: { version: "v22", plataforma: "win32", arquitectura: "x64" },
      nodeEnPath: { ok: true },
      scripts: { ok: true, cuantos: 9 },
      simulador: { ok: true },
      claudeCode: { ok: true },
    };
    expect(todoBien(d)).toBe(true);
    expect(todoBien({ ...d, simulador: { ok: false, motivo: "m" } })).toBe(false);
  });
});
