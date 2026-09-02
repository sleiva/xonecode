import { afterEach, describe, expect, it, vi } from "vitest";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Modelos } from "./modelos.js";

type HerramientaGeminiLigada = {
  config: {
    tools: Array<{
      functionDeclarations: Array<{
        parameters: { properties: { glob: { type: unknown; nullable?: boolean } } };
      }>;
    }>;
  };
};

describe("esquemas de herramientas para Gemini", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("convierte el argumento nullable de grep a un Schema que Gemini acepta", () => {
    vi.stubEnv("GOOGLE_API_KEY", "prueba");
    const grep = tool(async () => "", {
      name: "grep",
      description: "Busca texto en ficheros",
      schema: z.object({
        pattern: z.string(),
        path: z.string().optional().default("/"),
        glob: z.string().optional().nullable().default(null),
      }),
    });
    const modelo = new Modelos({ bandera: "gemini/gemini-flash-latest" }).paraPapel("rapido") as {
      bindTools(herramientas: unknown[]): HerramientaGeminiLigada;
    };
    const ligado = modelo.bindTools([grep]);

    const glob = ligado.config.tools[0]!.functionDeclarations[0]!.parameters.properties.glob;
    expect(glob.type).toBe("string");
    expect(glob.nullable).toBe(true);
  });
});
