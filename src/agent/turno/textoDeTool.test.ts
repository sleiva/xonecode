import { describe, it, expect } from "vitest";
import { aTexto, esMensajeDeTool, middlewareTextoDeTool } from "./textoDeTool.js";

describe("aTexto", () => {
  it("una cadena se deja tal cual", () => {
    expect(aTexto("hola")).toBe("hola");
  });

  it("bloques de texto se concatenan SIN su envoltorio", () => {
    // `JSON.stringify` daría `[{"type":"text","text":"…"}]` y el modelo tendría que
    // desenterrar el contenido de su propio envoltorio en cada llamada.
    expect(aTexto([{ type: "text", text: "hola " }, { type: "text", text: "mundo" }])).toBe("hola mundo");
  });

  it("un bloque que NO es de texto se declara, no se pierde en silencio", () => {
    expect(aTexto([{ type: "image", data: "…" }])).toBe("[image]");
  });

  it("null y undefined dan cadena vacía, no «null»", () => {
    expect(aTexto(null)).toBe("");
    expect(aTexto(undefined)).toBe("");
  });

  it("un objeto suelto cae a JSON como último recurso", () => {
    expect(aTexto({ a: 1 })).toBe('{"a":1}');
  });

  it("un objeto circular no revienta", () => {
    const c: Record<string, unknown> = {};
    c.yo = c;
    expect(() => aTexto(c)).not.toThrow();
  });
});

describe("esMensajeDeTool", () => {
  it("lo reconoce por `type`, por `role` y por `tool_call_id`", () => {
    expect(esMensajeDeTool({ type: "tool" })).toBe(true);
    expect(esMensajeDeTool({ role: "tool" })).toBe(true);
    expect(esMensajeDeTool({ tool_call_id: "abc" })).toBe(true);
  });

  it("no confunde otros mensajes", () => {
    expect(esMensajeDeTool({ type: "ai", content: "x" })).toBe(false);
    expect(esMensajeDeTool({ tool_call_id: "" })).toBe(false);
    expect(esMensajeDeTool(null)).toBe(false);
  });
});

describe("middlewareTextoDeTool", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const correr = async (messages: unknown[]): Promise<any> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mw = middlewareTextoDeTool() as any;
    let visto: unknown;
    await mw.wrapModelCall({ messages }, (req: unknown) => {
      visto = req;
      return Promise.resolve({});
    });
    return visto;
  };

  it("convierte el contenido en bloques de un ToolMessage", async () => {
    // Este es el caso EXACTO que hacía reventar el turno real:
    // `@langchain/ollama/utils.js:107` lanza si el contenido no es una cadena.
    const req = await correr([
      { type: "tool", tool_call_id: "1", content: [{ type: "text", text: "contenido del fichero" }] },
    ]);
    expect(req.messages[0].content).toBe("contenido del fichero");
  });

  it("NO toca los mensajes que no son de tool", async () => {
    const humano = { type: "human", content: [{ type: "text", text: "hola" }] };
    const req = await correr([humano]);
    expect(req.messages[0]).toBe(humano); // la misma referencia
  });

  it("NO clona si ya era una cadena: sin cambios, sin copia", async () => {
    const tool = { type: "tool", tool_call_id: "1", content: "ya es texto" };
    const req = await correr([tool]);
    expect(req.messages[0]).toBe(tool);
  });

  it("no muta el mensaje original: el historial conserva sus bloques", async () => {
    // Reescribir el estado perdería el contenido estructurado para todo lo demás.
    const bloques = [{ type: "text", text: "x" }];
    const tool = { type: "tool", tool_call_id: "1", content: bloques };
    await correr([tool]);
    expect(tool.content).toBe(bloques);
  });

  it("una petición sin `messages` pasa sin romper", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mw = middlewareTextoDeTool() as any;
    let visto: unknown;
    await mw.wrapModelCall({ sinMensajes: true }, (r: unknown) => {
      visto = r;
      return Promise.resolve({});
    });
    expect(visto).toEqual({ sinMensajes: true });
  });
});
