/**
 * El vocabulario de color de la TUI: las MISMAS claves semánticas que `cli/tema.ts`
 * (`exito`, `grave`, `mudo`…), traducidas a la paleta de la TUI. La piel stdio pide
 * ANSI a tema.ts y la TUI pide hex a aquí — un solo significado, dos renderizadores.
 * Paleta dark-first con los azules de XOne (medidos en el CSS de xone.es: navy #00396f,
 * azul #47abd6, cian #2ac4ea).
 *
 * Los tokens de CONTROL de tema.ts (`reset`, `borrar`, `limpiarLinea`, `arriba`)
 * se reflejan como no-ops: Ink compone spans y gestiona el cursor, así que aquí no
 * hay nada que emitir — pero la clave existe, para que el test de espejo que recorre
 * `Object.keys(crearTema(true))` pruebe que ningún token nuevo de tema.ts se olvida.
 */
export const temaInk = {
  texto: "#d4d4d8",
  mudo: "#71717a",
  negrita: "#ffffff",
  exito: "#4ade80",
  aviso: "#fbbf24",
  grave: "#f87171",
  anadido: "#4ade80",
  quitado: "#f87171",
  /** El `▏` del cursor. El cian de xone.es (#2ac4ea), del mismo tono frío que `acento`. */
  prompt: "#2ac4ea",
  /** No-op: Ink abre y cierra sus spans solos; un reset ANSI dentro de un span lo rompería. */
  reset: "",
  /** No-ops de control: el render de Ink repinta; ni borra líneas ni mueve el cursor. */
  borrar: "",
  limpiarLinea: "",
  arriba: (): string => "",
  /** El azul claro de xone.es: cabeceras de sidebar, viñetas, el ■ del fin, el logotipo. */
  acento: "#47abd6",
  /** Reservado: token de maqueta SIN consumidor hoy — el test de espejo lo lista. */
  borde: "#27272a",
  /**
   * El fondo de la tarjeta de la Entrada, pintado fila a fila en cada `Text` (Ink 5.2.1
   * no da fondo a `Box`). El gris de OpenCode (`backgroundElement`, darkStep3) sobre su
   * terminal `#0a0a0a`: un escalón visible, no un matiz.
   */
  fondoInput: "#1e1e1e",
  /** Fondo casi negro para una petición pendiente: se aparta de la conversación activa. */
  fondoCola: "#090909",
  /**
   * Superficie de la sidebar: un azul pizarra separado del transcript para que el
   * contexto se lea como panel, no como una continuación de la conversación.
   */
  fondoSidebar: "#162331",
  /**
   * El navy dominante de xone.es. SOLO para barras y bordes: como color de texto sobre
   * un terminal oscuro es casi invisible, y un color de marca que no se lee no es marca.
   */
  marca: "#00396f",
  /**
   * El único tono cálido de la paleta: la línea «+ fase: Ns» se distingue del texto mudo
   * sin competir con el acento azul. No es color XOne; es un token de TUI declarado.
   */
  fase: "#e0a458",
  /**
   * Un gris por debajo de `mudo`: las líneas de herramientas son paisaje y tienen que
   * leerse como tal, más apagadas que los avisos y que el detalle de una fase.
   */
  tenue: "#52525b",
} as const;
