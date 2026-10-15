import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { carpetasDeLecturaDeSkills, carpetaDelPluginDeSkills } from "./pluginDeSkills.js";

describe("carpetasDeLecturaDeSkills", () => {
  it("de cada skill montada, su enlace en el plugin Y su carpeta real", () => {
    const casa = "/casa-de-prueba/.xonecode";
    const carpetas = carpetasDeLecturaDeSkills({ casa });
    // Las de serie del paquete existen siempre: xone-development entre ellas.
    const i = carpetas.indexOf(join(carpetaDelPluginDeSkills(casa), "skills", "xone-development"));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(carpetas[i + 1]).toMatch(/skills[\\/]xone-development$/);
    expect(carpetas.length % 2).toBe(0);
  });
});
