/**
 * **El razonamiento por la API Responses** (`apiDeModelos: "responses"`, `core/modelos.ts#apiDeModelosDe`), en el `fetch`
 * del cliente: la misma costura que `ecoDeRazonamiento.ts` para Chat Completions, por las mismas razones.
 *
 * Medido el 05-11-2026 con `@langchain/openai` 1.5.5 (sondas fuera del harness, contra la API real):
 *
 * - **DeepSeek manda el razonamiento como `response.reasoning_text.delta`** (y el item `reasoning` con
 *   `content: [{type: "reasoning_text"}]`), y LangChain solo lee `reasoning_summary_text`: el texto se perdía y el chat
 *   no lo enseñaba. Aquí se RENOMBRA a `reasoning_summary_text`, que LangChain convierte en bloques `reasoning`. Ollama ya
 *   habla el formato estándar (`summary`) y no se toca.
 * - **TrueForge reconstruye los mensajes en cada vuelta** (`modeloLangchain.ts#convertirMensajes`) y no lleva el item
 *   `reasoning` de LangChain: lo que el modelo pensó antes de llamar a una tool no volvía en la petición siguiente. Ni
 *   DeepSeek ni Ollama dan 400 por eso —medido—, pero el modelo pierde su hilo entre tools. Aquí se GUARDA el
 *   razonamiento de cada respuesta por el `call_id` de sus tools, y se REPONE delante de esa llamada si no lo trae, en
 *   el formato de cada uno (`content: reasoning_text` en DeepSeek, `summary: summary_text` en el estándar).
 *
 * **La memoria es por CLIENTE**, como la del eco: los `call_id` viven dentro de una conversación.
 */

export type FormatoDeRazonamiento = "deepseek" | "estandar";

export interface MemoriaDeRazonamiento {
  guardar(callId: string, texto: string): void;
  de(callId: string): string | undefined;
}

/** Cuántos `call_id` recuerda como mucho: los más viejos se olvidan (una sesión larga no crece sin tope). */
export const TOPE_DE_RAZONAMIENTOS_RECORDADOS = 2000;

export function crearMemoriaDeRazonamiento(tope = TOPE_DE_RAZONAMIENTOS_RECORDADOS): MemoriaDeRazonamiento {
  const porLlamada = new Map<string, string>();
  return {
    guardar(callId, texto) {
      if (texto === "") return;
      porLlamada.delete(callId);
      porLlamada.set(callId, texto);
      while (porLlamada.size > tope) porLlamada.delete(porLlamada.keys().next().value as string);
    },
    de: (callId) => porLlamada.get(callId),
  };
}

type Item = { type?: string; call_id?: string; content?: unknown; summary?: unknown; [k: string]: unknown };

const textoDeSummary = (summary: unknown): string =>
  Array.isArray(summary) ? summary.map((s) => (typeof (s as { text?: unknown }).text === "string" ? (s as { text: string }).text : "")).join("") : "";
const textoDeContent = (content: unknown): string =>
  Array.isArray(content)
    ? content.map((c) => ((c as { type?: unknown }).type === "reasoning_text" && typeof (c as { text?: unknown }).text === "string" ? (c as { text: string }).text : "")).join("")
    : "";

/** Un item `reasoning` con `texto`, en el formato que espera cada proveedor. */
export function itemDeRazonamiento(texto: string, formato: FormatoDeRazonamiento): Item {
  return formato === "deepseek"
    ? { type: "reasoning", summary: [], content: [{ type: "reasoning_text", text: texto }] }
    : { type: "reasoning", summary: [{ type: "summary_text", text: texto }] };
}

/**
 * El cuerpo de una petición a `/responses` con el razonamiento REPUESTO: delante del primer `function_call` de cada
 * vuelta del asistente que no lleva ya un `reasoning`, el que se guardó para su `call_id`. Y en DeepSeek, un `reasoning`
 * que LangChain manda con `summary` pasa a `content`, que es lo suyo. Lo que no se entiende se devuelve tal cual.
 */
export function cuerpoConRazonamiento(cuerpo: unknown, memoria: MemoriaDeRazonamiento, formato: FormatoDeRazonamiento): unknown {
  if (cuerpo === null || typeof cuerpo !== "object" || !Array.isArray((cuerpo as { input?: unknown }).input)) return cuerpo;
  const entrada = (cuerpo as { input: Item[] }).input;
  const salida: Item[] = [];
  for (const item of entrada) {
    if (item?.type === "reasoning" && formato === "deepseek" && textoDeContent(item.content) === "") {
      const texto = textoDeSummary(item.summary);
      salida.push(texto === "" ? item : { ...item, ...itemDeRazonamiento(texto, formato) });
      continue;
    }
    if (item?.type === "function_call" && typeof item.call_id === "string") {
      const anterior = salida.at(-1);
      // Dentro de una misma vuelta (varias llamadas seguidas) va UNO, delante de la primera.
      const yaVa = anterior?.type === "reasoning" || anterior?.type === "function_call";
      const texto = memoria.de(item.call_id);
      if (!yaVa && texto !== undefined) salida.push(itemDeRazonamiento(texto, formato));
    }
    salida.push(item);
  }
  return { ...(cuerpo as object), input: salida };
}

