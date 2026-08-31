/**
 * Convierte a TEXTO el contenido de los `ToolMessage` antes de mandárselo al modelo.
 *
 * ## El fallo que cierra, medido el 2026-08-30
 *
 * Un turno real reventaba con `Non string tool message content is not supported` tras
 * 8-10 llamadas a tools. Reproducido con DOS modelos distintos —`glm-5.3-flash:cloud` y
 * `qwen3.8:27b-mlx`, nube y local— y con la misma traza, lo que hacía pensar en un
 * problema de langchain o de deepagents.
 *
 * **No lo era.** El mensaje sale de `@langchain/ollama/dist/utils.js:107`:
 *
 * ```js
 * function convertToolMessageToOllama(message) {
 *   if (typeof message.content !== "string")
 *     throw new Error("Non string tool message content is not supported");
 * ```
 *
 * O sea: es del PROVEEDOR, no del harness. Los dos modelos fallaban igual porque los dos
 * eran Ollama. Su conversor no acepta contenido en bloques —que es lo que devuelven las
 * tools de fichero de deepagents— y no lo convierte ni degrada: lanza.
 *
 * Y es una combinación que en este laboratorio importa: Ollama local es la vía por
 * omisión (el coste manda), así que sin esto el harness no puede correr con su propio
 * proveedor por defecto.
 *
 * ## Por qué se aplica SIEMPRE y no solo con Ollama
 *
 * Un `ToolMessage` de texto lo acepta cualquier proveedor, así que convertir de más no
 * rompe a nadie. Condicionarlo al proveedor tendría dos costes: la rama solo se
 * ejercitaría con Ollama —o sea, un camino que se rompe sin que ningún test lo note— y
 * obligaría a este módulo a saber qué proveedor hay detrás, que es justo lo que los
 * puertos existen para no tener que saber.
 */
import { createMiddleware } from "langchain";

/** Un bloque de contenido: `{type:"text", text}` es el caso que hay que conservar. */
function textoDeBloque(bloque: unknown): string {
  if (typeof bloque === "string") return bloque;
  if (!bloque || typeof bloque !== "object") return "";
  const b = bloque as Record<string, unknown>;
  if (typeof b.text === "string") return b.text;
  // Un bloque que no es de texto (una imagen, por ejemplo) no se puede meter en una
  // cadena sin mentir sobre lo que es. Se declara en vez de perderlo en silencio.
  return typeof b.type === "string" ? `[${b.type}]` : "";
}

/**
 * El contenido de un mensaje, como cadena.
 *
 * `JSON.stringify` es el último recurso y no el primero: para bloques de texto daría
 * `[{"type":"text","text":"…"}]`, y el modelo tendría que desenterrar el contenido de
 * su propio envoltorio en cada llamada.
 */
export function aTexto(contenido: unknown): string {
  if (typeof contenido === "string") return contenido;
  if (Array.isArray(contenido)) return contenido.map(textoDeBloque).join("");
  if (contenido === null || contenido === undefined) return "";
  try {
    return JSON.stringify(contenido);
  } catch {
    return String(contenido);
  }
}

/** ¿Es un `ToolMessage`? Se mira por las dos vías: el tipo de langchain y el campo. */
export function esMensajeDeTool(msg: unknown): boolean {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  if (m.type === "tool" || m.role === "tool") return true;
  return typeof m.tool_call_id === "string" && m.tool_call_id.length > 0;
}

/**
 * Convierte los `ToolMessage` de la petición, sin tocar el historial.
 *
 * Va en `wrapModelCall` y no en `beforeModel` a propósito: lo que hay que arreglar es lo
 * que SE MANDA, no lo que se guarda. Reescribir el estado perdería el contenido
 * estructurado para todo lo demás —el rastreo, un proveedor que sí lo acepte— por un
 * problema de un solo conversor.
 */
export function middlewareTextoDeTool() {
  return createMiddleware({
    name: "TextoDeToolMiddleware",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wrapModelCall: (request: any, handler: any) => {
      const mensajes = request?.messages;
      if (!Array.isArray(mensajes)) return handler(request);

      let hubo = false;
      const convertidos = mensajes.map((m: unknown) => {
        if (!esMensajeDeTool(m)) return m;
        const msg = m as Record<string, unknown>;
        if (typeof msg.content === "string") return m;
        hubo = true;
        // Se clona: mutar el mensaje lo cambiaría también en el historial, que es
        // exactamente lo que este middleware evita.
        const copia = Object.create(Object.getPrototypeOf(msg));
        Object.assign(copia, msg, { content: aTexto(msg.content) });
        return copia;
      });

      return handler(hubo ? { ...request, messages: convertidos } : request);
    },
  });
}
