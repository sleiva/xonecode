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

/**
 * Una línea del plan, CON lo que le pasa al fichero.
 *
 * `texto` es la línea entera tal como sale por el scrollback —signo y ruta, con sus dos
 * espacios de sangría—: la tarjeta y el terminal enseñan lo MISMO porque es el mismo texto,
 * y el día que alguien cambie el formato de uno tiene que cambiar el del otro.
 *
 * `cambio` es lo que el signo SIGNIFICA, y viaja aparte por la razón de siempre: `+` es
 * sintaxis. Una piel que quisiera colorear lo que se añade leería el primer carácter de
 * `texto`, y eso se rompe el día que la sangría cambie de ancho o que una ruta empiece por
 * `-` —enseñando en verde un borrado—, sin un solo error. Es el MISMO dato que
 * `CambioLocal.clase` (`core/planDeSubida.ts`), con los mismos tres valores.
 *
 * **Ausente = esta línea no habla de un fichero**: hoy solo pasa con la cabecera («SUBIDA A
 * CLOUDSTUDIO — N operaciones»), que no es ni un añadido ni un borrado. Distinto de
 * `"nuevo"`, que sí lo es.
 */
export interface LineaDelPlan {
  texto: string;
  cambio?: "nuevo" | "modificado" | "borrado";
}

/**
 * Una pregunta cuya respuesta es SÍ o NO, con lo que se decide delante.
 *
 * Existe porque una piel rica no puede saber si el campo de texto sobra adivinándolo del
 * enunciado: el `[s/N]` es SINTAXIS, y el día que alguien reescriba el prompt —o lo
 * traduzca— la tarjeta que ofrece botones se quedaría con un editor, o al revés: dos
 * botones sobre una pregunta de texto libre, que es el caso que no puede pasar y no daría
 * ningún error. Aquí viaja la INTENCIÓN, que es lo mismo que ya hace `LineaDeConsola`
 * diciendo si una línea es prosa.
 *
 * `lineas` es lo que se decide, línea a línea, tal como se enseña en el terminal: quien
 * pregunta ya lo escribe con `escribir`, y una piel con tarjeta lo repite DENTRO de ella
 * porque es el paso donde se DECIDE — la misma razón que hace viajar el diff entero en la
 * aprobación de escrituras. No es contenido nuevo por el cable: son las mismas líneas que
 * ese `escribir` ya manda.
 *
 * **Y el enunciado va SIN la pista de tecleo.** `politicaInteractiva` pregunta «¿Subir a
 * CloudStudio?», no «¿Subir a CloudStudio? [s/N]»: el `[s/N]` es la pista de una piel que
 * se contesta ESCRIBIENDO, y la pone esa piel (`PISTA_DE_DECISION`, ver abajo). Una tarjeta
 * con dos botones no tiene nada que teclear, y llevarlo dentro del texto dejaba al cliente
 * la opción de enseñarlo —donde se lee como «escribe s o n» delante de un botón— o de
 * recortarlo a ciegas, que es leer sintaxis por la puerta de atrás.
 *
 * La respuesta sigue siendo una cadena por la misma puerta de siempre (`interpretAnswer`:
 * `"s"` autoriza, cualquier otra cosa rechaza), y las dos caras de los botones son esas
 * dos, no un vocabulario nuevo.
 */
export interface DecisionDeConsola {
  lineas: readonly LineaDelPlan[];
}

/**
 * La pista de una pregunta que se contesta TECLEANDO: `[s/N]`, con el defecto en
 * mayúscula.
 *
 * La pone la piel que tiene un teclado delante —stdio y la TUI—, y solo esa: son las dos
 * únicas que resuelven una pregunta con lo que alguien escriba. La consola web no la pone
 * porque su tarjeta no tiene campo.
 *
 * Es SIEMPRE `[s/N]` y nunca `[S/n]` porque el Enter a secas NO aprueba una decisión: la
 * asimetría de `CLAUDE.md` —aprobar ESCRIBE— y `politicaInteractiva` llama a
 * `interpretAnswer` sin `interactive`, así que la cadena vacía rechaza aquí incluso con un
 * TTY de verdad. La pista de la APROBACIÓN de escrituras sí alterna, y por eso la construye
 * `pedirDecisiones` en el sitio donde se sabe si hay humano (`hayHumano()`): una pista no
 * puede viajar con la pregunta cuando su contenido depende de la piel que la va a enseñar.
 *
 * **Límite declarado**: una decisión no puede cambiar su pista por pregunta. Hoy solo hay
 * una que la use —la subida— y su defecto es fijo; el día que una decisión se apruebe con
 * Enter, esto tiene que bajar al que la formula, como ya hace `aprobar.ts`.
 */