/** El estado de UNA respuesta en streaming: lo pensado hasta ahora, para atarlo a sus llamadas. */
export interface EstadoDeRespuesta {
  pensado: string;
}

/**
 * Un evento del streaming, ya parseado: lo que hay que guardar y, en DeepSeek, el evento renombrado. Devuelve el evento
 * que sigue hacia LangChain.
 */
export function eventoConRazonamiento(evento: Record<string, unknown>, estado: EstadoDeRespuesta, memoria: MemoriaDeRazonamiento, formato: FormatoDeRazonamiento): Record<string, unknown> {
  const tipo = evento.type;
  if ((tipo === "response.reasoning_text.delta" || tipo === "response.reasoning_summary_text.delta") && typeof evento.delta === "string") estado.pensado += evento.delta;
  if (tipo === "response.output_item.added" || tipo === "response.output_item.done") {
    const item = evento.item as Item | undefined;
    if (item?.type === "function_call" && typeof item.call_id === "string") memoria.guardar(item.call_id, estado.pensado);
  }
  if (formato !== "deepseek") return evento;
  if (tipo === "response.reasoning_text.delta") return { ...evento, type: "response.reasoning_summary_text.delta", summary_index: 0 };
  if (tipo === "response.reasoning_text.done") return { ...evento, type: "response.reasoning_summary_text.done", summary_index: 0 };
  return evento;
}

/** Una respuesta ENTERA (sin streaming): guarda lo pensado por `call_id` y, en DeepSeek, copia `content` a `summary`. */
export function respuestaConRazonamiento(respuesta: unknown, memoria: MemoriaDeRazonamiento, formato: FormatoDeRazonamiento): unknown {
  const output = (respuesta as { output?: unknown } | null)?.output;
  if (!Array.isArray(output)) return respuesta;
  let pensado = "";
  const nuevos = (output as Item[]).map((item) => {
    if (item?.type === "reasoning") {
      const texto = textoDeContent(item.content) || textoDeSummary(item.summary);
      pensado += texto;
      return formato === "deepseek" && textoDeSummary(item.summary) === "" && texto !== "" ? { ...item, summary: [{ type: "summary_text", text: texto }] } : item;
    }
    if (item?.type === "function_call" && typeof item.call_id === "string") memoria.guardar(item.call_id, pensado);
    return item;
  });
  return { ...(respuesta as object), output: nuevos };
}

/** El SSE línea a línea: cada `data:` con JSON pasa por `eventoConRazonamiento`; lo demás, tal cual. */
function flujoConRazonamiento(cuerpo: ReadableStream<Uint8Array>, memoria: MemoriaDeRazonamiento, formato: FormatoDeRazonamiento): ReadableStream<Uint8Array> {
  const estado: EstadoDeRespuesta = { pensado: "" };
  const decodificador = new TextDecoder();
  const codificador = new TextEncoder();
  let resto = "";
  const linea = (l: string): string => {
    if (l.startsWith("event:") && formato === "deepseek") return l.replace("response.reasoning_text.", "response.reasoning_summary_text.");
    if (!l.startsWith("data:")) return l;
    const dato = l.slice(5).trim();
    if (!dato.startsWith("{")) return l;
    try {
      return `data: ${JSON.stringify(eventoConRazonamiento(JSON.parse(dato) as Record<string, unknown>, estado, memoria, formato))}`;
    } catch {
      return l;
    }
  };
  return cuerpo.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(trozo, control) {
        resto += decodificador.decode(trozo, { stream: true });
        const lineas = resto.split("\n");
        resto = lineas.pop() ?? "";
        if (lineas.length > 0) control.enqueue(codificador.encode(lineas.map(linea).join("\n") + "\n"));
      },
      flush(control) {
        resto += decodificador.decode();
        if (resto !== "") control.enqueue(codificador.encode(linea(resto)));
      },
    })
  );
}

/** El `fetch` del cliente de Responses: repone el razonamiento al pedir y lo recoge (y renombra) al recibir. */
export function fetchConRazonamientoDeResponses(memoria: MemoriaDeRazonamiento, formato: FormatoDeRazonamiento, fetchBase: typeof fetch = fetch): typeof fetch {
  return async (entrada: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    let opciones = init;
    if (typeof init?.body === "string") {
      try {
        opciones = { ...init, body: JSON.stringify(cuerpoConRazonamiento(JSON.parse(init.body), memoria, formato)) };
      } catch {
        // Un cuerpo que no es JSON va tal cual.
      }
    }
    const respuesta = await fetchBase(entrada, opciones);
    if (!respuesta.ok || respuesta.body === null) return respuesta;
    const tipo = respuesta.headers.get("content-type") ?? "";
    if (tipo.includes("text/event-stream")) {
      return new Response(flujoConRazonamiento(respuesta.body, memoria, formato), { status: respuesta.status, statusText: respuesta.statusText, headers: respuesta.headers });
    }
    if (tipo.includes("application/json")) {
      const texto = await respuesta.text();
      let cuerpo = texto;
      try {
        cuerpo = JSON.stringify(respuestaConRazonamiento(JSON.parse(texto), memoria, formato));
      } catch {
        // Lo que no es JSON va tal cual.
      }
      return new Response(cuerpo, { status: respuesta.status, statusText: respuesta.statusText, headers: respuesta.headers });
    }
    return respuesta;
  };
}
