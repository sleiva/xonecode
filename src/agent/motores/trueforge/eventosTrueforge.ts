/**
 * Los eventos de TrueForge, en los eventos de dominio de XOneCode (`core/events.ts`).
 *
 * Es lo que hace la interfaz transparente al motor: las pieles —web, terminal, tareas— pintan
 * eventos de dominio y no saben qué los produjo. Aquí se decide qué se cuenta de un turno de
 * TrueForge, con las MISMAS reglas que `puente.ts` aplica a los chunks de deepagents:
 *
 * - **Ningún evento lleva argumentos de tool**: la línea de una tool lleva solo el `detalle` de la
 *   lista blanca (`resumenDeTool.ts#detalleDe`), y el resultado de una tool no se pinta —
 *   `write_file` llevaría el fichero entero—.
 * - **Solo el hilo RAÍZ habla**: lo que dice un subagente no es la respuesta, igual que el
 *   `esDelPadre` del puente. Sus tools sí se ven, que es lo que dice que está trabajando.
 *
 * Puro sobre los eventos: guarda lo justo entre uno y otro (el uso de la última llamada) y no
 * toca nada más.
 */
import type { DomainEvent, OrigenDeLaTool } from "../../../core/events.js";
import { detalleDe } from "../../turno/resumenDeTool.js";

/** Lo que interesa de un evento de TrueForge, sin atarse a sus tipos internos. */
type EventoTrueforge = {
  type?: string;
  thread_id?: string;
  id?: string;
  content?: unknown;
  reasoning_content?: unknown;
  status?: string;
  error?: unknown;
  output?: unknown;
  context?: unknown;
};

/** El uso de UNA llamada al modelo, tal como lo adjunta TrueForge al mensaje completo. */
export interface UsoDeLlamada {
  input: number;
  output: number;
  cache: number;
}

const HILO_RAIZ = "main";

/** Las tool calls de un mensaje completo del asistente: nombre y argumentos. */
function llamadasDe(mensaje: unknown): { nombre: string; args: unknown }[] {
  const tc = (mensaje as { tool_calls?: { function?: { name?: string; arguments?: string } }[] } | null)?.tool_calls;
  if (!Array.isArray(tc)) return [];
  return tc.flatMap((t) => {
    const nombre = t.function?.name;
    if (typeof nombre !== "string") return [];
    let args: unknown = {};
    try {
      args = JSON.parse(t.function?.arguments ?? "{}");
    } catch {
      args = {};
    }
    return [{ nombre, args }];
  });
}

/** Cómo dice TrueForge que un hilo agotó su tope de llamadas, en el `error` de su `agent.done`. */
const TOPE_AGOTADO = /iteration limit of (\d+)/;

/**
 * El tope que agotó un hilo, si ESTE evento es ese corte; `undefined` si no. Vale para el raíz y
 * para cualquier hijo, y existe para la traza: sin él, un especialista cortado por el tope era
 * indistinguible de uno que terminó —medido: la traza decía «cortes: 0» con un documentador que
 * se quedó en exactamente 30 llamadas a mitad de un manual—.
 */
export function topeAgotadoDe(evento: unknown): number | undefined {
  const e = evento as { type?: string; status?: string; error?: unknown };
  if (e?.type !== "internal.agent.done" || e.status !== "error" || typeof e.error !== "string") return undefined;
  const tope = TOPE_AGOTADO.exec(e.error);
  return tope === null ? undefined : Number(tope[1]);
}

/**
 * El especialista de un hilo hijo, si se sabe: lo contesta la sesión (`quienEs`), que es quien
 * sabe qué hilo abrió cada delegación.
 */
export type EspecialistaDeHilo = (hilo: string) => string | undefined;

/**
 * De quién es lo que llega por un hilo. El raíz es el orquestador; cualquier otro, un
 * especialista, con su nombre solo si la sesión lo conoce — sin resolutor, o con un hilo que no
 * sabe, el nombre se CALLA en vez de rellenarse con el id del hilo.
 */
