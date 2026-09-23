/**
 * Cuántas columnas caben, y qué pasa con la que no cabe.
 *
 * Desde que el panel de vistas (Ficheros, Revisión, Trazas…) puede vivir a la DERECHA del
 * chat en vez de sustituirlo, la pantalla tiene tres columnas que compiten por el mismo
 * ancho: la barra lateral, la conversación y el panel. Quién se queda fuera lo decide esta
 * función, y lo decide en CÓDIGO por dos motivos:
 *
 * 1. **Lo que no cabe se DESMONTA**, y eso no lo sabe hacer una hoja de estilos. Es la regla
 *    de siempre de esta consola: un elemento invisible sigue siendo tabulable, así que se
 *    llega con el teclado a botones que no se ven.
 * 2. **El ancho de la barra y el del panel los pone JS** (los recuerda el navegador y se
 *    arrastran con el ratón), así que un `@media` no puede consultarlos: con la misma
 *    ventana y la barra estrecha caben tres columnas, y con la barra ancha no.
 *
 * Y siendo pura, se prueba entera sin montar nada — que es lo que impide que esta regla
 * acabe siendo una de las que este repo llama «escrita y no probada».
 */

/**
 * El suelo de la conversación. Por debajo de esto el chat deja de ser un chat: el
 * compositor lleva tres bandas (modelo y esfuerzo arriba, el campo en medio, el modo y el
 * botón abajo) y el transcript lleva código en bloques que no se parten.
 *
 * No sale de la hoja copiada: su `--dsh-chat-content-width` es un `clamp(680px, …)` aplicado
 * como `max-width`, y un `max-width` nunca ensancha nada, así que no obliga a ningún suelo
 * — solo dice hasta dónde se deja crecer el texto.
 */
export const ANCHO_MINIMO_DEL_CHAT = 560;

/**
 * El suelo del panel. Es el ancho por debajo del cual sus dos inquilinos más apretados
 * dejan de contestar lo que existen para contestar: el árbol de Ficheros con la ruta de un
 * fichero de verdad al lado, y un diff de Revisión, que es texto que no se puede reflujar.
 */
export const ANCHO_MINIMO_DEL_PANEL = 360;

/** Lo que mide el panel la primera vez, mientras nadie lo haya arrastrado. */
export const ANCHO_PANEL_POR_OMISION = 480;

/**
 * El tope duro, el mismo papel que `ANCHO_BARRA_MAXIMO` tiene en la barra.
 *
 * Era 720 y se quedaba corto: pedido por él, mirando la pantalla, «el resize tiene un tope,
 * dejarlo más». Un diff de Revisión o un `.xne` largo en Ficheros se leen mejor anchos, y el
 * que de verdad protege algo es el OTRO techo —el que deja al chat su `ANCHO_MINIMO_DEL_CHAT`,
 * en `acotarAnchoDePanel`—, que es el que impide que el panel se lleve la conversación. Con un
 * panel ancho la barra se pliega sola para hacerle sitio (`repartoDeColumnas`, paso 2).
 */
export const ANCHO_PANEL_MAXIMO = 1400;

export type RepartoDeColumnas = {
  /**
   * La barra lateral. **`plegada` aquí no es lo mismo que la preferencia del usuario**: esto
   * es lo que se PINTA ahora, y puede estar plegada porque no cabe aunque él la quiera
   * abierta. Quien recuerda la preferencia no debe escribir nunca lo que salga de aquí, o
   * estrechar la ventana una vez dejaría la barra plegada para siempre.
   */
  readonly barra: "abierta" | "plegada";
  /**
   * Dónde vive el panel de vistas:
   *
   * - `columna`: a la derecha del chat, que se queda entero con su compositor.
   * - `centro`: ocupa el sitio del chat, que es como se comportaba esta consola antes de
   *   que hubiera tercera columna — y sigue siendo lo correcto en una ventana estrecha.
   * - `cerrado`: no está.
   */
  readonly panel: "columna" | "centro" | "cerrado";
};

