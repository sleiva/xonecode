import { describe, it, expect } from "vitest";
import { parsear, resolver, ModeloMalEscrito, POR_OMISION } from "./modelos.js";

describe("parsear", () => {
  it("separa proveedor y modelo", () => {
    expect(parsear("ollama/kimi-k3:cloud")).toEqual({ proveedor: "ollama", modelo: "kimi-k3:cloud" });
  });

  it("reconoce Ollama Cloud como proveedor separado", () => {
    expect(parsear("ollama-cloud/glm-4.6")).toEqual({
      proveedor: "ollama-cloud",
      modelo: "glm-4.6",
    });
  });

  it("parte por la PRIMERA barra: un id de modelo puede llevar barras", () => {
    expect(parsear("ollama/library/qwen3:8b")).toEqual({
      proveedor: "ollama",
      modelo: "library/qwen3:8b",
    });
  });

  it("rechaza un proveedor desconocido, y lo dice con la lista", () => {
    // Un proveedor mal escrito no falla al parsear si no se valida: falla mucho
    // después, al construir el cliente, con un error que no menciona la bandera.
    expect(() => parsear("olama/x")).toThrow(ModeloMalEscrito);
    expect(() => parsear("olama/x")).toThrow(/gemini, openai, anthropic, ollama/);
  });

  it("rechaza las formas sin las dos partes", () => {
    for (const malo of ["ollama", "ollama/", "/modelo", ""]) {
      expect(() => parsear(malo), malo).toThrow(ModeloMalEscrito);
    }
  });
});

describe("resolver", () => {
  it("sin nada, cada papel usa su omisión y lo declara", () => {
    const r = resolver();
    expect(r.rapido).toEqual({ ...POR_OMISION.rapido, origen: "omision" });
    expect(r.afilado.modelo).toBe(POR_OMISION.afilado.modelo);
    expect(r.trabajo.origen).toBe("omision");
  });

  it("`--modelo` fija los TRES papeles", () => {
    const r = resolver({ bandera: "anthropic/claude-sonnet-4-5-20250929" });
    for (const papel of ["rapido", "trabajo", "afilado"] as const) {
      expect(r[papel].proveedor).toBe("anthropic");
      expect(r[papel].origen).toBe("bandera");
    }
  });

  it("lo específico gana a lo general", () => {
    const r = resolver({ bandera: "ollama/glm-5.3-flash:cloud", porPapel: { afilado: "anthropic/opus" } });
    expect(r.rapido.proveedor).toBe("ollama");
    expect(r.afilado).toEqual({ proveedor: "anthropic", modelo: "opus", origen: "bandera" });
  });

  it("el entorno se usa si no hay bandera, y se declara como tal", () => {
    const r = resolver({ entorno: { XONECODE_MODELO: "gemini/gemini-3.6-flash" } });
    expect(r.trabajo).toEqual({ proveedor: "gemini", modelo: "gemini-3.6-flash", origen: "entorno" });
  });

  it("la bandera gana al entorno", () => {
    const r = resolver({ bandera: "ollama/x", entorno: { XONECODE_MODELO: "gemini/y" } });
    expect(r.trabajo.proveedor).toBe("ollama");
    expect(r.trabajo.origen).toBe("bandera");
  });

  it("porPapel gana al config.json del proyecto", () => {
    const r = resolver({
      porPapel: { afilado: "anthropic/opus" },
      proyecto: { modelos: { afilado: "ollama/local" } },
    });
    expect(r.afilado).toEqual({ proveedor: "anthropic", modelo: "opus", origen: "bandera" });
    expect(r.afilado.origen).toBe("bandera");
  });

  it("el entorno gana al config.json del proyecto", () => {
    const r = resolver({
      entorno: { XONECODE_MODELO: "gemini/gemini-3.6-flash" },
      proyecto: { modelos: { trabajo: "anthropic/claude" } },
    });
    expect(r.trabajo).toEqual({ proveedor: "gemini", modelo: "gemini-3.6-flash", origen: "entorno" });
  });

  it("proyecto.modelos.<papel> se usa si no hay clí ni entorno", () => {
    const r = resolver({ proyecto: { modelos: { rapido: "openai/gpt-x" } } });
    expect(r.rapido).toEqual({ proveedor: "openai", modelo: "gpt-x", origen: "proyecto" });
    expect(r.trabajo.origen).toBe("omision");
  });

  it("proyecto.modelo (general) se usa cuando no hay modelos.<papel> en proyecto", () => {
    const r = resolver({ proyecto: { modelo: "anthropic/claude-sonnet-4-5-20250929" } });
    expect(r.rapido).toEqual({
      proveedor: "anthropic",
      modelo: "claude-sonnet-4-5-20250929",
      origen: "proyecto",
    });
  });

  it("proyecto.modelo (general) GANA a global.modelos.<papel> (específico de otro fichero)", () => {
    // El rango del FICHERO (proyecto > global) pesa más que la especificidad dentro
    // de un fichero: especificidad solo compite dentro del mismo fichero.
    const r = resolver({
      proyecto: { modelo: "anthropic/claude-sonnet-4-5-20250929" },
      global: { modelos: { afilado: "ollama/kimi-k3:cloud" } },
    });
    expect(r.afilado).toEqual({
      proveedor: "anthropic",
      modelo: "claude-sonnet-4-5-20250929",
      origen: "proyecto",
    });
  });

  it("global.modelos.<papel> se usa cuando no hay nada de proyecto", () => {
    const r = resolver({ global: { modelos: { afilado: "ollama/kimi-k3:cloud" } } });
    expect(r.afilado).toEqual({ proveedor: "ollama", modelo: "kimi-k3:cloud", origen: "global" });
    expect(r.rapido.origen).toBe("omision");
  });

  it("global.modelo (general) se usa cuando no hay nada más", () => {
    const r = resolver({ global: { modelo: "gemini/gemini-3.6-flash" } });
    expect(r.trabajo).toEqual({ proveedor: "gemini", modelo: "gemini-3.6-flash", origen: "global" });
  });
});
