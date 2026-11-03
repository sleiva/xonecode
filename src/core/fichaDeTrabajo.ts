/**
 * La FICHA de un trabajo: lo que se pidió y con qué se da por hecho, guardado por el harness y no por la conversación.
 *
 * Diseño en `docs/superpowers/specs/2026-11-03-ficha-de-trabajo-design.md`, con la forma de los objetivos de Codex
 * (`codex-rs/ext/goal`): el objetivo se guarda fuera de la conversación y, antes de dar algo por hecho, cada requisito
 * se comprueba contra la evidencia ACTUAL. Medido en xonecode: el juez recibía cuatro hechos y ninguno decía qué casos
 * pasaron en el aparato ni si la captura era de la versión que se entrega; y `marcar_criterios_del_plan` marcaba una
 * casilla con la palabra del agente, sin prueba, y no la desmarcaba aunque se editara después.
 *
 * Reglas:
 * - **Solo el código la escribe**, a partir de lo que pasa por el harness. Cada dato lleva su PROCEDENCIA.
 * - **La vigencia se deriva, no se guarda**: una evidencia vale mientras los ficheros del trabajo tengan la huella que
 *   tenían al producirla. Editar uno la deja caducada. Primera versión conservadora: TODOS los ficheros escritos en el
 *   trabajo, no solo los que tocan a esa evidencia (límite declarado).
 * - **Tres estados, nunca dos**: con evidencia vigente, caducada o sin evidencia. «No probado» no es «correcto».
 *
 * Puro: las huellas las calcula quien lee el disco (`agent/`).
 */
import type { EstadoDeTarea } from "./tareasDelPlan.js";

export const VERSION_DE_FICHA = 1;

export type Procedencia = "persona" | "plan" | "agente" | "harness";
export interface Dato {
  texto: string;
  procedencia: Procedencia;
  cuando: string;
}

/** Lo que el harness ve pasar y sirve de prueba. `casos` y `captura` son pruebas EN EL APARATO. */
export type TipoDeEvidencia = "escritura" | "validacion" | "verificador" | "casos" | "captura" | "medida";
export const PRUEBAS_EN_EL_APARATO: readonly TipoDeEvidencia[] = ["casos", "captura"];

export interface Evidencia {
  id: string;
  tipo: TipoDeEvidencia;
  cuando: string;
  /** El agente que la produjo (`developer-xone`, `orquestador`…). */
  quien: string;
  /** Lo que se puede decir de ella en una línea: «3 casos», «verde», la ruta de una captura. */
  resumen: string;
  /** Ruta → huella de los ficheros del trabajo en ese momento. */
  version: Readonly<Record<string, string>>;
  /** La colección que estaba en pantalla, si se sabe. */
  pantalla?: string;
}

/** Qué evidencia respalda una casilla marcada de un `TASKS.md`. */
export interface Respaldo {
  plan: string;
  tarea: string;
  criterio: number;
  evidencia: string;
  cuando: string;
}

export interface FichaDeTrabajo {
  version: typeof VERSION_DE_FICHA;
  objetivo?: Dato;
  aclaraciones: Dato[];
  /** Ruta → huella de cada fichero que el trabajo ha escrito, la última conocida. */
  escritos: Record<string, string>;
  evidencias: Evidencia[];
  respaldos: Respaldo[];
}

export function fichaNueva(objetivo?: Dato): FichaDeTrabajo {
  return { version: VERSION_DE_FICHA, ...(objetivo === undefined ? {} : { objetivo }), aclaraciones: [], escritos: {}, evidencias: [], respaldos: [] };
}

const siguienteId = (f: FichaDeTrabajo): string => `e${String(f.evidencias.length + 1)}`;

/** Un fichero escrito: cuenta como evidencia de escritura y pasa a formar parte de la versión del trabajo. */
export function conEscritura(f: FichaDeTrabajo, ruta: string, huella: string, quien: string, cuando: string): FichaDeTrabajo {
  const escritos = { ...f.escritos, [ruta]: huella };
  const e: Evidencia = { id: siguienteId(f), tipo: "escritura", cuando, quien, resumen: ruta, version: escritos };
  return { ...f, escritos, evidencias: [...f.evidencias, e] };
}

/** Cualquier otra evidencia: se ata a la versión del trabajo de ESE momento. */
export function conEvidencia(
  f: FichaDeTrabajo,
  e: { tipo: Exclude<TipoDeEvidencia, "escritura">; resumen: string; quien: string; cuando: string; pantalla?: string }
): { ficha: FichaDeTrabajo; id: string } {
  const id = siguienteId(f);
  const evidencia: Evidencia = { id, ...e, version: { ...f.escritos } };
  return { ficha: { ...f, evidencias: [...f.evidencias, evidencia] }, id };
}

