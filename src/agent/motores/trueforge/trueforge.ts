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
 * El trazado mudo (`NOOP_AGENT_TRACING`) es NUESTRO y va con `satisfies` contra los tipos PÚBLICOS
 * de la librería: si su interfaz cambia, el compilador lo dice aquí. Era una ruta profunda más, y la
 * única que no era un tipo.
 */
/**
 * La versión de la librería con la que corre este motor, la MISMA que fija `package.json`
 * (`frontera.test.ts` compara las dos, y contra la instalada). Viaja en la foto de memoria
 * (`memoriaTrueforge.ts`) para que una migración futura sepa con qué `toSnapshot()` se escribió.
 * Es una constante y no una lectura de su `package.json`: leerlo desde otro fichero sería una
 * segunda puerta a la librería, y aquí subirla se revisa de todas formas.
 */
export const VERSION_DE_TRUEFORGE = "0.2.1";

export {
  AgentThread,
  AgentThreadOrchestrator,
  EventType,
  ToolSet,
  askUserQuestion,
  contextCompaction,
  currentDateTime,
  dynamicSubAgents,
  openUI,
  toolResultResponse,
} from "@truefoundry/trueforge-core/core";
export type { AgentTracing, ILLM, LLMCreateParams, LLMCreateParamsStreaming } from "@truefoundry/trueforge-core/core";
import type {
  AgentExecutionTrace,
  AgentLocalToolTrace,
  AgentRemoteMcpToolTrace,
  AgentTracing,
} from "@truefoundry/trueforge-core/core";

// ── Rutas profundas: fuera de la API pública de 0.2.1, y solo TIPOS ──────────────────────────
export type { ExtendedChatCompletionChunk, RawAssistantMessageWithUsage } from "@truefoundry/trueforge-core/core/llm/LLMTypes";

// ── El trazado mudo: no trazamos con la librería (la traza es la nuestra, `diagnosticoDeTools`) ─
const TRAZA_MUDA = {
  runInContext: <T>(operation: () => T): T => operation(),
  startSubAgent: (): AgentExecutionTrace => TRAZA_MUDA,
  setOutput: () => undefined,
  setMetrics: () => undefined,
  setError: () => undefined,
  setSuccess: () => undefined,
  end: () => undefined,
} satisfies AgentExecutionTrace;
const TOOL_MUDA = { setOutput: () => undefined, setSandboxId: () => undefined } satisfies AgentLocalToolTrace;
const MCP_MUDO = { setOutput: () => undefined, setNumberOfTools: () => undefined } satisfies AgentRemoteMcpToolTrace;

export const NOOP_AGENT_TRACING = {
  withInitSpan: <T>(operation: () => Promise<T>): Promise<T> => operation(),
  startRootSpan: (): AgentExecutionTrace => TRAZA_MUDA,
  withLocalToolSpan: <T>(_input: unknown, operation: (span: AgentLocalToolTrace) => Promise<T>): Promise<T> => operation(TOOL_MUDA),
  withRemoteMcpToolSpan: <T>(_input: unknown, operation: (span: AgentRemoteMcpToolTrace) => Promise<T>): Promise<T> =>
    operation(MCP_MUDO),
} satisfies AgentTracing;
