import { describe, expect, it } from "vitest";
import { anuncioDeSkills } from "./skillsTrueforge.js";

const CATALOGO = [
  { nombre: "xone-development", descripcion: "cómo se programa en XOne", tokens: 1 },
  { nombre: "xone-hotswap", descripcion: "desplegar en un aparato", tokens: 1 },
  { nombre: "archify", descripcion: "diagramas", tokens: 1 },
];

describe("las skills de un agente de TrueForge", () => {
  it("anuncia SOLO las de su .md, con descripción y ruta", () => {
    const t = anuncioDeSkills({ skills: ["xone-hotswap"] }, CATALOGO);
    expect(t).toMatch(/xone-hotswap: desplegar en un aparato — \/skills\/xone-hotswap\/SKILL\.md/);
    expect(t).not.toMatch(/xone-development|archify/);
  });

  it("una que no está en el catálogo no se anuncia, y sin ninguna no hay sección", () => {
    expect(anuncioDeSkills({ skills: ["no-existe"] }, CATALOGO)).toBe("");
    expect(anuncioDeSkills({ skills: [] }, CATALOGO)).toBe("");
  });
});
