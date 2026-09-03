/**
 * El vocabulario de color de las pieles: tokens SEMÁNTICOS, nunca colores.
 *
 * Una piel pide significado (`tema.exito`, `tema.mudo`) igual que la TUI de
 * qwen-code pide `theme.status.success`: si mañana hay temas de usuario o el diff
 * quiere fondos en vez de texto, se cambia ESTE fichero y ninguna piel se entera.
 * Es el mismo principio que `core/ports.ts` aplicado al color: lo que puede cambiar
 * entra por una costura, no se pega a quien lo usa.
 *
 * La otra mitad del contrato: **con `conColor: false`, TODO token es cadena vacía.**
 * Las pieles no ramifican por TTY — componen `${t.mudo}texto${t.reset}` igual en una
 * tubería que en un terminal, y lo que mantiene limpios los pipes y los logs de CI es
 * que el tema apagado no tiene nada que poner. (Y `src/cli/tema.test.ts` recorre
 * `src/` entera y falla si alguien escribe un ANSI fuera de aquí.)
 */

/** Códigos de apertura; `reset` cierra. `texto` es vacío también con color: el color por omisión del terminal. */
export interface Tema {
  texto: string;
  mudo: string;
  negrita: string;
  exito: string;
  aviso: string;
  grave: string;
  /** El `+` de un diff. */
  anadido: string;
  /** El `-` de un diff. */
  quitado: string;
  prompt: string;
  reset: string;
  /**
   * Borrar del cursor al final de la línea (EL). Lo usa el spinner para dejar limpia
   * su línea antes de escribir la estática — el fotograma animado puede ser más largo
   * que la línea que lo reemplaza. Sin color es vacío porque el spinner ni arranca.
   */
  borrar: string;
  /** Borrar la línea entera, cursor incluido (EL con parámetro 2). Lo usa el panel de avisos para repintar. */
  limpiarLinea: string;
  /**
   * Mover el cursor N líneas hacia arriba (CUU parametrizado): la única forma de
   * repintar las líneas del panel de avisos, que viven POR ENCIMA del punto de
   * escritura. `0` líneas no escribe nada.
   */
  arriba: (lineas: number) => string;
}

/** Identificadores estables: los comandos y la TUI nunca dependen de un color concreto. */
export type IdTema = "xone" | "clear" | "midnight" | "graphite" | "ember";

export const TEMAS: readonly { id: IdTema; etiqueta: string; detalle: string }[] = [
  { id: "xone", etiqueta: "XOne", detalle: "cian corporativo · logo de bloque" },
  { id: "clear", etiqueta: "Clear", detalle: "alto contraste frío · trazo ligero" },
  { id: "midnight", etiqueta: "Midnight", detalle: "dark azul profundo · bajo brillo" },
  { id: "graphite", etiqueta: "Graphite", detalle: "dark neutro · contraste sobrio" },
  { id: "ember", etiqueta: "Ember", detalle: "ámbar cálido · trazo técnico" },
];

const CONTROL: Pick<Tema, "borrar" | "limpiarLinea" | "arriba"> = {
  borrar: "\x1b[K",
  limpiarLinea: "\x1b[2K",
  arriba: (lineas: number): string => (lineas > 0 ? `\x1b[${lineas}A` : ""),
};

const CON_COLOR_XONE: Tema = {
  texto: "",
  mudo: "\x1b[2m",
  negrita: "\x1b[1m",
  exito: "\x1b[32m",
  aviso: "\x1b[33m",
  grave: "\x1b[31m",
  // Mismo código que exito/grave a propósito: son tokens distintos porque significan
  // cosas distintas. Si el diff algún día quiere fondo de color, cambia aquí.
  anadido: "\x1b[32m",
  quitado: "\x1b[31m",
  prompt: "\x1b[36m",
  reset: "\x1b[0m",
  ...CONTROL,
};

