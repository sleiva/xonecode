import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogoModelos, baseUrlDeOllama } from "./catalogoModelos.js";
import { Modelos } from "./modelos.js";

type Llamada = { url: string; init: RequestInit | undefined };

function responderJson(...cuerpos: unknown[]): { fetch: typeof fetch; llamadas: Llamada[] } {
  const llamadas: Llamada[] = [];
  let indice = 0;
  const fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(entrada), init });
    const cuerpo = cuerpos[indice++];
    return new Response(JSON.stringify(cuerpo), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  return { fetch, llamadas };
}

/** Responde por TURNOS, con el estado de cada uno: para probar que un modelo roto entre
 *  varios buenos no se lleva la lista por delante. */
function responderPorTurnos(...turnos: { status: number; cuerpo: unknown }[]): typeof fetch {
  let indice = 0;
  return (async () => {
    const turno = turnos[indice++] ?? { status: 500, cuerpo: {} };
    return new Response(JSON.stringify(turno.cuerpo), {
      status: turno.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
}

function responderError(status: number, cuerpo: string): typeof fetch {
  return (async () => new Response(cuerpo, { status })) as typeof globalThis.fetch;
}

afterEach(() => vi.unstubAllEnvs());

describe("CatalogoModelos", () => {
  it("OpenAI pide el catálogo con bearer y excluye recursos no conversacionales", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-prueba-openai");
    const doble = responderJson({ data: [
      { id: "gpt-4o" },
      { id: "gpt-4o-realtime-preview" },
      { id: "text-embedding-3-small" },
      { id: "omni-moderation-latest" },
      { id: "whisper-1" },
      { id: "tts-1" },
      { id: "dall-e-3" },
      { id: "sora-2" },
    ] });

    await expect(new CatalogoModelos(doble.fetch).listar("openai")).resolves.toEqual([
      { proveedor: "openai", id: "gpt-4o" },
    ]);
    expect(doble.llamadas).toEqual([{
      url: "https://api.openai.com/v1/models",
      init: { headers: { authorization: "Bearer sk-prueba-openai" }, signal: expect.any(AbortSignal) },
    }]);
  });

  it("Anthropic sigue after_id y normaliza nombre y contexto", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-prueba-anthropic");
    const doble = responderJson(
      { data: [
        { id: "claude-sonnet", display_name: "Claude Sonnet", max_input_tokens: 200000 },
        { id: "claude-realtime-preview", display_name: "No conversacional", max_input_tokens: 200000 },
      ], has_more: true, last_id: "cursor opaco" },
      { data: [{ id: "claude-haiku", display_name: "Claude Haiku", max_input_tokens: 100000 }], has_more: false, last_id: null },
    );

    await expect(new CatalogoModelos(doble.fetch).listar("anthropic")).resolves.toEqual([
      { proveedor: "anthropic", id: "claude-sonnet", nombre: "Claude Sonnet", contexto: 200000 },
      { proveedor: "anthropic", id: "claude-haiku", nombre: "Claude Haiku", contexto: 100000 },
    ]);
    expect(doble.llamadas).toEqual([
      {
        url: "https://api.anthropic.com/v1/models",
        init: {
          headers: { "x-api-key": "sk-prueba-anthropic", "anthropic-version": "2023-06-01" },
          signal: expect.any(AbortSignal),
        },
      },
      {
        url: "https://api.anthropic.com/v1/models?after_id=cursor+opaco",
        init: {
          headers: { "x-api-key": "sk-prueba-anthropic", "anthropic-version": "2023-06-01" },
          signal: expect.any(AbortSignal),
        },
      },
    ]);
  });

  it("Gemini pagina y conserva solo modelos con generateContent", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "clave-prueba-gemini");
    const doble = responderJson(
      { models: [
        { name: "models/gemini-chat", displayName: "Chat", supportedGenerationMethods: ["generateContent"], inputTokenLimit: 1000000 },
        { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
        { name: "models/gemini-image-preview", supportedGenerationMethods: ["generateContent"] },
      ], nextPageToken: "siguiente token" },
      { models: [{ name: "models/gemini-chat-2", supportedGenerationMethods: ["generateContent"], inputTokenLimit: 32000 }] },
    );

    await expect(new CatalogoModelos(doble.fetch).listar("gemini")).resolves.toEqual([
      { proveedor: "gemini", id: "gemini-chat", nombre: "Chat", contexto: 1000000 },
      { proveedor: "gemini", id: "gemini-chat-2", contexto: 32000 },
    ]);
    expect(doble.llamadas).toEqual([
      {
        url: "https://generativelanguage.googleapis.com/v1beta/models",
        init: { headers: { "x-goog-api-key": "clave-prueba-gemini" }, signal: expect.any(AbortSignal) },
      },
      {
        url: "https://generativelanguage.googleapis.com/v1beta/models?pageToken=siguiente+token",
        init: { headers: { "x-goog-api-key": "clave-prueba-gemini" }, signal: expect.any(AbortSignal) },
      },
    ]);
  });

  it("Ollama comprueba la capacidad de cada modelo antes de publicarlo", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://ollama.local/");
    const doble = responderJson(
      { models: [{ name: "chat:latest" }, { name: "embed:latest" }] },
      { capabilities: ["completion", "vision"], model_info: { "llama.context_length": 32768 } },
      { capabilities: ["embedding"], model_info: { "nomic.context_length": 8192 } },
    );

    await expect(new CatalogoModelos(doble.fetch).listar("ollama")).resolves.toEqual([
      { proveedor: "ollama", id: "chat:latest", contexto: 32768 },
    ]);
    expect(doble.llamadas).toEqual([
      { url: "http://ollama.local/api/tags", init: { signal: expect.any(AbortSignal) } },
      {
        url: "http://ollama.local/api/show",
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: "chat:latest" }),
          signal: expect.any(AbortSignal),
        },
      },
      {
        url: "http://ollama.local/api/show",
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: "embed:latest" }),
          signal: expect.any(AbortSignal),
        },
      },
    ]);
  });

  it("Ollama Cloud pide el catálogo y sus capacidades con bearer", async () => {
    vi.stubEnv("OLLAMA_API_KEY", "clave-prueba-ollama");
    const doble = responderJson(
      { models: [{ name: "glm-4.6" }, { name: "embed:latest" }] },
      { capabilities: ["chat"], model_info: { "glm.context_length": 131072 } },
      { capabilities: ["embedding"], model_info: { "nomic.context_length": 8192 } },
    );

    await expect(new CatalogoModelos(doble.fetch).listar("ollama-cloud" as never)).resolves.toEqual([
      { proveedor: "ollama-cloud", id: "glm-4.6", contexto: 131072 },
    ]);
    expect(doble.llamadas).toEqual([
      {
        url: "https://ollama.com/api/tags",
        init: {
          headers: { authorization: "Bearer clave-prueba-ollama" },
          signal: expect.any(AbortSignal),
        },
      },
      {
        url: "https://ollama.com/api/show",
        init: {
          method: "POST",
          headers: {
            authorization: "Bearer clave-prueba-ollama",
            "content-type": "application/json",
          },
          body: JSON.stringify({ model: "glm-4.6" }),
          signal: expect.any(AbortSignal),
        },
      },
      {
        url: "https://ollama.com/api/show",
        init: {
          method: "POST",
          headers: {
            authorization: "Bearer clave-prueba-ollama",
            "content-type": "application/json",
          },
          body: JSON.stringify({ model: "embed:latest" }),
          signal: expect.any(AbortSignal),
        },
      },
    ]);
  });

  it("rechaza una credencial ausente sin intentar llamar al proveedor", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchFalso = vi.fn() as unknown as typeof fetch;

    await expect(new CatalogoModelos(fetchFalso).listar("openai"))
      .rejects.toThrow("falta la credencial para openai; usa /provider openai");
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("un 401 no filtra ni la clave ni el body remoto", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-secreta");
    const catalogo = new CatalogoModelos(responderError(401, "key sk-secreta no válida"));

    await expect(catalogo.listar("openai")).rejects.toThrow("credencial no autorizada para openai");
    await catalogo.listar("openai").catch((error: unknown) => {
      expect(String(error)).not.toContain("sk-secreta");
      expect(String(error)).not.toContain("no válida");
    });
  });

  it("convierte timeout, fallo de red y JSON inesperado en errores seguros", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-secreta");
    const timeout = (async (_entrada: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolver, rechazar) => {
      init?.signal?.addEventListener("abort", () => rechazar(new Error("sk-secreta cuerpo remoto")));
    })) as typeof fetch;
    const red = (async () => { throw new Error("sk-secreta cuerpo remoto"); }) as typeof fetch;
    const jsonRoto = (async () => new Response("sk-secreta cuerpo remoto", { status: 200 })) as typeof fetch;

    await expect(new CatalogoModelos(timeout, 1).listar("openai")).rejects.toThrow("timeout al consultar openai");
    await expect(new CatalogoModelos(red).listar("openai")).rejects.toThrow("no se puede contactar con openai");
    await expect(new CatalogoModelos(jsonRoto).listar("openai")).rejects.toThrow("respuesta incompatible de openai");
    for (const catalogo of [new CatalogoModelos(red), new CatalogoModelos(jsonRoto)]) {
      await catalogo.listar("openai").catch((error: unknown) => expect(String(error)).not.toContain("sk-secreta"));
    }
  });

  it("limita una paginación que no avanza", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "clave-prueba-gemini");
    const doble = responderJson(...Array.from({ length: 21 }, () => ({ models: [], nextPageToken: "siempre-igual" })));

    await expect(new CatalogoModelos(doble.fetch).listar("gemini"))
      .rejects.toThrow("respuesta incompatible de gemini");
  });

  it("rechaza metadatos de paginación Anthropic malformados", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-prueba-anthropic");
    const doble = responderJson({ data: [], has_more: "false" });

    await expect(new CatalogoModelos(doble.fetch).listar("anthropic"))
      .rejects.toThrow("respuesta incompatible de anthropic");
  });

  it("rechaza un nextPageToken de Gemini que no es texto", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "clave-prueba-gemini");
    const doble = responderJson({ models: [], nextPageToken: 42 });

    await expect(new CatalogoModelos(doble.fetch).listar("gemini"))
      .rejects.toThrow("respuesta incompatible de gemini");
  });

  it("etiqueta con el proveedor los errores de normalización", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-prueba-openai");
    const doble = responderJson({ data: "forma inesperada" });

    await expect(new CatalogoModelos(doble.fetch).listar("openai"))
      .rejects.toThrow("respuesta incompatible de openai");
  });
});

