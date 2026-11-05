import { describe, expect, it } from "vitest";
import winston from "winston";
import { AIMessageChunk, type BaseMessage } from "@langchain/core/messages";
import { AgentThread, AgentThreadOrchestrator, EventType, NOOP_AGENT_TRACING, ToolSet, toolResultResponse } from "./trueforge.js";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { CORTES_SEGUIDOS_ANTES_DE_PARAR, aMensajesDeLangchain, cortadaPorTopeDeSalida, modeloParaTrueforge } from "./modeloLangchain.js";

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
    const toolSet = new ToolSet({ source: source as never, selectors: { enableTools: ["@all"], disableTools: [], preloadTools: [], requireApprovalForTools: [] }, preload: true, approvalPolicies: undefined });
    const raiz = new AgentThread({
      definition: { modelClient: modeloParaTrueforge({ modelo: () => modelo }), modelName: "prueba", instruction: "reglas de XOne" },
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
    return turnoConGuiones([trozos, [new AIMessageChunk({ content: "Lo repito." })]]);
  }

  /** Lo mismo con un guion por llamada al modelo; `ultimo` es el texto con el que acabó el hilo. */
  async function turnoConGuiones(guiones: AIMessageChunk[][], extra: Partial<Parameters<typeof modeloParaTrueforge>[0]> = {}) {
    const { modelo, recibidos } = modeloGuionizado(guiones);
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
    const toolSet = new ToolSet({ source: source as never, selectors: { enableTools: ["@all"], disableTools: [], preloadTools: [], requireApprovalForTools: [] }, preload: true, approvalPolicies: undefined });
    const raiz = new AgentThread({
      definition: { modelClient: modeloParaTrueforge({ modelo: () => modelo, ...extra }), modelName: "prueba", instruction: "reglas" },
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
    const mensajes = (raiz.toSnapshot() as { context?: { role: string; content?: unknown }[] }).context ?? [];
    const ultimo = String([...mensajes].reverse().find((m) => m.role === "assistant")?.content ?? "");
    return { leidos, llamadasAlModelo: recibidos.length, respuesta: String(respuesta?.content), recibidos, ultimo };
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

  /** Una respuesta cortada a mitad de `write_file`, con el corte como lo deja `@langchain/anthropic` en streaming. */
  const cortadaComoAnthropic = (idDeLlamada: string) => [
    new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: idDeLlamada, name: "read_file", args: '{"file_path":"/planes/TASKS.md","content":"# Tar' }] }),
    new AIMessageChunk({ content: "", additional_kwargs: { stop_reason: "max_tokens" }, usage_metadata: { input_tokens: 10, output_tokens: 32_768, total_tokens: 32_778 } }),
  ];

  it("el corte de Claude (stop_reason en additional_kwargs) tampoco se ejecuta reparado, y el modelo sabe por qué", async () => {
    // Medido en Maset: con Anthropic `finish_reason` no llega, la llamada salía reparada y se ejecutaba.
    const r = await turnoConLlamada(cortadaComoAnthropic("c1"));
    expect(r.leidos).toEqual([]);
    expect(r.respuesta).toMatch(/TOPE DE SALIDA/);
    expect(r.respuesta).toContain("32768");
    expect(r.respuesta).toContain("/planes/TASKS.md");
    expect(r.respuesta).toMatch(/JSON|Unterminated/i);
  }, 20_000);

  it(`tras ${CORTES_SEGUIDOS_ANTES_DE_PARAR} cortes seguidos no se vuelve a llamar al modelo: el hilo cierra diciéndolo`, async () => {
    const r = await turnoConGuiones([cortadaComoAnthropic("c1"), cortadaComoAnthropic("c2"), [new AIMessageChunk({ content: "no debería llegar" })]]);
    expect(r.leidos).toEqual([]);
    expect(r.llamadasAlModelo).toBe(CORTES_SEGUIDOS_ANTES_DE_PARAR);
    expect(r.ultimo).toMatch(/No he podido terminar/);
    expect(r.ultimo).toContain("/planes/TASKS.md");
  }, 20_000);

  it("una respuesta sana entre dos cortes reinicia la cuenta", async () => {
    const sana = [
      new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "s1", name: "read_file", args: '{"file_path":"/app.xml"}' }] }),
      new AIMessageChunk({ content: "", response_metadata: { finish_reason: "tool_calls" } }),
    ];
    const r = await turnoConGuiones([cortadaComoAnthropic("c1"), sana, cortadaComoAnthropic("c2"), [new AIMessageChunk({ content: "Hecho." })]]);
    expect(r.llamadasAlModelo).toBe(4);
    expect(r.leidos).toEqual([{ file_path: "/app.xml" }]);
    expect(r.ultimo).toBe("Hecho.");
  }, 20_000);

  it("`alCerrar`: una respuesta que cerraría el hilo sigue con la llamada que devuelve, con lo dicho como dato", async () => {
    const dichos: string[] = [];
    let veces = 0;
    const r = await turnoConGuiones([[new AIMessageChunk({ content: "T1 hecha." })], [new AIMessageChunk({ content: "Fin." })]], {
      alCerrar: (texto) => {
        dichos.push(texto);
        return veces++ === 0 ? { name: "read_file", argumentos: JSON.stringify({ file_path: "/siguiente" }) } : undefined;
      },
    });
    expect(r.leidos).toEqual([{ file_path: "/siguiente" }]);
    expect(dichos).toEqual(["T1 hecha.", "Fin."]);
    expect(r.llamadasAlModelo).toBe(2);
    expect(r.ultimo).toBe("Fin.");
  }, 20_000);

  it("y una llamada sana en una respuesta que acabó bien sigue igual", async () => {
    const r = await turnoConLlamada([
      new AIMessageChunk({ content: "", tool_call_chunks: [{ index: 0, id: "c1", name: "read_file", args: '{"file_path":"/app.xml"}' }] }),
      new AIMessageChunk({ content: "", response_metadata: { finish_reason: "tool_calls" } }),
    ]);
    expect(r.leidos).toEqual([{ file_path: "/app.xml" }]);
  }, 20_000);
});

