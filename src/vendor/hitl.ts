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
      const action = value?.actionRequests?.[0];
      if (!id || !action?.name) continue;

      pending.push({
        id,
        tool: action.name,
        args: action.args ?? {},
        description: action.description ?? `Ejecutar ${action.name}`,
        allowedDecisions: value?.reviewConfigs?.[0]?.allowedDecisions ?? ["approve", "reject"],
      });
    }
  }
  return pending;
}

/** El mapa `{ id → { decisions: [...] } }` que espera `new Command({ resume })`. */
export function buildResume(
  decisions: Map<string, Decision>
): Record<string, { decisions: Decision[] }> {
  const resume: Record<string, { decisions: Decision[] }> = {};
  for (const [id, decision] of decisions) {
    resume[id] = { decisions: [decision] };
  }
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
