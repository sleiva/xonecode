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

/**
 * Lo que va detrás de la ficha: el ALCANCE y cómo se CIERRA. Medido con Codex sobre la calculadora (04-11-2026), con el
 * mismo modelo: su orquestador escribía «ejecuta SOLO la Tarea 1… no modifiques Menu.xne todavía» y «devuelve el
 * resultado de cada criterio con la evidencia», y su desarrollador cerró la tarea criterio a criterio sin adelantarse.
 * El nuestro, sin esas dos frases, construía las tareas siguientes dentro de la primera y no marcaba nada. Lo pone el
 * código, no el orquestador: así no depende de que se acuerde.
 */
export const ALCANCE_Y_CIERRE_DE_LA_TAREA = [
  "ALCANCE: haz SOLO esta tarea. Lo que piden las otras tareas del plan no lo toques todavía, aunque lo veas venir.",
  "CIERRE: prueba en el aparato CADA criterio de arriba, marca solo los comprobados y, al cerrarla, di por criterio",
  "`[x]` o `[ ]` con su prueba (lo que viste o mediste) o por qué no se pudo comprobar.",
].join("\n");

/**
 * **No se pasa de una tarea ABIERTA a otra** (decisión suya, 04-11-2026: «que no pase de tarea en rojo»). Medido en la
 * calculadora (pasada 21): el desarrollador devolvió la 02 con el crítico en rojo y cuatro de cinco criterios sin marcar,
 * «la tarea no está cerrada», y el orquestador mandó la 03 sin más; nadie volvía a por la 02. Abierta es que no tiene
 * TODAS sus casillas marcadas (`progreso !== "finalizada"`). Se puede volver a encargar hasta este tope de intentos; con
 * él agotado, el turno se termina diciéndole a la persona lo que falta, en vez de seguir con la siguiente.
 */
export const INTENTOS_POR_TAREA = 2;

/** La última tarea encargada a quien recibe el encargo, y cuántas veces se le ha encargado en el turno. */
export interface TareaYaEncargada {
  plan: string;
  numero: string;
  intentos: number;
}

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
/**
 * Los planes que nombra un encargo SIN su ruta: «plan `demo-calculadora`», «el plan demo-calculadora». Medido en la
 * calculadora: el orquestador nombraba así el plan en sus encargos de ajuste y se saltaban la regla de una tarea. Solo
 * cuentan los que tienen `TASKS.md` (lo decide quien llama, con `leerTasks`).
 */
export function planesPorSuNombre(encargo: string): string[] {
  const nombres = [...encargo.matchAll(/\bplan(?:es)?\s+[«"`']?([A-Za-z0-9][A-Za-z0-9_-]*)/gi)].map((m) => m[1]!);
  return [...new Set(nombres)];
}

export function decidirEncargo(
  nombre: string,
  encargo: string,
  leerTasks: (plan: string) => string | undefined,
  anterior?: TareaYaEncargada,
): DecisionDeEncargo {
  const porRuta = planesNombrados(encargo);
  const porNombre = porRuta.length > 0 ? porRuta : planesPorSuNombre(encargo);
  // Sin plan nombrado pero con su línea `TAREA:`, es del plan de la última tarea que se le encargó. Medido en Maset: «TAREA: 01
  // Vuelta de ajuste visual…» no nombraba el plan, pasaba por trabajo libre y no contaba como intento (`INTENTOS_POR_TAREA`).
  const planes = porNombre.length === 0 && anterior !== undefined && LINEA_DE_TAREA.test(encargo) ? [anterior.plan] : porNombre;
  const conTareas = planes
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
  const previa = anterior?.plan === plan ? tareas.find((t) => clave(t.numero) === clave(anterior.numero)) : undefined;
  if (anterior !== undefined && previa !== undefined && previa.progreso !== "finalizada") {
    const cuantas = `${String(previa.criterios.hechos)} de ${String(previa.criterios.total)} criterios comprobados`;
    const agotada = anterior.intentos >= INTENTOS_POR_TAREA;
    const cerrarElTurno =
      `Ya se le encargó ${String(anterior.intentos)} veces: NO la mandes otra vez ni pases a otra. Termina el turno y dile a la ` +
      `persona qué criterios de la ${previa.numero} faltan y por qué (lo que ${nombre} contó al devolverla).`;
    if (clave(tarea.numero) !== clave(previa.numero)) {
      return {
        tipo: "rechazo",
        motivo:
          `${nombre} NO HA ARRANCADO: la tarea ${previa.numero} (${previa.titulo}) volvió SIN CERRAR (${cuantas}) y no se pasa a la ` +
          `${tarea.numero} con una tarea abierta. ` +
          (agotada
            ? cerrarElTurno
            : `Vuelve a mandar \`TAREA: ${previa.numero}\` al mismo ${nombre} con lo que dijo que faltaba, para que lo arregle y lo compruebe.`),
      };
    }
    if (agotada) return { tipo: "rechazo", motivo: `${nombre} NO HA ARRANCADO: la tarea ${previa.numero} sigue SIN CERRAR (${cuantas}). ${cerrarElTurno}` };
  }
  const ficha = [
    "",
    "",
    `LA TAREA DE ESTE ENCARGO, de /planes/${plan}/TASKS.md (líneas ${String(tarea.linea)}–${String(tarea.linea + tarea.lineas - 1)}; el resto del plan no hace falta leerlo):`,
    `## ${tarea.numero} — ${tarea.titulo}`,
    tarea.cuerpo,
    "",
    ALCANCE_Y_CIERRE_DE_LA_TAREA,
  ].join("\n");
  return { tipo: "tarea", plan, tarea, encargo: `${encargo}${ficha}` };
}
