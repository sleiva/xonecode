/**
 * Lo que un turno le cuenta al mundo. `agent/` los emite, `core/` decide qué se enseña,
 * las pieles (TUI y stdio) los pintan.
 *
 * Ningún evento lleva argumentos de tool. Ni truncados: `studio_edit_file` lleva el
 * contenido del fichero y una tool MCP lleva el bearer. Enseñar el progreso no puede ser
 * la forma de filtrar un secreto, así que el TIPO no los puede llevar.
 */
export type DomainEvent =
  | { tipo: "token"; texto: string; msgId?: string }
  | { tipo: "fase"; fase: Fase; detalle?: string }
  | { tipo: "tool"; nombre: string; error?: string }
  | { tipo: "plan"; tareas: TareaDelPlan[] }
  | { tipo: "tarea"; id: string; indice: number; total: number; estado: EstadoTarea }
  | { tipo: "verificacion"; verde: boolean; errores: number; avisos: number }
  | { tipo: "reparacion"; intento: number; tope: number }
  | { tipo: "bloqueado"; motivo: MotivoBloqueo; explicacion: string }
  | { tipo: "pausa"; pendientes: PendienteDeAprobacion[] }
  | { tipo: "aviso"; texto: string; severidad: "info" | "aviso" | "grave" }
  | { tipo: "fin"; ms: number };

/** Las fases del lazo. Es lo que llena los 100-300 s en que el agente no habla. */
export type Fase =
  | "entendiendo"
  | "planificando"
  | "esperando-aprobacion"
  | "ejecutando"
  | "verificando"
  | "juzgando"
  | "subiendo"
  | "respondiendo";

export type EstadoTarea = "pendiente" | "en-curso" | "hecha" | "fallida";

export interface TareaDelPlan {
  id: string;
  descripcion: string;
  /** Criterios de aceptación. VACÍO es honesto; un texto de relleno haría juzgar un adorno. */
  aceptacion: string[];
}

/**
 * Los tres motivos por los que el lazo para sin terminar, y son DISTINTOS a propósito.
 *
 * `no-progreso` no es «se acabaron los intentos»: es la misma huella de error dos veces,
 * y se corta ANTES de agotar el presupuesto porque seguir no va a cambiar nada.
 */
export type MotivoBloqueo = "no-progreso" | "tope-reparaciones" | "tope-replanificaciones";

export interface PendienteDeAprobacion {
  id: string;
  /** Qué especialista lo pide. Viaja aquí porque el interrupt NO dice de dónde viene. */
  origen: string;
  descripcion: string;
  decisionesPermitidas: string[];
}