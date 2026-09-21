import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Modelos } from "./modelos.js";

/**
 * La COSTURA con `@langchain/anthropic`, que es lo que este repo exige de un contrato ajeno:
 * las dos decisiones de `core/` (el tope de salida y el razonamiento adaptativo) solo valen
 * si llegan al payload que el cliente va a mandar, y eso no lo ve ningún test de la tabla.
 *
 * Se construye el `ChatAnthropic` de VERDAD y se lee su `invocationParams()`, que es el
 * método público con el que él mismo compone la petición. Sin red: construir un cliente y
 * preguntarle sus parámetros no llama a nadie.
 *
 * El día que la dependencia cambie de sitio el `max_tokens` o deje de omitir `thinking`
 * cuando no se fija (su línea 781 hoy), esto cae — que es el único aviso posible, porque el
 * otro camino es un 400 en producción o una respuesta cortada en silencio.
 */
describe("el cliente de Anthropic, contra su propio invocationParams", () => {
  const anterior = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    // Una clave de pega: el constructor la exige, y aquí no se llama a nadie.
    process.env.ANTHROPIC_API_KEY = "sk-ant-de-pega";
  });
  afterEach(() => {
    if (anterior === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = anterior;
  });

  /** Los parámetros con que el cliente compondría la petición de ese modelo. */
  const parametrosDe = (modelo: string): { max_tokens?: number; thinking?: unknown } => {
    const cliente = new Modelos({ bandera: `anthropic/${modelo}` }).paraPapel("trabajo");
    const conParams = cliente as { invocationParams: () => { max_tokens?: number; thinking?: unknown } };
    return conParams.invocationParams();
  };

  it("el tope de salida viaja en el payload, también para un id que la dependencia no conoce", () => {
    // `claude-sonnet-5` es el caso medido: su tabla por prefijo no lo tiene
    // (`claude-sonnet-4` no es prefijo de `claude-sonnet-5`), así que sin esto heredaba su
    // `FALLBACK_MAX_OUTPUT_TOKENS` de 4096 y cortaba las escrituras a media respuesta.
    expect(parametrosDe("claude-sonnet-5").max_tokens).toBe(16_384);
    expect(parametrosDe("claude-opus-5").max_tokens).toBe(16_384);
  });

  it("a la generación 4.6-4.8 se le PIDE el razonamiento adaptativo", () => {
    // Sin pedirlo, la dependencia omite `thinking` y esos modelos corren sin pensar.
    expect(parametrosDe("claude-opus-4-8").thinking).toEqual({ type: "adaptive" });
    expect(parametrosDe("claude-sonnet-4-6").thinking).toEqual({ type: "adaptive" });
  });

  it("y a los que NO lo aceptan no se les manda el campo: mandarlo sería un 400", () => {
    // Haiku 4.5 y lo anterior a 4.6 usan `{type:"enabled", budget_tokens:N}`. Y Opus 5 /
    // Sonnet 5 ya corren adaptativo por omisión, así que tampoco se les manda nada.
    expect(parametrosDe("claude-haiku-4-5").thinking).toBeUndefined();
    expect(parametrosDe("claude-3-5-sonnet").thinking).toBeUndefined();
    expect(parametrosDe("claude-opus-5").thinking).toBeUndefined();
    expect(parametrosDe("claude-sonnet-5").thinking).toBeUndefined();
  });
});

/**
 * La misma costura, para el ESFUERZO, y en los cuatro clientes.
 *
 * Aquí vale doble que en el caso del `max_tokens`: la tabla de `core/esfuerzo.ts` dice qué
 * niveles admite cada modelo, pero cada cliente tiene su propio nombre para el campo
 * —`outputConfig.effort`, `reasoningEffort`, `thinkingConfig.thinkingLevel`, `think`— y una
 * traducción mal escrita no da error de tipos: da un parámetro que el servidor ignora, o
 * un 400. Ningún test de la tabla puede verlo.
 *
 * Sin red: construir un cliente y preguntarle sus parámetros no llama a nadie.
 */