function origenDelHilo(hilo: string, especialistaDe: EspecialistaDeHilo | undefined): OrigenDeLaTool {
  if (hilo === HILO_RAIZ) return { rol: "orquestador" };
  const nombre = especialistaDe?.(hilo);
  return nombre === undefined ? { rol: "especialista" } : { rol: "especialista", nombre };
}

/**
 * Un evento de TrueForge → cero o más eventos de dominio, y el uso si trae una llamada al modelo
 * terminada (para que quien corre el turno lo sume al contador).
 */
export function traducirEvento(
  evento: unknown,
  especialistaDe?: EspecialistaDeHilo
): { eventos: DomainEvent[]; uso?: UsoDeLlamada } {
  const e = (evento ?? {}) as EventoTrueforge;
  const hilo = e.thread_id ?? HILO_RAIZ;
  const delRaiz = hilo === HILO_RAIZ;
  switch (e.type) {
    case "model.message.delta": {
      if (!delRaiz) return { eventos: [] };
      const salida: DomainEvent[] = [];
      if (typeof e.reasoning_content === "string" && e.reasoning_content !== "") {
        salida.push({ tipo: "razonamiento", texto: e.reasoning_content, ...(e.id === undefined ? {} : { msgId: e.id }) });
      }
      if (typeof e.content === "string" && e.content !== "") {
        salida.push({ tipo: "token", texto: e.content, ...(e.id === undefined ? {} : { msgId: e.id }) });
      }
      return { eventos: salida };
    }
    case "internal.agent.context.append": {
      // El mensaje COMPLETO del asistente: de aquí salen sus tools —con los argumentos ya
      // enteros, no a trozos— y el uso de la llamada.
      const salidas = Array.isArray(e.output) ? e.output : [];
      const eventos: DomainEvent[] = [];
      let uso: UsoDeLlamada | undefined;
      const origen = origenDelHilo(hilo, especialistaDe);
      for (const m of salidas) {
        for (const { nombre, args } of llamadasDe(m)) {
          const detalle = detalleDe(nombre, args);
          eventos.push({ tipo: "tool", nombre, ...(detalle === undefined ? {} : { detalle }), origen });
        }
        const u = (m as { usage?: { input_tokens?: number; output_tokens?: number; cache_read_tokens?: number } } | null)?.usage;
        if (u !== undefined) {
          uso = {
            input: (uso?.input ?? 0) + (u.input_tokens ?? 0),
            output: (uso?.output ?? 0) + (u.output_tokens ?? 0),
            cache: (uso?.cache ?? 0) + (u.cache_read_tokens ?? 0),
          };
        }
      }
      return { eventos, ...(uso === undefined ? {} : { uso }) };
    }
    case "agent.context.overwrite": {
      // La compactación: una llamada al modelo que también se paga. Su uso viene en el evento y
      // no en un mensaje del contexto, así que sin esto el resumen sería gratis en el contador.
      const u = (e as { usage?: { input_tokens?: number; output_tokens?: number; cache_read_tokens?: number } }).usage;
      if (u === undefined) return { eventos: [] };
      return { eventos: [], uso: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cache: u.cache_read_tokens ?? 0 } };
    }
    case "internal.agent.done": {
      // Un subagente que falla lo dice su padre, que recibe el error como respuesta de tool.
      // El RAÍZ que falla se dice aquí: un turno que se rompe no puede cerrar en silencio.
      if (!delRaiz || e.status !== "error") return { eventos: [] };
      const detalle = typeof e.error === "string" ? e.error : "error del motor";
      // El TOPE de llamadas no es un fallo del motor: es un corte, y se dice como tal — con cuántas
      // y con lo que se puede hacer. Sin esto se leía «el motor falló» con el texto en inglés.
      const tope = TOPE_AGOTADO.exec(detalle);
      if (tope !== null) {
        return {
          eventos: [
            {
              tipo: "aviso",
              texto: `⚠ el orquestador agotó su tope de ${tope[1]} llamadas en este turno: lo hecho hasta aquí se queda como está; pide que siga si hace falta`,
              severidad: "grave",
            },
          ],
        };
      }
      return { eventos: [{ tipo: "aviso", texto: `⚠ el motor TrueForge falló: ${detalle}`, severidad: "grave" }] };
    }
    default:
      return { eventos: [] };
  }
}
