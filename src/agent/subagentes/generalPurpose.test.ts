import { describe, it, expect } from "vitest";
import { createDeepAgent, FilesystemBackend } from "deepagents";
import { FakeListChatModel } from "@langchain/core/utils/testing";

/**
 * Saca la descripción de la tool `task` tal como la ve el modelo.
 * Se busca recorriendo el agente porque la librería no la expone por API.
 */
function descripcionDeTask(agente: unknown): string | undefined {
  const vistos = new Set<unknown>();
  let encontrada: string | undefined;
  const recorrer = (o: unknown, prof = 0): void => {
    if (encontrada || !o || prof > 8 || typeof o !== "object" || vistos.has(o)) return;
    vistos.add(o);
    const r = o as Record<string, unknown>;
    if (r.name === "task" && typeof r.description === "string") {
      encontrada = r.description;
      return;
    }
    for (const v of Object.values(r)) recorrer(v, prof + 1);
  };
  recorrer(agente);
  return encontrada;
}

describe("el pre-empt de general-purpose sigue vigente", () => {
  it("ocupar el nombre sustituye el catálogo, no lo duplica", async () => {
    const agente = await createDeepAgent({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model: new FakeListChatModel({ responses: ["ok"] }) as any,
      backend: new FilesystemBackend({ rootDir: ".", virtualMode: true }),
      subagents: [
        { name: "docs", description: "responde preguntas de XOne", systemPrompt: "x", tools: [] },
        {
          name: "general-purpose",
          description: "NO USAR. No tiene ninguna capacidad de XOne.",
          systemPrompt: "y",
          tools: [],
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const desc = descripcionDeTask(agente);
    expect(desc, "no se encontró la tool `task`").toBeDefined();

    // Lo que importa: el catálogo lo lista con NUESTRO texto...
    expect(desc).toContain("- general-purpose: NO USAR.");
    // ...y NO con el de la librería, que dice que tiene las mismas capacidades
    // que el agente principal.
    expect(desc).not.toContain("- general-purpose: General-purpose agent");
    expect(desc).toContain("- docs: responde preguntas de XOne");
  });
});