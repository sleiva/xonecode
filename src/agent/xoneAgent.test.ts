import { describe, it, expect } from "vitest";
import { promptDe, PROMPT_ORQUESTADOR } from "./xoneAgent.js";
import { SkillsEnMemoria } from "../core/ports.js";

describe("PROMPT_ORQUESTADOR", () => {
  it("dice que NO tiene herramientas y que solo delega", () => {
    expect(PROMPT_ORQUESTADOR).toMatch(/NO tienes herramientas/);
    expect(PROMPT_ORQUESTADOR).toMatch(/delegar/);
  });

  it("pide paralelismo explícito para las tareas independientes", () => {
    expect(PROMPT_ORQUESTADOR).toMatch(/EN EL MISMO mensaje/);
  });
});

describe("promptDe", () => {
  const conSkills = new SkillsEnMemoria({
    "xone-development": "…",
    "xone-debugging": "…",
    "xone-spec-builder": "…",
    "xone-plan-builder": "…",
  });

  it("un especialista de solo lectura lo dice", () => {
    expect(promptDe("docs", conSkills)).toContain("No modificas nada");
  });

  it("uno que escribe avisa de que sus cambios se aprueban", () => {
    expect(promptDe("dev", conSkills)).toMatch(/aprobación humana/);
  });

  it("usa la fachada de memoria para tareas de proyecto sin exponer .xonecode", () => {
    const p = promptDe("dev", conSkills);
    expect(p).toContain("/MEMORIA_PROYECTO.md");
    expect(p).not.toContain("/.xonecode/memoria.md");
  });

  it("lleva las reglas duras de XOne, no solo su papel", () => {
    const p = promptDe("dev", conSkills);
    expect(p).toMatch(/no existen DOM/);
    expect(p).toMatch(/\.xne/);
    expect(p).toMatch(/bug mudo/);
  });

  it("nombra las skills que SÍ tiene", () => {
    expect(promptDe("dev", conSkills)).toContain("xone-development");
  });

  it("y AVISA de las que le faltan en vez de callarlo", () => {
    // Patrón 4: un doble nunca se disfraza. Un especialista sin su skill responde
    // de memoria, y sin este aviso nadie sabría por qué empeoró.
    const sin = new SkillsEnMemoria({});
    const p = promptDe("dev", sin);
    expect(p).toMatch(/AVISO/);
    expect(p).toContain("xone-development");
  });

  it("sin skills que falten no mete ningún aviso de relleno", () => {
    expect(promptDe("docs", conSkills)).not.toMatch(/AVISO/);
  });
});