it("baseUrlDeOllama usa el valor por omisión cuando no está configurada", () => {
  const original = process.env.OLLAMA_BASE_URL;
  delete process.env.OLLAMA_BASE_URL;
  expect(baseUrlDeOllama()).toBe("http://localhost:11434");
  if (original === undefined) delete process.env.OLLAMA_BASE_URL;
  else process.env.OLLAMA_BASE_URL = original;
});

it("Modelos y el catálogo comparten OLLAMA_BASE_URL", () => {
  vi.stubEnv("OLLAMA_BASE_URL", "http://ollama.local");
  expect(baseUrlDeOllama()).toBe("http://ollama.local");
  const cliente = new Modelos({ bandera: "ollama/prueba" }).paraPapel("rapido") as { baseUrl: string };
  expect(cliente.baseUrl).toBe(baseUrlDeOllama());
});

it("Modelos configura Ollama Cloud con su endpoint y bearer", () => {
  vi.stubEnv("OLLAMA_API_KEY", "clave-prueba-ollama");
  const cliente = new Modelos({ bandera: "ollama-cloud/glm-4.6" }).paraPapel("rapido") as {
    baseUrl: string;
    client: { config: { headers: Record<string, string> } };
  };
  expect(cliente.baseUrl).toBe("https://ollama.com");
  expect(cliente.client.config.headers).toEqual({ authorization: "Bearer clave-prueba-ollama" });
});

