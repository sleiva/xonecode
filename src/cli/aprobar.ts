import { interpretAnswer, REJECT_MESSAGE, MAX_APPROVAL_ROUNDS, type Decision } from "../vendor/hitl.js";
import type { PendienteDeAprobacion } from "../core/events.js";
import { conContexto, recortar, type LineaDeDiff } from "../core/diff.js";
import { crearTema } from "./tema.js";
import type { Escribir } from "./stdio.js";

// Los colores del bloque de diff salen del tema — sin TTY son cadena vacía y la salida
// queda limpia para pipes y CI. Mismo patrón que main.ts.
const tema = crearTema(process.stdout.isTTY === true);

/** Contexto alrededor de cada cambio y techo de líneas del bloque de diff. */
const CONTEXTO_DEL_DIFF = 2;
const TECHO_DEL_DIFF = 25;

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
  opciones: {
    interactive?: boolean;
    fichero?: (id: string) => string | undefined;
    /**
     * Las líneas de diff del pendiente (ver `agent/interrupts.ts` → `cambioDe`). Este es
     * el ÚNICO sitio donde el contenido de una escritura se enseña, y es a propósito:
     * aquí se DECIDE sobre ese contenido, y aprobar a ciegas es peor que no aprobar.
     */
    diff?: (id: string) => LineaDeDiff[] | undefined;
  } = {}
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

    const d = opciones.diff?.(p.id);
    if (d) {
      // Contexto alrededor de los cambios y techo de líneas: un diff de 200 líneas no
      // cabe en una pantalla, y las rachas de «igual» no ayudan a decidir nada.
      const { lineas, recortadas } = recortar(conContexto(d, CONTEXTO_DEL_DIFF), TECHO_DEL_DIFF);
      for (const l of lineas) {
        const color = l.tipo === "anadido" ? tema.anadido : l.tipo === "quitado" ? tema.quitado : tema.mudo;
        const signo = l.tipo === "anadido" ? "+ " : l.tipo === "quitado" ? "- " : "  ";
        escribir(`  ${color}${signo}${l.texto}${tema.reset}\n`);
      }
      if (recortadas > 0) escribir(`  … y ${recortadas} líneas más\n`);
    }

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
