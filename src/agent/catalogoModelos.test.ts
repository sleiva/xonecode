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
      { capabilities: ["completion"], model_info: { "llama.context_length": 32768 } },
      { capabilities: ["embedding"], model_info: { "nomic.context_length": 8192 } },
    );

    await expect(new CatalogoModelos(doble.fetch).listar("ollama")).resolves.toEqual([
      { proveedor: "ollama", id: "embed:latest", contexto: 32768 },
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
