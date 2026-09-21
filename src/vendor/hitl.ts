/**
 * Aprobación humana de N escrituras concurrentes.
 *
 * La forma de este módulo sale de la verificación en vivo, no de la intuición:
 *
 * 1. Los interrupts de un subagente SÍ propagan al stream de arriba.
 * 2. Con el orquestador emitiendo dos `task` en un turno, quedan DOS interrupts
 *    pendientes a la vez (`tasks.length === 2`, `next === ["tools","tools"]`).
 * 3. El resume tiene que ser un MAPA por id de interrupt. Un array pelado falla con
 *    "Invalid HITLResponse: decisions must be a non-empty array".
 * 4. El interrupt NO dice de qué subagente viene, así que la atribución viaja en la
 *    `description` que cada subagente pone en su `InterruptOnConfig`.
 *
 * De ahí que esto no pueda ser un "pregunta una cosa y reanuda": hay que recoger
 * todos los pendientes, preguntar por cada uno, y reanudar con un único Command.
 */

export interface PendingInterrupt {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  description: string;
  allowedDecisions: string[];
}

export interface Decision {
  type: "approve" | "reject";
  message?: string;
}

/**
 * Tope de rondas de aprobación. Sin él, un modelo que insista tras cada rechazo
 * convierte el bucle en un ciclo automático de ~200k tokens por ronda. Lo comparten
 * da04 y la consola.
 */
export const MAX_APPROVAL_ROUNDS = 5;

/**
 * El mensaje de rechazo tiene que dejar clarísimo que NO se aplicó nada: si solo dice
 * "no la reintentes", el modelo puede sintetizar la respuesta final como si la
 * escritura hubiese quedado lista — la salida contradiciendo lo que realmente pasó.
 */
export const REJECT_MESSAGE =
  "RECHAZADO por el usuario. Esta operación NO se ha ejecutado y el proyecto NO se " +
  "ha modificado. No la reintentes ni la reformules. En tu respuesta final di " +
  "explícitamente que el cambio no se aplicó porque fue rechazado, y explica qué " +
  "pretendías hacer y por qué, para que el usuario pueda decidir.";

export function collectPending(state: unknown): PendingInterrupt[] {
  const tasks = (state as { tasks?: unknown[] } | null)?.tasks;
  if (!Array.isArray(tasks)) return [];

  const pending: PendingInterrupt[] = [];
  for (const task of tasks) {
    const interrupts = (task as { interrupts?: unknown[] }).interrupts;
    if (!Array.isArray(interrupts)) continue;

    for (const interrupt of interrupts) {
      const { id, value } = interrupt as {
        id?: string;
        value?: {
          actionRequests?: Array<{ name?: string; args?: Record<string, unknown>; description?: string }>;
          reviewConfigs?: Array<{ allowedDecisions?: string[] }>;
        };
      };
      const acciones = value?.actionRequests ?? [];
      if (!id || acciones.length === 0) continue;

      /**
       * **UNA entrada por acción, no por interrupción, y ahí estaba el fallo.**
       *
       * `actionRequests` es una LISTA: cuando el modelo pide varias escrituras en la misma
       * tanda —lo hace DeepSeek, y cualquiera que paralelice—, la interrupción llega con
       * todas dentro. Leer solo `[0]` tenía dos consecuencias, y la silenciosa era la peor:
       * al usuario se le preguntaba por la PRIMERA y las demás no se veían; y al reanudar
       * se mandaba UNA decisión para N llamadas colgadas, que la librería rechaza con
       * «Number of human decisions (1) does not match number of hanging tool calls (3)».
       *
       * El `id` se compone porque es la CLAVE con la que todo lo de arriba empareja
       * decisiones —mapas en `turnoReal.ts`, la tarjeta de aprobación, el cable— y cambiar
       * su naturaleza obligaría a tocar las cuatro capas. Compuesto sigue siendo una cadena
       * opaca para todos ellos, y `buildResume` es el único que lo abre. Lleva también el
       * TOTAL porque al reanudar hay que entregar exactamente N decisiones y en ORDEN: sin
       * el total, una decisión que faltara al final encogería la lista sin que se note.
       */
      acciones.forEach((action, indice) => {
        if (!action?.name) return;
        pending.push({
          id: componerId(id, indice, acciones.length),
          tool: action.name,
          args: action.args ?? {},
          description: action.description ?? `Ejecutar ${action.name}`,
          // Cada acción tiene su propia configuración de revisión; se cae a la primera
          // porque la librería la omite cuando todas comparten la misma.
          allowedDecisions:
            value?.reviewConfigs?.[indice]?.allowedDecisions
            ?? value?.reviewConfigs?.[0]?.allowedDecisions
            ?? ["approve", "reject"],
        });
      });
    }
  }
  return pending;
}

/**
 * El separador del id compuesto. Un carácter que no aparece en un id de interrupción de
 * langgraph (son hexadecimales con guiones), así que partir por el PRIMERO es seguro.
 */
const SEPARADOR_DE_ACCION = "#";

