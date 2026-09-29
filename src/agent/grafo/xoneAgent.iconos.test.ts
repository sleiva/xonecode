import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SubagenteExternoPort } from "../../core/ports.js";

/**
 * A QUIÉN se le monta `buscar_icono` (IXCODE-18), mirado en lo que recibe `createDeepAgent` —el
 * molde de `xoneAgent.incorporar.test.ts`—: compuesto dentro de `construirAgente`, que todos los
 * tests doblan, el reparto quedaría escrito y sin probar.
 */
const capturado: { opciones?: Record<string, unknown> } = {};
vi.mock("deepagents", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return { ...real, createDeepAgent: (o: Record<string, unknown>) => ((capturado.opciones = o), { grafo: "de mentira" }) };
});
const { construirAgente } = await import("./xoneAgent.js");
const { SkillsEnMemoria, ModeloGuionizado, IconosEnMemoria } = await import("../../core/ports.js");
const { AGENTES_DE_SERIE } = await import("../subagentes/agentesEnDisco.js");
const { NOMBRE_BUSCAR_ICONO } = await import("./buscarIcono.js");

interface Montado {
  tools?: { name: string }[];
  interruptOn?: Record<string, unknown>;
  runnable?: unknown;
}

async function montados(opciones: { iconos?: boolean; externo?: boolean } = {}): Promise<Record<string, Montado>> {
  const raiz = mkdtempSync(join(tmpdir(), "iconos-cableado-"));
  writeFileSync(join(raiz, "app.xml"), "<app/>\n");
  const subagenteExterno: SubagenteExternoPort = { disponible: async () => true, correr: async () => "" };
  await construirAgente({
    raiz,
    ficheros: new Set(["/app.xml"]),
    agentes: AGENTES_DE_SERIE.map((a) => (opciones.externo === true && a.nombre === "developer-xone" ? { ...a, motor: "claude-code" as const } : a)),
    modelos: new ModeloGuionizado(),
    skills: new SkillsEnMemoria(),
    subagenteExterno,
    ...(opciones.iconos === true ? { iconos: new IconosEnMemoria(["lucide:home"]) } : {}),
  });
  const subagentes = (capturado.opciones?.["subagents"] ?? []) as (Montado & { name: string })[];
  return Object.fromEntries(subagentes.map((s) => [s.name, s]));
}
const conTool = (m: Record<string, Montado>) =>
  Object.entries(m)
    .filter(([, s]) => (s.tools ?? []).some((t) => t.name === NOMBRE_BUSCAR_ICONO))
    .map(([n]) => n)
    .sort();

describe("el montaje de buscar_icono", () => {
  it("con el puerto: exactamente designer-xone y developer-xone", async () => {
    expect(conTool(await montados({ iconos: true }))).toEqual(["designer-xone", "developer-xone"]);
  });

  it("es de LECTURA: no entra en la aprobación de nadie", async () => {
    const m = await montados({ iconos: true });
    for (const s of Object.values(m)) expect(Object.keys(s.interruptOn ?? {})).not.toContain(NOMBRE_BUSCAR_ICONO);
  });

  it("sin puerto, nadie: una tool que siempre dijera «no hay red» sería un botón muerto", async () => {
    expect(conTool(await montados())).toEqual([]);
  });

  it("un developer de motor EXTERNO no la recibe", async () => {
    expect(conTool(await montados({ iconos: true, externo: true }))).toEqual(["designer-xone"]);
  });
});
