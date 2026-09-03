import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crearDiagnosticoDeTools, NOMBRE_TRAZA_TOOLS, rutaTrazaDeTools, VARIABLE_TRAZA_TOOLS } from "./diagnosticoDeTools.js";
import { createTokenTracker } from "../vendor/tokenTracking.js";

describe("diagnóstico de tools", () => {
  it("solo se activa de forma explícita", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-traza-"));
    expect(crearDiagnosticoDeTools(raiz, {})).toBeUndefined();
    expect(rutaTrazaDeTools(raiz)).toBe(join(raiz, ".xonecode", NOMBRE_TRAZA_TOOLS));
  });

  it("registra coste y detalle seguro, nunca argumentos completos", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-traza-"));
    const log = crearDiagnosticoDeTools(raiz, { [VARIABLE_TRAZA_TOOLS]: "1" });
    const tracker = createTokenTracker();
    tracker.input = 120;
    tracker.output = 8;
    tracker.calls = 2;
    log!.modelo("planner", { input: 80, output: 6, cache: 40, llamadas: 2, contexto: 80 });
    log!.herramienta("grep", "function MTLogin", { pattern: "function MTLogin", path: "/", max_count: 10 }, tracker);

    const lineas = readFileSync(rutaTrazaDeTools(raiz), "utf8").trim().split("\n").map((linea) => JSON.parse(linea)) as Array<Record<string, unknown>>;
    expect(lineas.map((l) => l.tipo)).toEqual(["sesion", "modelo", "tool"]);
    expect(lineas[1]).toMatchObject({ origen: "planner", input: 80, cache: 40 });
    expect(lineas[2]).toMatchObject({
      nombre: "grep",
      detalle: "function MTLogin",
      parametros: { pattern: "function MTLogin", path: "/", max_count: 10 },
      inputAcumulado: 120,
    });
    expect(JSON.stringify(lineas)).not.toContain("contenido");
  });
});
