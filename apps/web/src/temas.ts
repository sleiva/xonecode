/**
 * Los temas de la consola web: un juego para el claro y otro para el oscuro.
 *
 * El MODO (sistema / claro / oscuro) lo decide `apariencia.ts`; esto dice, para cada modo, de
 * qué temas se elige. Un tema es la familia ENTERA de superficies, texto y acento, no solo un
 * color: por eso son veinticinco semillas y no una.
 *
 * **XOneCode no lleva semillas, a propósito.** Aplicarlo es QUITAR `data-tema` del `body`: queda
 * la cascada de siempre (`design-platform.css` + `marca.css` + `shiki.css`). Así «se ve exactamente
 * como antes» es verdad por construcción, no por haber copiado bien unos valores. Es el de omisión
 * en CLARO; en OSCURO el XOneCode es el de semillas `azul-noche` (ver su comentario), y el oscuro
 * de antes, sin semillas, se retiró.
 *
 * Los de fuera salen de su paleta oficial publicada (GitHub Primer, One Light, Dracula,
 * Ayu). Donde la oficial no llega al contraste que exige `temas.test.ts`, la semilla va
 * ajustada y lo dice su comentario. El juego lo eligieron las instalaciones del Marketplace de
 * VS Code (medido el 02-10-2026, ver el spec).
 *
 * Este fichero es la EXCEPCIÓN declarada a «ningún color literal», como `marca.css` y
 * `splash.css`: es la paleta misma. El puente que la reparte es `estilos/temas.css`, sin un
 * solo literal.
 */
export type ModoDeTema = "claro" | "oscuro";

/**
 * Las semillas, en el orden en que se leen: 16 de interfaz y 9 del resaltado de código. `cambio` es
 * el azul de la marca «cambiada» del editor y de la `M` del árbol: azul en TODOS los temas (decisión
 * del usuario), y no el `negocio`, que en varios es violeta o rosa.
 */
