import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const AQUI = dirname(fileURLToPath(import.meta.url));
const modulos = readdirSync(AQUI).filter((f) => f.endsWith(".module.css"));

describe("disciplina de estilos (heredada de deepseek)", () => {
  it("hay módulos que revisar", () => {
    expect(modulos.length).toBeGreaterThan(0);
  });

  it("ningún componente escribe un color literal: solo alias semánticos", () => {
    for (const m of modulos) {
      const css = readFileSync(join(AQUI, m), "utf8");
      expect(css, m).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css, m).not.toMatch(/\b(rgb|rgba|hsl|hsla)\s*\(/);
    }
  });

  it("ningún componente decide el tema: eso es del dueño del tema", () => {
    for (const m of modulos) {
      const css = readFileSync(join(AQUI, m), "utf8");
      expect(css, m).not.toMatch(/prefers-color-scheme/);
      expect(css, m).not.toMatch(/\[data-theme/);
    }
  });
});
