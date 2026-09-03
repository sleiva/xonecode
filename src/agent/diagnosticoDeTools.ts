import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { TokenTracker } from "../vendor/tokenTracking.js";
import type { ParametrosSeguros } from "./resumenDeTool.js";

/** Activa una traza local y opt-in; nunca se habilita para una sesión normal. */
export const VARIABLE_TRAZA_TOOLS = "XONECODE_TRACE_TOOLS";
export const NOMBRE_TRAZA_TOOLS = "traza-tools.jsonl";

export interface UsoDeModelo {
  input: number;
  output: number;
  cache: number;
  llamadas: number;
  contexto: number;
}

export interface DiagnosticoDeTools {
  modelo(origen: string, uso: UsoDeModelo): void;
  herramienta(nombre: string, detalle: string | undefined, parametros: ParametrosSeguros | undefined, tracker: TokenTracker): void;
}

/** Ruta pública solo para comunicar al usuario dónde quedó su diagnóstico. */
export function rutaTrazaDeTools(raiz: string): string {
  return join(raiz, ".xonecode", NOMBRE_TRAZA_TOOLS);
}

/**
 * Crea un registro append-only de costes y calls, con solo argumentos de una
 * lista blanca; nunca incluye contenido de tools.
 *
 * JSONL permite analizar una sesión grande sin tener que cargarla entera. Es
 * deliberadamente síncrono: son registros minúsculos de un modo de diagnóstico
 * y así no se pierde la última llamada si el usuario cancela el proceso.
 */
export function crearDiagnosticoDeTools(
  raiz: string,
  entorno: NodeJS.ProcessEnv = process.env
): DiagnosticoDeTools | undefined {
  if (entorno[VARIABLE_TRAZA_TOOLS] !== "1") return undefined;

  const ruta = rutaTrazaDeTools(raiz);
  const sesion = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const escribir = (evento: Record<string, unknown>): void => {
    try {
      mkdirSync(join(raiz, ".xonecode"), { recursive: true });
      appendFileSync(ruta, `${JSON.stringify({ v: 1, sesion, at: new Date().toISOString(), ...evento })}\n`, "utf8");
    } catch {
      // Diagnosticar no puede impedir que el agente responda. La traza es una
      // comodidad local, no parte del camino de ejecución del turno.
    }
  };

  escribir({ tipo: "sesion" });
  return {
    modelo(origen, uso) {
      escribir({ tipo: "modelo", origen, ...uso });
    },
    herramienta(nombre, detalle, parametros, tracker) {
      escribir({
        tipo: "tool",
        nombre,
        ...(detalle === undefined ? {} : { detalle }),
        ...(parametros === undefined ? {} : { parametros }),
        inputAcumulado: tracker.input,
        outputAcumulado: tracker.output,
        llamadasModelo: tracker.calls,
      });
    },
  };
}
