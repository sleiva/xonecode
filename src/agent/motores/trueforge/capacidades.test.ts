import { describe, expect, it } from "vitest";
import type { Agente } from "../../../core/agentes.js";
import { capacidadesDelEspecialista, toolsDe, type DependenciasDelEspecialista } from "./capacidades.js";

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

describe("OpenUI, para quien hace artefactos", () => {
  it("lo lleva quien tiene `artifacts-builder`, y quien no, no", () => {
    const con = toolsDe(capacidadesDelEspecialista(agente({ skills: ["artifacts-builder"] }), "x", deps()));
    const sin = toolsDe(capacidadesDelEspecialista(agente({ skills: ["xone-development"] }), "x", deps()));
    expect(con).toContain("get_openui_instructions");
    expect(sin).not.toContain("get_openui_instructions");
  });

  it("sus instrucciones se cargan BAJO DEMANDA y nuestras reglas van al lado", () => {
    const pieza = capacidadesDelEspecialista(agente({ skills: ["artifacts-builder"] }), "x", deps()).find((c) => c.nombre === "openui")!;
    const secciones: [string, string][] = [];
    for (const b of pieza.capability.instructionBuilders as ((b: unknown) => void)[]) {
      b({ addSection: (tag: string, contenido: string) => void secciones.push([tag, contenido]) });
    }
    // La de la librería (la que dice que llame a la tool) y la nuestra.
    expect(secciones.map(([t]) => t)).toEqual(["openui", "openui-en-xonecode"]);
    const nuestra = secciones[1]![1];
    expect(nuestra).toContain("/artefactos/<nombre>.openui");
    expect(nuestra).toContain("ÚLTIMA pestaña");
    // Y el prompt grande de la librería NO viaja en el sistema: lo trae la tool.
    expect(secciones[0]![1]).toContain("get_openui_instructions");
    expect(secciones[0]![1].length).toBeLessThan(1000);
  });
});
