/**
 * **El desarrollador CONTINUO** (como Codex: «keep going until the query is completely resolved»): recibe la primera tarea
 * de un plan y sigue con las demás en la MISMA conversación, pidiendo la siguiente con `siguiente_tarea`. Puro.
 *
 * Medido en las pasadas de la calculadora (03-11-2026): con UNA tarea por encargo, cada encargo era una conversación nueva
 * del desarrollador —su memoria rehecha (reducida o ventana), que no sale de la caché—, y volvía a leer los ficheros y a
 * navegar la app desde cero. Pasarle la tarea siguiente como RESULTADO DE UNA TOOL, y no como un mensaje nuevo, deja el
 * prefijo intacto: ni se rehace la memoria ni se corta el eco del razonamiento de DeepSeek (que no lo repone tras un
 * mensaje de usuario). La ficha de cada tarea la sigue poniendo el código delante (`encargoDeTarea.ts`).
 */
import type { TareaDelPlan } from "./tareasDelPlan.js";

export const NOMBRE_SIGUIENTE_TAREA = "siguiente_tarea";

/** `01`, `T1` y `1` son la misma tarea. */
const clave = (numero: string): string => String(Number.parseInt(numero.replace(/^T/i, ""), 10));

/**
 * La tarea que toca después de `actual`: la primera, en el orden del plan, que no está finalizada, no es la actual y no se
 * cerró ya en este encargo (`cerradas`). Así no vuelve a una que dejó a medias ni da vueltas en círculo.
 */
export function siguienteTareaPendiente(
  tareas: readonly TareaDelPlan[],
  actual: string,
  cerradas: ReadonlySet<string>
): TareaDelPlan | undefined {
  const fuera = new Set([...cerradas, actual].map(clave));
  return tareas.find((t) => t.progreso !== "finalizada" && !fuera.has(clave(t.numero)));
}

/** Lo que devuelve `siguiente_tarea` con una tarea más: la ficha de ESA tarea, compuesta como la del primer encargo. */
export function textoDeSiguienteTarea(cerrada: string, encargo: string): string {
  return (
    `Tarea ${cerrada} cerrada. SIGUE en esta misma conversación con la SIGUIENTE (lo que ya leíste y aprendiste sigue valiendo: ` +
    "no releas lo que no cambió):\n\n" +
    `${encargo}\n\nCuando la tengas probada y marcada, vuelve a llamar a \`${NOMBRE_SIGUIENTE_TAREA}\`.`
  );
}

export function textoSinMasTareas(plan: string, cerradas: readonly string[]): string {
  return (
    `No quedan tareas pendientes en /planes/${plan}/ (cerradas en este encargo: ${cerradas.join(", ") || "ninguna"}). ` +
    "Termina con tu informe final: por cada tarea, qué hiciste, qué probaste en el aparato y lo que quede por arreglar."
  );
}

/** Lo que devuelve `siguiente_tarea` la primera vez que se pide sin ningún criterio de la tarea marcado. */
export function textoSinEvidencia(tarea: string, total: number): string {
  return (
    `La tarea ${tarea} NO se cierra todavía: tiene ${String(total)} criterio(s) y no hay ninguno marcado. Prueba en el aparato ` +
    "cada uno (con `xone-probar`, varios casos en una orden), marca con `marcar_criterios_del_plan` los comprobados y, de los " +
    `que no se puedan comprobar, di por qué. Después vuelve a llamar a \`${NOMBRE_SIGUIENTE_TAREA}\`.`
  );
}

export const DESCRIPCION_DE_SIGUIENTE_TAREA =
  "Cierra la tarea del plan en la que estás y te da la ficha de la SIGUIENTE, para seguir en esta misma conversación. " +
  "Llámala cuando la tarea esté hecha, probada en el aparato y marcada (o cuando ya no puedas avanzar en ella: dilo en " +
  "`resumen`). Si no quedan tareas, te lo dice y cierras con tu informe final.";

/** Al desarrollador, detrás de su bucle: cómo sigue. */
export const TEXTO_DEL_DEVELOPER_CONTINUO = [
  `TRABAJAS EL PLAN ENTERO EN ESTE ENCARGO: al acabar una tarea (probada y marcada), llama a \`${NOMBRE_SIGUIENTE_TAREA}\` con un`,
  "`resumen` de una línea; te devuelve la ficha de la siguiente y sigues aquí mismo, con lo que ya sabes. No devuelvas el",
  "encargo hasta que te diga que no quedan tareas.",
].join("\n");

/**
 * Al orquestador: una sola delegación por plan, y SIN decirle al desarrollador que siga. Medido en la pasada 13: con
 * «seguirá él con las demás», el orquestador le escribió «cuando la cierres sigue con la 2 en el mismo encargo», y el
 * desarrollador construyó T1 y T2 a la vez sin marcar nada. Codex, con el mismo modelo, mandaba «SOLO la Tarea 1» y la
 * siguiente después, al mismo hilo. Aquí la siguiente la pone el harness al cerrar la tarea (`siguiente_tarea`).
 */
export const TEXTO_DEL_ORQUESTADOR_CONTINUO = [
  "DESARROLLADOR CONTINUO: a developer-xone mándale SOLO la PRIMERA tarea pendiente del plan (`TAREA: <número>`) y NO le",
  "digas que siga con las demás: la siguiente se la da el harness, en el mismo encargo, cuando cierre la actual con sus",
  "criterios marcados. Volverá cuando no quede ninguna. Al volver, no le mandes otra salvo que su informe diga que alguna",
  "se quedó sin hacer.",
].join("\n");
