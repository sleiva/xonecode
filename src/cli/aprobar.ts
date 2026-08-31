import { interpretAnswer, REJECT_MESSAGE, MAX_APPROVAL_ROUNDS, type Decision } from "../vendor/hitl.js";
import type { PendienteDeAprobacion } from "../core/events.js";
import type { Escribir } from "./stdio.js";

export { MAX_APPROVAL_ROUNDS, REJECT_MESSAGE, type Decision };

/** Leer una línea. Entra por parámetro: sin esto, esto no se puede probar. */
export type Preguntar = (pregunta: string) => Promise<string>;

/**
 * Pregunta por cada pendiente y devuelve las decisiones, en el mapa por id.
 *
 * **Fail-closed, y no es una preferencia: es la asimetría que protege el proyecto del
 * usuario.** Aprobar ESCRIBE; rechazar no toca nada. Así que lo que no se entiende es
 * RECHAZO, siempre. Y el Enter a secas solo aprueba con `interactive: true` —un TTY de
 * verdad detrás—: en un pipe o en CI una línea en blanco no demuestra que haya nadie
 * mirando, y esto aprueba escrituras sobre un proyecto real.
 *
 * `interpretAnswer` ya implementa las dos reglas y está medido: se reusa, no se reescribe.
 */
export async function pedirDecisiones(
  pendientes: PendienteDeAprobacion[],
  preguntar: Preguntar,
  escribir: Escribir,
  opciones: { interactive?: boolean; fichero?: (id: string) => string | undefined } = {}
): Promise<Map<string, Decision>> {
  const decisiones = new Map<string, Decision>();
  for (const [i, p] of pendientes.entries()) {
    escribir(`\n${"─".repeat(60)}\n`);
    escribir(`APROBACIÓN ${i + 1}/${pendientes.length}\n`);
    escribir(`  ${p.descripcion}\n`);
    const f = opciones.fichero?.(p.id);
    // Solo la RUTA, nunca los argumentos: `write_file` lleva el contenido entero del
    // fichero. Pero aprobar a ciegas es peor que no aprobar, así que la ruta sí.
    if (f) escribir(`  fichero: ${f}\n`);
    escribir(`  quién:   ${p.origen}\n`);

    const respuesta = await preguntar(
      opciones.interactive === true ? "¿Aprobar? [S/n] " : "¿Aprobar? [s/N] "
    );
    const decision = interpretAnswer(respuesta, opciones);
    decisiones.set(p.id, decision);
    escribir(decision.type === "approve" ? "  → APROBADO\n" : "  → rechazado, no se ha aplicado nada\n");
  }
  return decisiones;
}

/** El `preguntar` de producción: una línea de stdin. */
export function preguntarPorStdin(): Preguntar {
  return async (pregunta: string): Promise<string> => {
    process.stdout.write(pregunta);
    return new Promise((resolver) => {
      const limpiar = (): void => {
        process.stdin.off("data", onData);
        process.stdin.off("end", onEnd);
        process.stdin.pause();
      };
      const onData = (d: Buffer): void => {
        limpiar();
        resolver(d.toString().split("\n")[0] ?? "");
      };
      // **Si stdin se cierra sin dar nada, se resuelve con cadena vacía.** Sin esto el
      // proceso se queda esperando un `data` que no va a llegar (un cron, un `< /dev/null`)
      // y el turno se cuelga para siempre. Y la cadena vacía es lo correcto además de lo
      // seguro: `interpretAnswer` sin TTY la trata como RECHAZO.
      const onEnd = (): void => {
        limpiar();
        resolver("");
      };
      process.stdin.resume();
      process.stdin.on("data", onData);
      process.stdin.on("end", onEnd);
    });
  };
}
