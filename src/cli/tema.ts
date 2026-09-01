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
}

const CON_COLOR: Tema = {
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
};

/**
 * El tema apagado se DERIVA del encendido, no se escribe aparte: un token nuevo que
 * se olvide de apagarse falla en el test que recorre `Object.entries`, no en un pipe
 * de CI a las tantas.
 */
const SIN_COLOR: Tema = Object.fromEntries(
  Object.keys(CON_COLOR).map((nombre) => [nombre, ""])
) as unknown as Tema;

export function crearTema(conColor: boolean): Tema {
  return conColor ? CON_COLOR : SIN_COLOR;
}