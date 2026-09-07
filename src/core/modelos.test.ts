import { describe, it, expect } from "vitest";
import {
  parsear, resolver, ModeloMalEscrito, POR_OMISION,
  COMPATIBLES_OPENAI, compatibleConOpenAi, PROVEEDORES, SIN_CREDENCIAL, VARIABLES_POR_PROVEEDOR,
} from "./modelos.js";

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

describe("los proveedores compatibles con OpenAI", () => {
  it("son proveedores de verdad: se parsean y llevan barras en el id del modelo", () => {
    // NVIDIA nombra los suyos `publicador/modelo`, así que el corte por la PRIMERA barra
    // (el mismo que sostiene `library/qwen3:8b` de Ollama) es lo que hace que esto valga.
    expect(parsear("nvidia/meta/llama-3.3-70b-instruct")).toEqual({
      proveedor: "nvidia",
      modelo: "meta/llama-3.3-70b-instruct",
    });
    expect(parsear("groq/llama-3.3-70b-versatile").proveedor).toBe("groq");
    expect(parsear("xai/grok-4").proveedor).toBe("xai");
  });

  it("cada uno tiene URL base y variable, y `compatibleConOpenAi` no reconoce a los demás", () => {
    for (const [proveedor, fila] of Object.entries(COMPATIBLES_OPENAI)) {
      expect(PROVEEDORES).toContain(proveedor);
      expect(fila.baseUrl.startsWith("https://")).toBe(true);
      expect(compatibleConOpenAi(proveedor as never)).toEqual(fila);
    }
    // `openai` encaja en la forma y NO está en la tabla a propósito: su listado filtra por
    // las familias de ids de OpenAI, que en los otros tres no significan nada.
    expect(compatibleConOpenAi("openai")).toBeUndefined();
    expect(compatibleConOpenAi("ollama")).toBeUndefined();
  });
});

describe("la tabla de variables de entorno", () => {
  /**
   * Esta es la que impide que vuelvan las cuatro copias. Ya habían divergido una vez: la de
   * `cli/config.ts` no tenía `OLLAMA_API_KEY`, así que `/config` decía «sin credencial» de
   * un proveedor que la tenía puesta.
   */
  it("nombra exactamente a los proveedores que necesitan credencial", () => {
    const conVariable = PROVEEDORES.filter((p) => VARIABLES_POR_PROVEEDOR[p] !== undefined);
    const necesitanClave = PROVEEDORES.filter((p) => !SIN_CREDENCIAL.has(p));
    expect([...conVariable].sort()).toEqual([...necesitanClave].sort());
  });

  it("la variable de un compatible es la misma que declara su fila", () => {
    for (const [proveedor, fila] of Object.entries(COMPATIBLES_OPENAI)) {
      expect(VARIABLES_POR_PROVEEDOR[proveedor as never]).toBe(fila.variable);
    }
  });

  it("ninguna variable se repite entre dos proveedores", () => {
    const variables = PROVEEDORES.flatMap((p) => {
      const variable = VARIABLES_POR_PROVEEDOR[p];
      return variable === undefined ? [] : [variable];
    });
    expect(new Set(variables).size).toBe(variables.length);
  });
});
