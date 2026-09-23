/**
 * TODO lo que XOneCode usa de `@truefoundry/trueforge-core`, por un solo sitio.
 *
 * La librería es 0.x (fijada EXACTA a 0.2.1 en `package.json`) y no promete compatibilidad entre
 * versiones. Con los imports repartidos por el motor, subirla obligaba a revisar cada fichero; aquí
 * se revisa uno. Dos clases de cosas, y se separan a propósito:
 *
 * - Lo de la API PÚBLICA (`@truefoundry/trueforge-core/core`): el orquestador, los hilos, las
 *   capabilities, `ILLM`.
 * - Lo que SOLO está en rutas profundas: los tipos de los fragmentos del modelo y el trazado mudo.
 *   El paquete los deja importar (`"./*"` en sus `exports`), pero no son su API: son lo primero
 *   que puede moverse en una versión nueva, y por eso viven aquí y en ningún otro sitio.
 *
 * `NOOP_AGENT_TRACING` no se reimplementa: `AgentTracing` es una interfaz de spans anidados que
 * cambia con la librería, y una copia nuestra sería un segundo sitio que mantener al día sin que el
 * compilador avisara de lo que la librería espera de él.
 */
export {
  AgentThread,
  AgentThreadOrchestrator,
  EventType,
  ToolSet,
  askUserQuestion,
  contextCompaction,
  currentDateTime,
  dynamicSubAgents,
  toolResultResponse,
} from "@truefoundry/trueforge-core/core";
export type { AgentTracing, ILLM, LLMCreateParams, LLMCreateParamsStreaming } from "@truefoundry/trueforge-core/core";

// ── Rutas profundas: fuera de la API pública de 0.2.1 ──────────────────────────────────────────
export type { ExtendedChatCompletionChunk, RawAssistantMessageWithUsage } from "@truefoundry/trueforge-core/core/llm/LLMTypes";
export { NOOP_AGENT_TRACING } from "@truefoundry/trueforge-core/core/tracing/NoopAgentTracing";
