import { describe, expect, it } from "vitest";
import winston from "winston";
import { AIMessageChunk, type BaseMessage } from "@langchain/core/messages";
import { AgentThread, AgentThreadOrchestrator, ToolSet, EventType, toolResultResponse } from "@truefoundry/trueforge-core/core";
import { NOOP_AGENT_TRACING } from "@truefoundry/trueforge-core/core/tracing/NoopAgentTracing";
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
