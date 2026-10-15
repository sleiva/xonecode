/**
 * Las tareas en background que VIVEN en el gestor de tareas (Jira, Notion…): las reglas puras de qué se escribe en él
 * y cuándo. Ver `docs/superpowers/specs/2026-10-15-tareas-desde-el-gestor-design.md`.
 *
 * Nada de aquí sabe de qué gestor se trata: escribe a través de `GestorDeTareasPort`, y los destinos los propone
 * `transicionPropuesta` sobre las transiciones que da cada ticket.
 */
import type { CategoriaDeTarea, GestorDeTareasPort, Vinculo } from "./gestorDeTareas.js";
import type { EstadoDeTarea, Tarea, TicketDeTarea } from "./tareas.js";

/**
 * La cabecera FIJA del comentario con el encargo ampliado. Es una constante porque la fase 2 la BUSCARÁ entre los
 * comentarios del ticket para leer el último encargo revisado: cambiarla dejaría de encontrar los de antes.
 */
export const CABECERA_DEL_ENCARGO = "🤖 Encargo para el agente (xonecode)";

/** El comentario que sube el encargo ampliado al ticket recién creado. Markdown: los dos gestores lo entienden. */
export function comentarioDeEncargo(encargo: string): string {
  return `**${CABECERA_DEL_ENCARGO}**\n\n${encargo.trim()}\n\n— escrito por xonecode`;
}

/**
 * Qué hay que escribir en el gestor cuando una tarea cambia de estado. Solo dos momentos en la fase 1:
 *  - **empezar** (→ `en-proceso`): pasar el ticket a EN CURSO. Vuelve a pasar tras cada feedback y tras una
 *    reanudación, así que quien lo aplica mira antes si el ticket ya está en curso (`hayQueTransicionar`).
 *  - **cerrar** (→ `terminada`): el comentario de cierre y la transición a PROBAR.
 * Aparcar (→ `requiere-atencion`) no escribe nada todavía; volver a la cola (→ `nuevo`) tampoco.
 */
export function escrituraEnElGestor(antes: EstadoDeTarea | undefined, despues: EstadoDeTarea): "empezar" | "cerrar" | undefined {
  if (antes === despues) return undefined;
  if (despues === "en-proceso") return "empezar";
  if (despues === "terminada") return "cerrar";
  return undefined;
}

/** Un cambio que hay que reflejar: la tarea tal como quedó y qué escribir. */
export interface ReflejoPendiente {
  tarea: Tarea & { ticket: TicketDeTarea };
  escritura: "empezar" | "cerrar";
}

/**
 * Los reflejos que salen de pasar la cola de `antes` a `despues`, comparando por id. Solo las tareas CON ticket, y
 * solo cuando su ESTADO cambió: guardar un aviso en `ticket` (que no cambia el estado) no vuelve a disparar nada. Una
 * tarea nueva cuenta como «antes» ausente; una que desaparece (descartada) no escribe nada.
 */
export function reflejosPendientes(antes: readonly Tarea[], despues: readonly Tarea[]): ReflejoPendiente[] {
  const previos = new Map(antes.map((t) => [t.id, t.estado] as const));
  const pendientes: ReflejoPendiente[] = [];
  for (const t of despues) {
    if (t.ticket === undefined) continue;
    const escritura = escrituraEnElGestor(previos.get(t.id), t.estado);
    if (escritura !== undefined) pendientes.push({ tarea: t as Tarea & { ticket: TicketDeTarea }, escritura });
  }
  return pendientes;
}

/**
 * Si al EMPEZAR hay que mover el ticket: no si ya está en curso (una reanudación, o la persona lo movió a mano). Al
 * cerrar se mueve siempre: comentar y pasar a PROBAR es lo que dice que está hecho.
 */
export function hayQueTransicionar(escritura: "empezar" | "cerrar", categoriaActual: CategoriaDeTarea): boolean {
  return escritura === "cerrar" || categoriaActual === "por-hacer";
}

/** El `Vinculo` con el que se escribe en el ticket de una tarea: el COPIADO al crearla, nunca el del proyecto ahora. */
export function vinculoDelTicket(ticket: TicketDeTarea): Vinculo {
  return { conector: ticket.conector, sitio: ticket.sitio, proyecto: ticket.proyecto };
}

/**
 * CERRAR un ticket: comentar y LUEGO transicionar. Una sola secuencia para el «Cerrar en …» de un chat y para una tarea
 * en background que termina —dos copias acabarían distintas—:
 *  - si `comentar` falla, LANZA y no se transiciona (no se dice «hecho» de algo sin explicar);
 *  - si la transición falla, el comentario YA está en el gestor: no se lanza —repetir el cierre comentaría DOS veces—,
 *    se devuelve el motivo en `falloDeTransicion` (traducido por quien llama, que sabe limpiar el mensaje remoto).
 */
export async function cerrarTicket(
  g: Pick<GestorDeTareasPort, "comentar" | "transicionar">,
  v: Vinculo,
  clave: string,
  comentario: string,
  transicion: string | undefined,
  motivoDe: (error: unknown) => string
): Promise<{ falloDeTransicion?: string }> {
  await g.comentar(v, clave, comentario);
  if (transicion === undefined) return {};
  try {
    await g.transicionar(v, clave, transicion);
    return {};
  } catch (error) {
    return { falloDeTransicion: motivoDe(error) };
  }
}
