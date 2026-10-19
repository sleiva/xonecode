/**
 * Qué motor EXTERNO está sin cuota, y hasta cuándo: mientras dure, sus especialistas corren con el modelo por defecto.
 *
 * Es del PROCESO y no de la sesión: la cuota es de la cuenta de Claude Code (o de Codex), así que la agota cualquier
 * sesión o tarea de esta máquina y la sufren todas. Solo en memoria: al reiniciar se vuelve a probar el motor, y si
 * sigue agotado lo dirá su primer error. Reconocerlo y calcular la hora es de `core/agotamientoExterno.ts`.
 */
import type { Agente } from "../../core/agentes.js";
import type { MotorExterno } from "../../core/ports.js";
import { agotadoHasta } from "../../core/agotamientoExterno.js";

const agotados = new Map<MotorExterno, number>();

/** Apunta el agotamiento si el error lo es; devuelve hasta cuándo, o `undefined` si es otro fallo. */
export function apuntarSiSeAgoto(motor: MotorExterno, error: unknown, ahora: number = Date.now()): number | undefined {
  const hasta = agotadoHasta(error instanceof Error ? error.message : String(error), ahora);
  if (hasta !== undefined) agotados.set(motor, hasta);
  return hasta;
}

/** Hasta cuándo está agotado ese motor, o `undefined` si no lo está (o ya pasó la hora, y entonces se olvida). */
export function agotadoHastaAhora(motor: string, ahora: number = Date.now()): number | undefined {
  const hasta = agotados.get(motor as MotorExterno);
  if (hasta === undefined) return undefined;
  if (hasta <= ahora) {
    agotados.delete(motor as MotorExterno);
    return undefined;
  }
  return hasta;
}

/** Solo para tests: el registro es del proceso y un test no puede dejárselo al siguiente. */
export function olvidarAgotamientos(): void {
  agotados.clear();
}

/**
 * El MISMO especialista en nuestro motor: su `.md` entero (prompt, skills, permisos, ejecución), sin el `modelo` ni el
 * `esfuerzo` del producto externo —son de Claude Code; aquí manda el modelo por defecto de su papel—.
 */
export function conModeloPorDefecto(agente: Agente): Agente {
  const { modelo: _modelo, esfuerzo: _esfuerzo, ...resto } = agente;
  return { ...resto, motor: "modelo" };
}

const hora = (ms: number): string => new Date(ms).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

/** Lo que lee el ORQUESTADOR en vez de la respuesta del especialista: qué pasó y que vuelva a encargarlo. */
export function textoDeExternoAgotado(motor: MotorExterno, agente: string, hasta: number, modelo: string | undefined): string {
  return (
    `⚠ El agente externo (${motor}) se ha quedado sin cuota hasta las ${hora(hasta)} y no hizo este encargo. ` +
    `Desde ahora ${agente} y los demás especialistas de ${motor} corren con el modelo por defecto` +
    `${modelo === undefined ? "" : ` (${modelo})`}: vuelve a encargarle esto mismo a ${agente}.`
  );
}

/** El aviso del chat: quién cambia de motor y hasta cuándo. */
export function avisoDeFallback(motor: string, agente: string, hasta: number, modelo: string | undefined): string {
  return `⚠ ${motor} sin cuota hasta las ${hora(hasta)}: ${agente} trabaja con el modelo por defecto${modelo === undefined ? "" : ` (${modelo})`}`;
}

/** El aviso del chat cuando el producto SE AGOTA a mitad: ese encargo no se hizo, los siguientes irán con el de reserva. */
export function avisoDeAgotamiento(motor: string, agente: string, hasta: number, modelo: string | undefined): string {
  return `⚠ ${motor} se ha quedado sin cuota hasta las ${hora(hasta)}: ${agente} no hizo su encargo; los siguientes irán con el modelo por defecto${modelo === undefined ? "" : ` (${modelo})`}`;
}
