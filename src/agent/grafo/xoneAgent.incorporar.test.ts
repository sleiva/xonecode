import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SubagenteExternoPort } from "../../core/ports.js";

/**
 * A QUIÉN se le monta `incorporar_adjunto` (IXCODE-7), mirado en lo que recibe `createDeepAgent`
 * —el molde de `xoneAgent.unir.test.ts`—: compuesto dentro de `construirAgente`, que todos los
 * tests doblan, el reparto quedaría escrito y sin probar. El grafo de VERDAD (que se para y
 * escribe) lo mira `xoneAgent.adjuntos.test.ts`; aquí, el reparto, que allí no se ve porque los
 * subagentes se compilan dentro del `task`.
 */
const capturado: { opciones?: Record<string, unknown> } = {};
vi.mock("deepagents", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return { ...real, createDeepAgent: (o: Record<string, unknown>) => ((capturado.opciones = o), { grafo: "de mentira" }) };
});
const { construirAgente } = await import("./xoneAgent.js");
const { SkillsEnMemoria, ModeloGuionizado } = await import("../../core/ports.js");
const { AGENTES_DE_SERIE } = await import("../subagentes/agentesEnDisco.js");
const { NOMBRE_INCORPORAR_ADJUNTO } = await import("../../core/adjuntos.js");

interface Montado {
  tools?: { name: string }[];
  interruptOn?: Record<string, unknown>;
  runnable?: unknown;
}

async function montados(opciones: { adjuntos?: string; externo?: boolean } = {}): Promise<Record<string, Montado>> {
  const raiz = mkdtempSync(join(tmpdir(), "incorporar-cableado-"));
  writeFileSync(join(raiz, "app.xml"), "<app/>\n");
  const subagenteExterno: SubagenteExternoPort = { disponible: async () => true, correr: async () => "" };
  await construirAgente({
    raiz,
    ficheros: new Set(["/app.xml"]),
    agentes: AGENTES_DE_SERIE.map((a) => (opciones.externo === true && a.nombre === "developer-xone" ? { ...a, motor: "claude-code" as const } : a)),
    modelos: new ModeloGuionizado(),
    skills: new SkillsEnMemoria(),
    subagenteExterno,
    ...(opciones.adjuntos === undefined ? {} : { adjuntos: opciones.adjuntos }),
  });
  const subagentes = (capturado.opciones?.["subagents"] ?? []) as (Montado & { name: string })[];
  return Object.fromEntries(subagentes.map((s) => [s.name, s]));
}
const conTool = (m: Record<string, Montado>) =>
  Object.entries(m)
    .filter(([, s]) => (s.tools ?? []).some((t) => t.name === NOMBRE_INCORPORAR_ADJUNTO))
    .map(([n]) => n)
    .sort();

describe("el montaje de incorporar_adjunto", () => {
  it("con carpeta de adjuntos: solo developer-xone (el diseñador está confinado a icons/), y con su fila de aprobación", async () => {
    const m = await montados({ adjuntos: mkdtempSync(join(tmpdir(), "incorporar-adjs-")) });
    expect(conTool(m)).toEqual(["developer-xone"]);
    // La tool y su aprobación van JUNTAS: quien la tiene, la tiene en su `interruptOn`.
    for (const n of conTool(m)) expect(Object.keys(m[n]!.interruptOn ?? {}), n).toContain(NOMBRE_INCORPORAR_ADJUNTO);
  });

  it("sin carpeta de adjuntos, nadie: no hay nada que incorporar", async () => {
    expect(conTool(await montados())).toEqual([]);
  });

  it("un developer de motor EXTERNO no la recibe: se monta sin tools propias (otro proceso)", async () => {
    const m = await montados({ adjuntos: mkdtempSync(join(tmpdir(), "incorporar-adjs-")), externo: true });
    expect(m["developer-xone"]?.runnable).toBeDefined();
    expect(m["developer-xone"]?.tools).toBeUndefined();
    expect(conTool(m)).toEqual([]);
  });
});
