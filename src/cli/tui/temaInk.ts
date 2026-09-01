/**
 * El vocabulario de color de la TUI: las MISMAS claves semánticas que `cli/tema.ts`
 * (`exito`, `grave`, `mudo`…), traducidas a la paleta de la TUI. La piel stdio pide
 * ANSI a tema.ts y la TUI pide hex a aquí — un solo significado, dos renderizadores.
 * Paleta dark-first con los azules de XOne.
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
  /** El `❯` del input. Cian como el ANSI 36 de tema.ts, del mismo tono frío que `acento`. */
  prompt: "#22d3ee",
  /** No-op: Ink abre y cierra sus spans solos; un reset ANSI dentro de un span lo rompería. */
  reset: "",
  /** No-ops de control: el render de Ink repinta; ni borra líneas ni mueve el cursor. */
  borrar: "",
  limpiarLinea: "",
  arriba: (): string => "",
  acento: "#38bdf8",
  borde: "#27272a",
  fondoInput: "#18181b",
} as const;