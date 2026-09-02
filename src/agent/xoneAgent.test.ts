import { describe, it, expect } from "vitest";
import { DESCRIPCIONES_FICHEROS, promptDe, PROMPT_ORQUESTADOR, rutasDeSkills } from "./xoneAgent.js";
import { SkillsEnMemoria } from "../core/ports.js";

describe("PROMPT_ORQUESTADOR", () => {
  it("dice que NO tiene herramientas y que solo delega", () => {
    expect(PROMPT_ORQUESTADOR).toMatch(/NO tienes herramientas/);
    expect(PROMPT_ORQUESTADOR).toMatch(/delegar/);
  });

  it("pide paralelismo explícito para las tareas independientes", () => {
    expect(PROMPT_ORQUESTADOR).toMatch(/EN EL MISMO mensaje/);
  });

  it("reserva los diagramas de la app para mockup y el análisis real para planner", () => {
    expect(PROMPT_ORQUESTADOR).toMatch(/diagramas o esquemas.*`mockup`/s);
    expect(PROMPT_ORQUESTADOR).toMatch(/`planner` el análisis/s);
  });
});

describe("promptDe", () => {
  const conSkills = new SkillsEnMemoria({
    "xone-development": "…",
    "xone-debugging": "…",
    "xone-spec-builder": "…",
    "xone-plan-builder": "…",
    archify: "…",
    "artifacts-builder": "…",
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

  it("dirige explícitamente los diagramas y esquemas a archify", () => {
    const p = promptDe("planner", conSkills);
    expect(p).toMatch(/diagrama, esquema, arquitectura, flujo, secuencia, datos o estados/i);
    expect(p).toContain("`archify`");
    expect(p).toContain("usa solamente `archify`");
    expect(p).toContain("No cargues ni uses `artifacts-builder` como sustituto");
    expect(p).toContain("/artifacts/<nombre>.html");
  });

  it("describe en las tools de escritura el destino y la skill correctos", () => {
    expect(DESCRIPCIONES_FICHEROS.write_file).toContain("`archify`");
    expect(DESCRIPCIONES_FICHEROS.write_file).toContain("/artifacts/<nombre>.html");
    expect(DESCRIPCIONES_FICHEROS.edit_file).toContain("/MEMORIA_PROYECTO.md");
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

  it("expone cada skill disponible como una ruta que carga Deep Agents", () => {
    expect(rutasDeSkills("dev", conSkills)).toEqual([
      "/skills/xone-development/",
      "/skills/xone-debugging/",
      "/skills/archify/",
      "/skills/artifacts-builder/",
    ]);
  });
});