export const PISTA_DE_DECISION = " [s/N] ";

/**
 * Leer una línea. Entra por parámetro: sin esto, esto no se puede probar.
 *
 * El segundo parámetro es la FORMA de la respuesta, y es opcional a propósito: la mayoría
 * de las preguntas —«número (Enter cancela)», una URL, una clave— son texto libre, y una
 * implementación que no lo declare sigue valiendo (una función con menos parámetros es
 * asignable), así que stdio, la TUI y los dobles de los tests no cambian de una línea.
 */
export type Preguntar = (pregunta: string, decision?: DecisionDeConsola) => Promise<string>;

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
 *
 * **`eof` existe porque un TTY no basta para saber que hay alguien.** `crearPreguntar`
 * (`cli/stdio.ts`) devuelve cadena vacía por DOS motivos distintos que llegan idénticos:
 * el usuario pulsó Enter, o la entrada se acabó (Ctrl-D, un stdin agotado a mitad de
 * turno). Con `interactive: true` la cadena vacía APRUEBA —el Enter vale por un sí, y es
 * un rasgo querido: quien lo pulsa tiene el diff delante—, así que sin distinguirlas un
 * Ctrl-D aprobaba una escritura que nadie llegó a ver. Con `eof`, un readline cerrado
 * degrada la pregunta a no-interactiva y ahí la cadena vacía ya rechaza. No se cambió
 * `Preguntar` a `string | null`: contados a mano hay 18 sitios que llaman a un `preguntar`
 * fuera de los tests, y en 16 la cadena vacía significa «cancela / usa el valor por
 * omisión» —que es lo correcto también ante un EOF—. Solo las dos PUERTAS necesitan
 * distinguir: esta y la subida a CloudStudio (`consola.ts#politicaInteractiva`, que lo
 * resolvió de otra forma: allí el Enter no vale por un sí y el prompt es `[s/N]` siempre).
 */
export async function pedirDecisiones(
  pendientes: PendienteDeAprobacion[],
  preguntar: Preguntar,
  escribir: Escribir,
  opciones: {
    interactive?: boolean;
    /**
     * ¿Se acabó la entrada? `crearDetectorDeEof` (`cli/stdio.ts`) es quien lo sabe para el
     * readline de la consola; `eofDeStdin` (aquí abajo) para el stdin crudo del disparo
     * único. Ausente = no se sabe, y entonces manda `interactive` a secas: los llamadores
     * que no lo pasan se comportan exactamente igual que antes.
     */
    eof?: () => boolean;
    fichero?: (id: string) => string | undefined;
    /**
     * Las líneas de diff del pendiente (ver `agent/turno/interrupts.ts` → `cambioDe`). Este es
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

    // El default VISIBLE tiene que coincidir con el real, y con la entrada agotada el
    // real ya no es «sí»: enseñar `[S/n]` ahí sería mentir en el paso que escribe.
    const hayHumano = (): boolean => opciones.interactive === true && !(opciones.eof?.() ?? false);
    const respuesta = await preguntar(hayHumano() ? "¿Aprobar? [S/n] " : "¿Aprobar? [s/N] ");
    // Se vuelve a mirar DESPUÉS de preguntar: el readline puede cerrarse a media pregunta
    // —`crearPreguntar` lo documenta como caso propio y resuelve con cadena vacía—, y
    // mirarlo solo antes dejaría esa cadena vacía entrando otra vez por la puerta del Enter.
    const decision = interpretAnswer(respuesta, { interactive: hayHumano() });
    decisiones.set(p.id, decision);
    escribir(decision.type === "approve" ? "  → APROBADO\n" : "  → rechazado, no se ha aplicado nada\n");
  }
  return decisiones;
}

/**
 * El EOF de stdin CRUDO, hermano de `crearDetectorDeEof` para quien no tiene un readline
 * (el disparo único de `cli/run.ts`). `readableEnded` pasa a `true` al emitirse `end`
 * — medido en este Node 22, junto con lo otro que hace falta saber aquí: un `on("end")`
 * registrado DESPUÉS del EOF ya no dispara nunca.
 */
export function eofDeStdin(): boolean {
  return process.stdin.readableEnded === true;
}

/** El `preguntar` de producción: una línea de stdin. */
export function preguntarPorStdin(): Preguntar {
  return async (pregunta: string): Promise<string> => {
    process.stdout.write(pregunta);
    // Si stdin YA se acabó, el `on("end")` de abajo no volvería a dispararse (medido) y
    // esto se quedaría esperando para siempre. Misma guarda de «ya cerrado» que
    // `crearPreguntar`, y la misma respuesta: cadena vacía.
    if (eofDeStdin()) return "";
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
