/**
 * Las tareas en background que VIVEN en el gestor de tareas (Jira, Notion…): las reglas puras de qué se escribe en él
 * y cuándo. Ver `docs/superpowers/specs/2026-10-15-tareas-desde-el-gestor-design.md`.
 *
 * Nada de aquí sabe de qué gestor se trata: escribe a través de `GestorDeTareasPort`, y los destinos los propone
 * `transicionPropuesta` sobre las transiciones que da cada ticket.
 */
import { transicionPropuesta } from "./gestorDeTareas.js";
import type {
  CategoriaDeTarea, ComentarioDelGestor, EstadoDelGestor, GestorDeTareasPort, MapeoDeEstados, TareaDelGestor, TransicionDelGestor, Vinculo,
} from "./gestorDeTareas.js";
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
  /** `descartar` no sale de un cambio de estado sino de BORRAR la tarea (ver `conReflejoAlGuardar`). */
  escritura: "empezar" | "cerrar" | "descartar";
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

/** Cada cuánto mira el gestor el proceso que ejecuta las tareas (la puerta 2). Más «Mirar ahora». */
export const INTERVALO_DE_SONDEO_MS = 5 * 60 * 1000;

/**
 * El mapeo que se PROPONE para un flujo, por categoría: preparar = el primero «por hacer», lanzar = el primero «en
 * curso», terminar = PROBAR si existe (el flujo de IXCODE) o el primero «terminada». La persona lo confirma o lo cambia.
 */
export function mapeoPropuesto(estados: readonly EstadoDelGestor[]): MapeoDeEstados {
  const preparar = estados.find((e) => e.categoria === "por-hacer")?.nombre;
  const lanzar = estados.find((e) => e.categoria === "en-curso")?.nombre;
  const terminar = (estados.find((e) => /^probar$/i.test(e.nombre)) ?? estados.find((e) => e.categoria === "terminada"))?.nombre;
  return {
    ...(preparar === undefined ? {} : { preparar }),
    ...(lanzar === undefined ? {} : { lanzar }),
    ...(terminar === undefined ? {} : { terminar }),
  };
}

/**
 * La transición que lleva un ticket al estado del MAPEO para ese momento (empezar → lanzar, cerrar → terminar), por el
 * nombre de su destino sin mayúsculas. Sin estado mapeado, la regla de antes (`transicionPropuesta`). Con estado mapeado
 * y sin transición que lleve a él, `undefined`: no se adivina otra.
 */
export function transicionHacia(
  ts: readonly TransicionDelGestor[],
  para: "empezar" | "cerrar",
  estados: MapeoDeEstados | undefined
): TransicionDelGestor | undefined {
  const destino = para === "empezar" ? estados?.lanzar : estados?.terminar;
  if (destino === undefined) return transicionPropuesta(ts, para);
  return ts.find((t) => t.destino.trim().toLowerCase() === destino.trim().toLowerCase());
}

/** Si un estado del gestor es el del mapeo (sin mayúsculas ni espacios de más). */
export function esEstado(estado: string, mapeado: string | undefined): boolean {
  return mapeado !== undefined && estado.trim().toLowerCase() === mapeado.trim().toLowerCase();
}

/** Lo que el sondeo tiene que hacer con un ticket. */
export type AccionDelSondeo = { tipo: "preparar"; ticket: TareaDelGestor } | { tipo: "lanzar"; ticket: TareaDelGestor };

/**
 * Qué hacer en una pasada del sondeo, PURO: con los tickets ASIGNADOS a la cuenta del conector, el mapeo, qué tickets
 * ya tienen encargo subido y cuáles ya tienen tarea (no descartada).
 *  - En el estado de PREPARAR y sin encargo → preparar.
 *  - En el estado de LANZAR y sin tarea → lanzar (con o sin encargo: sin él se usa el texto del ticket).
 * Un ticket ya preparado no se vuelve a preparar; uno con tarea no lanza otra. Sin estado de lanzar no se lanza nada.
 */
export function accionesDelSondeo(o: {
  tickets: readonly TareaDelGestor[];
  estados: MapeoDeEstados;
  conEncargo: ReadonlySet<string>;
  conTarea: ReadonlySet<string>;
}): AccionDelSondeo[] {
  const acciones: AccionDelSondeo[] = [];
  for (const ticket of o.tickets) {
    if (o.conTarea.has(ticket.clave)) continue;
    if (esEstado(ticket.estado, o.estados.lanzar)) acciones.push({ tipo: "lanzar", ticket });
    else if (esEstado(ticket.estado, o.estados.preparar) && !o.conEncargo.has(ticket.clave)) acciones.push({ tipo: "preparar", ticket });
  }
  return acciones;
}

/** Si un comentario es un encargo subido por xonecode: empieza por la cabecera fija (con o sin negrita). */
export function esComentarioDeEncargo(texto: string): boolean {
  return texto.trimStart().replace(/^\*\*/, "").startsWith(CABECERA_DEL_ENCARGO);
}

/**
 * El encargo que se ejecuta al LANZAR, leído de los comentarios del ticket: el ÚLTIMO con la cabecera, tal como esté
 * (si la persona lo editó, su versión), sin la cabecera ni la firma; y lo comentado DEBAJO de él, como indicaciones
 * añadidas. Sin encargo, `undefined` (se usará el texto del ticket).
 */
export function encargoDeLosComentarios(comentarios: readonly ComentarioDelGestor[]): { encargo: string; añadidos: string[] } | undefined {
  const ordenados = [...comentarios].sort((a, b) => a.creado.localeCompare(b.creado));
  let i = -1;
  for (let k = ordenados.length - 1; k >= 0; k--) {
    if (esComentarioDeEncargo(ordenados[k]!.texto)) {
      i = k;
      break;
    }
  }
  if (i === -1) return undefined;
  const encargo = ordenados[i]!.texto
    .trimStart()
    .replace(/^\*\*[^\n]*\*\*\s*|^[^\n]*\n+/, "")
    .replace(/\n*— escrito por xonecode\s*$/, "")
    .trim();
  return { encargo, añadidos: ordenados.slice(i + 1).map((c) => c.texto.trim()).filter((t) => t !== "") };
}

/** El encargo final de una tarea lanzada desde el gestor: el encargo, y debajo lo que se comentó después, dicho como tal. */
export function encargoConAñadidos(encargo: string, añadidos: readonly string[]): string {
  if (añadidos.length === 0) return encargo;
  return `${encargo}\n\n## Indicaciones añadidas en el ticket\n\n${añadidos.map((a) => `- ${a.replace(/\n+/g, " ")}`).join("\n")}`;
}

/**
 * A dónde vuelve el ticket de una tarea DESCARTADA: al estado de preparar del mapeo o, sin él, al primero «por hacer».
 * Si se quedara en el de lanzar, el sondeo la crearía otra vez en la pasada siguiente: descartar la resucitaba. Volver
 * a moverlo es volver a pedirla, el mismo gesto que la lanzó.
 */
export function transicionDeDescarte(ts: readonly TransicionDelGestor[], estados: MapeoDeEstados | undefined): TransicionDelGestor | undefined {
  const destino = estados?.preparar;
  if (destino !== undefined) return ts.find((t) => esEstado(t.destino, destino));
  return ts.find((t) => t.categoria === "por-hacer");
}
