/**
 * Los temas de la consola web: un juego para el claro y otro para el oscuro.
 *
 * El MODO (sistema / claro / oscuro) lo decide `apariencia.ts`; esto dice, para cada modo, de
 * qué temas se elige. Un tema es la familia ENTERA de superficies, texto y acento, no solo un
 * color: por eso son 24 semillas y no una.
 *
 * **XOneCode no lleva semillas, a propósito.** Es el de omisión en los dos modos, y aplicarlo es
 * QUITAR `data-tema` del `body`: queda la cascada de siempre (`design-platform.css` +
 * `marca.css` + `shiki.css`). Así «se ve exactamente como antes» es verdad por construcción, no
 * por haber copiado bien unos valores.
 *
 * Los otros seis salen de su paleta oficial publicada (GitHub Primer, One Dark/Light, Dracula,
 * Ayu). Donde la oficial no llega al contraste que exige `temas.test.ts`, la semilla va
 * ajustada y lo dice su comentario. El juego lo eligieron las instalaciones del Marketplace de
 * VS Code (medido el 02-10-2026, ver el spec).
 *
 * Este fichero es la EXCEPCIÓN declarada a «ningún color literal», como `marca.css` y
 * `splash.css`: es la paleta misma. El puente que la reparte es `estilos/temas.css`, sin un
 * solo literal.
 */
export type ModoDeTema = "claro" | "oscuro";

/** Las 24 semillas, en el orden en que se leen: 15 de interfaz y 9 del resaltado de código. */
export const NOMBRES_DE_SEMILLA = [
  "fondo", "capa1", "capa2", "capa3", "texto", "texto2", "texto3", "borde",
  "acento", "sobreAcento", "peligro", "exito", "aviso", "negocio", "sombra",
  "palabraClave", "cadena", "funcion", "comentario", "constante", "parametro",
  "puntuacion", "enlace", "expresionDeCadena",
] as const;

export type NombreDeSemilla = (typeof NOMBRES_DE_SEMILLA)[number];
export type Semillas = Record<NombreDeSemilla, string>;

export interface Tema {
  id: string;
  nombre: string;
  modo: ModoDeTema;
  /** Ausente SOLO en XOneCode: ver la cabecera. */
  semillas?: Semillas;
  /** Solo XOneCode, que no tiene semillas: los tres colores con que se ENSEÑA en el selector. */
  muestra?: { fondo: string; texto: string; acento: string };
}

