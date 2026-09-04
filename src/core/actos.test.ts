import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import type { Acto } from "./actos.js";

describe("core/actos", () => {
  it("no importa nada de cli/: el acto es de dominio, no de una piel", () => {
    const fuente = readFileSync(new URL("./actos.ts", import.meta.url), "utf8");
    expect(fuente).not.toMatch(/from ["']\.\.\/cli\//);
  });

  it("un acto de herramientas lleva LÍNEAS ya resumidas, nunca argumentos", () => {
    const acto: Acto = { tipo: "herramientas", lineas: ["read_file  src/app.xne"] };
    expect(acto.lineas[0]).not.toContain("{");
  });
});
