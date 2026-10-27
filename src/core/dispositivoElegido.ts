/**
 * La FOTO de un aparato elegido —el de una sesión, o el de por defecto de las sesiones nuevas
 * (IXCODE-51)— y la regla que la valida. Puro, y solo importa `granja.ts`, que no importa nada: lo
 * leen `dispositivoDeSesion.ts` y `settings.ts`, y desde cualquiera de los dos sería un ciclo.
 */
import { ID_DE_GRANJA, NOMBRE_DE_GRANJA, type OrigenDeDispositivos } from "./granja.js";

export interface DispositivoDeLaSesion {
  id: string;
  nombre: string;
  plataforma: "android" | "ios";
  /** `granja`: la granja de dispositivos XOne (`core/granja.ts`), no un aparato de este equipo. */
  clase: "emulador" | "simulador" | "fisico" | "granja";
}

/**
 * El aparato de una sesión cuyo proyecto usa la granja (`core/granja.ts`): no una copia —esa se pide
 * al usarla y cambia de un turno a otro—, sino «la granja». Siempre Android: iOS sigue siendo local.
 */
export const DISPOSITIVO_DE_GRANJA: DispositivoDeLaSesion = {
  id: ID_DE_GRANJA,
  nombre: NOMBRE_DE_GRANJA,
  plataforma: "android",
  clase: "granja",
};

/**
 * Validada como la valida `skills/xone-hotswap/lib/dispositivo.mjs` (`dispositivoDeLaSesion`): las
 * dos lecturas tienen que coincidir, o la shell y los scripts creerían en aparatos distintos.
 * Rota o incompleta = no hay elección.
 */
export function dispositivoDeValor(valor: unknown): DispositivoDeLaSesion | undefined {
  const d = valor as Partial<DispositivoDeLaSesion> | null | undefined;
  if (typeof d !== "object" || d === null) return undefined;
  if (typeof d.id !== "string" || d.id === "") return undefined;
  if (d.plataforma !== "android" && d.plataforma !== "ios") return undefined;
  // La granja tiene UNA forma; otra con esa clase está rota. Nunca cae a `fisico`: sería un móvil «granja».
  if (d.clase === "granja") return d.id === ID_DE_GRANJA && d.plataforma === "android" ? DISPOSITIVO_DE_GRANJA : undefined;
  const clase = d.clase === "emulador" || d.clase === "simulador" || d.clase === "fisico" ? d.clase : "fisico";
  return { id: d.id, nombre: typeof d.nombre === "string" ? d.nombre : d.id, plataforma: d.plataforma, clase };
}

/**
 * El aparato de una sesión, ajustado al ORIGEN de su proyecto (`config.json#origenDeDispositivos`).
 * En la granja, un Android de este equipo —o ninguno— pasa a ser la granja, y un iPhone se queda
 * (la granja es solo Android). En este equipo, la granja pasa a «ninguno» y lo demás se queda.
 * Se aplica al abrir una sesión, al cambiar el origen y al elegir en la pastilla.
 */
export function dispositivoSegunOrigen(
  d: DispositivoDeLaSesion | undefined,
  origen: OrigenDeDispositivos,
): DispositivoDeLaSesion | undefined {
  if (origen === "granja") return d?.plataforma === "ios" ? d : DISPOSITIVO_DE_GRANJA;
  return d?.clase === "granja" ? undefined : d;
}

/**
 * El origen EN VIGOR de un proyecto: el suyo (`config.json#origenDeDispositivos`) si lo dice; si no,
 * el global —la granja si el aparato por omisión de Ajustes → General es la granja—, y si no, este
 * equipo. La misma precedencia que el modo de escritura: el proyecto manda sobre el global.
 */
export function origenEnVigor(
  delProyecto: OrigenDeDispositivos | undefined,
  porDefecto: DispositivoDeLaSesion | undefined,
): OrigenDeDispositivos {
  return delProyecto ?? (porDefecto?.clase === "granja" ? "granja" : "local");
}

/**
 * El aparato en que lanza la pestaña Ejecutar: SOLO uno de este equipo que esté a mano (`conectado` o `arrancado`),
 * nunca la granja —que no está en la medida—. Decisión suya: Ejecutar es «ahora, aquí», y la granja es para las
 * tareas. Manda la primera preferencia que esté a mano —la que se eligió en la pestaña, luego el aparato de la
 * sesión, el del proyecto y el global—; si ninguna lo está, el primero a mano. Elegirlo NO toca la pastilla.
 */
export function aparatoDeEjecutar<D extends { id: string; estado: string }>(
  dispositivos: readonly D[] | undefined,
  preferencias: readonly (string | undefined)[],
): D | undefined {
  const aMano = (dispositivos ?? []).filter((d) => d.estado === "conectado" || d.estado === "arrancado");
  for (const id of preferencias) {
    const d = id === undefined ? undefined : aMano.find((x) => x.id === id);
    if (d !== undefined) return d;
  }
  return aMano[0];
}

/** Lo que dice un proyecto del aparato de sus tareas (y de sus chats nuevos). Los dos ausentes = como el global. */
export interface AparatoDelProyecto {
  origen?: OrigenDeDispositivos;
  /** Un aparato CONCRETO de este equipo (`config.json#dispositivoPorDefecto`); nunca la granja. */
  dispositivo?: DispositivoDeLaSesion;
}

/**
 * Lo elegido en «Tareas en background» de Ejecutar: `global` (lo que diga Ajustes → General), `granja`, o el id de un
 * aparato de este equipo. `undefined` = el proyecto dice «este equipo» sin aparato concreto (lo eligió la pastilla).
 */
export function eleccionDeAparatoDelProyecto(a: AparatoDelProyecto): string | undefined {
  if (a.origen === "granja") return ID_DE_GRANJA;
  if (a.dispositivo !== undefined) return a.dispositivo.id;
  return a.origen === undefined ? "global" : undefined;
}
