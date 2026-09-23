import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { TokenTracker } from "../../vendor/tokenTracking.js";
import type { ParametrosSeguros } from "./resumenDeTool.js";
import type { OrigenDeTool } from "./puente.js";

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
  /**
   * Un especialista al que se le agotó el presupuesto de llamadas.
   *
   * **OPCIONAL**, como los métodos nuevos de `Piel`: así ningún doble de los tests se rompe por
   * existir esto, y quien no lo implemente sigue funcionando igual.
   *
   * Existe porque un corte era INDISTINGUIBLE de un agente que termina: la traza decía «15
   * llamadas» en los dos casos. Eso costó una sesión entera de diagnóstico equivocado —se leyó
   * como un fallo de enrutado lo que era el tope cortando— y es el tipo de dato que solo se
   * echa de menos cuando ya te ha engañado.
   */
  corte?(origen: string, limite: number): void;
  /**
   * `origen` distingue el orquestador de un especialista, y es EXACTO (sale del namespace del
   * stream, ver `puente.ts#esDelPadre`). No dice CUÁL especialista: sus segmentos son ids
   * opacos. Dos cubos ciertos en vez de cinco dudosos.
   */
  herramienta(nombre: string, detalle: string | undefined, parametros: ParametrosSeguros | undefined, tracker: TokenTracker, origen?: OrigenDeTool, respuesta?: string): void;
  /**
   * **Cuánto METIÓ en el contexto lo que devolvió una tool.** Opcional, como `corte`.
   *
   * Contar llamadas no dice a donde van los tokens: dos `read_file` son dos líneas iguales y
   * pueden ser doscientos caracteres o veinte mil. Van los CARACTERES y nunca el contenido, y
   * no se convierten a tokens — la razón cambia con el modelo y con lo que haya dentro, así
   * que una cifra de tokens aquí sería una precisión inventada.
   */
  resultado?(nombre: string | undefined, detalle: string | undefined, chars: number): void;
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
    corte(origen, limite) {
      escribir({ tipo: "corte", origen, limite });
    },
    resultado(nombre, detalle, chars) {
      escribir({
        tipo: "resultado",
        ...(nombre === undefined ? {} : { nombre }),
        ...(detalle === undefined ? {} : { detalle }),
        chars,
      });
    },
    herramienta(nombre, detalle, parametros, tracker, origen, respuesta) {
      escribir({
        tipo: "tool",
        nombre,
        ...(origen === undefined ? {} : { origen }),
        ...(respuesta === undefined ? {} : { respuesta }),
        ...(detalle === undefined ? {} : { detalle }),
        ...(parametros === undefined ? {} : { parametros }),
        inputAcumulado: tracker.input,
        outputAcumulado: tracker.output,
        llamadasModelo: tracker.calls,
      });
    },
  };
}
