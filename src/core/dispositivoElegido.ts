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
