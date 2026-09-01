import { collectPending, buildResume, type Decision, type PendingInterrupt } from "../vendor/hitl.js";
import type { PendienteDeAprobacion } from "../core/events.js";
import { diffDeLineas, type LineaDeDiff } from "../core/diff.js";

export { buildResume, type Decision, type PendingInterrupt };

/**
 * Los interrupts pendientes de un hilo, en el vocabulario de xonecode.
 *
 * **Se pregunta al ESTADO, no al resultado del stream.** La clave `__interrupt__` solo
 * existe en la llamada que pausó; el estado sobrevive al proceso y es la fuente de verdad.
 * Es la misma razón por la que se puede pausar en un proceso y aprobar desde otro.
 */
export async function pendientesDe(agente: unknown, config: unknown): Promise<PendienteDeAprobacion[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const estado = await (agente as any).getState(config);
  return collectPending(estado).map(aPendiente);
}

/**
 * De la forma de deepagents a la de xonecode.
 *
 * El `origen` sale de la `description`, que es donde `hitlDe()` metió el nombre del perfil
 * —`[dev] quiere escribir un fichero del proyecto`—: **el interrupt no dice de qué
 * subagente viene**, y `dev` y `mockup` comparten `write_file`.
 */
export function aPendiente(p: PendingInterrupt): PendienteDeAprobacion {
  const m = /^\[([^\]]+)\]/.exec(p.description);
  return {
    id: p.id,
    origen: m?.[1] ?? p.tool,
    descripcion: p.description,
    decisionesPermitidas: p.allowedDecisions,
  };
}

/**
 * Qué fichero se va a tocar, para poder decirlo sin enseñar los argumentos.
 *
 * Los argumentos NO se publican: `write_file` lleva el contenido entero. Pero aprobar a
 * ciegas es peor que no aprobar, así que se extrae **solo la ruta** de la lista blanca de
 * claves que la llevan.
 */
export function ficheroDe(p: PendingInterrupt): string | undefined {
  for (const clave of ["file_path", "path", "filePath", "file"]) {
    const v = p.args[clave];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

/** El antes y el después de un pendiente, listos para decidir: la ruta y sus líneas de diff. */
export interface VistaDelCambio {
  ruta: string;
  lineas: LineaDeDiff[];
}

/**
 * La vista del cambio que pide un pendiente: el ANTES es el disco (el interrupt para
 * ANTES de escribir, así que disco == antes) y el DESPUÉS sale de los argumentos.
 *
 * Este es el ÚNICO sitio donde el contenido sale de los argumentos, y es a propósito:
 * la aprobación es el paso donde enseñar el contenido es la REGLA — aprobar a ciegas
 * es peor que no aprobar. Fuera de aquí, la lista blanca de `resumenDeTool.ts` manda.
 *
 * `leer` entra por parámetro (en producción lee del disco; en los tests, un mapa) y
 * una tool que no es de escritura, o args incompletos, no produce vista — no crash.
 */
export function cambioDe(
  p: PendingInterrupt,
  leer: (ruta: string) => string
): VistaDelCambio | undefined {
  const ruta = ficheroDe(p);
  if (ruta === undefined) return undefined;

  if (p.tool === "write_file") {
    const despues = p.args.content;
    if (typeof despues !== "string") return undefined;
    return { ruta, lineas: diffDeLineas(leer(ruta), despues) };
  }

  if (p.tool === "edit_file") {
    const viejo = p.args.old_string;
    const nuevo = p.args.new_string;
    if (typeof viejo !== "string" || typeof nuevo !== "string") return undefined;
    const antes = leer(ruta);
    if (!antes.includes(viejo)) {
      // El reemplazo no calza con lo que hay en disco: enseñar un diff fingido sería
      // peor que el crudo. Las dos piezas, tal cual.
      return { ruta, lineas: [...diffDeLineas(viejo, nuevo)] };
    }
    return { ruta, lineas: diffDeLineas(antes, antes.split(viejo).join(nuevo)) };
  }

  return undefined;
}