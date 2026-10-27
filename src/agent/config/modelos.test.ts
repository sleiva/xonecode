import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    expect(parametrosDe("claude-sonnet-5").max_tokens).toBe(32_768);
    expect(parametrosDe("claude-opus-5").max_tokens).toBe(32_768);
  });

  it("una llamada SIN streaming sale con 16.384: por encima de ~21.333 el SDK lanza antes de mandar", async () => {
    // El juez y el aumentador usan `.invoke()` sin streaming sobre el MISMO cliente del turno.
    const cliente = new Modelos({ bandera: "anthropic/claude-sonnet-5-5" }).paraPapel("trabajo") as {
      invoke: (p: string) => Promise<unknown>;
      completionWithRetry: (peticion: { max_tokens?: number; stream?: boolean }) => Promise<unknown>;
    };
    const pedidas: { max_tokens?: number; stream?: boolean }[] = [];
    cliente.completionWithRetry = async (peticion) => {
      pedidas.push(peticion);
      return { id: "m", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };
    };
    await cliente.invoke("hola");
    expect(pedidas).toHaveLength(1);
    expect(pedidas[0]?.stream).toBe(false);
    expect(pedidas[0]?.max_tokens).toBe(16_384);
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
/**
 * La CACHÉ de Anthropic, en el cuerpo que se MANDA. Medido el 21-10-2026 con `claude-sonnet-5-5`: sin `cache_control` la
 * segunda llamada leía 0 de caché. Aquí no vale `invocationParams()` —su `cache_control` sale de las opciones de cada
 * llamada y llega `undefined`—: lo que cuenta es la petición HTTP, y se captura con un `fetch` de pega, sin red.
 */
describe("la caché de Anthropic viaja en la petición", () => {
  const anterior = process.env.ANTHROPIC_API_KEY;
  const fetchAnterior = globalThis.fetch;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-de-pega";
  });
  afterEach(() => {
    globalThis.fetch = fetchAnterior;
    if (anterior === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = anterior;
  });

  it("con `cache_control` automático de primer nivel, en streaming y sin él", async () => {
    const cuerpos: Record<string, unknown>[] = [];
    globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
      cuerpos.push(JSON.parse(String(init?.body)));
      // La respuesta mínima de un mensaje: no importa qué dice, solo qué se pidió.
      return new Response(
        JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;
    const cliente = new Modelos({ bandera: "anthropic/claude-sonnet-5-5" }).paraPapel("trabajo") as { invoke: (m: unknown) => Promise<unknown> };
    await cliente.invoke([{ role: "user", content: "hola" }]).catch(() => undefined);
    expect(cuerpos.length).toBeGreaterThan(0);
    expect(cuerpos[0]!["cache_control"]).toEqual({ type: "ephemeral" });
  });

  it("con `1h` la pide de UNA HORA, y solo quien la pide", async () => {
    const cuerpos: Record<string, unknown>[] = [];
    globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
      cuerpos.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({ id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }) as typeof fetch;
    const modelos = new Modelos({ bandera: "anthropic/claude-sonnet-5-5" });
    for (const cliente of [modelos.paraPapel("trabajo", undefined, undefined, undefined, "1h"), modelos.paraPapel("trabajo")]) {
      await (cliente as { invoke: (m: unknown) => Promise<unknown> }).invoke([{ role: "user", content: "hola" }]).catch(() => undefined);
    }
    expect(cuerpos.map((c) => c["cache_control"])).toEqual([{ type: "ephemeral", ttl: "1h" }, { type: "ephemeral" }]);
  });
});

/**
 * El RAZONAMIENTO de Anthropic, que viaja en el `message_delta` del SSE (`usage.output_tokens_details.thinking_tokens`) y
 * `@langchain/anthropic` 1.5.2 tira: al trozo solo pasa `output_tokens`. Medido el 21-10-2026 contra la API con
 * `claude-sonnet-5-5`. Sin esto la traza no puede decir cuánto de la salida fue pensar.
 */
describe("el razonamiento de Anthropic llega al uso del mensaje", () => {
  const anterior = process.env.ANTHROPIC_API_KEY;
  const fetchAnterior = globalThis.fetch;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-de-pega";
  });
  afterEach(() => {
    globalThis.fetch = fetchAnterior;
    if (anterior === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = anterior;
  });

  const sse = (eventos: Record<string, unknown>[]) =>
    new Response(eventos.map((e) => `event: ${String(e["type"])}\ndata: ${JSON.stringify(e)}\n\n`).join(""), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  const conversacion = (detalles?: Record<string, unknown>) => [
    { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 41, output_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "17" } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1500, ...(detalles === undefined ? {} : { output_tokens_details: detalles }) } },
    { type: "message_stop" },
  ];
  const acumulado = async (eventos: Record<string, unknown>[]) => {
    globalThis.fetch = (async () => sse(eventos)) as typeof fetch;
    const cliente = new Modelos({ bandera: "anthropic/claude-sonnet-5-5" }).paraPapel("trabajo") as {
      stream: (m: unknown) => Promise<AsyncIterable<{ concat: (o: unknown) => unknown }>>;
    };
    let total: { concat: (o: unknown) => unknown } | undefined;
    for await (const t of await cliente.stream([{ role: "user", content: "hola" }])) total = total === undefined ? t : (total.concat(t) as typeof t);
    return total as unknown as { usage_metadata?: { output_tokens?: number; output_token_details?: { reasoning?: number } }; additional_kwargs: Record<string, unknown> };
  };

  it("los `thinking_tokens` del `message_delta` van a `output_token_details.reasoning`, y no se quedan en el mensaje", async () => {
    const m = await acumulado(conversacion({ thinking_tokens: 1234 }));
    expect(m.usage_metadata?.output_tokens).toBe(1500);
    expect(m.usage_metadata?.output_token_details?.reasoning).toBe(1234);
    expect(Object.keys(m.additional_kwargs).some((k) => k.includes("thinking"))).toBe(false);
  });

  it("si el proveedor no lo dice, no se inventa: ausente, no cero", async () => {
    const m = await acumulado(conversacion());
    expect(m.usage_metadata?.output_tokens).toBe(1500);
    expect(m.usage_metadata?.output_token_details?.reasoning).toBeUndefined();
  });
});

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
    expect(params("nvidia/openai/gpt-oss-20b", "low")["reasoning_effort"]).toBe("low");
    // El id lleva el proveedor DOS veces y no es un error: `parsear` corta por la primera
    // barra, así que el proveedor es `nvidia` y el modelo `nvidia/nemotron-…` — los ids de
    // NIM incluyen al fabricante, igual que `openai/gpt-oss-20b`.
    expect(params("nvidia/nvidia/nemotron-3-super-120b-a12b", "max")["reasoning_effort"]).toBe("max");
  });

  /**
   * DeepSeek vuelve a poder pensar: el eco del `reasoning_content` se repone en el `fetch`
   * (`ecoDeRazonamiento.ts`), así que su nivel viaja como el de cualquier compatible.
   */
  it("deepseek manda su nivel y ya no se le apaga el pensamiento", () => {
    const p = params("deepseek/deepseek-flash", "high");
    expect(p["reasoning_effort"]).toBe("high");
    expect(p["thinking"]).toBeUndefined();
  });

  /**
   * El nivel por omisión de un subagente, por FAMILIA de proveedor: solo lo MECÁNICO (quien ejecuta)
   * y solo en DeepSeek. Lo que el `.md` o la sesión fijaron gana siempre.
   */
  /**
   * El interruptor de pensamiento de un subagente: apagado por omisión solo para lo MECÁNICO y solo en DeepSeek;
   * lo que el `.md` dice gana. Apagado manda sobre el esfuerzo.
   */
  describe("el pensamiento de un subagente, por familia", () => {
    const con = (id: string, o: { esfuerzo?: "low" | "high" | "max"; sesion?: "low" | "high" | "max"; clase?: "mecanica"; pensamiento?: "apagado" | "activo" }) => {
      const modelos = new Modelos({ bandera: id }, undefined, undefined, o.sesion);
      return (modelos.paraPapel("trabajo", o.esfuerzo, o.clase, o.pensamiento) as {
        invocationParams: () => Record<string, unknown>;
      }).invocationParams();
    };

    it("un subagente que ejecuta, con DeepSeek y sin decir nada, va SIN pensamiento", () => {
      const p = con("deepseek/deepseek-flash", { clase: "mecanica" });
      expect(p["thinking"]).toEqual({ type: "disabled" });
      expect(p["reasoning_effort"]).toBeUndefined();
    });

    it("apagado manda sobre el esfuerzo: sin pensamiento no hay nivel que pedir", () => {
      const p = con("deepseek/deepseek-flash", { clase: "mecanica", esfuerzo: "max", sesion: "high" });
      expect(p["thinking"]).toEqual({ type: "disabled" });
      expect(p["reasoning_effort"]).toBeUndefined();
    });

    it("lo que dice el .md gana: `activo` lo enciende, `apagado` lo apaga en cualquier clase", () => {
      expect(con("deepseek/deepseek-flash", { clase: "mecanica", pensamiento: "activo" })["thinking"]).toBeUndefined();
      expect(con("deepseek/deepseek-flash", { pensamiento: "apagado" })["thinking"]).toEqual({ type: "disabled" });
    });

    it("sin clase (el raíz, escritores, consulta) no se decide nada", () => {
      expect(con("deepseek/deepseek-flash", {})["thinking"]).toBeUndefined();
    });

    it("otra familia no lo hereda ni recibe un parámetro que no conoce", () => {
      expect(JSON.stringify(con("anthropic/claude-opus-5", { clase: "mecanica", pensamiento: "apagado" }))).not.toContain("disabled");
      expect(con("nvidia/openai/gpt-oss-20b", { clase: "mecanica" })["thinking"]).toBeUndefined();
    });
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

/**
 * El `user_id` de DeepSeek, contra el `invocationParams()` del cliente REAL.
 *
 * Dos mitades, y la segunda es la que importa: con la identidad pasada a mano se prueba que
 * el campo llega a la raíz del cuerpo; SIN pasarla —que es como la construyen los diez
 * `new Modelos(` de producción— se prueba que el lector de disco está CABLEADO. Solo la
 * primera sería probar la función y no el montaje, que es el patrón del `Calificador`.
 */
describe("el user_id de DeepSeek, contra el invocationParams del cliente", () => {
  const guardadas = { ...process.env };
  let casa: string;
  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "deepseek-de-pega";
    process.env.NVIDIA_API_KEY = "nvidia-de-pega";
    casa = mkdtempSync(join(tmpdir(), "xonecode-identidad-"));
    process.env.HOME = casa;
    process.env.USERPROFILE = casa;
  });
  afterEach(() => {
    for (const v of ["DEEPSEEK_API_KEY", "NVIDIA_API_KEY", "HOME", "USERPROFILE"]) {
      if (guardadas[v] === undefined) delete process.env[v];
      else process.env[v] = guardadas[v];
    }
    rmSync(casa, { recursive: true, force: true });
  });

  const jwt = (sub: string): string =>
    `e30.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.firma`;

  const params = (modelos: Modelos) =>
    (modelos.paraPapel("trabajo") as { invocationParams: () => Record<string, unknown> }).invocationParams();

  /** Deja en la casa temporal un login de CloudStudio con ese `sub`, en ese entorno. */
  const conLogin = (entorno: string, url: string, sub: string): void => {
    mkdirSync(join(casa, ".xonecode"), { recursive: true });
    writeFileSync(join(casa, ".xonecode", "settings.json"), JSON.stringify({ entornos: [{ id: entorno, nombre: entorno, url }] }));
    writeFileSync(join(casa, ".xonecode", "cloudstudio-oauth.json"), JSON.stringify({
      version: 2,
      porEntorno: { [entorno]: { tokens: { access_token: "opaco", token_type: "Bearer", id_token: jwt(sub) } } },
    }));
  };

  it("con identidad, viaja como user_id en la RAÍZ del cuerpo, y no como el `user` del SDK", () => {
    const p = params(new Modelos({ bandera: "deepseek/deepseek-flash" }, undefined, undefined, undefined, () => "xonecode-abc"));
    expect(p["user_id"]).toBe("xonecode-abc");
    expect(p["user"]).toBeUndefined();
  });

  it("solo a DeepSeek: otro compatible con OpenAI no lo lleva aunque haya identidad", () => {
    const p = params(new Modelos({ bandera: "nvidia/nemotron-x" }, undefined, undefined, undefined, () => "xonecode-abc"));
    expect(p["user_id"]).toBeUndefined();
  });

  it("sin login en la máquina no se manda nada", () => {
    expect(params(new Modelos({ bandera: "deepseek/deepseek-flash" }))["user_id"]).toBeUndefined();
  });

  it("CABLEADO: sin pasar nada, lee el login de la casa y manda su hash", () => {
    conLogin("webstudio", "https://mcp.xonewebstudio.com/mcp", "8f1c-guid");
    const p = params(new Modelos({ bandera: "deepseek/deepseek-flash" }));
    expect(p["user_id"]).toMatch(/^xonecode-[0-9a-f]{32}$/);
    expect(String(p["user_id"])).not.toContain("8f1c");
  });

  it("el entorno del PROYECTO manda: se resuelve por su url, como la sincronización", () => {
    conLogin("webstudio", "https://mcp.xonewebstudio.com/mcp", "8f1c-guid");
    const delProyecto = params(new Modelos({
      bandera: "deepseek/deepseek-flash",
      proyecto: { cloudstudio: { url: "https://mcp.xonewebstudio.com/mcp" } },
    }));
    const deOtroServidor = params(new Modelos({
      bandera: "deepseek/deepseek-flash",
      proyecto: { cloudstudio: { url: "https://cloudstudio.cliente.example/mcp" } },
    }));
    expect(delProyecto["user_id"]).toMatch(/^xonecode-/);
    // Un proyecto de OTRO servidor, sin sesión ahí, no toma prestada la identidad de éste.
    expect(deOtroServidor["user_id"]).toBeUndefined();
  });

  it("y se lee en cada construcción: un login hecho con la consola abierta ya cuenta", () => {
    const modelos = new Modelos({ bandera: "deepseek/deepseek-flash" });
    expect(params(modelos)["user_id"]).toBeUndefined();
    conLogin("webstudio", "https://mcp.xonewebstudio.com/mcp", "8f1c-guid");
    expect(params(modelos)["user_id"]).toMatch(/^xonecode-/);
  });
});