describe("el esfuerzo, contra el invocationParams de cada cliente", () => {
  const guardadas = { ...process.env };
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-de-pega";
    process.env.GOOGLE_API_KEY = "google-de-pega";
    process.env.DEEPSEEK_API_KEY = "deepseek-de-pega";
    process.env.NVIDIA_API_KEY = "nvidia-de-pega";
  });
  afterEach(() => {
    for (const v of ["ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "DEEPSEEK_API_KEY", "NVIDIA_API_KEY"]) {
      if (guardadas[v] === undefined) delete process.env[v];
      else process.env[v] = guardadas[v];
    }
  });

  const params = (id: string, esfuerzo?: "low" | "medium" | "high" | "xhigh" | "max", piensa?: boolean) => {
    const modelos = new Modelos(
      { bandera: id },
      undefined,
      piensa === undefined ? undefined : () => ({ piensa }),
    );
    const cliente = modelos.paraPapel("trabajo", esfuerzo) as {
      invocationParams: () => Record<string, unknown>;
    };
    return cliente.invocationParams();
  };

  it("anthropic lo manda dentro de outputConfig, que es donde lo quiere su API", () => {
    expect(params("anthropic/claude-opus-5", "low")["output_config"]).toEqual({ effort: "low" });
    expect(params("anthropic/claude-opus-5", "max")["output_config"]).toEqual({ effort: "max" });
  });

  it("gemini lo traduce a thinkingLevel EN VERSALES", () => {
    const p = params("gemini/gemini-3.8-flash", "medium");
    expect(p["thinkingConfig"] ?? p["generationConfig"]).toBeTruthy();
    expect(JSON.stringify(p)).toContain("MEDIUM");
  });

  it("los compatibles con OpenAI lo mandan como reasoning_effort", () => {
    expect(params("deepseek/deepseek-flash", "high")["reasoning_effort"]).toBe("high");
    expect(params("nvidia/openai/gpt-oss-20b", "low")["reasoning_effort"]).toBe("low");
  });

  it("ollama lo manda como «think» con el nivel dentro, no como booleano", () => {
    // Medido contra el servidor: valida "high"|"medium"|"low"|"max"|true|false, y el tipo
    // `boolean` del cliente es una limitación suya — pasa el valor tal cual al request.
    expect(params("ollama/granite4.2:3b", "low", true)["think"]).toBe("low");
  });

  /** Las cuatro caras del fail-closed, que es lo que de verdad hay que defender. */
  describe("y lo que NO se manda", () => {
    it("sin esfuerzo elegido, ningún cliente lleva el campo", () => {
      expect(params("anthropic/claude-opus-5")["output_config"]).toBeUndefined();
      expect(params("deepseek/deepseek-flash")["reasoning_effort"]).toBeUndefined();
      expect(params("ollama/granite4.2:3b", undefined, true)["think"]).toBeUndefined();
      expect(JSON.stringify(params("gemini/gemini-3.8-flash"))).not.toContain("thinkingLevel");
    });

    it("un nivel que el modelo no admite se OMITE, en vez de viajar y dar un 400", () => {
      // Haiku 4.5 no acepta `effort`.
      expect(params("anthropic/claude-haiku-4-5", "low")["output_config"]).toBeUndefined();
      // Gemini 2.5 contesta «Thinking level is not supported for this model».
      expect(JSON.stringify(params("gemini/gemini-2.5-flash", "low"))).not.toContain("LOW");
      // DeepSeek colapsa `medium` sobre `high`, así que `medium` no es uno de los suyos.
      expect(params("deepseek/deepseek-flash", "medium")["reasoning_effort"]).toBeUndefined();
      // Ollama no valida `xhigh`.
      expect(params("ollama/granite4.2:3b", "xhigh", true)["think"]).toBeUndefined();
    });

    it("a ollama SIN capacidades medidas no se le manda nada, que es la dirección segura", () => {
      // Pedirle pensar a un modelo que no piensa no da peor respuesta: tumba el turno con
      // `"ministral-3:3b" does not support thinking`.
      expect(params("ollama/granite4.2:3b", "low")["think"]).toBeUndefined();
      expect(params("ollama/ministral-3:3b", "low", false)["think"]).toBeUndefined();
    });

    it("un proveedor sin fila medida tampoco lo lleva, aunque el cliente sepa mandarlo", () => {
      process.env.OPENAI_API_KEY = "openai-de-pega";
      expect(params("openai/gpt-5", "high")["reasoning_effort"]).toBeUndefined();
    });
  });
});
