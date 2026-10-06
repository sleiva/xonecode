import { describe, expect, it } from "vitest";
import winston from "winston";
import { AIMessageChunk, type BaseMessage } from "@langchain/core/messages";
import { AgentThread, AgentThreadOrchestrator, EventType, NOOP_AGENT_TRACING, ToolSet, toolResultResponse } from "./trueforge.js";
import { aMensajesDeLangchain, modeloParaTrueforge } from "./modeloLangchain.js";

/** Un modelo de LangChain de pega: por cada llamada, un guion de trozos. Apunta lo que recibe. */
function modeloGuionizado(guiones: AIMessageChunk[][]) {
  const recibidos: BaseMessage[][] = [];
  const toolsAtadas: unknown[][] = [];
  const modelo = {
    bindTools(tools: unknown[]) {
      toolsAtadas.push(tools);
      return modelo;
    },
    async stream(mensajes: BaseMessage[]) {
      recibidos.push(mensajes);
      const guion = guiones.shift() ?? [new AIMessageChunk({ content: "" })];
      return (async function* () {
        for (const t of guion) yield t;
      })();
    },
  };
  return { modelo, recibidos, toolsAtadas };
}

describe("el modelo de TrueForge hecho con nuestro modelo de LangChain", () => {
  it("traduce los mensajes de OpenAI a LangChain, con tool calls y respuestas de tool", () => {
    const m = aMensajesDeLangchain([
      { role: "system", content: "reglas" },
      { role: "user", content: "hola" },
      { role: "assistant", content: "", tool_calls: [{ id: "c1", function: { name: "read_file", arguments: '{"file_path":"/a"}' } }] },
      { role: "tool", tool_call_id: "c1", content: "<app/>" },
    ]);
    expect(m.map((x) => x.getType())).toEqual(["system", "human", "ai", "tool"]);
    expect((m[2] as unknown as { tool_calls: { name: string; args: unknown }[] }).tool_calls[0]).toMatchObject({ name: "read_file", args: { file_path: "/a" } });
  });

  it("un turno ENTERO contra el orquestador real: tool call, respuesta, texto final y tokens", async () => {
    const { modelo, recibidos, toolsAtadas } = modeloGuionizado([
      [
        new AIMessageChunk({ content: "Miro. ", tool_call_chunks: [{ index: 0, id: "c1", name: "read_file", args: '{"file_path":' }] }),
        new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, args: '"/app.xml"}' }] }),
        new AIMessageChunk({ content: "", usage_metadata: { input_tokens: 40, output_tokens: 7, total_tokens: 47 } }),
      ],
      [new AIMessageChunk({ content: "Tiene una colección.", usage_metadata: { input_tokens: 60, output_tokens: 5, total_tokens: 65 } })],
    ]);
    const leidos: unknown[] = [];
    const source = {
      name: "xone",
      id: "xone",
      listTools: async () => ({
        result: { tools: [{ name: "read_file", description: "lee", inputSchema: { type: "object", properties: { file_path: { type: "string" } } }, preload: true }] },
        wasInitialized: undefined,
      }),
      callTool: async (p: { arguments?: unknown }) => {
        leidos.push(p.arguments);
        return toolResultResponse({ text: "<app/>" });
      },
      toolCallInfo: async () => ({ type: "mcp", mcp_server_id: "xone", mcp_server_name: "xone", original_tool_name: "read_file" }),
    };
    const logger = winston.createLogger({ silent: true, transports: [] });
    const toolSet = new ToolSet({ source: source as never, selectors: { enableTools: ["@all"], disableTools: [], preloadTools: [], requireApprovalForTools: [] }, preload: true });
    const raiz = new AgentThread({
      definition: { modelClient: modeloParaTrueforge({ modelo: () => modelo }), instruction: "reglas de XOne" },
      threadId: "main",
      title: "main",
      capabilities: [{ systemToolSets: [toolSet] }] as never,
      tracing: NOOP_AGENT_TRACING,
      logger,
    });
    const orq = new AgentThreadOrchestrator({
      agentThreads: new Map([["main", raiz]]),
      createDynamicSubAgentThread: async () => {
        throw new Error("sin subagentes");
      },
      tracing: NOOP_AGENT_TRACING,
      logger,
    });
    for await (const _ of orq.send([{ type: EventType.USER_MESSAGE, content: "¿qué hay?" }] as never)) void _;
    const it2 = orq.execute({ signal: new AbortController().signal });
    let r = await it2.next();
    while (!r.done) r = await it2.next();

    // La tool call llegó ENTERA —sus argumentos venían partidos en dos trozos— y se ejecutó.
    expect(leidos).toEqual([{ file_path: "/app.xml" }]);
    // La segunda llamada al modelo lleva la respuesta de la tool, ya en LangChain.
    expect(recibidos[1]!.map((x) => x.getType())).toContain("tool");
    // Las tools se ataron con la forma de OpenAI, que es la que `bindTools` sabe leer.
    expect(JSON.stringify(toolsAtadas[0])).toContain("read_file");
    const salida = (r.value as { output: { content: string; usage?: { output_tokens: number } } | null }).output!;
    expect(salida.content).toBe("Tiene una colección.");
  }, 20_000);
});