describe("cortadaPorTopeDeSalida, contra el cliente de Anthropic de verdad", () => {
  it("su stream con stop_reason max_tokens se reconoce, aunque response_metadata no lo traiga", async () => {
    const cliente = new ChatAnthropic({ model: "claude-sonnet-5-5", apiKey: "sk-ant-de-pega", maxTokens: 32_768 });
    const eventos = [
      { type: "message_start", message: { id: "m1", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 1 } } },
      { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t1", name: "write_file", input: {} } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"file_path":"/planes/TASKS.md","content":"# Tar' } },
      { type: "message_delta", delta: { stop_reason: "max_tokens", stop_sequence: null }, usage: { output_tokens: 32_768 } },
      { type: "message_stop" },
    ];
    (cliente as unknown as { createStreamWithRetry: () => Promise<unknown> }).createStreamWithRetry = async () => ({
      async *[Symbol.asyncIterator]() {
        for (const e of eventos) yield e;
      },
      controller: new AbortController(),
    });
    let acumulado: AIMessageChunk | undefined;
    for await (const t of await cliente.stream("hola")) acumulado = acumulado === undefined ? t : acumulado.concat(t);
    // La forma medida: LangChain «repara» los argumentos y el corte solo consta en additional_kwargs.
    expect(acumulado?.tool_calls?.[0]?.args).toEqual({ file_path: "/planes/TASKS.md", content: "# Tar" });
    expect((acumulado?.response_metadata as { finish_reason?: unknown }).finish_reason).toBeUndefined();
    expect(cortadaPorTopeDeSalida(acumulado)).toBe(true);
  });

  it("una respuesta que acabó bien no cuenta como cortada", () => {
    expect(cortadaPorTopeDeSalida(new AIMessageChunk({ content: "ok", additional_kwargs: { stop_reason: "end_turn" } }))).toBe(false);
    expect(cortadaPorTopeDeSalida(new AIMessageChunk({ content: "ok", response_metadata: { finish_reason: "stop" } }))).toBe(false);
  });
});

