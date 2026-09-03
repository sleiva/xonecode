import { afterEach, describe, expect, it, vi } from "vitest";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Modelos } from "./modelos.js";
import { crearBusquedaRegex } from "./busquedaRegex.js";

type HerramientaGeminiLigada = {
  config: {
    tools: Array<{
      functionDeclarations: Array<{
        parameters: { properties: { glob: { type: unknown; nullable?: boolean } } };
      }>;
    }>;
  };
};

function claves(objeto: unknown): string[] {
  if (Array.isArray(objeto)) return objeto.flatMap(claves);
  if (!objeto || typeof objeto !== "object") return [];
  return Object.entries(objeto).flatMap(([clave, valor]) => [clave, ...claves(valor)]);
}

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

  it("elimina restricciones JSON Schema que Gemini no admite, sin borrar argumentos", () => {
    vi.stubEnv("GOOGLE_API_KEY", "prueba");
    const regex = crearBusquedaRegex({} as never);
    const modelo = new Modelos({ bandera: "gemini/gemini-flash-latest" }).paraPapel("rapido") as {
      bindTools(herramientas: unknown[]): HerramientaGeminiLigada;
    };
    const ligado = modelo.bindTools([regex]);
    const parametros = ligado.config.tools[0]!.functionDeclarations[0]!.parameters as unknown as Record<string, unknown>;
    const propiedades = parametros.properties as Record<string, unknown>;

    // `pattern` sigue siendo el nombre de un parámetro; se retiran únicamente
    // las restricciones del schema que provocaban el HTTP 400 de Gemini.
    expect(propiedades).toHaveProperty("pattern");
    expect(claves(parametros)).not.toContain("exclusiveMinimum");
    expect(claves(parametros)).not.toContain("maximum");
    expect(claves(parametros)).not.toContain("minLength");
  });
});
