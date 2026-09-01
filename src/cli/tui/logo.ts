/**
 * El logotipo XONE en letras de bloque, para la cabecera de la sidebar.
 *
 * Un array de cadenas y no figlet: el logotipo es UN dibujo fijo, y una dependencia
 * más para cinco filas no lo acorta (mismo criterio por el que la Entrada no usa
 * `ink-text-input`). Cada letra mide 5 columnas, con 2 de separación: 26 en total,
 * que caben en las 30 de la sidebar. Solo `█` y espacio: ningún carácter que un
 * terminal pueda medir como doble ancho y descuadrar el bloque.
 */
export const LOGO_XONE: readonly string[] = [
  "█   █  █████  █   █  █████",
  " █ █   █   █  ██  █  █    ",
  "  █    █   █  █ █ █  ████ ",
  " █ █   █   █  █  ██  █    ",
  "█   █  █████  █   █  █████",
];

/**
 * Anchura TOTAL del terminal (no de la sidebar) a partir de la cual el logotipo se
 * pinta. Por debajo, el transcript se queda estrecho y el dibujo estorba más que
 * marca. Es un número a ojo, y vive en un solo sitio para poder ajustarlo.
 */
export const ANCHO_MINIMO_PARA_LOGO = 100;

export function cabeLogo(columnas: number): boolean {
  return columnas >= ANCHO_MINIMO_PARA_LOGO;
}
