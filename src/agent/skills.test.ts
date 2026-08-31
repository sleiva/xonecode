import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { SkillsEnDisco, RAIZ_SKILLS, tokensDe } from "./skills.js";
import { esDoble } from "../core/ports.js";

describe("SkillsEnDisco", () => {
  it("NO lleva la marca de doble: son las skills de verdad", () => {
    expect(esDoble(new SkillsEnDisco())).toBe(false);
  });

  it("la raíz por omisión existe y es la de `lab/skills/`", () => {
    // Si esto falla, la ruta relativa se ha roto — y el síntoma sería un catálogo
    // vacío sin ningún error, que es el peor modo de fallo posible.
    expect(existsSync(RAIZ_SKILLS)).toBe(true);
    expect(RAIZ_SKILLS.endsWith("/skills")).toBe(true);
  });

  it("encuentra las seis skills de XOne", () => {
    const nombres = new SkillsEnDisco().catalogo().map((s) => s.nombre);
    expect(nombres).toContain("xone-development");
    expect(nombres).toContain("xone-review");
    expect(nombres.length).toBeGreaterThanOrEqual(6);
  });

  it("cada skill trae descripción y un coste en tokens distinto de cero", () => {
    for (const s of new SkillsEnDisco().catalogo()) {
      expect(s.descripcion.length, s.nombre).toBeGreaterThan(0);
      expect(s.tokens, s.nombre).toBeGreaterThan(0);
    }
  });

  it("cargar() devuelve el SKILL.md entero", () => {
    expect(new SkillsEnDisco().cargar("xone-development")).toContain("XOne");
  });

  it("una skill que no existe falla diciendo cuáles hay", () => {
    expect(() => new SkillsEnDisco().cargar("no-existe")).toThrow(/xone-development/);
  });

  it("una raíz inexistente da catálogo vacío, no una excepción", () => {
    expect(new SkillsEnDisco("/no/existe/nada").catalogo()).toEqual([]);
  });

  it("tokensDe estima por caracteres", () => {
    expect(tokensDe("abcd")).toBe(1);
    expect(tokensDe("")).toBe(0);
  });
});