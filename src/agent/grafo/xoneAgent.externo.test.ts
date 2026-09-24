import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Agente } from "../../core/agentes.js";
import type { PeticionExterna, SubagenteExternoPort } from "../../core/ports.js";

/**
 * El hijo EXTERNO de deepagents, invocado por su `runnable` de verdad —el que monta
 * `construirAgente` y recibe `createDeepAgent`—, no por un doble del grafo.
 *
 * Existe por un fallo de saneamiento: un motor que no arranca lanza con la ruta de la máquina en el
 * mensaje («spawn /Users/…/codex ENOENT»), y lanzado, el `ToolNode` de LangChain lo devolvía CRUDO al
 * modelo. Ahora se devuelve como la respuesta del hijo, pasado por `textoDeFalloExterno`: la misma
 * regla que TrueForge (`motores/trueforge/modeloExterno.ts`), que delega en el mismo puerto.
 */
const capturado: { opciones?: Record<string, unknown> } = {};

vi.mock("deepagents", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return {
    ...real,
    createDeepAgent: (opciones: Record<string, unknown>) => {
      capturado.opciones = opciones;
      return { grafo: "de mentira" };
    },
  };
});

const { construirAgente } = await import("./xoneAgent.js");
const { SkillsEnMemoria, ModeloGuionizado } = await import("../../core/ports.js");

const externo: Agente = {
  nombre: "revisor-codex",
  descripcion: "revisa con Codex",
  motor: "codex",
  soloLectura: true,
  skills: [],
  instrucciones: "revisa",
  origen: "global",
};

async function runnableCon(correr: (p: PeticionExterna) => Promise<string>) {
  const raiz = mkdtempSync(join(tmpdir(), "xoneagent-externo-"));
  writeFileSync(join(raiz, "app.xml"), "<app/>\n");
  const puerto: SubagenteExternoPort = { disponible: async () => true, correr };
  await construirAgente({
    raiz,
    ficheros: new Set(["/app.xml"]),
    agentes: [externo],
    modelos: new ModeloGuionizado(),
    skills: new SkillsEnMemoria(),
    subagenteExterno: puerto,
  });
  const hijo = ((capturado.opciones?.["subagents"] ?? []) as { name: string; runnable?: { invoke: (e: unknown, c?: unknown) => Promise<unknown> } }[]).find(
    (s) => s.name === "revisor-codex"
  );
  return hijo!.runnable!;
}

const textoDe = (salida: unknown): string =>
  String(((salida as { messages: { content: unknown }[] }).messages.at(-1) ?? { content: "" }).content);

describe("el hijo externo de deepagents", () => {
  it("contesta lo que devuelve el producto", async () => {
    const r = await runnableCon(async () => "todo bien");
    expect(textoDe(await r.invoke({ messages: [{ content: "revisa" }] }))).toBe("todo bien");
  });

  it("un motor que FALLA se devuelve como texto, SANEADO: ninguna ruta de la máquina", async () => {
    const r = await runnableCon(async () => {
      throw new Error("no se pudo lanzar codex: spawn /Users/alguien/.local/bin/codex ENOENT");
    });
    const texto = textoDe(await r.invoke({ messages: [{ content: "revisa" }] }));
    expect(texto).toContain("no terminó su encargo");
    expect(texto).toContain("spawn <ruta> ENOENT");
    expect(texto).not.toContain("/Users/alguien");
  });

  it("con el turno CANCELADO se relanza: no hay respuesta que dar", async () => {
    const control = new AbortController();
    control.abort();
    const r = await runnableCon(async () => {
      throw new Error("matado");
    });
    await expect(r.invoke({ messages: [{ content: "revisa" }] }, { signal: control.signal })).rejects.toThrow();
  });
});
