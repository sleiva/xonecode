import type { Acto } from "./actos.js";
import { nombreDeAdjuntoAceptable } from "./adjuntos.js";
import { tituloDeTarea, type Tarea } from "./tareas.js";

/**
 * Repartir un encargo GRANDE en tareas de fondo que corren EN ORDEN (petición de la persona, 06-10-2026: «cuando le doy
 * una tarea grande, por ejemplo el diseño de dos ventanas…»; plan en
 * `docs/superpowers/plans/2026-10-06-tareas-encadenadas.md`).
 *
 * El orquestador PROPONE (`proponer_tareas`), con los diseños que necesita cada tarea; la persona ve cada una aumentada
 * y editable y, al pulsar «Encolar en orden», se crean encadenadas por `Tarea.tras`. **Nada de aquí crea una tarea por su
 * cuenta**: crear una tarea es la autorización para que escriba sin preguntar (CLAUDE.md § tareas), y esa la da la
 * persona, también en modo autónomo. Puro.
 */
export const NOMBRE_PROPONER_TAREAS = "proponer_tareas";
/** Un reparto de más tareas es otro plan, no un encargo repartido. */
export const TOPE_DE_TAREAS_PROPUESTAS = 6;
/** El mismo tope que el encargo aumentado (`agent/tareas/aumentador.ts#TOPE_DE_ENCARGO`). */
export const TOPE_DE_PETICION = 8000;

export interface TareaPropuesta {
  titulo: string;
  /** El encargo de ESA tarea, autosuficiente: la tarea no ve la conversación en que se propuso. */
  peticion: string;
  /** Los adjuntos de la sesión que necesita ESTA tarea (sus diseños), por nombre (`/adjuntos/x.zip` o `x.zip`). */
  adjuntos?: string[];
}

export interface PropuestaDeTareas {
  /** Por qué no cabe en un turno: se le enseña a la persona encima de las tareas. */
  motivo: string;
  tareas: TareaPropuesta[];
}

/** La propuesta en una línea, para la piel que no la pinta como tarjeta (stdio, la TUI). */
export function textoDePropuesta(p: PropuestaDeTareas): string {
  const lista = p.tareas.map((t, i) => `${i + 1}. ${t.titulo}`).join(" · ");
  return `🗂  El agente propone repartir el encargo en ${p.tareas.length} tareas de fondo, en orden (${p.motivo}): ${lista}. Encolarlas solo se puede desde la consola web.`;
}

/** El nombre de un adjunto sin el prefijo de su ruta virtual. */
export const nombreDeAdjuntoPropuesto = (a: string): string => a.trim().replace(/^\/adjuntos\//, "");

/** Por qué la propuesta no vale, o `undefined`. Lo dice en palabras, para devolvérselo al agente. */
export function motivoDePropuestaInaceptable(p: PropuestaDeTareas): string | undefined {
  if (p.motivo.trim() === "") return "falta el motivo del reparto";
  if (p.tareas.length < 2) return "un reparto son al menos dos tareas; una sola, hazla en este turno";
  if (p.tareas.length > TOPE_DE_TAREAS_PROPUESTAS) return `como mucho ${TOPE_DE_TAREAS_PROPUESTAS} tareas por reparto`;
  for (const [i, t] of p.tareas.entries()) {
    if (t.titulo.trim() === "") return `la tarea ${i + 1} no tiene título`;
    if (t.peticion.trim() === "") return `la tarea ${i + 1} no tiene petición`;
    if (t.peticion.length > TOPE_DE_PETICION) return `la petición de la tarea ${i + 1} pasa de ${TOPE_DE_PETICION} caracteres`;
    for (const a of t.adjuntos ?? []) {
      if (!nombreDeAdjuntoAceptable(nombreDeAdjuntoPropuesto(a))) return `«${a}» no es un adjunto de esta conversación (tarea ${i + 1})`;
    }
  }
  return undefined;
}

/**
 * Las `Tarea` de una propuesta aceptada: en estado `nuevo`, encadenadas por `tras` y con `creada` creciente (+1 ms cada
 * una: el FIFO del corredor ordena por `creada`, y dos iguales no tienen orden). Sin adjuntos: los pone el servidor
 * después de copiarlos, leyéndolos del disco como siempre.
 */
export function tareasEncadenadas(opciones: {
  proyecto: Tarea["proyecto"];
  tareas: readonly { peticion: string; encargo: string }[];
  ahora: Date;
  id: () => string;
}): Tarea[] {
  const salida: Tarea[] = [];
  opciones.tareas.forEach((t, i) => {
    salida.push({
      id: opciones.id(),
      proyecto: opciones.proyecto,
      titulo: tituloDeTarea(t.peticion),
      peticion: t.peticion,
      // Vacío cae a la petición, como el «Encolar» de Nueva tarea.
      encargo: t.encargo.trim() === "" ? t.peticion : t.encargo,
      adjuntos: [],
      estado: "nuevo",
      creada: new Date(opciones.ahora.getTime() + i).toISOString(),
      ...(i === 0 ? {} : { tras: salida[i - 1]!.id }),
    });
  });
  return salida;
}

/**
 * La propuesta `id` si está en el transcript y nadie la ha resuelto todavía; si no, `undefined`.
 *
 * Es la guarda del servidor antes de encolar o descartar: lo que se encola sale de AQUÍ —el acto
 * que escribió la piel—, no de lo que mande el cliente, y una propuesta ya resuelta no se encola
 * otra vez (dos pestañas, un doble clic).
 */
export function propuestaPendiente(
  actos: readonly Acto[],
  id: string
): Extract<Acto, { tipo: "propuesta-de-tareas" }> | undefined {
  let propuesta: Extract<Acto, { tipo: "propuesta-de-tareas" }> | undefined;
  for (const a of actos) {
    if (a.tipo === "propuesta-de-tareas" && a.id === id) propuesta = a;
    if (a.tipo === "propuesta-resuelta" && a.propuesta === id) return undefined;
  }
  return propuesta;
}
