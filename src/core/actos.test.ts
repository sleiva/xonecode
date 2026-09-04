import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import type { Acto } from "./actos.js";
import { conLineaDeTool } from "./actos.js";

describe("core/actos", () => {
  it("no importa nada de cli/: el acto es de dominio, no de una piel", () => {
    const fuente = readFileSync(new URL("./actos.ts", import.meta.url), "utf8");
    expect(fuente).not.toMatch(/from ["']\.\.\/cli\//);
  });

  it("un acto de herramientas lleva LÍNEAS ya resumidas, nunca argumentos", () => {
    const acto: Acto = { tipo: "herramientas", lineas: ["read_file  src/app.xne"] };
    expect(acto.lineas[0]).not.toContain("{");
  });

  describe("conLineaDeTool", () => {
    it("una línea que no es cierre de racha se añade detrás", () => {
      expect(conLineaDeTool(["→ lee /a"], "✱ busca x")).toEqual(["→ lee /a", "✱ busca x"]);
    });

    it("el cierre de racha SUSTITUYE a la apertura de la misma racha, no se añade", () => {
      // Lo que el colapsador del motor (core/notify.ts) emite de verdad: apertura al
      // empezar la racha, cierre con el ×N al terminarla — dos líneas porque stdio solo
      // añade. Una piel que repinta (TUI, web) se queda solo con el cierre.
      expect(conLineaDeTool(["→ lee /a"], "→ lee ×3 — /a, /b, /c")).toEqual(["→ lee ×3 — /a, /b, /c"]);
    });

    it("un cierre que no corresponde a la última apertura se añade, no sustituye", () => {
      expect(conLineaDeTool(["✱ busca x"], "→ lee ×3 — /a, /b, /c")).toEqual([
        "✱ busca x",
        "→ lee ×3 — /a, /b, /c",
      ]);
    });
  });
});