/**
 * El reparto. El orden de las preguntas ES la política, y va de más generoso a menos:
 *
 * 1. ¿Caben las tres? Entonces las tres.
 * 2. ¿Caben el chat y el panel sin la barra? Entonces **la barra se pliega sola** para
 *    hacerle sitio al panel. Es la única concesión automática, y es transitoria: en cuanto
 *    la ventana vuelve a dar, la barra vuelve.
 * 3. Ni eso: el panel ocupa el centro, como siempre.
 *
 * **Con el panel CERRADO no hay concesión ninguna: manda el usuario y punto.** Es
 * deliberado, y el motivo es que el botón de la barra no puede quedarse muerto: si el ancho
 * la plegara por su cuenta sin panel de por medio, pulsar «Mostrar la barra lateral» no
 * tendría ningún efecto y no habría nada que hacer al respecto. Con el panel abierto sí lo
 * hay —cerrarlo—, y eso es lo que hace ese botón cuando el reparto le ha quitado el sitio.
 * Así que estrechar la ventana a secas se comporta exactamente como antes de que existiera
 * la tercera columna.
 */
export function repartoDeColumnas({
  anchoVentana,
  anchoBarra,
  anchoPanel,
  barraPlegadaPorElUsuario,
  panelAbierto,
}: {
  /** `window.innerWidth`. Lo que no sea un número positivo se lee como «no se ha podido
   *  medir», y entonces se decide como si sobrara sitio: el lado que no esconde nada. */
  anchoVentana: number;
  anchoBarra: number;
  anchoPanel: number;
  /** La preferencia de ESTE navegador, la que el usuario puso con el botón. */
  barraPlegadaPorElUsuario: boolean;
  panelAbierto: boolean;
}): RepartoDeColumnas {
  const ventana = Number.isFinite(anchoVentana) && anchoVentana > 0 ? anchoVentana : Number.POSITIVE_INFINITY;
  const panel = Math.max(anchoPanel, ANCHO_MINIMO_DEL_PANEL);

  if (!panelAbierto) {
    return { barra: barraPlegadaPorElUsuario ? "plegada" : "abierta", panel: "cerrado" };
  }
  if (!barraPlegadaPorElUsuario && ventana >= anchoBarra + ANCHO_MINIMO_DEL_CHAT + panel) {
    return { barra: "abierta", panel: "columna" };
  }
  if (ventana >= ANCHO_MINIMO_DEL_CHAT + panel) {
    return { barra: "plegada", panel: "columna" };
  }
  // El panel ya no le disputa el sitio a la barra —ocupa el del chat—, así que aquí tampoco
  // hay nada que conceder: vuelve a mandar el usuario.
  return { barra: barraPlegadaPorElUsuario ? "plegada" : "abierta", panel: "centro" };
}

/**
 * El ancho del panel, acotado. Misma forma que `acotarAnchoDeBarra` —y por el mismo
 * motivo— con una diferencia que no es cosmética: **el techo se calcula contra el suelo del
 * CHAT, no contra una fracción de la ventana**.
 *
 * Con una fracción, arrastrar el panel podía llevarse la conversación por debajo de su
 * suelo, y entonces `repartoDeColumnas` cambiaba de rama EN MEDIO del gesto: el panel
 * saltaba de la columna al centro mientras lo arrastrabas. Atando el techo a lo que le
 * queda al chat, el arrastre no puede provocar ese salto.
 */
export function acotarAnchoDePanel(px: number, anchoVentana?: number): number {
  if (!Number.isFinite(px)) return ANCHO_PANEL_POR_OMISION;
  const techo =
    anchoVentana === undefined || !Number.isFinite(anchoVentana)
      ? ANCHO_PANEL_MAXIMO
      : Math.max(ANCHO_MINIMO_DEL_PANEL, Math.min(ANCHO_PANEL_MAXIMO, Math.round(anchoVentana - ANCHO_MINIMO_DEL_CHAT)));
  return Math.round(Math.min(Math.max(px, ANCHO_MINIMO_DEL_PANEL), techo));
}