/**
 * ¿Sigue valiendo? La versión del trabajo es la MISMA que cuando se produjo: cada fichero que registró tiene la misma
 * huella ahora, y ninguno escrito DESPUÉS existe. Un fichero que ya no existe la caduca. Medido: una captura sacada antes
 * de que el diseñador escribiera sus SVG tenía la versión vacía y respaldó seis casillas de esos SVG.
 */
export function vigente(e: Evidencia, huellasActuales: Readonly<Record<string, string | undefined>>): boolean {
  const rutas = new Set([...Object.keys(e.version), ...Object.keys(huellasActuales)]);
  return [...rutas].every((ruta) => huellasActuales[ruta] === e.version[ruta]);
}

/**
 * La prueba en el aparato que respalda marcar un criterio AHORA: la más reciente de las vigentes. Sin ninguna, no se
 * marca (`marcar_criterios_del_plan` lo devuelve como error).
 */
export function pruebaVigente(f: FichaDeTrabajo, huellasActuales: Readonly<Record<string, string | undefined>>): Evidencia | undefined {
  return [...f.evidencias].reverse().find((e) => PRUEBAS_EN_EL_APARATO.includes(e.tipo) && vigente(e, huellasActuales));
}

export function conRespaldo(f: FichaDeTrabajo, r: Respaldo): FichaDeTrabajo {
  const resto = f.respaldos.filter((x) => !(x.plan === r.plan && x.tarea === r.tarea && x.criterio === r.criterio));
  return { ...f, respaldos: [...resto, r] };
}

export type EstadoDeCriterio = "vigente" | "caducado" | "sin-evidencia";

/** El estado de un criterio de una tarea según la ficha: con qué se marcó y si eso sigue valiendo. */
export function estadoDeCriterio(
  f: FichaDeTrabajo,
  donde: { plan: string; tarea: string; criterio: number },
  huellasActuales: Readonly<Record<string, string | undefined>>
): EstadoDeCriterio {
  const r = f.respaldos.find((x) => x.plan === donde.plan && x.tarea === donde.tarea && x.criterio === donde.criterio);
  const e = r === undefined ? undefined : f.evidencias.find((x) => x.id === r.evidencia);
  if (e === undefined) return "sin-evidencia";
  return vigente(e, huellasActuales) ? "vigente" : "caducado";
}

/**
 * El estado de una tarea, CALCULADO: nada marcado → pendiente; algo → en curso; todo marcado pero alguna marca sin
 * respaldo vigente o el verificador sin verde → implementada; todo con respaldo vigente y verde → hecha. Una casilla
 * marcada sin respaldo en la ficha (de antes de que existiera, o a mano) cuenta como «sin evidencia».
 */
export function estadoDeTarea(criterios: readonly EstadoDeCriterio[], marcados: number, verificador: "verde" | "rojo" | undefined): EstadoDeTarea {
  if (criterios.length === 0 || marcados === 0) return "pendiente";
  if (marcados < criterios.length) return "en curso";
  return criterios.every((c) => c === "vigente") && verificador === "verde" ? "hecha" : "implementada";
}

/** La ficha leída del disco, o `undefined` si no se entiende: se aparta y se empieza otra, nunca se adivina. */
export function interpretarFicha(json: unknown): FichaDeTrabajo | undefined {
  if (json === null || typeof json !== "object") return undefined;
  const f = json as Partial<FichaDeTrabajo>;
  if (f.version !== VERSION_DE_FICHA) return undefined;
  if (!Array.isArray(f.aclaraciones) || !Array.isArray(f.evidencias) || !Array.isArray(f.respaldos)) return undefined;
  if (f.escritos === null || typeof f.escritos !== "object" || Array.isArray(f.escritos)) return undefined;
  return f as FichaDeTrabajo;
}

/**
 * Lo que dice una salida de `xone-hotswap` con varios casos (`---`): cuántos casos se probaron y qué pulsó cada uno.
 * `undefined` si no hubo ninguno: una orden suelta no es una prueba de casos.
 */
export function casosDeLaSalida(salida: string): { casos: number; resumen: string } | undefined {
  const casos: string[] = [];
  for (const linea of salida.split("\n")) {
    if (!linea.startsWith("{")) continue;
    try {
      const j = JSON.parse(linea) as { comando?: unknown; pasos?: unknown; nuevos?: unknown };
      if (j.comando !== "caso") continue;
      const nuevos = Array.isArray(j.nuevos) ? j.nuevos.slice(0, 3).map(String).join(", ") : "";
      casos.push(`${String(j.pasos ?? "")} → ${nuevos}`);
    } catch {
      // Una línea que no es JSON no es un caso.
    }
  }
  return casos.length === 0 ? undefined : { casos: casos.length, resumen: `${String(casos.length)} caso(s): ${casos.join(" · ")}` };
}
