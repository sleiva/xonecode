import { describe, it, expect } from "vitest";
import { createDeepAgent, FilesystemBackend } from "deepagents";
import { FakeListChatModel } from "@langchain/core/utils/testing";

async function formasDeChunk(subgraphs: boolean): Promise<number[]> {
  const agente = await createDeepAgent({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: new FakeListChatModel({ responses: ["hola que tal"] }) as any,
    backend: new FilesystemBackend({ rootDir: ".", virtualMode: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await (agente as any).stream(
    { messages: [{ role: "user", content: "di hola" }] },
    {
      configurable: { thread_id: `forma-${subgraphs}` },
      streamMode: ["updates", "messages"],
      subgraphs,
    }
  );

  const longitudes = new Set<number>();
  for await (const chunk of stream) {
    if (Array.isArray(chunk)) longitudes.add(chunk.length);
  }
  return [...longitudes].sort();
}

describe("la forma del chunk depende de `subgraphs`", () => {
  it("sin subgraphs el chunk es [modo, dato]", async () => {
    expect(await formasDeChunk(false)).toEqual([2]);
  });

  it("con subgraphs el chunk es [namespace, modo, dato]", async () => {
    // Si esto pasa a valer 2, la normalización de `agent/` sobra y hay que quitarla.
    // Si sigue valiendo 3, desestructurar como [modo, dato] deja la consola MUDA.
    expect(await formasDeChunk(true)).toEqual([3]);
  });
});