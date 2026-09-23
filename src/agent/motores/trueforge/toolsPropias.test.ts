import { describe, expect, it } from "vitest";
import { crearNavegacionXone } from "../../grafo/navegacionXone.js";
import { fuenteDeLangchain, type ToolDeLangchain } from "./toolsPropias.js";

type Respuesta = { result: { content: { text: string }[]; isError?: boolean } };

describe("las tools propias de xonecode, adaptadas a TrueForge", () => {
  const navegacion = crearNavegacionXone(async () => {
    throw new Error("sin índice");
  }, new Set()) as unknown as ToolDeLangchain;

  it("el esquema es el de la tool de LangChain, en JSON Schema", async () => {
    const { result } = await fuenteDeLangchain([navegacion]).listTools();
    const t = result.tools[0]!;
    expect(t.name).toBe("xone_navegacion");
    expect((t.inputSchema as { properties?: Record<string, unknown> }).properties).toHaveProperty("operacion");
  });

  it("la llamada es su `invoke`: la MISMA respuesta que en deepagents, callejón incluido", async () => {
    const r = (await fuenteDeLangchain([navegacion]).callTool({ name: "xone_navegacion", arguments: { operacion: "inventario" } })) as unknown as Respuesta;
    expect(r.result.isError).toBeFalsy();
    expect(r.result.content[0]!.text).toMatch(/No se pudo leer la estructura del proyecto/);
  });

  it("un argumento que no pasa el esquema se le DEVUELVE al modelo, no tumba el turno", async () => {
    const r = (await fuenteDeLangchain([navegacion]).callTool({ name: "xone_navegacion", arguments: { operacion: "inventada" } })) as unknown as Respuesta;
    expect(r.result.isError).toBe(true);
  });
});
