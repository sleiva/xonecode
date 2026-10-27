import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scriptsDeLasSkills } from "./proyecto.js";

const SKILLS = resolve(__dirname, "../../../skills");

/**
 * `xone-granja` sustituye a `xone-hotswap` en un proyecto con la granja (`core/granja.ts#skillsSegunOrigen`), y sus
 * scripts REENVÍAN a los de `xone-hotswap`, que son los que saben ir a la copia: una sola lógica.
 */
describe("la skill xone-granja", () => {
  it("sus scripts llevan los nombres de los de xone-hotswap, sin los que solo sirven a un aparato de este equipo", () => {
    const deGranja = readdirSync(join(SKILLS, "xone-granja", "scripts")).sort();
    const deHotswap = new Set(readdirSync(join(SKILLS, "xone-hotswap", "scripts")));
    expect(deGranja.every((n) => deHotswap.has(n))).toBe(true);
    expect(deGranja).toContain("xone-desplegar-android");
    expect(deGranja).toContain("xone-hotswap");
    // El emulador es de este equipo: con la granja no se levanta ninguno.
    expect(deGranja).not.toContain("xone-arrancar-android");
    // Y entran al PATH de quien la lleva, como los de cualquier skill.
    expect(scriptsDeLasSkills(SKILLS, ["xone-granja"]).sort()).toEqual(deGranja);
  });

  it("reenviar conserva argumentos, salida y código: el --help es el del script de xone-hotswap", () => {
    const original = spawnSync(process.execPath, [join(SKILLS, "xone-hotswap", "scripts", "xone-log-android"), "--help"], { encoding: "utf8" });
    const reenviado = spawnSync(process.execPath, [join(SKILLS, "xone-granja", "scripts", "xone-log-android"), "--help"], { encoding: "utf8" });
    expect(reenviado.status).toBe(original.status);
    expect(reenviado.stderr).toBe(original.stderr);
    expect(reenviado.stderr).toContain("xone-log-android");
  });

  it("el SKILL.md se presenta con su nombre", () => {
    const texto = readFileSync(join(SKILLS, "xone-granja", "SKILL.md"), "utf8").split("\n").slice(0, 3).join("\n");
    expect(texto).toContain("name: xone-granja");
  });
});