function componerId(id: string, indice: number, total: number): string {
  // Con una sola acción el id se queda como estaba: es el caso normal y así no cambia nada
  // de lo que ya circula —transcripts guardados, tarjetas en vuelo— por un caso que no era.
  return total === 1 ? id : `${id}${SEPARADOR_DE_ACCION}${indice}/${total}`;
}

/** `«abc#1/3»` → la interrupción, su índice y cuántas hay. Un id simple es `{indice:0,total:1}`. */
function descomponerId(compuesto: string): { id: string; indice: number; total: number } {
  const corte = compuesto.indexOf(SEPARADOR_DE_ACCION);
  if (corte < 0) return { id: compuesto, indice: 0, total: 1 };
  const [indice, total] = compuesto.slice(corte + 1).split("/").map(Number);
  if (!Number.isInteger(indice) || !Number.isInteger(total) || total < 1) {
    return { id: compuesto, indice: 0, total: 1 };
  }
  return { id: compuesto.slice(0, corte), indice: indice!, total: total! };
}

/**
 * El mapa `{ id → { decisions: [...] } }` que espera `new Command({ resume })`.
 *
 * **Una interrupción con N acciones necesita N decisiones, en ORDEN.** Por eso esto vuelve
 * a agrupar lo que `collectPending` desplegó: la lista se dimensiona con el total que viaja
 * en el id, y cada decisión se coloca en su índice.
 *
 * **El hueco que quede se RECHAZA**, que es la dirección de siempre: una decisión que falta
 * es una que nadie tomó, y aprobar por omisión una escritura sobre el proyecto del cliente
 * es justo lo que la aprobación existe para impedir. Aquí no debería pasar nunca —quien
 * llama resuelve todas las pendientes, a mano o automáticas—, pero si pasa, el turno sigue
 * y lo que no se decidió no se aplica, en vez de reventar con un descuadre de números.
 */
export function buildResume(
  decisions: Map<string, Decision>
): Record<string, { decisions: Decision[] }> {
  const porInterrupcion = new Map<string, Decision[]>();
  for (const [compuesto, decision] of decisions) {
    const { id, indice, total } = descomponerId(compuesto);
    let lista = porInterrupcion.get(id);
    if (lista === undefined) {
      lista = Array.from({ length: total }, () => ({ type: "reject" as const, message: REJECT_MESSAGE }));
      porInterrupcion.set(id, lista);
    }
    // Una lista más corta de lo que dice este id significa dos totales distintos para la
    // misma interrupción: se estira, porque quedarse corto es el descuadre que esto arregla.
    while (lista.length < total) lista.push({ type: "reject", message: REJECT_MESSAGE });
    lista[indice] = decision;
  }
  const resume: Record<string, { decisions: Decision[] }> = {};
  for (const [id, lista] of porInterrupcion) resume[id] = { decisions: lista };
  return resume;
}

/**
 * Respuestas que cuentan como aprobar.
 *
 * El Enter a secas ("") solo vale con un terminal de verdad detrás. Fuera de un TTY
 * —un pipe, CI, un cron— una línea en blanco no demuestra que haya nadie mirando, y
 * esto aprueba escrituras sobre un proyecto real. Ahí se exige un "s" explícito.
 */
const APPROVALS_TTY = new Set(["", "s", "si", "sí", "y", "yes"]);
const APPROVALS_NO_TTY = new Set(["s", "si", "sí", "y", "yes"]);

/**
 * Interpreta una respuesta de aprobación, sin imprimir nada ni preguntar: es la
 * parte pura de promptForDecisions, para que la consola TUI la reutilice.
 *
 * Fail-closed: el Enter a secas solo aprueba con `interactive: true` explícito (un
 * TTY de verdad detrás); cualquier otra respuesta que no se entiende es rechazo.
 */
export function interpretAnswer(answer: string, opts: { interactive?: boolean } = {}): Decision {
  const approvals = opts.interactive === true ? APPROVALS_TTY : APPROVALS_NO_TTY;
  if (approvals.has(answer.trim().toLowerCase())) return { type: "approve" };
  return { type: "reject", message: REJECT_MESSAGE };
}

export async function promptForDecisions(
  pending: PendingInterrupt[],
  ask: (question: string) => Promise<string>,
  opts: { interactive?: boolean } = {}
): Promise<Map<string, Decision>> {
  const decisions = new Map<string, Decision>();

  for (const [i, p] of pending.entries()) {
    console.log(`\n${"─".repeat(64)}`);
    console.log(`APROBACIÓN ${i + 1}/${pending.length}: ${p.description}`);
    console.log(`  tool: ${p.tool}`);
    // La `description` propia sustituye a la autogenerada, que era la que traía los
    // args. Hay que imprimirlos aquí o el usuario aprueba a ciegas.
    console.log(`  args: ${JSON.stringify(p.args, null, 2).replace(/\n/g, "\n        ")}`);

    const answer = await ask("¿Aprobar? [S/n] ");
    const decision = interpretAnswer(answer, opts);
    decisions.set(p.id, decision);
    console.log(decision.type === "approve" ? "  → aprobado" : "  → rechazado");
  }
  return decisions;
}
