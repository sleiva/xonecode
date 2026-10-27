/**
 * El modelo de TrueForge (`ILLM`) hecho con NUESTRO modelo de LangChain.
 *
 * TrueForge trae su propio cliente (`VercelAILLM`), que construye el modelo desde una
 * configuración de proveedor. No se usa, y es la decisión que hace el motor intercambiable sin
 * que se note: nuestros modelos salen de `Modelos.paraPapel()` ya con todo lo que se les ha ido
 * poniendo —el `user_id` de DeepSeek, el eco de su razonamiento, el tope de salida y el
 * pensamiento adaptativo de Claude, el esfuerzo por modelo—, y reconstruirlos con la
 * configuración de TrueForge lo perdería todo en silencio.
 *
 * El contrato de TrueForge habla en la forma de las chat completions de OpenAI, así que esto es
 * una traducción en los dos sentidos: los mensajes que manda a mensajes de LangChain, y el stream
 * de LangChain a los fragmentos que espera.
 *
 * **La cancelación entra por aquí**: `ILLM.create` no recibe señal, así que la de la llamada en
 * curso se pide a `senal()` en cada `create`, y quien corre el turno la pone.
 */
import { AIMessage, AIMessageChunk, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import type { ExtendedChatCompletionChunk, ILLM, LLMCreateParams, LLMCreateParamsStreaming, RawAssistantMessageWithUsage } from "./trueforge.js";
import { razonamientoDe, razonamientoVisibleDe, textoDe } from "../../turno/puente.js";

/** Lo que llega al padre si, tras un corte, el resumen no dejó texto. */
const RELLENO_DEL_CORTE = "[Detenido a petición de la persona a mitad de una llamada, antes de poder resumir lo hecho.]";

/**
 * Tras cuántas respuestas SEGUIDAS cortadas por el tope de salida con una tool call dentro ya no se
 * vuelve a llamar al modelo. Medido en el soporte de Maset (27-10-2026): un analista de Sonnet 5.5
 * repitió 30 veces el mismo `write_file` de `TASKS.md`, cada vuelta cortada en 16.384 de salida —unos
 * 490 k tokens y 52 minutos— hasta que la persona canceló. Con la nota del corte (`notaDelCorte`) el
 * modelo tiene UNA ocasión de partir el trabajo; si la segunda también se corta, no va a cambiar.
 */
export const CORTES_SEGUIDOS_ANTES_DE_PARAR = 2;

/**
 * ¿Acabó la respuesta por TOPE de salida? Cada cliente lo dice en un sitio: los compatibles con
 * OpenAI, `response_metadata.finish_reason: "length"`; `@langchain/anthropic` 1.5.2 en streaming deja
 * el `stop_reason: "max_tokens"` del `message_delta` en `additional_kwargs` (medido con el cliente de
 * verdad: `response_metadata` no trae nada). Mirar solo el primero dejaba pasar los cortes de Claude, y
 * LangChain «reparaba» su `write_file`: medio fichero escrito sin avisar.
 */
export function cortadaPorTopeDeSalida(mensaje: AIMessageChunk | undefined): boolean {
  if (mensaje === undefined) return false;
  const meta = mensaje.response_metadata as { finish_reason?: unknown; stop_reason?: unknown } | undefined;
  const extra = mensaje.additional_kwargs as { stop_reason?: unknown } | undefined;
  return meta?.finish_reason === "length" || meta?.stop_reason === "max_tokens" || extra?.stop_reason === "max_tokens";
}

/** La ruta que nombran unos argumentos, aunque estén cortados: es lo que se lee primero. */
function rutaDeArgumentos(argumentos: string): string | undefined {
  return /"(?:file_path|path)"\s*:\s*"([^"]{1,300})"/.exec(argumentos)?.[1];
}

/**
 * Lo que se le antepone a la respuesta de una tool call que se cortó: sin esto el modelo solo ve el
 * error del JSON y repite la MISMA llamada, que se vuelve a cortar.
 */
