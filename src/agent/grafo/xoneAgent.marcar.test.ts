import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A QUIÉN se le monta `marcar_criterios_del_plan`, mirado en lo que recibe `createDeepAgent`
 * (el molde de `xoneAgent.incorporar.test.ts`): compuesto dentro de `construirAgente`, que todos
 * los tests doblan, el reparto quedaría escrito y sin probar.
 */
const capturado: { opciones?: Record<string, unknown> } = {};
vi.mock("deepagents", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return { ...real, createDeepAgent: (o: Record<string, unknown>) => ((capturado.opciones = o), { grafo: "de mentira" }) };
});
const { construirAgente } = await import("./xoneAgent.js");
const { SkillsEnMemoria, ModeloGuionizado } = await import("../../core/ports.js");
const { AGENTES_DE_SERIE } = await import("../subagentes/agentesEnDisco.js");
const { NOMBRE_MARCAR_CRITERIOS } = await import("./marcarCriteriosDelPlan.js");

describe("el montaje de marcar_criterios_del_plan en deepagents", () => {
  it("quien trabaja las tareas la tiene (el que ejecuta, el desarrollador y el diseñador); ni el orquestador ni quien solo lee", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "marcar-cableado-"));
    writeFileSync(join(raiz, "app.xml"), "<app/>\n");
    await construirAgente({
      raiz,
      ficheros: new Set(["/app.xml"]),
      agentes: AGENTES_DE_SERIE,
      modelos: new ModeloGuionizado(),
      skills: new SkillsEnMemoria(),
      subagenteExterno: { disponible: async () => true, correr: async () => "" },
    });
    const subagentes = (capturado.opciones?.["subagents"] ?? []) as { name: string; tools?: { name: string }[] }[];
    const conTool = subagentes.filter((s) => (s.tools ?? []).some((t) => t.name === NOMBRE_MARCAR_CRITERIOS)).map((s) => s.name);
    expect([...conTool].sort()).toEqual(["designer-xone", "developer-xone", "device-controller"]);
    const delRaiz = (capturado.opciones?.["tools"] ?? []) as { name: string }[];
    expect(delRaiz.map((t) => t.name)).not.toContain(NOMBRE_MARCAR_CRITERIOS);
  });
});
