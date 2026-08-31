import { collectPending, buildResume, type Decision, type PendingInterrupt } from "../vendor/hitl.js";
import type { PendienteDeAprobacion } from "../core/events.js";

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