describe("una llamada con los argumentos ROTOS no se pierde", () => {
  /**
   * Medido en la prueba real de las tareas encadenadas: el modelo emitió `proponer_tareas` con unos
   * 3.000 tokens de argumentos que no eran un JSON leíble; LangChain la dejó en `invalid_tool_calls`,
   * este adaptador solo miraba `tool_calls`, y el turno cerró como si el modelo no hubiera llamado a
   * nada. Ahora la llamada sigue, con sus argumentos tal cual: la librería no los puede leer y le
   * contesta al modelo con el error, y el modelo puede repetirla.
   */
  /** Un turno contra el orquestador real con UNA llamada a `read_file` cuyos trozos son `trozos`; devuelve
   *  lo que la tool llegó a recibir y lo que vio el modelo en su segunda llamada. */
  async function turnoConLlamada(trozos: AIMessageChunk[]) {
    const { modelo, recibidos } = modeloGuionizado([trozos, [new AIMessageChunk({ content: "Lo repito." })]]);
    const leidos: unknown[] = [];
    const source = {
      name: "xone",
      id: "xone",
      listTools: async () => ({
        result: { tools: [{ name: "read_file", description: "lee", inputSchema: { type: "object", properties: { file_path: { type: "string" } } }, preload: true }] },
        wasInitialized: undefined,
      }),
      callTool: async (p: { arguments?: unknown }) => {
        leidos.push(p.arguments);
        return toolResultResponse({ text: "<app/>" });
      },
      toolCallInfo: async () => ({ type: "mcp", mcp_server_id: "xone", mcp_server_name: "xone", original_tool_name: "read_file" }),
    };
    const logger = winston.createLogger({ silent: true, transports: [] });
    const toolSet = new ToolSet({ source: source as never, selectors: { enableTools: ["@all"], disableTools: [], preloadTools: [], requireApprovalForTools: [] }, preload: true });
    const raiz = new AgentThread({
      definition: { modelClient: modeloParaTrueforge({ modelo: () => modelo }), instruction: "reglas" },
      threadId: "main",
      title: "main",
      capabilities: [{ systemToolSets: [toolSet] }] as never,
      tracing: NOOP_AGENT_TRACING,
      logger,
    });
    const orq = new AgentThreadOrchestrator({
      agentThreads: new Map([["main", raiz]]),
      createDynamicSubAgentThread: async () => {
        throw new Error("sin subagentes");
      },
      tracing: NOOP_AGENT_TRACING,
      logger,
    });
    for await (const _ of orq.send([{ type: EventType.USER_MESSAGE, content: "lee" }] as never)) void _;
    const it2 = orq.execute({ signal: new AbortController().signal });
    let r = await it2.next();
    while (!r.done) r = await it2.next();
    const respuesta = recibidos[1]?.find((x) => x.getType() === "tool");
    return { leidos, llamadasAlModelo: recibidos.length, respuesta: String(respuesta?.content) };
  }

  it("un JSON que LangChain no puede leer llega al modelo como error de la tool, sin ejecutarse", async () => {
    const r = await turnoConLlamada([
      new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "c1", name: "read_file", args: '{"file_path": /app}' }] }),
    ]);
    expect(r.leidos).toEqual([]);
    expect(r.llamadasAlModelo).toBe(2);
    expect(r.respuesta).toMatch(/JSON|Unexpected/i);
  }, 20_000);

  it("cortada por el TOPE de salida no se ejecuta reparada: falla con su JSON cortado", async () => {
    // Sin el tope, LangChain la «repara» a {file_path:"/app"} y la tool se ejecutaría con el valor cortado.
    const r = await turnoConLlamada([
      new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "c1", name: "read_file", args: '{"file_path":"/app' }] }),
      new AIMessageChunk({ content: "", response_metadata: { finish_reason: "length" } }),
    ]);
    expect(r.leidos).toEqual([]);
    expect(r.respuesta).toMatch(/JSON|Unterminated/i);
  }, 20_000);

  it("y una llamada sana en una respuesta que acabó bien sigue igual", async () => {
    const r = await turnoConLlamada([
      new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "c1", name: "read_file", args: '{"file_path":"/app.xml"}' }] }),
      new AIMessageChunk({ content: "", response_metadata: { finish_reason: "tool_calls" } }),
    ]);
    expect(r.leidos).toEqual([{ file_path: "/app.xml" }]);
  }, 20_000);
});