/**
 * La API Responses (`apiDeModelos: "responses"`): el corte solo consta en `status: "incomplete"` con
 * `incomplete_details.reason: "max_output_tokens"`, y LangChain da el `write_file` a medias por bueno (señalado en una
 * revisión y reproducido con el cliente de verdad, 05-11-2026).
 */
describe("cortadaPorTopeDeSalida, con la API Responses de verdad", () => {
  const sse = (cortada: boolean): string => {
    const ev = (o: { type: string }) => `event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`;
    const resp = { id: "r1", object: "response", created_at: 0, model: "deepseek-flash", output: [], usage: null };
    return [
      ev({ type: "response.created", sequence_number: 0, response: { ...resp, status: "in_progress" } } as never),
      ev({ type: "response.output_item.added", sequence_number: 1, output_index: 0, item: { type: "function_call", id: "fc1", call_id: "c1", name: "write_file", arguments: "" } } as never),
      ev({ type: "response.function_call_arguments.delta", sequence_number: 2, output_index: 0, item_id: "fc1", delta: cortada ? '{"file_path":"/a.md","content":"medio fich' : '{"file_path":"/a.md","content":"entero"}' } as never),
      ev(
        (cortada
          ? { type: "response.incomplete", sequence_number: 3, response: { ...resp, status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, usage: { input_tokens: 10, output_tokens: 8, total_tokens: 18 } } }
          : { type: "response.completed", sequence_number: 3, response: { ...resp, status: "completed", usage: { input_tokens: 10, output_tokens: 8, total_tokens: 18 } } }) as never
      ),
    ].join("");
  };
  const cliente = (cortada: boolean) =>
    new ChatOpenAI({
      model: "deepseek-flash",
      apiKey: "sk-de-pega",
      useResponsesApi: true,
      configuration: { baseURL: "https://x", fetch: (async () => new Response(sse(cortada), { status: 200, headers: { "content-type": "text/event-stream" } })) as typeof fetch },
    });

  it("su stream incompleto por el tope se reconoce, aunque LangChain «repare» la llamada; uno completo, no", async () => {
    for (const cortada of [true, false]) {
      let acumulado: AIMessageChunk | undefined;
      for await (const t of await cliente(cortada).stream("hola")) acumulado = acumulado === undefined ? t : acumulado.concat(t);
      expect(acumulado?.tool_calls?.[0]?.name).toBe("write_file");
      expect(cortadaPorTopeDeSalida(acumulado)).toBe(cortada);
    }
  });

  it("y el adaptador de TrueForge entrega los argumentos CRUDOS, que fallan, con la nota del corte: no medio fichero", async () => {
    const r = (await modeloParaTrueforge({ modelo: () => cliente(true) }).createNonStream({ messages: [{ role: "user", content: "escribe" }] } as never)) as {
      output: { tool_calls?: { function: { name: string; arguments: string } }[] };
    };
    const llamada = r.output.tool_calls?.[0];
    expect(llamada?.function.name).toBe("write_file");
    expect(llamada?.function.arguments).toBe('{"file_path":"/a.md","content":"medio fich');
    expect(() => JSON.parse(llamada!.function.arguments)).toThrow();
  });
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

/** `view_image` (`agent/grafo/verImagen.ts`): la imagen va al MISMO modelo, detrás de las respuestas de tool. */
describe("view_image en la conversación", () => {
  const IMG = { base64: "AAAA", mime: "image/png", ruta: "/artefactos/c.png" };
  it("la imagen marcada va en un mensaje DETRÁS del bloque de respuestas, nunca entre dos, y se rehace igual", () => {
    const mensajes = [
      { role: "user", content: "prueba" },
      { role: "assistant", content: "", tool_calls: [{ id: "a", type: "function", function: { name: "view_image", arguments: "{}" } }, { id: "b", type: "function", function: { name: "ls", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "a", content: "⟦imagen:0123456789abcdef⟧ /artefactos/c.png va justo debajo" },
      { role: "tool", tool_call_id: "b", content: "x" },
      { role: "assistant", content: "la veo" },
    ] as never;
    const de = (id: string) => (id === "0123456789abcdef" ? IMG : undefined);
    const r = aMensajesDeLangchain(mensajes, de);
    expect(r.map((m) => m.getType())).toEqual(["human", "ai", "tool", "tool", "human", "ai"]);
    expect(JSON.stringify(r[4]!.content)).toContain("data:image/png;base64,AAAA");
    expect(JSON.stringify(aMensajesDeLangchain(mensajes, de))).toBe(JSON.stringify(r));
    // Sin el registro, la conversión no cambia.
    expect(aMensajesDeLangchain(mensajes).map((m) => m.getType())).toEqual(["human", "ai", "tool", "tool", "ai"]);
  });

  it("una imagen que ya no está se dice en texto, sin romper la conversación", () => {
    const r = aMensajesDeLangchain([{ role: "tool", tool_call_id: "a", content: "⟦imagen:ffffffffffffffff⟧" }] as never, () => undefined);
    expect(JSON.stringify(r[1]!.content)).toContain("ya no está");
  });
});


/**
 * El CONTRATO de la librería que da el paralelismo de herramientas (`docs/PARALELISMO-TRUEFORGE.md` §2 y §4, entrega A):
 * las tools de UNA respuesta del modelo corren a la vez (`executeToolCalls`, `Promise.all`), y el paso siguiente del
 * modelo espera al lote entero. Con barrera: cada llamada espera a que entre la otra; en serie, no se vería nunca.
 */
describe("CONTRATO: las tools de una respuesta corren a la vez", () => {
  it("dos lecturas de la misma respuesta están DENTRO a la vez, y el modelo no vuelve hasta que acaban las dos", async () => {
    const { modelo, recibidos } = modeloGuionizado([
      [new AIMessageChunk({ content: "", tool_call_chunks: [
        { index: 0, id: "r1", name: "read_file", args: '{"file_path":"/a.xne"}' },
        { index: 1, id: "r2", name: "read_file", args: '{"file_path":"/b.xne"}' },
      ] })],
      [new AIMessageChunk({ content: "Leídas." })],
    ]);
    let dentro = 0;
    let maximo = 0;
    let avisar: (() => void) | undefined;
    const lasDos = new Promise<void>((r) => (avisar = r));
    const source = {
      name: "xone",
      id: "xone",
      listTools: async () => ({
        result: { tools: [{ name: "read_file", description: "lee", inputSchema: { type: "object", properties: { file_path: { type: "string" } } }, preload: true }] },
        wasInitialized: undefined,
      }),
      callTool: async () => {
        dentro++;
        maximo = Math.max(maximo, dentro);
        if (dentro === 2) avisar?.();
        const vista = await Promise.race([lasDos.then(() => "juntas"), new Promise<string>((r) => setTimeout(() => r("sola"), 5_000))]);
        dentro--;
        return toolResultResponse({ text: vista });
      },
      toolCallInfo: async () => ({ type: "mcp", mcp_server_id: "xone", mcp_server_name: "xone", original_tool_name: "read_file" }),
    };
    const logger = winston.createLogger({ silent: true, transports: [] });
    const toolSet = new ToolSet({ source: source as never, selectors: { enableTools: ["@all"], disableTools: [], preloadTools: [], requireApprovalForTools: [] }, preload: true, approvalPolicies: undefined });
    const raiz = new AgentThread({
      definition: { modelClient: modeloParaTrueforge({ modelo: () => modelo }), modelName: "prueba", instruction: "reglas" },
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
    for await (const _ of orq.send([{ type: EventType.USER_MESSAGE, content: "lee las dos" }] as never)) void _;
    const it2 = orq.execute({ signal: new AbortController().signal });
    let r = await it2.next();
    while (!r.done) r = await it2.next();
    expect(maximo).toBe(2);
    expect(recibidos).toHaveLength(2);
    const respuestas = recibidos[1]!.filter((x) => x.getType() === "tool").map((x) => String(x.content));
    expect(respuestas).toEqual(["juntas", "juntas"]);
  }, 20_000);
});