describe("Ollama: un modelo roto no se lleva la lista por delante", () => {
  const CHAT = { capabilities: ["completion"], model_info: { "x.context_length": 4096 } };

  /**
   * Medido contra el Ollama del usuario: `/api/tags` devolvía 26 modelos, y dos de ellos
   * —modelos de Ollama Cloud retirados— contestaban al `/api/show` con **HTTP 410** y
   * «was retired at …». Siguen en el manifiesto local, así que `tags` los nombra, pero ya
   * no existen. El bucle no capturaba nada, así que el primer 410 lanzaba y el proveedor
   * ENTERO se reportaba como no disponible: elegir «ollama» en el asistente no listaba nada
   * y volvía al paso de proveedor, con veinte y pico modelos usables detrás.
   */
  it("un modelo RETIRADO (410) se salta; los demás siguen listándose", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://ollama.local/");
    const fetch = responderPorTurnos(
      { status: 200, cuerpo: { models: [{ name: "bueno:latest" }, { name: "retirado:cloud" }, { name: "otro:latest" }] } },
      { status: 200, cuerpo: CHAT },
      { status: 410, cuerpo: { error: "retirado:cloud was retired at 2026-06-16" } },
      { status: 200, cuerpo: CHAT },
    );
    await expect(new CatalogoModelos(fetch).listar("ollama")).resolves.toEqual([
      { proveedor: "ollama", id: "bueno:latest", contexto: 4096 },
      { proveedor: "ollama", id: "otro:latest", contexto: 4096 },
    ]);
  });

  /**
   * Lo que NO se puede tragar: que fallen todos. Eso no es «no tienes modelos», es que no
   * se puede hablar con el servidor — y devolver `[]` se lo diría a alguien que tiene
   * veinte, con el asistente tratándolo como un proveedor vacío en vez de como una avería.
   */
  it("si fallan TODOS, se lanza: un servidor roto no es un catálogo vacío", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://ollama.local/");
    const fetch = responderPorTurnos(
      { status: 200, cuerpo: { models: [{ name: "uno:latest" }, { name: "dos:latest" }] } },
      { status: 500, cuerpo: {} },
      { status: 500, cuerpo: {} },
    );
    await expect(new CatalogoModelos(fetch).listar("ollama")).rejects.toThrow(/no disponible de ollama/);
  });

  /** Un servidor SIN modelos sigue siendo una lista vacía legítima, no un error. */
  it("cero etiquetas es una lista vacía, no una avería", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://ollama.local/");
    const fetch = responderPorTurnos({ status: 200, cuerpo: { models: [] } });
    await expect(new CatalogoModelos(fetch).listar("ollama")).resolves.toEqual([]);
  });

  /**
   * El código HTTP va en el mensaje: sin él, un 410 («ese modelo ya no existe») y un 500
   * («el servidor está roto») se leen igual y hay que salir a curl para distinguirlos.
   */
  it("el error nombra el código HTTP, para poder distinguir la avería", async () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://ollama.local/");
    await expect(
      new CatalogoModelos(responderError(503, "nope")).listar("ollama")
    ).rejects.toThrow(/HTTP 503/);
  });
});
