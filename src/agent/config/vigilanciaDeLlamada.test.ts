import { describe, expect, it } from "vitest";
import { fetchConVigilancia, LlamadaSinRespuesta } from "./vigilanciaDeLlamada.js";

const topes = { primerDato: 60, silencio: 60 };
const bytes = (t: string) => new TextEncoder().encode(t);
/** Un cuerpo que da estos trozos y después, si `colgarse`, no vuelve a dar nada. */
function cuerpo(trozos: string[], colgarse = false): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < trozos.length) c.enqueue(bytes(trozos[i++]!));
      else if (colgarse) return new Promise(() => undefined);
      else c.close();
      return undefined;
    },
  });
}
const leer = (r: Response) => r.text();

/** Medido el 03-11-2026: una llamada a DeepSeek con la conexión abierta y sin un byte colgó el turno 12 minutos. */
describe("una llamada al modelo que no responde se corta", () => {
  it("una respuesta normal pasa entera, con su estado y sus cabeceras", async () => {
    const f = fetchConVigilancia(async () => new Response(cuerpo(["data: a\n\n", "data: b\n\n"]), { status: 200, headers: { "content-type": "text/event-stream" } }), topes);
    const r = await f("https://x/v1/chat/completions");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/event-stream");
    expect(await leer(r)).toBe("data: a\n\ndata: b\n\n");
  });

  it("si no llegan ni las cabeceras, se aborta y LANZA (el SDK lo reintenta)", async () => {
    let señal: AbortSignal | undefined;
    const f = fetchConVigilancia((_e, init) => {
      señal = init?.signal ?? undefined;
      return new Promise(() => undefined);
    }, topes);
    await expect(f("https://x")).rejects.toBeInstanceOf(LlamadaSinRespuesta);
    expect(señal?.aborted).toBe(true);
  });

  it("si llegan las cabeceras pero no el primer dato, también lanza: aún se puede reintentar", async () => {
    const f = fetchConVigilancia(async () => new Response(cuerpo([], true)), topes);
    await expect(f("https://x")).rejects.toThrow(/no empezó a responder/);
  });

  it("si se para a mitad, el flujo falla con el motivo en vez de esperar para siempre", async () => {
    const f = fetchConVigilancia(async () => new Response(cuerpo(["data: a\n\n"], true)), topes);
    const r = await f("https://x");
    await expect(leer(r)).rejects.toThrow(/dejó de responder a mitad/);
  });

  it("abortar por fuera (Detener) aborta también la petición", async () => {
    const fuera = new AbortController();
    let señal: AbortSignal | undefined;
    const f = fetchConVigilancia((_e, init) => {
      señal = init?.signal ?? undefined;
      return new Promise((_ok, mal) => init?.signal?.addEventListener("abort", () => mal(new Error("abortada"))));
    }, { primerDato: 5000, silencio: 5000 });
    const p = f("https://x", { signal: fuera.signal });
    fuera.abort();
    await expect(p).rejects.toThrow("abortada");
    expect(señal?.aborted).toBe(true);
  });

  it("una respuesta sin cuerpo se devuelve tal cual", async () => {
    const f = fetchConVigilancia(async () => new Response(null, { status: 204 }), topes);
    expect((await f("https://x")).status).toBe(204);
  });
});

/**
 * Lo que hace que el corte sirva: el cliente de LangChain REINTENTA cuando el `fetch` lanza antes del primer dato. Con
 * el `ChatOpenAI` de verdad y un servidor de mentira: la primera llamada se cuelga, la segunda contesta.
 */
describe("el cliente reintenta la llamada cortada", () => {
  it("streaming: la primera se cuelga, la segunda contesta, y el turno sigue", async () => {
    const { ChatOpenAI } = await import("@langchain/openai");
    let llamadas = 0;
    const sse = [
      `data: ${JSON.stringify({ id: "1", object: "chat.completion.chunk", created: 1, model: "m", choices: [{ index: 0, delta: { role: "assistant", content: "hola" }, finish_reason: null }] })}\n\n`,
      `data: ${JSON.stringify({ id: "1", object: "chat.completion.chunk", created: 1, model: "m", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n",
    ];
    const base: typeof fetch = async (_e, init) => {
      llamadas += 1;
      if (llamadas === 1) return new Promise((_ok, mal) => init?.signal?.addEventListener("abort", () => mal(new Error("abortada"))));
      return new Response(cuerpo(sse), { status: 200, headers: { "content-type": "text/event-stream" } });
    };
    const modelo = new ChatOpenAI({ model: "m", apiKey: "k", streaming: true, configuration: { baseURL: "https://x/v1", fetch: fetchConVigilancia(base, topes) } });
    let texto = "";
    for await (const trozo of await modelo.stream("hola")) texto += String(trozo.content);
    expect(texto).toBe("hola");
    expect(llamadas).toBe(2);
  }, 20_000);
});

/**
 * Medido en la pasada 7 de la calculadora (DeepSeek flash): una llamada del orquestador estuvo 27,5 minutos abierta y
 * devolvió 218 tokens. DeepSeek, con la petición en cola, manda comentarios SSE (`: keep-alive`) para no cerrar la
 * conexión, y cada uno reiniciaba el reloj: la llamada no se cortaba nunca.
 */
describe("un keep-alive no cuenta como dato", () => {
  /** Unos trozos y después, para siempre, un `: keep-alive` cada 10 ms. */
  const conLatidos = (trozos: string[]): ReadableStream<Uint8Array> => {
    let i = 0;
    return new ReadableStream<Uint8Array>({
      pull: (c) =>
        i < trozos.length
          ? void c.enqueue(bytes(trozos[i++]!))
          : new Promise<void>((listo) => setTimeout(() => (c.enqueue(bytes(": keep-alive\n\n")), listo()), 10)),
    });
  };

  it("solo latidos antes del primer dato: se corta y LANZA igual que sin un byte", async () => {
    const f = fetchConVigilancia(async () => new Response(conLatidos([])), topes);
    await expect(f("https://x")).rejects.toBeInstanceOf(LlamadaSinRespuesta);
  });

  it("solo latidos a mitad: el flujo falla con el motivo, aunque la conexión siga viva", async () => {
    const f = fetchConVigilancia(async () => new Response(conLatidos(["data: a\n\n"])), topes);
    const r = await f("https://x");
    await expect(leer(r)).rejects.toBeInstanceOf(LlamadaSinRespuesta);
  });

  it("los latidos entre datos de verdad pasan tal cual y no rompen nada", async () => {
    const f = fetchConVigilancia(async () => new Response(cuerpo([": keep-alive\n\n", "data: a\n\n", ": keep-alive\n\n", "data: b\n\n"])), topes);
    expect(await leer(await f("https://x"))).toBe(": keep-alive\n\ndata: a\n\n: keep-alive\n\ndata: b\n\n");
  });
});
