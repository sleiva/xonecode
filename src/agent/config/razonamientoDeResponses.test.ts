import { describe, expect, it } from "vitest";
import {
  crearMemoriaDeRazonamiento,
  cuerpoConRazonamiento,
  eventoConRazonamiento,
  fetchConRazonamientoDeResponses,
  respuestaConRazonamiento,
} from "./razonamientoDeResponses.js";
import { apiDeModelosDe, apiPara } from "../../core/modelos.js";
import { validar } from "../../core/config.js";

describe("el razonamiento por la API Responses", () => {
  it("DeepSeek: `reasoning_text` se renombra a `reasoning_summary_text` (lo que LangChain lee) y se guarda por `call_id`", () => {
    const memoria = crearMemoriaDeRazonamiento();
    const estado = { pensado: "" };
    const delta = eventoConRazonamiento({ type: "response.reasoning_text.delta", item_id: "r1", delta: "Hay que " }, estado, memoria, "deepseek");
    expect(delta).toMatchObject({ type: "response.reasoning_summary_text.delta", summary_index: 0, delta: "Hay que " });
    eventoConRazonamiento({ type: "response.reasoning_text.delta", delta: "sumar." }, estado, memoria, "deepseek");
    eventoConRazonamiento({ type: "response.output_item.added", item: { type: "function_call", call_id: "c1", name: "suma" } }, estado, memoria, "deepseek");
    expect(memoria.de("c1")).toBe("Hay que sumar.");
    // El estándar (Ollama) no se toca, pero también se guarda.
    const m2 = crearMemoriaDeRazonamiento();
    const e2 = { pensado: "" };
    const tal = eventoConRazonamiento({ type: "response.reasoning_summary_text.delta", delta: "pienso" }, e2, m2, "estandar");
    expect(tal.type).toBe("response.reasoning_summary_text.delta");
    eventoConRazonamiento({ type: "response.output_item.done", item: { type: "function_call", call_id: "c2" } }, e2, m2, "estandar");
    expect(m2.de("c2")).toBe("pienso");
  });

  it("se REPONE delante de la primera llamada de su vuelta, en el formato de cada uno; si ya va, no se duplica", () => {
    const memoria = crearMemoriaDeRazonamiento();
    memoria.guardar("c1", "Hay que sumar.");
    const cuerpo = {
      model: "deepseek-flash",
      input: [
        { role: "user", content: "suma" },
        { type: "function_call", call_id: "c1", name: "suma", arguments: "{}" },
        { type: "function_call", call_id: "c9", name: "otra", arguments: "{}" },
        { type: "function_call_output", call_id: "c1", output: "5" },
      ],
    };
    const deepseek = cuerpoConRazonamiento(cuerpo, memoria, "deepseek") as { input: { type?: string; content?: unknown; summary?: unknown }[] };
    expect(deepseek.input.map((i) => i.type ?? "message")).toEqual(["message", "reasoning", "function_call", "function_call", "function_call_output"]);
    expect(deepseek.input[1]).toEqual({ type: "reasoning", summary: [], content: [{ type: "reasoning_text", text: "Hay que sumar." }] });
    const estandar = cuerpoConRazonamiento(cuerpo, memoria, "estandar") as { input: { summary?: unknown }[] };
    expect(estandar.input[1]).toEqual({ type: "reasoning", summary: [{ type: "summary_text", text: "Hay que sumar." }] });
    // Con su `reasoning` ya delante (lo trajo LangChain), no se añade otro; en DeepSeek su `summary` pasa a `content`.
    const yaVa = cuerpoConRazonamiento({ input: [{ type: "reasoning", id: "r1", summary: [{ type: "summary_text", text: "ya" }] }, cuerpo.input[1]] }, memoria, "deepseek") as { input: { type?: string; content?: unknown }[] };
    expect(yaVa.input.map((i) => i.type)).toEqual(["reasoning", "function_call"]);
    expect(yaVa.input[0]!.content).toEqual([{ type: "reasoning_text", text: "ya" }]);
    // Con TEXTO del asistente antes de la llamada, delante del texto: detrás, DeepSeek da 400 (medido en la consola).
    const conTexto = cuerpoConRazonamiento(
      { input: [{ role: "user", content: "suma" }, { type: "message", role: "assistant", content: [{ type: "output_text", text: "Voy a sumar." }] }, cuerpo.input[1], { type: "function_call_output", call_id: "c1", output: "5" }, { role: "assistant", content: "Da 5." }] },
      memoria,
      "deepseek"
    ) as { input: { type?: string; role?: string }[] };
    expect(conTexto.input.map((i) => i.type ?? i.role)).toEqual(["user", "reasoning", "message", "function_call", "function_call_output", "assistant"]);
    // Sin nada guardado para ese `call_id`, nada; y lo que no es un cuerpo de Responses, tal cual.
    expect((cuerpoConRazonamiento({ input: [{ type: "function_call", call_id: "zz" }] }, memoria, "deepseek") as { input: unknown[] }).input).toHaveLength(1);
    expect(cuerpoConRazonamiento({ messages: [] }, memoria, "deepseek")).toEqual({ messages: [] });
  });

  it("una respuesta ENTERA: guarda lo pensado por `call_id` y, en DeepSeek, copia `content` a `summary`", () => {
    const memoria = crearMemoriaDeRazonamiento();
    const r = respuestaConRazonamiento(
      { output: [{ type: "reasoning", id: "r1", summary: [], content: [{ type: "reasoning_text", text: "pensé" }] }, { type: "function_call", call_id: "c1" }] },
      memoria,
      "deepseek"
    ) as { output: { summary?: unknown }[] };
    expect(r.output[0]!.summary).toEqual([{ type: "summary_text", text: "pensé" }]);
    expect(memoria.de("c1")).toBe("pensé");
  });

  it("por el `fetch`: el SSE se reescribe línea a línea aunque llegue partido, y la petición siguiente lleva el razonamiento", async () => {
    const memoria = crearMemoriaDeRazonamiento();
    const sse = [
      'event: response.reasoning_text.delta\ndata: {"type":"response.reasoning_text.delta","delta":"Hay que "}\n\n',
      'data: {"type":"response.reasoning_text.del',
      'ta","delta":"sumar."}\n\ndata: {"type":"response.output_item.added","item":{"type":"function_call","call_id":"c1"}}\n\n',
    ];
    const pedidos: string[] = [];
    const base = (async (_u: unknown, init?: { body?: unknown }) => {
      pedidos.push(String(init?.body ?? ""));
      const flujo = new ReadableStream<Uint8Array>({
        start(c) {
          for (const t of sse) c.enqueue(new TextEncoder().encode(t));
          c.close();
        },
      });
      return new Response(flujo, { status: 200, headers: { "content-type": "text/event-stream" } });
    }) as unknown as typeof fetch;
    const f = fetchConRazonamientoDeResponses(memoria, "deepseek", base);
    const texto = await (await f("https://x/responses", { method: "POST", body: JSON.stringify({ input: [] }) })).text();
    expect(texto).toContain("event: response.reasoning_summary_text.delta");
    expect(texto.match(/"type":"response\.reasoning_summary_text\.delta"/g)).toHaveLength(2);
    expect(texto).not.toContain("response.reasoning_text.");
    expect(memoria.de("c1")).toBe("Hay que sumar.");
    await f("https://x/responses", { method: "POST", body: JSON.stringify({ input: [{ type: "function_call", call_id: "c1" }] }) });
    expect(pedidos[1]).toContain('"reasoning_text","text":"Hay que sumar."');
  });
});

describe("`apiDeModelos` en el config.json", () => {
  it("del proyecto manda sobre el global; ausente, Responses; solo DeepSeek y Ollama van por ella", () => {
    expect(apiDeModelosDe({})).toBe("responses");
    expect(apiDeModelosDe({ global: { apiDeModelos: "responses" } })).toBe("responses");
    expect(apiDeModelosDe({ global: { apiDeModelos: "responses" }, proyecto: { apiDeModelos: "chat" } })).toBe("chat");
    expect(apiPara("deepseek", "responses")).toBe("responses");
    expect(apiPara("ollama", "responses")).toBe("responses");
    expect(apiPara("anthropic", "responses")).toBe("chat");
    expect(apiPara("deepseek", "chat")).toBe("chat");
  });

  it("un valor que no es «chat» ni «responses» se descarta con aviso", () => {
    expect(validar({ apiDeModelos: "responses" }, "/c.json", "global").config.apiDeModelos).toBe("responses");
    const malo = validar({ apiDeModelos: "rest" }, "/c.json", "global");
    expect(malo.config.apiDeModelos).toBeUndefined();
    expect(malo.avisos.map((a) => a.texto).join("\n")).toContain("«apiDeModelos» debe ser «chat» o «responses»");
  });
});