function notaDelCorte(tool: string, argumentos: string, salida: number): string {
  const ruta = rutaDeArgumentos(argumentos);
  return (
    `[Cortada por el TOPE DE SALIDA] Tu respuesta llegó al máximo de tokens de salida${salida > 0 ? ` (${salida})` : ""} ` +
    `en mitad de esta llamada a \`${tool}\`${ruta === undefined ? "" : ` sobre \`${ruta}\``}: sus argumentos llegaron incompletos ` +
    "y NO se ha ejecutado. No la repitas igual: volvería a cortarse. Parte el trabajo en piezas más pequeñas: un " +
    "documento largo (un .md, un plan, /doc/) se escribe por partes —la primera con `write_file` y cada sección o fase " +
    "siguiente con `write_file` y `append: true`—; el código, con varios `edit_file`, o repartido en varios ficheros."
  );
}

/** Con lo que se cierra el hilo tras `CORTES_SEGUIDOS_ANTES_DE_PARAR` cortes: lo lee quien lo llamó o la persona. */
function textoDelParoPorCortes(ruta: string | undefined): string {
  return (
    `No he podido terminar: ${CORTES_SEGUIDOS_ANTES_DE_PARAR} respuestas seguidas se cortaron al llegar al máximo de ` +
    `salida${ruta === undefined ? "" : ` intentando escribir \`${ruta}\``}, y no se aplicó ninguna. Hay que partir ese ` +
    "trabajo en piezas más pequeñas (un documento, por partes con `append`; un plan, una fase por llamada) y volver a pedirlo."
  );
}

/** Lo mínimo que se usa de un modelo de LangChain: atarle las tools y pedirle un stream. */
interface ModeloDeLangchain {
  bindTools?: (tools: unknown[]) => ModeloDeLangchain;
  stream: (mensajes: BaseMessage[], opciones?: { signal?: AbortSignal }) => Promise<AsyncIterable<AIMessageChunk>>;
}

type MensajeOpenAi = {
  role: string;
  content?: unknown;
  tool_calls?: { id: string; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  reasoning_content?: string;
};

/** El texto de un `content` de OpenAI, sea cadena o lista de partes. */
function textoDeContenido(contenido: unknown): string {
  if (typeof contenido === "string") return contenido;
  if (!Array.isArray(contenido)) return "";
  return contenido
    .map((p) => (typeof p === "object" && p !== null && (p as { type?: string }).type === "text" ? String((p as { text: unknown }).text) : ""))
    .join("");
}

/** Los argumentos de una tool call, que en OpenAI viajan como cadena JSON. Rotos = `{}`. */
function argumentosDe(json: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(json);
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Los mensajes que manda TrueForge, en mensajes de LangChain. */
export function aMensajesDeLangchain(mensajes: readonly MensajeOpenAi[]): BaseMessage[] {
  return mensajes.map((m): BaseMessage => {
    switch (m.role) {
      case "system":
      case "developer":
        return new SystemMessage(textoDeContenido(m.content));
      case "assistant":
        return new AIMessage({
          content: textoDeContenido(m.content),
          tool_calls: (m.tool_calls ?? []).map((t) => ({ id: t.id, name: t.function.name, args: argumentosDe(t.function.arguments), type: "tool_call" as const })),
          // El razonamiento de la vuelta anterior, por si el proveedor lo exige de vuelta
          // (DeepSeek): el eco lo repone por id de tool call, pero no se tira si viene.
          ...(m.reasoning_content === undefined ? {} : { additional_kwargs: { reasoning_content: m.reasoning_content } }),
        });
      case "tool":
        return new ToolMessage({ tool_call_id: m.tool_call_id ?? "", content: textoDeContenido(m.content) });
      default:
        // `user` y cualquier otro rol: el contenido tal cual, que puede traer imágenes.
        return new HumanMessage({ content: (typeof m.content === "string" || Array.isArray(m.content) ? m.content : "") as never });
    }
  });
}

/**
 * Un `ILLM` sobre un modelo de LangChain. `modelo` y `senal` son funciones y no valores: el modelo
 * cambia con `/modelo` sin rehacer el hilo, y la señal es la de la llamada EN CURSO.
 */
export function modeloParaTrueforge(opciones: {
  modelo: () => unknown;
  senal?: () => AbortSignal | undefined;
  nombre?: string;
  /**
   * DETENER (`detencion.ts`): mientras devuelva un texto, la respuesta NO lleva tool calls —se
   * tiran del stream y del mensaje final— y, si no queda texto, lleva ése. Una respuesta sin tool
   * calls cierra el hilo. Se pregunta en cada llamada.
   */
  soloTexto?: () => string | undefined;
  /** Cuántas tool calls se tiraron por `soloTexto`: la medida de si el filtro hace falta. */
  alTirarLlamadas?: (cuantas: number) => void;
  /**
   * DETENER a MITAD de una llamada: la señal que corta SOLO el stream de este hijo —no el turno—
   * y la orden con la que se le pide el resumen. Si se aborta mientras genera, la llamada no
   * falla: se relanza en el acto con lo que ya había dicho y la orden al final, sin tool calls, y
   * a la librería le llega UNA respuesta normal de texto —que cierra el hilo—. Se pregunta al
   * empezar cada llamada; con `soloTexto` ya activo no hace falta (la orden llegó antes).
   */
  corte?: () => { senal: AbortSignal; orden: () => string } | undefined;
  /**
   * Cuántos de los tokens de salida de una llamada fueron RAZONAMIENTO. La librería reconstruye el
   * uso de sus eventos sin ese campo, así que se avisa aquí, a la salida del adaptador, con los
   * tokens de salida para emparejarlo con el evento.
   */
  alRazonar?: (salida: number, razonamiento: number) => void;
}): ILLM {
  let secuencia = 0;
  /** Las tool calls cortadas por el tope, por id, con su nota: se reponen IGUAL en cada llamada, que la caché lo agradece. */
  const notasDeCorte = new Map<string, string>();
  /** Respuestas seguidas cortadas con una tool call dentro, y la ruta de la última. */
  let cortesSeguidos = 0;
  let rutaDelUltimoCorte: string | undefined;

  async function* crear(cuerpo: LLMCreateParamsStreaming | LLMCreateParams): AsyncGenerator<
    ExtendedChatCompletionChunk,
    RawAssistantMessageWithUsage,
    unknown
  > {
    const base = opciones.modelo() as ModeloDeLangchain;
    const tools = (cuerpo as { tools?: unknown[] }).tools ?? [];
    const modelo = tools.length > 0 && typeof base.bindTools === "function" ? base.bindTools(tools) : base;
    const mensajes = aMensajesDeLangchain(
      (cuerpo as { messages: MensajeOpenAi[] }).messages.map((m) => {
        const nota = m.role === "tool" && m.tool_call_id !== undefined ? notasDeCorte.get(m.tool_call_id) : undefined;
        return nota === undefined ? m : { ...m, content: `${nota}\n\n${textoDeContenido(m.content)}` };
      }),
    );
    const senal = opciones.senal?.();
    const id = `xc-${++secuencia}`;
    const creado = Math.floor(Date.now() / 1000);
    const nombre = opciones.nombre ?? "xonecode";
    let relleno = opciones.soloTexto?.();
    const corte = relleno === undefined ? opciones.corte?.() : undefined;

    // Tras `CORTES_SEGUIDOS_ANTES_DE_PARAR` cortes seguidos no se llama al modelo: el hilo se cierra
    // con texto, como al detener, y lo lee quien lo llamó. Una respuesta sin tool calls cierra el hilo.
    if (relleno === undefined && cortesSeguidos >= CORTES_SEGUIDOS_ANTES_DE_PARAR) {
      const texto = textoDelParoPorCortes(rutaDelUltimoCorte);
      cortesSeguidos = 0;
      rutaDelUltimoCorte = undefined;
      yield {
        id,
        object: "chat.completion.chunk",
        created: creado,
        model: nombre,
        choices: [{ index: 0, delta: { role: "assistant", content: texto }, finish_reason: null }],
      } as ExtendedChatCompletionChunk;
      return {
        output: { role: "assistant", content: texto },
        usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
        finish_reason: "stop",
      } as RawAssistantMessageWithUsage;
    }

    const senalDelStream =
      corte === undefined ? senal : senal === undefined ? corte.senal : AbortSignal.any([senal, corte.senal]);
    let acumulado: AIMessageChunk | undefined;
    /** Los trozos de UNA pasada: la normal y, si se corta, la del resumen. */
    const pasada = async function* (lista: BaseMessage[], s: AbortSignal | undefined): AsyncGenerator<AIMessageChunk> {
      for await (const trozo of await modelo.stream(lista, s === undefined ? {} : { signal: s })) yield trozo;
    };
    let trozos = pasada(mensajes, senalDelStream);
    for (;;) {
      let r: IteratorResult<AIMessageChunk>;
      try {
        r = await trozos.next();
      } catch (e) {
        // Un aborto que es SOLO del corte —no del turno— no es un fallo: se pide el resumen.
        if (corte === undefined || !corte.senal.aborted || senal?.aborted === true || relleno !== undefined) throw e;
        relleno = RELLENO_DEL_CORTE;
        const dicho = acumulado === undefined ? "" : textoDe(acumulado);
        acumulado = undefined;
        trozos = pasada([...mensajes, ...(dicho.trim() === "" ? [] : [new AIMessage(dicho)]), new HumanMessage(corte.orden())], senal);
        continue;
      }
      if (r.done === true) break;
      const trozo = r.value;
      acumulado = acumulado === undefined ? trozo : acumulado.concat(trozo);
      const texto = textoDe(trozo);
      // En los TROZOS va el razonamiento que se ENSEÑA, DeepSeek incluido: los trozos solo
      // alimentan los eventos del chat. El mensaje que se guarda en el hilo es el `output` de
      // abajo, que sigue con `razonamientoDe` — lo de DeepSeek no entra en la memoria.
      const pensado = razonamientoVisibleDe(trozo);
      const llamadas = (relleno === undefined ? (trozo.tool_call_chunks ?? []) : []).map((t, i) => ({
        index: t.index ?? i,
        ...(t.id === undefined ? {} : { id: t.id, type: "function" as const }),
        function: { ...(t.name === undefined ? {} : { name: t.name }), arguments: t.args ?? "" },
      }));
      if (texto === "" && pensado === "" && llamadas.length === 0) continue;
      yield {
        id,
        object: "chat.completion.chunk",
        created: creado,
        model: nombre,
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              ...(texto === "" ? {} : { content: texto }),
              ...(pensado === "" ? {} : { reasoning_content: pensado }),
              ...(llamadas.length === 0 ? {} : { tool_calls: llamadas }),
            },
            finish_reason: null,
          },
        ],
      } as ExtendedChatCompletionChunk;
    }

    const pedidas = acumulado?.tool_calls ?? [];
    /**
     * **Una llamada con los argumentos rotos no se pierde, ni se ejecuta a medias.** Dos casos, medidos:
     * - LangChain no pudo leer el JSON y la dejó en `invalid_tool_calls`. Solo se miraba `tool_calls`, y
     *   en la prueba real de las tareas encadenadas el turno cerró como si `proponer_tareas` no se
     *   hubiera llamado. Ahora sigue con sus argumentos TAL CUAL: el núcleo de TrueForge no los puede
     *   leer y le contesta al modelo con el error del JSON (`executeToolCalls`), que puede repetirla.
     * - La respuesta acabó por TOPE de salida (`cortadaPorTopeDeSalida`): LangChain «repara» un JSON
     *   cortado —cierra comillas y llaves— y lo da por bueno, así que un `write_file` cortado escribiría
     *   medio fichero sin avisar. Ahí van los argumentos CRUDOS, sin reparar, y fallan igual; y su
     *   respuesta lleva delante la nota del corte (`notasDeCorte`).
     */
    const cortadaPorTope = cortadaPorTopeDeSalida(acumulado);
    const crudos = new Map<string, string>();
    for (const t of acumulado?.tool_call_chunks ?? []) if (t.id !== undefined) crudos.set(t.id, t.args ?? "");
    const ilegibles = (acumulado?.invalid_tool_calls ?? []).filter((t) => t.name !== undefined);
    const todas: { id?: string | undefined; name: string; argumentos: string }[] = [
      ...pedidas.map((t) => ({
        id: t.id,
        name: t.name,
        argumentos: cortadaPorTope && t.id !== undefined && crudos.has(t.id) ? crudos.get(t.id)! : JSON.stringify(t.args ?? {}),
      })),
      ...ilegibles.map((t) => ({ id: t.id, name: t.name!, argumentos: t.args ?? "" })),
    ];
    const llamadas = (relleno === undefined ? todas : []).map((t, i) => ({ ...t, id: t.id ?? `${id}-${i}` }));
    if (relleno !== undefined && todas.length > 0) opciones.alTirarLlamadas?.(todas.length);
    const uso = acumulado?.usage_metadata;
    if (llamadas.length > 0) {
      if (cortadaPorTope) {
        cortesSeguidos++;
        for (const t of llamadas) notasDeCorte.set(t.id, notaDelCorte(t.name, t.argumentos, uso?.output_tokens ?? 0));
        rutaDelUltimoCorte = llamadas.map((t) => rutaDeArgumentos(t.argumentos)).find((r) => r !== undefined);
      } else {
        cortesSeguidos = 0;
      }
    }
    const razonamiento = acumulado === undefined ? "" : razonamientoDe(acumulado);
    const contenido = acumulado === undefined ? "" : textoDe(acumulado);
    if (uso?.output_token_details?.reasoning !== undefined) opciones.alRazonar?.(uso.output_tokens ?? 0, uso.output_token_details.reasoning);
    return {
      output: {
        role: "assistant",
        content: relleno !== undefined && contenido.trim() === "" ? relleno : contenido,
        ...(llamadas.length === 0
          ? {}
          : {
              tool_calls: llamadas.map((t) => ({
                id: t.id,
                type: "function" as const,
                function: { name: t.name, arguments: t.argumentos },
              })),
            }),
        ...(razonamiento === "" ? {} : { reasoning_content: razonamiento }),
      },
      usage: {
        input_tokens: uso?.input_tokens ?? 0,
        output_tokens: uso?.output_tokens ?? 0,
        total_tokens: uso?.total_tokens ?? 0,
        // La caché es una PARTE de la entrada y no puede superarla: la MISMA cota que
        // `vendor/tokenTracking.ts`, que este motor no heredaba. Medido con Gemini en MyAllXOne:
        // `@langchain/google-genai` suma `cache_read` dos veces en streaming, una sesión acabó con
        // 5,8 M de caché sobre 3,6 M de entrada, y la pantalla («entrada − caché») decía 0 de entrada.
        ...(uso?.input_token_details?.cache_read === undefined
          ? {}
          : { cache_read_tokens: Math.min(uso.input_token_details.cache_read, uso.input_tokens ?? 0) }),
        // De los tokens de salida, cuántos fueron RAZONAMIENTO (DeepSeek y los modelos que lo declaran). Ausente
        // = el proveedor no lo dice, que no es lo mismo que cero: por eso no se rellena con 0.
        ...(uso?.output_token_details?.reasoning === undefined ? {} : { reasoning_tokens: uso.output_token_details.reasoning }),
      },
      finish_reason: llamadas.length > 0 ? "tool_calls" : "stop",
    } as RawAssistantMessageWithUsage;
  }

  return {
    create: (cuerpo) => crear(cuerpo),
    // La compactación de contexto de TrueForge pide una respuesta entera: el mismo camino,
    // agotado.
    createNonStream: async (cuerpo) => {
      const it = crear(cuerpo);
      let r = await it.next();
      while (!r.done) r = await it.next();
      return r.value;
    },
  };
}
