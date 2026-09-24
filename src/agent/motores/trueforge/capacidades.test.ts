import { describe, expect, it } from "vitest";
import type { Agente } from "../../../core/agentes.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { capacidadesDelEspecialista, SKILL_DE_OPENUI, toolsDe, type DependenciasDelEspecialista } from "./capacidades.js";
import { RAIZ_SKILLS } from "../../grafo/skills.js";
import { AGENTES_DE_SERIE } from "../../subagentes/agentesEnDisco.js";

const agente = (campos: Partial<Agente>): Agente =>
  ({ nombre: "x", descripcion: "d", motor: "modelo", soloLectura: false, skills: [], ...campos }) as Agente;

const deps = (): DependenciasDelEspecialista & { shells: number } => {
  const d = {
    shells: 0,
    backend: {} as never,
    propias: (a: Agente) => [{ name: "xone_navegacion" }, ...(a.soloLectura ? [] : [{ name: "regex_search" }])] as never,
    conShell: () => {
      d.shells += 1;
      return { execute: () => undefined, write: () => undefined };
    },
  };
  return d;
};

describe("qué piezas lleva cada especialista, por lo que declara su `.md`", () => {
  it("quien ESCRIBE: las seis de fichero, sus propias, la fecha — y ninguna shell", () => {
    const d = deps();
    const tools = toolsDe(capacidadesDelEspecialista(agente({ soloLectura: false }), "x", d));
    expect(tools).toEqual(expect.arrayContaining(["write_file", "edit_file", "read_file", "xone_navegacion", "get_current_datetime"]));
    expect(tools).not.toContain("execute");
    expect(d.shells).toBe(0);
  });

  it("quien EJECUTA: lectura + `execute`, sin escribir ficheros; la shell se monta SOLO para él", () => {
    const d = deps();
    const tools = toolsDe(capacidadesDelEspecialista(agente({ ejecucion: true }), "x", d));
    expect(tools).toContain("execute");
    expect(tools).not.toContain("write_file");
    expect(d.shells).toBe(1);
  });

  it("quien solo LEE: las seis (su permiso lo confina fuera del proyecto) y sin shell", () => {
    const tools = toolsDe(capacidadesDelEspecialista(agente({ soloLectura: true }), "x", deps()));
    expect(tools).toContain("write_file");
    expect(tools).not.toContain("execute");
  });

  it("un nombre que no es de nadie: lectura a secas, sin propias ni escritura ni shell", () => {
    const d = deps();
    const tools = toolsDe(capacidadesDelEspecialista(undefined, "inventado", d));
    expect(tools).toEqual(["ls", "read_file", "glob", "grep", "get_current_datetime"]);
    expect(d.shells).toBe(0);
  });
});

describe("OpenUI lo trae su skill, `openui-builder`", () => {
  it("lo lleva quien declara la skill; `artifacts-builder` a secas ya no basta", () => {
    const con = toolsDe(capacidadesDelEspecialista(agente({ skills: ["openui-builder"] }), "x", deps()));
    const soloHtml = toolsDe(capacidadesDelEspecialista(agente({ skills: ["artifacts-builder"] }), "x", deps()));
    expect(con).toContain("get_openui_instructions");
    expect(soloHtml).not.toContain("get_openui_instructions");
  });

  it("sus instrucciones se cargan BAJO DEMANDA y las reglas del harness van al lado", () => {
    const pieza = capacidadesDelEspecialista(agente({ skills: ["openui-builder"] }), "x", deps()).find((c) => c.nombre === "openui")!;
    const secciones: [string, string][] = [];
    for (const b of pieza.capability.instructionBuilders as ((b: unknown) => void)[]) {
      b({ addSection: (tag: string, contenido: string) => void secciones.push([tag, contenido]) });
    }
    expect(secciones.map(([t]) => t)).toEqual(["openui", "openui-en-xonecode"]);
    const nuestra = secciones[1]![1];
    expect(nuestra).toContain("/artefactos/<nombre>.openui");
    expect(nuestra).toContain("openui-builder");
    // El prompt grande de la librería NO viaja en el sistema: lo trae la tool.
    expect(secciones[0]![1]).toContain("get_openui_instructions");
    expect(secciones[0]![1].length).toBeLessThan(1000);
  });
});

describe("la skill que las reglas NOMBRAN existe, y dice lo que hace falta", () => {
  it("`openui-builder` está en el catálogo real, pide la tool y manda a `/artefactos/`", () => {
    // Un nombre muerto en un prompt manda al modelo a buscar algo que no está.
    const skill = readFileSync(join(RAIZ_SKILLS, SKILL_DE_OPENUI, "SKILL.md"), "utf8");
    expect(skill).toMatch(/^---\nname: openui-builder\n/);
    expect(skill).toContain("get_openui_instructions");
    expect(skill).toContain("/artefactos/<nombre>.openui");
    // Y dice qué hacer SIN la tool, que es el caso de un motor externo: no inventarse la sintaxis.
    expect(skill).toContain("no escribas OpenUI");
    // Y que el orquestador —que no la ve— no concluya que no existe: medido, eso le hacía
    // imponer HTML en el encargo.
    expect(skill).toContain("que tú no la veas no significa que no");
  });

  it("de serie la lleva quien lleva `artifacts-builder`: los que hacen artefactos", () => {
    const html = AGENTES_DE_SERIE.filter((a) => a.skills.includes("artifacts-builder")).map((a) => a.nombre);
    const openui = AGENTES_DE_SERIE.filter((a) => a.skills.includes(SKILL_DE_OPENUI)).map((a) => a.nombre);
    expect(openui.sort()).toEqual(html.sort());
  });
});