export const TEMAS: readonly Tema[] = [
  { id: "xonecode-oscuro", nombre: "XOneCode", modo: "oscuro", muestra: { fondo: "#151517", texto: "#cfd3d6", acento: "#00a3e0" } },
  {
    id: "github-oscuro",
    nombre: "GitHub Dark",
    modo: "oscuro",
    semillas: {
      fondo: "#0d1117", capa1: "#161b22", capa2: "#21262d", capa3: "#30363d",
      texto: "#e6edf3", texto2: "#9198a1", texto3: "#7d8590", borde: "#30363d",
      // `accent.emphasis` y no `accent.fg` (#2f81f7): con letra blanca encima, el claro no llega a 4,5.
      acento: "#1f6feb", sobreAcento: "#ffffff",
      peligro: "#f85149", exito: "#3fb950", aviso: "#d29922", negocio: "#a371f7", sombra: "#010409",
      palabraClave: "#ff7b72", cadena: "#a5d6ff", funcion: "#d2a8ff", comentario: "#8b949e",
      constante: "#79c0ff", parametro: "#ffa657", puntuacion: "#c9d1d9", enlace: "#58a6ff",
      expresionDeCadena: "#a5d6ff",
    },
  },
  {
    id: "one-oscuro",
    nombre: "One Dark",
    modo: "oscuro",
    semillas: {
      fondo: "#282c34", capa1: "#21252b", capa2: "#2c313a", capa3: "#333842",
      texto: "#abb2bf", texto2: "#9da5b4", texto3: "#7f848e", borde: "#3e4451",
      // El azul de One Dark es claro: la letra encima es el fondo del tema, no el blanco.
      acento: "#61afef", sobreAcento: "#282c34",
      peligro: "#e06c75", exito: "#98c379", aviso: "#e5c07b", negocio: "#c678dd", sombra: "#181a1f",
      palabraClave: "#c678dd", cadena: "#98c379", funcion: "#61afef", comentario: "#7f848e",
      constante: "#d19a66", parametro: "#e06c75", puntuacion: "#abb2bf", enlace: "#56b6c2",
      expresionDeCadena: "#98c379",
    },
  },
  {
    id: "dracula",
    nombre: "Dracula",
    modo: "oscuro",
    semillas: {
      fondo: "#282a36", capa1: "#21222c", capa2: "#343746", capa3: "#44475a",
      // Dracula publica un solo gris de texto (`comment`, #6272a4) y no llega a 3:1 sobre
      // `current line`: `texto2` y `texto3` son derivados entre `foreground` y `comment`.
      texto: "#f8f8f2", texto2: "#c9c9d1", texto3: "#8c94b8", borde: "#44475a",
      acento: "#bd93f9", sobreAcento: "#282a36",
      peligro: "#ff5555", exito: "#50fa7b", aviso: "#f1fa8c", negocio: "#ff79c6", sombra: "#191a21",
      palabraClave: "#ff79c6", cadena: "#f1fa8c", funcion: "#50fa7b", comentario: "#6272a4",
      constante: "#bd93f9", parametro: "#ffb86c", puntuacion: "#f8f8f2", enlace: "#8be9fd",
      expresionDeCadena: "#f1fa8c",
    },
  },
  { id: "xonecode-claro", nombre: "XOneCode", modo: "claro", muestra: { fondo: "#ffffff", texto: "#61666b", acento: "#00a3e0" } },
  {
    id: "github-claro",
    nombre: "GitHub Light",
    modo: "claro",
    semillas: {
      fondo: "#ffffff", capa1: "#f6f8fa", capa2: "#ffffff", capa3: "#eaeef2",
      texto: "#1f2328", texto2: "#59636e", texto3: "#6e7781", borde: "#d0d7de",
      acento: "#0969da", sobreAcento: "#ffffff",
      peligro: "#d1242f", exito: "#1a7f37", aviso: "#9a6700", negocio: "#8250df", sombra: "#1f2328",
      palabraClave: "#cf222e", cadena: "#0a3069", funcion: "#8250df", comentario: "#6e7781",
      constante: "#0550ae", parametro: "#953800", puntuacion: "#1f2328", enlace: "#0969da",
      expresionDeCadena: "#0a3069",
    },
  },
  {
    id: "one-claro",
    nombre: "One Light",
    modo: "claro",
    semillas: {
      fondo: "#fafafa", capa1: "#f0f0f1", capa2: "#ffffff", capa3: "#e5e5e6",
      texto: "#383a42", texto2: "#50525c", texto3: "#696c77", borde: "#dbdbdc",
      // El azul oficial (#4078f2) da 4,05 con letra blanca: oscurecido lo justo para 4,5.
      acento: "#3a6fe0", sobreAcento: "#ffffff",
      peligro: "#e45649", exito: "#50a14f", aviso: "#c18401", negocio: "#a626a4", sombra: "#383a42",
      palabraClave: "#a626a4", cadena: "#50a14f", funcion: "#4078f2", comentario: "#a0a1a7",
      constante: "#986801", parametro: "#e45649", puntuacion: "#383a42", enlace: "#0184bc",
      expresionDeCadena: "#50a14f",
    },
  },
  {
    id: "ayu-claro",
    nombre: "Ayu Light",
    modo: "claro",
    semillas: {
      fondo: "#fcfcfc", capa1: "#f3f4f5", capa2: "#ffffff", capa3: "#e7eaed",
      texto: "#5c6166", texto2: "#646a71", texto3: "#828a92", borde: "#d8dce0",
      // El naranja de Ayu es claro: la letra encima es oscura.
      acento: "#ffaa33", sobreAcento: "#1f2328",
      // Verde y ámbar oficiales (#6cbf43, #f2ae49) no llegan a 3:1 sobre el fondo: oscurecidos.
      peligro: "#e65050", exito: "#4c9a2a", aviso: "#c27c10", negocio: "#a37acc", sombra: "#3d424d",
      palabraClave: "#fa8d3e", cadena: "#86b300", funcion: "#f2ae49", comentario: "#787b80",
      constante: "#a37acc", parametro: "#f07171", puntuacion: "#5c6166", enlace: "#399ee6",
      expresionDeCadena: "#4cbf99",
    },
  },
];

/** Los temas de un modo, en el orden del catálogo (XOneCode primero). */
export function temasDe(modo: ModoDeTema): readonly Tema[] {
  return TEMAS.filter((t) => t.modo === modo);
}

/** El tema con ese id SI es de ese modo; si no —desconocido, retirado, o del otro modo—, XOneCode. */
export function temaPorId(id: string | undefined, modo: ModoDeTema): Tema {
  return TEMAS.find((t) => t.id === id && t.modo === modo) ?? temasDe(modo)[0]!;
}

function luminancia(hex: string): number {
  const canal = (i: number): number => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

/** Razón de contraste WCAG 2.x entre dos `#rrggbb`. */
export function contraste(a: string, b: string): number {
  const [alto, bajo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (alto + 0.05) / (bajo + 0.05);
}