export const NOMBRES_DE_SEMILLA = [
  "fondo", "capa1", "capa2", "capa3", "texto", "texto2", "texto3", "borde",
  "acento", "sobreAcento", "peligro", "exito", "aviso", "negocio", "sombra", "cambio",
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
  /**
   * **Azul noche, el oscuro por OMISIÓN** (petición suya, tablero E del lienzo «XOneCode · propuesta
   * visual»). El de antes se leía apagado aunque sus cifras de contraste pasaban: las tres superficies
   * iban de RGB 21 a 44 y casi no se distinguían, los bordes eran blanco al 12 %, y el código iba
   * apagado. Aquí las superficies van ESCALONADAS y teñidas del navy de la marca, el borde es opaco y
   * se ve, el texto sube (principal ~17:1, secundario ~12:1, terciario ~7,7:1 sobre el fondo) y el
   * resaltado es vivo. Es el primero de su modo, que es lo que `temaPorId` toma por omisión.
   */
  {
    id: "azul-noche",
    // Se LLAMA XOneCode (petición suya): es el oscuro de la marca. El id se queda en `azul-noche`
    // para no confundirlo con el de antes, `xonecode-oscuro`, retirado (ver abajo).
    nombre: "XOneCode",
    modo: "oscuro",
    semillas: {
      fondo: "#0a1520", capa1: "#0f1d2b", capa2: "#142536", capa3: "#1b3045",
      texto: "#eef5fa", texto2: "#bfd0de", texto3: "#93abc0", borde: "#2a4a68",
      // El cian de la marca, aclarado para leerse sobre el navy; la letra encima es oscura (8,5:1).
      acento: "#4cc6f2", sobreAcento: "#03202e",
      peligro: "#f87171", exito: "#4ade80", aviso: "#fbbf24", negocio: "#c4b5fd", sombra: "#050b11", cambio: "#60a5fa",
      palabraClave: "#f9a8d4", cadena: "#86efac", funcion: "#7dd3fc", comentario: "#8fa6ba",
      constante: "#fdba74", parametro: "#fca5a5", puntuacion: "#bfd0de", enlace: "#4cc6f2",
      expresionDeCadena: "#86efac",
    },
  },
  /** Grafito: el mismo esquema que Azul noche sobre un negro NEUTRO, sin tinte — el más sobrio. */
  {
    id: "grafito",
    nombre: "Grafito",
    modo: "oscuro",
    semillas: {
      fondo: "#0e1013", capa1: "#15181c", capa2: "#1b1f24", capa3: "#232830",
      texto: "#f1f4f7", texto2: "#c6cdd5", texto3: "#9ba6b2", borde: "#363e47",
      acento: "#38bdf8", sobreAcento: "#04202f",
      peligro: "#f87171", exito: "#4ade80", aviso: "#fbbf24", negocio: "#c4b5fd", sombra: "#000000", cambio: "#60a5fa",
      palabraClave: "#f9a8d4", cadena: "#86efac", funcion: "#7dd3fc", comentario: "#8b98a5",
      constante: "#fdba74", parametro: "#fca5a5", puntuacion: "#c6cdd5", enlace: "#38bdf8",
      expresionDeCadena: "#86efac",
    },
  },
  /** Pizarra: un oscuro más SUAVE —gris azulado, no casi negro— con acento turquesa, para sesiones
   *  largas o con luz ambiente (tablero F del lienzo). */
  {
    id: "pizarra",
    nombre: "Pizarra",
    modo: "oscuro",
    semillas: {
      fondo: "#1c2430", capa1: "#222b38", capa2: "#283342", capa3: "#303d4f",
      texto: "#f3f6fa", texto2: "#cbd5e1", texto3: "#a3b1c2", borde: "#46566c",
      acento: "#5eead4", sobreAcento: "#05261f",
      peligro: "#fca5a5", exito: "#4ade80", aviso: "#fdba74", negocio: "#d8b4fe", sombra: "#0b0f15", cambio: "#60a5fa",
      palabraClave: "#fbcfe8", cadena: "#a7f3d0", funcion: "#7dd3fc", comentario: "#9fb0c3",
      constante: "#fed7aa", parametro: "#d8b4fe", puntuacion: "#cbd5e1", enlace: "#5eead4",
      expresionDeCadena: "#a7f3d0",
    },
  },
  /** Tinta cálida: marrón muy oscuro, texto crema y acento ámbar — cansa menos de noche (tablero F). */
  {
    id: "tinta-calida",
    nombre: "Tinta cálida",
    modo: "oscuro",
    semillas: {
      fondo: "#15120e", capa1: "#1c1813", capa2: "#231e18", capa3: "#2d2720",
      texto: "#f5efe6", texto2: "#d8cdbd", texto3: "#b0a28e", borde: "#4a3f33",
      acento: "#fbbf24", sobreAcento: "#231700",
      peligro: "#fca5a5", exito: "#86efac", aviso: "#fdba74", negocio: "#f9a8d4", sombra: "#000000", cambio: "#60a5fa",
      palabraClave: "#f9a8d4", cadena: "#bef264", funcion: "#fdba74", comentario: "#a8998a",
      constante: "#fca5a5", parametro: "#fde68a", puntuacion: "#d8cdbd", enlace: "#fbbf24",
      expresionDeCadena: "#bef264",
    },
  },
  // El oscuro de antes (`xonecode-oscuro`, sin semillas) se RETIRÓ de la lista (petición suya): quien
  // lo tuviera guardado cae en el de omisión, que es el XOneCode de arriba (`temaPorId`).
  {
    id: "github-oscuro",
    nombre: "GitHub Dark",
    modo: "oscuro",
    semillas: {
      fondo: "#0d1117", capa1: "#161b22", capa2: "#21262d", capa3: "#30363d",
      texto: "#e6edf3", texto2: "#9198a1", texto3: "#7d8590", borde: "#30363d",
      // `accent.emphasis` y no `accent.fg` (#2f81f7): con letra blanca encima, el claro no llega a 4,5.
      acento: "#1f6feb", sobreAcento: "#ffffff",
      peligro: "#f85149", exito: "#3fb950", aviso: "#d29922", negocio: "#a371f7", sombra: "#010409", cambio: "#1f6feb",
      palabraClave: "#ff7b72", cadena: "#a5d6ff", funcion: "#d2a8ff", comentario: "#8b949e",
      constante: "#79c0ff", parametro: "#ffa657", puntuacion: "#c9d1d9", enlace: "#58a6ff",
      expresionDeCadena: "#a5d6ff",
    },
  },
  // One Dark se RETIRÓ de la lista (petición suya); One Light, el claro, se queda. Quien lo tuviera
  // guardado cae en el de omisión (`temaPorId`).
  /**
   * Dracula REDISEÑADO (petición suya, tablero F del lienzo): la paleta oficial con el texto subido
   * —`texto2` y `texto3` más claros, el comentario de #6272a4 a #8592c4— para que se lea igual de
   * bien que los nuestros. Superficies, acento y colores de estado, los oficiales.
   */
  {
    id: "dracula",
    nombre: "Dracula",
    modo: "oscuro",
    semillas: {
      fondo: "#282a36", capa1: "#21222c", capa2: "#343746", capa3: "#44475a",
      texto: "#f8f8f2", texto2: "#d4d6e4", texto3: "#9aa3cc", borde: "#44475a",
      acento: "#bd93f9", sobreAcento: "#21222c",
      peligro: "#ff5555", exito: "#50fa7b", aviso: "#ffb86c", negocio: "#ff79c6", sombra: "#191a21", cambio: "#8be9fd",
      palabraClave: "#ff79c6", cadena: "#f1fa8c", funcion: "#50fa7b", comentario: "#8592c4",
      constante: "#bd93f9", parametro: "#ffb86c", puntuacion: "#f8f8f2", enlace: "#8be9fd",
      expresionDeCadena: "#f1fa8c",
    },
  },
  /**
   * SynthWave '84 (diseñado por él, tablero F del lienzo): violeta profundo con acento rosa neón y el
   * resaltado de la paleta oficial del tema de VS Code. El texto va en blanco y los grises suben para
   * pasar el contraste; el resplandor del botón del lienzo no se lleva (sería un color fuera del puente).
   */
  {
    id: "synthwave-84",
    nombre: "SynthWave '84",
    modo: "oscuro",
    semillas: {
      fondo: "#262335", capa1: "#1e1a2e", capa2: "#2f2a47", capa3: "#3b3358",
      texto: "#ffffff", texto2: "#d7d2ee", texto3: "#a39dc9", borde: "#3f3660",
      acento: "#ff7edb", sobreAcento: "#2a0a24",
      peligro: "#fe4450", exito: "#72f1b8", aviso: "#ff8b39", negocio: "#fede5d", sombra: "#171520", cambio: "#36f9f6",
      palabraClave: "#fede5d", cadena: "#ff8b39", funcion: "#36f9f6", comentario: "#848bbd",
      constante: "#f97e72", parametro: "#fede5d", puntuacion: "#d7d2ee", enlace: "#36f9f6",
      expresionDeCadena: "#72f1b8",
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
      peligro: "#d1242f", exito: "#1a7f37", aviso: "#9a6700", negocio: "#8250df", sombra: "#1f2328", cambio: "#0969da",
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
      peligro: "#e45649", exito: "#50a14f", aviso: "#c18401", negocio: "#a626a4", sombra: "#383a42", cambio: "#4078f2",
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
      peligro: "#e65050", exito: "#4c9a2a", aviso: "#c27c10", negocio: "#a37acc", sombra: "#3d424d", cambio: "#399ee6",
      palabraClave: "#fa8d3e", cadena: "#86b300", funcion: "#f2ae49", comentario: "#787b80",
      constante: "#a37acc", parametro: "#f07171", puntuacion: "#5c6166", enlace: "#399ee6",
      expresionDeCadena: "#4cbf99",
    },
  },
];

/** Los temas de un modo, en el orden del catálogo: el de omisión primero (XOneCode en claro, Azul
 *  noche en oscuro). */
export function temasDe(modo: ModoDeTema): readonly Tema[] {
  return TEMAS.filter((t) => t.modo === modo);
}

/** El tema con ese id SI es de ese modo; si no —desconocido, retirado, o del otro modo—, el de
 *  omisión de ese modo (el primero). */
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
