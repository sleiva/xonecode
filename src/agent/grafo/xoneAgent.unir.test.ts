import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Agente } from "../../core/agentes.js";

/**
 * A QUIÉN se le monta `unir_secciones`, mirado en lo que recibe `createDeepAgent`: escribe sin
 * aprobación, así que solo a quien declara `escribeEn`. Compuesto dentro de `construirAgente`
 * —que todos los tests doblan—, el reparto quedaría escrito y sin probar.
 */
const capturado: { opciones?: Record<string, unknown> } = {};
vi.mock("deepagents", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return { ...real, createDeepAgent: (o: Record<string, unknown>) => ((capturado.opciones = o), { grafo: "de mentira" }) };
});
const { construirAgente } = await import("./xoneAgent.js");
const { SkillsEnMemoria, ModeloGuionizado, SubagenteExternoGuionizado } = await import("../../core/ports.js");

const agente = (extra: Partial<Agente>): Agente => ({
  nombre: "uno", descripcion: "hace cosas", motor: "modelo", soloLectura: false, skills: [], instrucciones: "", origen: "global", ...extra,
});

async function toolsDe(agentes: Agente[]): Promise<Record<string, string[]>> {
  const raiz = mkdtempSync(join(tmpdir(), "unir-cableado-"));
  writeFileSync(join(raiz, "app.xml"), "<app/>\n");
  await construirAgente({
    raiz, ficheros: new Set(["/app.xml"]), agentes, modelos: new ModeloGuionizado(), skills: new SkillsEnMemoria(), subagenteExterno: new SubagenteExternoGuionizado(),
  });
  const subagentes = (capturado.opciones?.["subagents"] ?? []) as { name: string; tools?: { name: string }[] }[];
  return Object.fromEntries(subagentes.map((s) => [s.name, (s.tools ?? []).map((t) => t.name)]));
}

describe("el montaje de unir_secciones", () => {
  it("lo recibe quien declara `escribeEn`, y quien no, no", async () => {
    const tools = await toolsDe([agente({ nombre: "document-writer", escribeEn: ["/doc/"] }), agente({ nombre: "developer-xone" })]);
    expect(tools["document-writer"]).toContain("unir_secciones");
    expect(tools["developer-xone"]).not.toContain("unir_secciones");
  });
});
