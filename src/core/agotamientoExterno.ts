/**
 * Un motor EXTERNO sin cuota: reconocerlo en su error y saber hasta cuándo dura.
 *
 * Medido en tres tareas de soporte (19-10-2026): Claude Code contestaba «You've hit your session limit · resets 4:30pm
 * (Europe/Madrid)», y cada especialista que corría en él (developer-xone, analyst-xone) se quedaba sin arrancar hasta
 * esa hora. El orquestador, sin nadie que escribiera, dejaba un documento o un icono y la tarea se cerraba sin hacer.
 * Mientras dure, esos especialistas corren con el modelo por defecto (`agent/subagentes/agotamiento.ts`).
 *
 * Puro: sin reloj ni zona de la máquina, que entran por parámetro.
 */

/** Lo que dura un agotamiento cuyo mensaje no dice hasta cuándo: se vuelve a probar el motor después. */
export const TOPE_DE_AGOTAMIENTO_MS = 60 * 60 * 1000;

/**
 * Las frases con las que un producto dice que se quedó sin cuota. Claude Code: «You've hit your session limit», «…your
 * usage limit», «…weekly limit»; Codex: «You've hit your usage limit»; y las genéricas de cuota. Un error cualquiera
 * (no arranca, se cortó, un 500) NO es esto: ahí no hay cuota que esperar y el modelo por defecto no lo arregla.
 */
const FRASES_DE_AGOTAMIENTO: readonly RegExp[] = [
  /hit your (?:\w+ )?limit/i,
  /\b(?:session|usage|weekly|daily|5-hour) limit\b/i,
  /\bquota (?:exceeded|exhausted)\b/i,
  /\bexhausted\b/i,
];

/** ¿Este error de un motor externo es que se quedó sin cuota? */
export function esAgotamiento(mensaje: string): boolean {
  return FRASES_DE_AGOTAMIENTO.some((r) => r.test(mensaje));
}

/**
 * Hasta cuándo (ms) está agotado, si el mensaje lo es. La hora que el mensaje dice, en SU zona; «try again in N
 * minutes/hours» relativo a `ahora`; y si no dice nada, `TOPE_DE_AGOTAMIENTO_MS`. `undefined` = no es un agotamiento.
 */
export function agotadoHasta(mensaje: string, ahora: number): number | undefined {
  if (!esAgotamiento(mensaje)) return undefined;
  return horaDeReinicio(mensaje, ahora) ?? enUnRato(mensaje, ahora) ?? ahora + TOPE_DE_AGOTAMIENTO_MS;
}

/** «resets 4:30pm (Europe/Madrid)», «resets 16:30 (Europe/Madrid)»: la PRÓXIMA vez que en esa zona son esas. */
function horaDeReinicio(mensaje: string, ahora: number): number | undefined {
  const m = /resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*\(([^)]+)\)/i.exec(mensaje);
  if (m === null) return undefined;
  let hora = Number(m[1]);
  const minuto = m[2] === undefined ? 0 : Number(m[2]);
  const sufijo = m[3]?.toLowerCase();
  if (sufijo === "pm" && hora < 12) hora += 12;
  if (sufijo === "am" && hora === 12) hora = 0;
  if (hora > 23 || minuto > 59) return undefined;
  const ahoraEnZona = minutosDelDiaEn(m[4]!.trim(), ahora);
  if (ahoraEnZona === undefined) return undefined;
  let faltan = hora * 60 + minuto - ahoraEnZona;
  if (faltan <= 0) faltan += 24 * 60;
  // Al minuto: los segundos de `ahora` se quitan para caer en la hora en punto que dice el mensaje.
  return Math.floor(ahora / 60_000) * 60_000 + faltan * 60_000;
}

/** «try again in 2 hours 5 minutes», «in 45 minutes». */
function enUnRato(mensaje: string, ahora: number): number | undefined {
  const m = /(?:try again|resets?)\s+in\s+((?:\d+\s*(?:hours?|hrs?|h|minutes?|mins?|m)\b[\s,and]*)+)/i.exec(mensaje);
  if (m === null) return undefined;
  let minutos = 0;
  for (const [, n, unidad] of m[1]!.matchAll(/(\d+)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/gi)) {
    minutos += Number(n) * (/^h/i.test(unidad!) ? 60 : 1);
  }
  return minutos === 0 ? undefined : ahora + minutos * 60_000;
}

/** Los minutos desde medianoche que marca el reloj de esa zona en `ahora`; `undefined` si la zona no existe. */
function minutosDelDiaEn(zona: string, ahora: number): number | undefined {
  try {
    const partes = new Intl.DateTimeFormat("en-GB", { timeZone: zona, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ahora);
    const h = Number(partes.find((p) => p.type === "hour")?.value);
    const min = Number(partes.find((p) => p.type === "minute")?.value);
    return Number.isFinite(h) && Number.isFinite(min) ? h * 60 + min : undefined;
  } catch {
    return undefined;
  }
}
