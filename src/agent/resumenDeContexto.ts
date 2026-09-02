/**
 * Política de contexto del harness.
 *
 * DeepAgents usa 170k tokens cuando el proveedor no publica su ventana de contexto. Con
 * Ollama eso retrasa demasiado la compresión y cada llamada reenvía lecturas ya resueltas.
 * Este umbral es independiente del proveedor: limita el coste sin borrar el trabajo reciente.
 */
import { createSummarizationMiddleware, type FilesystemBackend } from "deepagents";
import { RUTA_HISTORIAL_RESUMIDO } from "./memoriaDeProyecto.js";

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
