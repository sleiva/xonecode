/**
 * El logotipo XONE en letras de bloque, para la cabecera de la sidebar.
 *
 * Un array de cadenas y no figlet: el logotipo es UN dibujo fijo, y una dependencia
 * más para cinco filas no lo acorta (mismo criterio por el que la Entrada no usa
 * `ink-text-input`). Cada letra mide 5 columnas, con 2 de separación: 26 en total,
 * que caben en las 38 de contenido de la sidebar (42 menos 2 de padding por lado). Solo
 * `█` y espacio: ningún carácter que un terminal pueda medir como doble ancho y
 * descuadrar el bloque. No tiene umbral propio: se pinta siempre que hay sidebar, y la
 * sidebar solo se monta cuando cabe (`cabeSidebar`, en sidebar.tsx).
 */
export const LOGO_XONE: readonly string[] = [
  "█   █  █████  █   █  █████",
  " █ █   █   █  ██  █  █    ",
  "  █    █   █  █ █ █  ████ ",
  " █ █   █   █  █  ██  █    ",
  "█   █  █████  █   █  █████",
];
