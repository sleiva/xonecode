import { describe, expect, it } from "vitest";
import {
  acumuladorDeEcoSse,
  conEcoDeRazonamiento,
  crearMemoriaDeEco,
  ecosDeRespuesta,
  fetchConEcoDeRazonamiento,
} from "./ecoDeRazonamiento.js";

describe("la memoria de ecos", () => {
  it("guarda y devuelve por id de tool call", () => {
    const m = crearMemoriaDeEco();
    m.recordar("call_1", "pensé esto");
    expect(m.buscar("call_1")).toBe("pensé esto");
    expect(m.buscar("call_2")).toBeUndefined();
  });

  it("no guarda vacíos: un eco vacío no es un eco", () => {
    const m = crearMemoriaDeEco();
    m.recordar("call_1", "");
    m.recordar("", "algo");
    expect(m.tamaño).toBe(0);
  });

  /** Una sesión larga no puede crecer sin tope, y lo que se descarta es lo más viejo. */
  it("descarta lo viejo al pasarse del tope", () => {
    const m = crearMemoriaDeEco(2);
    m.recordar("a", "1");
    m.recordar("b", "2");
    m.recordar("c", "3");
    expect(m.tamaño).toBe(2);
    expect(m.buscar("a")).toBeUndefined();
    expect(m.buscar("c")).toBe("3");
  });

  it("y lo que se vuelve a usar sobrevive a lo que no", () => {
    const m = crearMemoriaDeEco(2);
    m.recordar("a", "1");
    m.recordar("b", "2");
    m.recordar("a", "1");   // re-insertar lo mueve al final
    m.recordar("c", "3");
    expect(m.buscar("a")).toBe("1");
    expect(m.buscar("b")).toBeUndefined();
  });
});

describe("volver a pegar el eco en la petición", () => {
  const memoria = () => {
    const m = crearMemoriaDeEco();
    m.recordar("call_1", "razoné A");
    return m;
  };

  it("se lo pone al asistente que hizo esa tool call", () => {
    const salida = conEcoDeRazonamiento(
      { messages: [{ role: "user" }, { role: "assistant", tool_calls: [{ id: "call_1" }] }] },
      memoria(),
    );
    expect(salida.messages?.[1]).toMatchObject({ reasoning_content: "razoné A" });
  });

  it("no toca lo que no es un asistente con tool calls", () => {
    const entrada = { messages: [{ role: "user" }, { role: "assistant" }] };
    expect(conEcoDeRazonamiento(entrada, memoria())).toBe(entrada);
  });

  /** Si algún día el cliente empieza a mandarlo, esto deja de hacer falta solo. */
  it("no pisa un `reasoning_content` que ya venga", () => {
    const salida = conEcoDeRazonamiento(
      { messages: [{ role: "assistant", reasoning_content: "el suyo", tool_calls: [{ id: "call_1" }] }] },
      memoria(),
    );
    expect(salida.messages?.[0]?.reasoning_content).toBe("el suyo");
  });

  it("un id que no consta se deja como está: no se inventa un razonamiento", () => {
    const entrada = { messages: [{ role: "assistant", tool_calls: [{ id: "call_9" }] }] };
    expect(conEcoDeRazonamiento(entrada, memoria())).toBe(entrada);
  });
});

describe("sacar el eco de una respuesta", () => {
  it("de una respuesta normal", () => {
    expect(ecosDeRespuesta({
      choices: [{ message: { reasoning_content: "pensé", tool_calls: [{ id: "call_1" }] } }],
    })).toEqual([["call_1", "pensé"]]);
  });

  it("sin tool calls no hay con qué emparejar, y no se inventa una clave", () => {
    expect(ecosDeRespuesta({ choices: [{ message: { reasoning_content: "pensé" } }] })).toEqual([]);
  });

  /**
   * El caso REAL: el turno streamea siempre. El razonamiento llega en trozos y el id de la
   * tool call solo viene en el PRIMER delta.
   */
  it("de un flujo SSE, juntando los trozos", () => {
    const a = acumuladorDeEcoSse();
    for (const l of [
      'data: {"choices":[{"index":0,"delta":{"reasoning_content":"pri"}}]}',
      'data: {"choices":[{"index":0,"delta":{"reasoning_content":"mero"}}]}',
      'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"id":"call_7","function":{"name":"leer"}}]}}]}',
      'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"function":{"arguments":"{\\"ruta\\""}}]}}]}',
      "data: [DONE]",
    ]) a.linea(l);
    expect(a.ecos()).toEqual([["call_7", "primero"]]);
  });

  it("una línea rota no tumba el flujo: es contabilidad, no transporte", () => {
    const a = acumuladorDeEcoSse();
    a.linea("data: {roto");
    a.linea('data: {"choices":[{"index":0,"delta":{"reasoning_content":"x","tool_calls":[{"id":"c1"}]}}]}');
    expect(a.ecos()).toEqual([["c1", "x"]]);
  });
});

describe("el fetch que restaura el eco", () => {
  it("apunta lo que vuelve y lo devuelve en la petición siguiente", async () => {
    const memoria = crearMemoriaDeEco();
    const cuerpos: string[] = [];
    const base = (async (_u: unknown, init?: { body?: unknown }) => {
      if (typeof init?.body === "string") cuerpos.push(init.body);
      return new Response(
        JSON.stringify({ choices: [{ message: { reasoning_content: "razoné", tool_calls: [{ id: "call_1" }] } }] }),
        { headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const f = fetchConEcoDeRazonamiento(memoria, base);
    // Primera: la respuesta trae el razonamiento.
    await (await f("https://x/v1/chat/completions", { method: "POST", body: JSON.stringify({ messages: [] }) })).text();
    await new Promise((r) => setTimeout(r, 0));   // el apunte va en segundo plano
    expect(memoria.buscar("call_1")).toBe("razoné");

    // Segunda: el mismo mensaje de asistente sale YA con su eco.
    await f("https://x/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ messages: [{ role: "assistant", tool_calls: [{ id: "call_1" }] }] }),
    });
    expect(cuerpos[1]).toContain("razoné");
  });

  it("un cuerpo que no es JSON se manda tal cual, sin romper nada", async () => {
    const cuerpos: string[] = [];
    const base = (async (_u: unknown, init?: { body?: unknown }) => {
      cuerpos.push(String(init?.body));
      return new Response("ok");
    }) as unknown as typeof fetch;
    await fetchConEcoDeRazonamiento(crearMemoriaDeEco(), base)("https://x", { method: "POST", body: "no soy json" });
    expect(cuerpos[0]).toBe("no soy json");
  });
});
