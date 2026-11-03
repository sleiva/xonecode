/**
 * **Un encargo de un plan es UNA tarea, y lo dice en una línea `TAREA: <número>`.** Puro.
 *
 * Medido en la calculadora (03-11-2026): el orquestador mandó «haz T1, T2 y T3» en un solo encargo; el desarrollador
 * construyó las tres de un tirón (19,5 min, el `.xne` editado 15 veces) y no marcó nada hasta el final, con una sola
 * captura para todas. La regla «tarea a tarea» vivía solo en prompts. Como Codex (`spawn_agent` con su `task_name`
 * obligatorio aparte del mensaje), la tarea va en un campo que el CÓDIGO lee, no deducida de la prosa: «T1 ya está; ahora
 * T2» nombra dos y es un encargo correcto. Lo que no cuadra no arranca y se le devuelve al orquestador
 * (`sesionTrueforge.ts#hiloQueNoArranca`); lo que cuadra lleva delante la ficha de su tarea, así el desarrollador no lee
 * el `TASKS.md` entero.
 */
import { leerTareasDelPlan, type TareaDelPlan } from "./tareasDelPlan.js";

/** La línea que dice la tarea del encargo, en cualquier sitio del texto. */
export const LINEA_DE_TAREA = /^[ \t]*TAREA:[ \t]*(.*)$/im;

/** Cuántas tareas pendientes se le listan al orquestador al devolverle un encargo. */
const TOPE_DE_TAREAS_LISTADAS = 8;

export type DecisionDeEncargo =
  /** No es trabajo de un plan con tareas (o nombra varios planes: no se adivina cuál). */
  | { tipo: "libre" }
  | { tipo: "tarea"; plan: string; tarea: TareaDelPlan; encargo: string }
  | { tipo: "rechazo"; motivo: string };

/** Los planes que nombra un encargo (`/planes/<slug>/`), sin repetir. */
export function planesNombrados(encargo: string): string[] {
  return [...new Set([...encargo.matchAll(/\/planes\/([A-Za-z0-9_-]+)\//g)].map((m) => m[1]!))];
}

/** `01`, `T1` y `1` son la misma tarea. */
const clave = (numero: string): string => String(Number.parseInt(numero.replace(/^T/i, ""), 10));

const listar = (tareas: readonly TareaDelPlan[]): string =>
  tareas
    .filter((t) => t.progreso !== "finalizada")
    .slice(0, TOPE_DE_TAREAS_LISTADAS)
    .map((t) => `${t.numero} (${t.titulo})`)
    .join(", ");

/**
 * Qué hacer con el encargo de `nombre`: dejarlo como está, arrancarlo con la ficha de su tarea delante, o devolverlo con
 * el motivo. `leerTasks` da el `TASKS.md` de un plan, o `undefined` si no lo tiene.
 */
export function decidirEncargo(nombre: string, encargo: string, leerTasks: (plan: string) => string | undefined): DecisionDeEncargo {
  const conTareas = planesNombrados(encargo)
    .map((plan) => ({ plan, texto: leerTasks(plan) }))
    .filter((p): p is { plan: string; texto: string } => p.texto !== undefined)
    .map((p) => ({ plan: p.plan, tareas: leerTareasDelPlan(p.texto).tareas }))
    .filter((p) => p.tareas.length > 0);
  if (conTareas.length !== 1) return { tipo: "libre" };
  const { plan, tareas } = conTareas[0]!;
  const forma = `Empieza el encargo con la línea \`TAREA: <número>\` y UNA sola tarea: la prueba en el aparato y la marca del plan van por tarea.`;
  const pendientes = listar(tareas);
  const siguiente = `Cuando vuelva, manda la siguiente al mismo ${nombre}: conserva lo que ya hizo.`;

  const linea = LINEA_DE_TAREA.exec(encargo);
  if (linea === null) {
    return {
      tipo: "rechazo",
      motivo: `${nombre} NO HA ARRANCADO: el encargo es trabajo del plan /planes/${plan}/ y no dice qué tarea. ${forma} Pendientes: ${pendientes}. ${siguiente}`,
    };
  }
  const pedidas = [...new Set([...linea[1]!.matchAll(/\d+/g)].map((m) => clave(m[0])))];
  const nombradas = pedidas.map((c) => tareas.find((t) => clave(t.numero) === c)).filter((t): t is TareaDelPlan => t !== undefined);
  if (nombradas.length === 0) {
    return {
      tipo: "rechazo",
      motivo: `${nombre} NO HA ARRANCADO: «TAREA: ${linea[1]!.trim()}» no es una tarea de /planes/${plan}/TASKS.md. ${forma} Pendientes: ${pendientes}.`,
    };
  }
  if (pedidas.length > 1) {
    const primera = nombradas.find((t) => t.progreso !== "finalizada") ?? nombradas[0]!;
    return {
      tipo: "rechazo",
      motivo:
        `${nombre} NO HA ARRANCADO: el encargo nombra ${String(pedidas.length)} tareas (${nombradas.map((t) => t.numero).join(", ")}). ${forma} ` +
        `Manda ahora la ${primera.numero} con \`TAREA: ${primera.numero}\`. ${siguiente}`,
    };
  }
  const tarea = nombradas[0]!;
  const ficha = [
    "",
    "",
    `LA TAREA DE ESTE ENCARGO, de /planes/${plan}/TASKS.md (líneas ${String(tarea.linea)}–${String(tarea.linea + tarea.lineas - 1)}; el resto del plan no hace falta leerlo):`,
    `## ${tarea.numero} — ${tarea.titulo}`,
    tarea.cuerpo,
  ].join("\n");
  return { tipo: "tarea", plan, tarea, encargo: `${encargo}${ficha}` };
}