describe("el uso de una llamada lleva el razonamiento, cuando el proveedor lo dice (IXCODE-18)", () => {
  const cuerpo = { messages: [{ role: "user", content: "hola" }] } as never;
  const usoDe = async (chunk: AIMessageChunk) => {
    const { modelo } = modeloGuionizado([[chunk]]);
    const r = await modeloParaTrueforge({ modelo: () => modelo }).createNonStream(cuerpo);
    return (r as unknown as { usage: Record<string, number> }).usage;
  };

  it("`output_token_details.reasoning` sale como `reasoning_tokens`", async () => {
    const uso = await usoDe(new AIMessageChunk({ content: "396", usage_metadata: { input_tokens: 50, output_tokens: 26, total_tokens: 76, output_token_details: { reasoning: 24 } } }));
    expect(uso).toMatchObject({ input_tokens: 50, output_tokens: 26, reasoning_tokens: 24 });
  });

  it("si el proveedor NO lo dice, no hay `reasoning_tokens`: ausente no es cero", async () => {
    const uso = await usoDe(new AIMessageChunk({ content: "396", usage_metadata: { input_tokens: 50, output_tokens: 26, total_tokens: 76 } }));
    expect(uso).toMatchObject({ output_tokens: 26 });
    expect(uso).not.toHaveProperty("reasoning_tokens");
  });

  it("la caché no pasa de la entrada: Gemini la cuenta dos veces en streaming y la pantalla decía 0 de entrada", async () => {
    const uso = await usoDe(new AIMessageChunk({ content: "x", usage_metadata: { input_tokens: 20097, output_tokens: 5, total_tokens: 20102, input_token_details: { cache_read: 32696 } } }));
    expect(uso["cache_read_tokens"]).toBe(20097);
    const normal = await usoDe(new AIMessageChunk({ content: "x", usage_metadata: { input_tokens: 100, output_tokens: 5, total_tokens: 105, input_token_details: { cache_read: 60 } } }));
    expect(normal["cache_read_tokens"]).toBe(60);
  });

  it("un cero DECLARADO se conserva: el proveedor dijo que no pensó", async () => {
    const uso = await usoDe(new AIMessageChunk({ content: "396", usage_metadata: { input_tokens: 5, output_tokens: 1, total_tokens: 6, output_token_details: { reasoning: 0 } } }));
    expect(uso["reasoning_tokens"]).toBe(0);
  });
});

