import { describe, it, expect } from "vitest";
import {
  esDoble,
  McpVacio,
  SkillsEnMemoria,
  ModeloGuionizado,
  StubVerifier,
  VerifierGuionizado,
  CatalogoModelosEnMemoria,
  type McpPort,
  type VerifierPort,
} from "./ports.js";

describe("la marca de doble", () => {
  it("todos los dobles la llevan", () => {
    expect(esDoble(new McpVacio())).toBe(true);
    expect(esDoble(new SkillsEnMemoria())).toBe(true);
    expect(esDoble(new ModeloGuionizado())).toBe(true);
    expect(esDoble(new StubVerifier())).toBe(true);
    expect(esDoble(new VerifierGuionizado([]))).toBe(true);
  });

  it("una implementación real NO la lleva, y no puede fingirla con un campo", () => {
    // Lo que hace que el mecanismo sea honesto: alguien que escriba un puerto real y le
    // ponga un campo `esStub: false` (o `true`) no cambia nada — la marca es un Symbol.
    const real: VerifierPort & { esStub?: boolean } = {
      esStub: false,
      async verificar() {
        return { verde: false, hallazgos: [] };
      },
    };
    expect(esDoble(real)).toBe(false);
  });

  it("no confunde null ni un primitivo con un puerto", () => {
    expect(esDoble(null)).toBe(false);
    expect(esDoble(undefined)).toBe(false);
    expect(esDoble("StubVerifier")).toBe(false);
    expect(esDoble(42)).toBe(false);
  });
});

describe("McpVacio", () => {
  it("publica un catálogo vacío en vez de fingir tools", async () => {
    const c = await new McpVacio().catalogo();
    expect(c.cloudstudio).toEqual([]);
    expect(c.ide).toEqual([]);
  });

  it("al invocar una tool falla diciendo que NO se ha tocado el proyecto", async () => {
    // Importa el TEXTO: un doble que falla con "not implemented" deja al modelo
    // interpretando si el cambio se aplicó o no.
    const mcp: McpPort = new McpVacio();
    await expect(mcp.invocar("studio_edit_file", {})).rejects.toThrow(/NO se ha tocado/);
    await expect(mcp.invocar("studio_edit_file", {})).rejects.toThrow(/studio_edit_file/);
  });
});

describe("CatalogoModelosEnMemoria", () => {
  it("el catálogo en memoria conserva proveedor, id y contexto", async () => {
    const catalogo = new CatalogoModelosEnMemoria({
      openai: [{ proveedor: "openai", id: "gpt-test", nombre: "GPT Test", contexto: 128000 }],
    });
    expect(esDoble(catalogo)).toBe(true);
    await expect(catalogo.listar("openai")).resolves.toEqual([
      { proveedor: "openai", id: "gpt-test", nombre: "GPT Test", contexto: 128000 },
    ]);
    await expect(catalogo.listar("ollama")).resolves.toEqual([]);
  });
});

describe("VerifierGuionizado", () => {
  it("recorre el guion y se queda en el último", async () => {
    const rojo = { verde: false, hallazgos: [] };
    const verde = { verde: true, hallazgos: [] };
    const v = new VerifierGuionizado([rojo, rojo, verde]);
    expect((await v.verificar()).verde).toBe(false);
    expect((await v.verificar()).verde).toBe(false);
    expect((await v.verificar()).verde).toBe(true);
    expect((await v.verificar()).verde).toBe(true);
  });
});
