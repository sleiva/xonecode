/**
 * Las rachas de líneas SIN CAMBIOS de un diff, plegadas — no quitadas.
 *
 * El modal de aprobación enseña el diff de una escritura, y su regla es que el contenido se
 * vea: es el paso donde se DECIDE sobre él. Pero «que se vea» y «volcarlo entero de golpe»
 * no son lo mismo, y medido en la pantalla del usuario con un `.xne` de sesenta campos, lo
 * segundo esconde lo primero: la tarjeta se llenaba de líneas iguales y había que buscar el
 * cambio a ojo. Las otras dos pieles ya resuelven esto recortando (`conContexto` +
 * `recortar`, `cli/aprobar.ts` y `cli/tui/aprobarTui.tsx`), pero ahí el recorte se PIERDE
 * porque un terminal no hace scroll ni tiene dónde pulsar.
 *
 * Aquí no hace falta perder nada: la racha se dobla en una línea que dice cuántas son y se
 * abre con un clic. Es exactamente el trato que el chat le da al trabajo del agente («No se
 * BORRA: sigue a un clic»), y lo que mantiene cierta la regla del modal — el contenido sigue
 * estando entero, a una pulsación.
 *
 * Módulo aparte y puro por lo mismo que `numerarParche.ts` y `protegerDolares.ts`: la regla
 * se prueba sin montar nada, y el componente solo decide cómo se pinta.
 */

/** La misma forma que `core/diff.ts#LineaDeDiff`, redeclarada como manda la frontera del
 *  cliente (`src/web/frontera.test.ts`). */
export type LineaDeDiff = { tipo: "igual" | "anadido" | "quitado"; texto: string };

/**
 * Cuántas líneas iguales se dejan a la vista a cada lado de un cambio.
 *
 * Tres y no las dos de las pieles de terminal: ahí el contexto compite con las 25 líneas de
 * techo de una pantalla de texto, y aquí la tarjeta hace scroll. Tres es lo que deja ver la
 * etiqueta que envuelve a un cambio en un `.xne` sin tener que abrir nada.
 */
export const CONTEXTO_DEL_DIFF = 3;

/**
 * Por debajo de esto una racha NO se pliega.
 *
 * Plegar dos líneas para poner en su sitio un «… 2 líneas sin cambios» no ahorra espacio y
 * encima cambia una línea de contenido por un control: sale peor. El mínimo se mide sobre lo
 * que se plegaría, no sobre la racha entera.
 */
export const MINIMO_PLEGABLE = 3;

/**
 * Un tramo del diff ya decidido: o son líneas a la vista, o una racha plegada.
 *
 * `plegado` lleva sus líneas DENTRO y no solo el número, que es lo que permite abrirlo sin
 * volver a pedir nada — el diff ya está en memoria, y una segunda petición al servidor por
 * unas líneas que ya tenemos sería inventarse un viaje.
 */
export type TramoDeDiff =
  | { clase: "lineas"; lineas: readonly LineaDeDiff[] }
  | { clase: "plegado"; lineas: readonly LineaDeDiff[] };

/** ¿Es una racha de las que se pueden plegar? */
const esIgual = (l: LineaDeDiff): boolean => l.tipo === "igual";

/**
 * Parte el diff en tramos, plegando el medio de cada racha de líneas iguales.
 *
 * Los extremos son un caso propio y no una excepción: una racha al PRINCIPIO no envuelve
 * nada por arriba —no hay cambio antes— así que solo conserva sus últimas `contexto` líneas,
 * y la del final, solo las primeras. Sin eso, un fichero con el único cambio en la línea 300
 * seguía abriendo con trescientas líneas de cabecera a la vista.
 */
export function plegarIguales(
  lineas: readonly LineaDeDiff[],
  contexto: number = CONTEXTO_DEL_DIFF
): TramoDeDiff[] {
  const tramos: TramoDeDiff[] = [];
  /** Lo que se va a pintar tal cual, acumulado hasta que aparezca un plegado. */
  let alaVista: LineaDeDiff[] = [];
  const volcar = (): void => {
    if (alaVista.length > 0) tramos.push({ clase: "lineas", lineas: alaVista });
    alaVista = [];
  };

  let i = 0;
  while (i < lineas.length) {
    const linea = lineas[i]!;
    if (!esIgual(linea)) {
      alaVista.push(linea);
      i += 1;
      continue;
    }
    // Toda la racha de iguales de una vez: lo que se decide es cuánto de ella se ve.
    let fin = i;
    while (fin < lineas.length && esIgual(lineas[fin]!)) fin += 1;
    const racha = lineas.slice(i, fin);
    // Cuánto se conserva a cada lado. En los extremos del diff no hay cambio que envolver,
    // así que ese lado no reserva contexto.
    const antesDeUnCambio = fin < lineas.length;
    const despuesDeUnCambio = i > 0;
    const cabeza = despuesDeUnCambio ? Math.min(contexto, racha.length) : 0;
    const cola = antesDeUnCambio ? Math.min(contexto, racha.length - cabeza) : 0;
    const plegadas = racha.length - cabeza - cola;
    if (plegadas < MINIMO_PLEGABLE) {
      alaVista.push(...racha);
    } else {
      alaVista.push(...racha.slice(0, cabeza));
      volcar();
      tramos.push({ clase: "plegado", lineas: racha.slice(cabeza, cabeza + plegadas) });
      alaVista.push(...racha.slice(cabeza + plegadas));
    }
    i = fin;
  }
  volcar();
  return tramos;
}
