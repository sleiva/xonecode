import { createMiddleware } from "langchain";

export interface TokenTracker {
  input: number;
  output: number;
  cache: number;
  calls: number;
  /** El input de la ÚLTIMA llamada: cuánto ocupa AHORA la ventana del modelo.
   *
   * Los acumulados dicen lo que la sesión HA costado; esto dice cuánto queda
   * de margen antes de que el historial desborde el contexto — dos preguntas
   * distintas y la segunda es la que la barra de estado necesita. */
  contexto: number;
}

export function createTokenTracker(): TokenTracker {
  return { input: 0, output: 0, cache: 0, calls: 0, contexto: 0 };
}

export function createTokenTrackingMiddleware(tracker: TokenTracker) {
  return createMiddleware({
    name: "TokenTrackingMiddleware",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    afterModel: (state: any) => {
      const messages = (state?.messages ?? []) as Array<Record<string, unknown>>;
      const lastMsg = messages[messages.length - 1];
      if (!lastMsg) return;

      let inputTokens = 0;
      let outputTokens = 0;
      let cacheRead = 0;

      // usage_metadata (LangChain standard)
      const usage = lastMsg.usage_metadata as Record<string, unknown> | undefined;
      if (usage) {
        inputTokens = (usage.input_tokens as number) ?? 0;
        outputTokens = (usage.output_tokens as number) ?? 0;
        const inputDetails = usage.input_token_details as Record<string, unknown> | undefined;
        cacheRead = (inputDetails?.cache_read as number) ?? 0;
      } else {
        // Fallback: response_metadata.token_usage
        const responseMeta = lastMsg.response_metadata as Record<string, unknown> | undefined;
        const tokenUsage = responseMeta?.token_usage as Record<string, unknown> | undefined;
        if (tokenUsage) {
          inputTokens = (tokenUsage.prompt_tokens as number) ?? 0;
          outputTokens = (tokenUsage.completion_tokens as number) ?? 0;
          const details = tokenUsage.prompt_tokens_details as Record<string, unknown> | undefined;
          cacheRead = (details?.cached_tokens as number) ?? 0;
        }
      }

      tracker.input += inputTokens;
      tracker.output += outputTokens;
      tracker.cache += cacheRead;
      tracker.calls += 1;
      tracker.contexto = inputTokens;
    },
  });
}

export function printTokenUsage(tracker: TokenTracker, latencyMs?: number) {
  console.log("\n=== Token Usage ===");
  console.log(`Input tokens:  ${tracker.input}`);
  console.log(`Output tokens: ${tracker.output}`);
  console.log(`Cache tokens:  ${tracker.cache}`);
  console.log(`LLM calls:     ${tracker.calls}`);
  if (latencyMs) {
    const tps = latencyMs > 0 && tracker.output > 0
      ? (tracker.output / latencyMs) * 1000
      : 0;
    console.log(`Latency:       ${latencyMs}ms`);
    console.log(`Speed:         ${tps.toFixed(1)} tok/s`);
  }
}