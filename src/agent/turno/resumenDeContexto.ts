/**
 * Política de contexto del harness.
 *
 * DeepAgents usa 170k tokens cuando el proveedor no publica su ventana de contexto. Con
 * Ollama eso retrasa demasiado la compresión y cada llamada reenvía lecturas ya resueltas.
 * Este umbral es independiente del proveedor: limita el coste sin borrar el trabajo reciente.
 */
import { createSummarizationMiddleware, type FilesystemBackend } from "deepagents";
import { createMiddleware } from "langchain";
import { HumanMessage } from "@langchain/core/messages";
import { RUTA_HISTORIAL_RESUMIDO } from "../grafo/memoriaDeProyecto.js";

export const UMBRAL_RESUMEN_TOKENS = 32_000;
export const CONTEXTO_RECIENTE_TOKENS = 8_000;

export function resumenDeContexto(backend: FilesystemBackend) {
  return createSummarizationMiddleware({
    backend,
    trigger: { type: "tokens", value: UMBRAL_RESUMEN_TOKENS },
    keep: { type: "tokens", value: CONTEXTO_RECIENTE_TOKENS },
    // Las tools de fichero pueden llevar contenido grande. Los argumentos antiguos ya
    // están representados por el resumen, no deben volver a inflar las siguientes llamadas.
    truncateArgsSettings: {
      trigger: { type: "tokens", value: UMBRAL_RESUMEN_TOKENS },
      keep: { type: "tokens", value: CONTEXTO_RECIENTE_TOKENS },
      maxLength: 1_000,
    },
    trimTokensToSummarize: 12_000,
    // El backend lo escribe directamente; no debe aparecer en el árbol ni en las tools del
    // agente. Así el estado de sesión permanece junto al proyecto y fuera de la app XOne.
    historyPathPrefix: RUTA_HISTORIAL_RESUMIDO,
  });
}

/**
 * Devuelve el ENCARGO a la conversación después de que el resumen se lo lleve.
 *
 * ## El fallo que cierra, medido offline el 17-09-2026
 *
 * Un turno real del usuario: el orquestador delegó una pregunta sobre si XOne servía para un
 * CRM, el especialista dio 57 pasos y volvió con la respuesta de la pregunta **anterior** —«la
 * ventana de inicio de mi app»—. El orquestador lo detectó y relanzó dos veces: 1,5M de tokens
 * para una pregunta. El propio modelo dijo que «parece que trae una sesión antigua pegada», y
 * esa hipótesis era falsa: los subagentes van en `handoff`, así que arrancan con el encargo y
 * nada más, y aunque HEREDAN nuestro checkpointer, el namespace de cada `task` lleva el paso y
 * el id del checkpoint dentro, así que no puede reanudar nada.
 *
 * Lo que pasa de verdad está en el middleware de resumen: al cruzar el umbral, los mensajes
 * `[0, corte)` se sustituyen por UN resumen, y el mensaje 0 es justamente el encargo. `keep`
 * solo conserva la COLA —no hay opción para el primero— y el prompt de resumen por omisión
 * pide «temas, decisiones y contexto para continuar», no el encargo. O sea que a partir de los
 * 32k el especialista sigue trabajando **sin la pregunta que le hicieron**, y contesta a lo que
 * el resumen le deje entender. Medido en `resumenDeContexto.test.ts`.
 *
 * ## Por qué por CÓDIGO y no por `summaryPrompt`
 *
 * Se podría pedir en el prompt del resumen que conserve el encargo, y a veces lo haría. Un
 * agente que pierde su encargo no contesta peor: contesta a otra cosa, y el coste de eso ya
 * está medido en millones de tokens. Es la misma regla que hace que los avisos de honestidad
 * sean código y no prompt (`core/bitacora.ts`).
 *
 * El encargo se saca del ESTADO, que el resumen no reescribe (guarda un `_summarizationEvent`
 * y reconstruye la lista efectiva), así que ahí sigue intacto el mensaje 0. Y se reinserta solo
 * si NO está: por debajo del umbral no hay nada que devolver y duplicarlo sería peor.
 */
export function conservarElEncargo() {
  return createMiddleware({
    name: "ConservarElEncargoMiddleware",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wrapModelCall: (request: any, handler: any) => {
      const mensajes = request?.messages;
      const historial = request?.state?.messages;
      if (!Array.isArray(mensajes) || !Array.isArray(historial) || mensajes.length === 0) return handler(request);

      // **El ÚLTIMO humano, no el primero**, y la diferencia es el defecto entero: en la
      // conversación de un ESPECIALISTA solo hay uno —el encargo— y los dos coinciden, pero la
      // del ORQUESTADOR es multiturno, y ahí el primero es la pregunta de hace tres turnos.
      // Reinyectar esa sería reintroducir a mano justo el fallo que esto arregla.
      const encargo = [...historial].reverse().find((m: unknown) => esDeHumano(m));
      if (encargo === undefined || mensajes.includes(encargo)) return handler(request);

      // Por CONTENIDO además de por identidad: la lista efectiva se reconstruye, así que el
      // mensaje puede ser otro objeto con el mismo texto. Sin esto se duplicaría el encargo en
      // cada llamada posterior al resumen.
      const texto = textoPlano(encargo);
      if (texto !== "" && mensajes.some((m: unknown) => esDeHumano(m) && textoPlano(m) === texto)) return handler(request);

      return handler({ ...request, messages: [encargo, ...mensajes] });
    },
  });
}

function esDeHumano(msg: unknown): boolean {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  return m.type === "human" || m.role === "user" || m instanceof HumanMessage;
}

function textoPlano(msg: unknown): string {
  const c = (msg as { content?: unknown } | null)?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((b) => (typeof b === "object" && b !== null && "text" in b ? String((b as { text: unknown }).text) : "")).join("");
  return "";
}

/**
 * El resumen y la devolución del encargo, SIEMPRE juntos y en este orden.
 *
 * Van en una sola función porque separarlos es el fallo: el primero de la lista envuelve al
 * siguiente, así que `conservarElEncargo` tiene que ver los mensajes YA resumidos — delante no
 * habría nada que devolver. Montarlos a mano en dos sitios (el orquestador y cada especialista)
 * es el patrón que en este repo ha fallado nueve veces: una composición de producción que vive
 * en un cierre que los tests doblan, y que puede dejar de estar montada con todo en verde.
 */
export function resumenConEncargo(backend: FilesystemBackend): ReturnType<typeof createMiddleware>[] {
  return [resumenDeContexto(backend), conservarElEncargo()] as ReturnType<typeof createMiddleware>[];
}
