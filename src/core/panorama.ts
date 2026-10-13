/**
 * El PANORAMA: lo que ve el móvil de todo el anfitrión a la vez (consolas abiertas y tareas en background).
 * Puro: compone a partir de datos ya reducidos (sin raíces, sin rutas de la máquina). Quien lo llama pone los ids
 * OPACOS de consola y los nombres; aquí solo se ordena, se recorta y se cuenta. Spec: `docs/superpowers/specs/2026-10-13-panel-movil-design.md`.
 */
import type { LineaDeDiff } from "./diff.js";
import type { PendienteDeAprobacion } from "./events.js";

/** Cuántas tareas terminadas viajan (las más recientes por `acabada`). */
export const TAREAS_TERMINADAS_EN_PANORAMA = 5;
export const CARACTERES_DE_TITULO = 120;
export const CARACTERES_DE_MOTIVO = 400;
/** Líneas de diff por fichero; pasadas esas, se recorta y se marca `recortada`. */
export const LINEAS_DE_DIFF_EN_PANORAMA = 200;
/** El feedback que el móvil manda a una tarea se recorta a esto. */
export const CARACTERES_DE_FEEDBACK = 4000;
/** Como mucho una vez por este intervalo se manda un panorama nuevo a los móviles. */
export const INTERVALO_DE_PANORAMA_MS = 1000;

export type EstadoDeConsola = "trabajando" | "esperando-aprobacion" | "esperando-respuesta" | "parada";
export type EstadoDeTareaEnPanorama = "nuevo" | "en-proceso" | "requiere-atencion" | "terminada";

export interface AprobacionDePanorama {
  pendientes: PendienteDeAprobacion[];
  ficheros: Record<string, string>;
  diffs: Record<string, LineaDeDiff[]>;
  recortada?: true;
}

export interface ConsolaDePanorama {
  id: string;
  proyecto: string;
  sesion?: string;
  foco: boolean;
  estado: EstadoDeConsola;
  ultimaActividad?: string;
  aprobacion?: AprobacionDePanorama;
}

export interface TareaDePanorama {
  id: string;
  titulo: string;
  proyecto: string;
  estado: EstadoDeTareaEnPanorama;
  tras?: string;
  motivo?: string;
  creada: string;
  acabada?: string;
}

export interface Panorama {
  clase: "panorama";
  consolas: ConsolaDePanorama[];
  tareas: TareaDePanorama[];
  esperando: number;
}

export interface EntradaDePanorama {
  consolas: Array<{
    id: string;
    proyecto: string;
    sesion?: string;
    foco: boolean;
    turnoEnVuelo: boolean;
    aprobacion?: { pendientes: PendienteDeAprobacion[]; ficheros: Record<string, string>; diffs: Record<string, LineaDeDiff[]> };
    preguntaPendiente: boolean;
    ultimaActividad?: string;
  }>;
  tareas: TareaDePanorama[];
}

const URGENCIA: Record<EstadoDeConsola, number> = { "esperando-aprobacion": 0, "esperando-respuesta": 1, trabajando: 2, parada: 3 };
const ORDEN_DE_TAREA: Record<EstadoDeTareaEnPanorama, number> = { "requiere-atencion": 0, "en-proceso": 1, nuevo: 2, terminada: 3 };

const recortarTexto = (t: string, tope: number): string => (t.length <= tope ? t : `${t.slice(0, Math.max(0, tope - 1))}…`);

function estadoDe(c: EntradaDePanorama["consolas"][number]): EstadoDeConsola {
  if (c.aprobacion !== undefined) return "esperando-aprobacion";
  if (c.preguntaPendiente) return "esperando-respuesta";
  if (c.turnoEnVuelo) return "trabajando";
  return "parada";
}

function aprobacionRecortada(a: NonNullable<EntradaDePanorama["consolas"][number]["aprobacion"]>): AprobacionDePanorama {
  let recortada = false;
  const diffs: Record<string, LineaDeDiff[]> = {};
  for (const [id, lineas] of Object.entries(a.diffs)) {
    if (lineas.length > LINEAS_DE_DIFF_EN_PANORAMA) {
      diffs[id] = lineas.slice(0, LINEAS_DE_DIFF_EN_PANORAMA);
      recortada = true;
    } else diffs[id] = lineas;
  }
  return { pendientes: a.pendientes, ficheros: a.ficheros, diffs, ...(recortada ? { recortada: true as const } : {}) };
}

function tareaRecortada(t: TareaDePanorama): TareaDePanorama {
  const { motivo, ...resto } = t;
  return {
    ...resto,
    titulo: recortarTexto(t.titulo, CARACTERES_DE_TITULO),
    ...(t.estado === "requiere-atencion" && motivo !== undefined ? { motivo: recortarTexto(motivo, CARACTERES_DE_MOTIVO) } : {}),
  };
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Pone cada tarea con `tras` justo detrás de su anterior, si esa viaja también. Tolera ciclos.
 * Una anterior TERMINADA ya no retiene (`siguientesAEjecutar`): la siguiente se queda en su bloque
 * de prioridad y no se va al de las terminadas. Y una tarea que se nombra a sí misma no se mueve.
 */
function respetandoTras(lista: TareaDePanorama[]): TareaDePanorama[] {
  const salida = [...lista];
  for (let pasada = 0; pasada < lista.length; pasada++) {
    let movida = false;
    for (const t of [...salida]) {
      if (t.tras === undefined || t.tras === t.id) continue;
      const iAnterior = salida.findIndex((x) => x.id === t.tras);
      const iT = salida.indexOf(t);
      if (iAnterior === -1 || salida[iAnterior]!.estado === "terminada" || iT > iAnterior) continue;
      salida.splice(iT, 1);
      salida.splice(salida.findIndex((x) => x.id === t.tras) + 1, 0, t);
      movida = true;
    }
    if (!movida) break;
  }
  return salida;
}

export function componerPanorama(entrada: EntradaDePanorama): Panorama {
  const consolas: ConsolaDePanorama[] = entrada.consolas
    .map((c): ConsolaDePanorama => ({
      id: c.id,
      proyecto: c.proyecto,
      ...(c.sesion !== undefined ? { sesion: c.sesion } : {}),
      foco: c.foco,
      estado: estadoDe(c),
      ...(c.ultimaActividad !== undefined ? { ultimaActividad: c.ultimaActividad } : {}),
      ...(c.aprobacion !== undefined ? { aprobacion: aprobacionRecortada(c.aprobacion) } : {}),
    }))
    .sort((a, b) => Number(b.foco) - Number(a.foco) || URGENCIA[a.estado] - URGENCIA[b.estado]);

  const vivas = entrada.tareas
    .filter((t) => t.estado !== "terminada")
    .sort((a, b) => ORDEN_DE_TAREA[a.estado] - ORDEN_DE_TAREA[b.estado] || cmp(a.creada, b.creada));
  const terminadas = entrada.tareas
    .filter((t) => t.estado === "terminada")
    .sort((a, b) => cmp(b.acabada ?? b.creada, a.acabada ?? a.creada))
    .slice(0, TAREAS_TERMINADAS_EN_PANORAMA);
  const tareas = respetandoTras([...vivas, ...terminadas]).map(tareaRecortada);

  const esperando =
    consolas.reduce((n, c) => n + (c.aprobacion?.pendientes.length ?? 0), 0) + tareas.filter((t) => t.estado === "requiere-atencion").length;
  return { clase: "panorama", consolas, tareas, esperando };
}