const CON_COLOR: Record<IdTema, Tema> = {
  xone: CON_COLOR_XONE,
  clear: {
    texto: "",
    mudo: "\x1b[38;5;250m",
    negrita: "\x1b[1;97m",
    exito: "\x1b[38;5;120m",
    aviso: "\x1b[38;5;222m",
    grave: "\x1b[38;5;210m",
    anadido: "\x1b[38;5;120m",
    quitado: "\x1b[38;5;210m",
    prompt: "\x1b[38;5;159m",
    reset: "\x1b[0m",
    ...CONTROL,
  },
  midnight: {
    texto: "",
    mudo: "\x1b[38;5;110m",
    negrita: "\x1b[1;97m",
    exito: "\x1b[38;5;80m",
    aviso: "\x1b[38;5;221m",
    grave: "\x1b[38;5;210m",
    anadido: "\x1b[38;5;80m",
    quitado: "\x1b[38;5;210m",
    prompt: "\x1b[38;5;81m",
    reset: "\x1b[0m",
    ...CONTROL,
  },
  graphite: {
    texto: "",
    mudo: "\x1b[38;5;249m",
    negrita: "\x1b[1;97m",
    exito: "\x1b[38;5;114m",
    aviso: "\x1b[38;5;223m",
    grave: "\x1b[38;5;217m",
    anadido: "\x1b[38;5;114m",
    quitado: "\x1b[38;5;217m",
    prompt: "\x1b[38;5;255m",
    reset: "\x1b[0m",
    ...CONTROL,
  },
  ember: {
    texto: "",
    mudo: "\x1b[38;5;245m",
    negrita: "\x1b[1;97m",
    exito: "\x1b[38;5;150m",
    aviso: "\x1b[38;5;214m",
    grave: "\x1b[38;5;203m",
    anadido: "\x1b[38;5;150m",
    quitado: "\x1b[38;5;203m",
    prompt: "\x1b[38;5;215m",
    reset: "\x1b[0m",
    ...CONTROL,
  },
};

/** El no-op para los tokens-función del tema apagado: se llama, y no escribe nada. */
const SIN_ACCION = (): string => "";

/**
 * El tema apagado se DERIVA del encendido, no se escribe aparte: un token nuevo que
 * se olvide de apagarse falla en el test que recorre `Object.entries`, no en un pipe
 * de CI a las tantas. Los tokens-función se derivan al no-op.
 */
const SIN_COLOR: Tema = Object.fromEntries(
  Object.keys(CON_COLOR_XONE).map((nombre) => [
    nombre,
    typeof CON_COLOR_XONE[nombre as keyof Tema] === "function" ? SIN_ACCION : "",
  ])
) as unknown as Tema;

let temaSeleccionado: IdTema = "xone";

export function temaActivo(): IdTema {
  return temaSeleccionado;
}

export function seleccionarTema(id: IdTema): void {
  temaSeleccionado = id;
}

export function esTema(valor: string): valor is IdTema {
  return TEMAS.some((tema) => tema.id === valor);
}

export function crearTema(conColor: boolean, id: IdTema = temaSeleccionado): Tema {
  return conColor ? CON_COLOR[id] : SIN_COLOR;
}

/**
 * Los modos de terminal de la TUI (`cli/tui/raton.ts`), aquí porque este es el único
 * fichero de producción con escapes ANSI (tema.test.ts lo vigila): son control de
 * terminal, como `arriba` o `limpiarLinea`, no color. Solo se escriben con stdout TTY.
 */
export const MODOS_DE_TERMINAL = {
  /** `?1049h` entra en la pantalla alternativa (la de vim); `H` lleva el cursor arriba a la izquierda. */
  entrarPantallaAlternativa: "\x1b[?1049h\x1b[H",
  salirPantallaAlternativa: "\x1b[?1049l",
  /** `?1000h` pide botones (la rueda son los botones 64/65); `?1006h` los codifica en SGR, legibles. */
  activarRaton: "\x1b[?1000h\x1b[?1006h",
  desactivarRaton: "\x1b[?1006l\x1b[?1000l",
} as const;
