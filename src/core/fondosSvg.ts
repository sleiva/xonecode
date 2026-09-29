/**
 * Fondos SVG para frames y botones: degradados, sombras y resplandores (IXCODE-18).
 *
 * XOne no tiene degradados ni desenfoques propios, y el `imgbk` acepta SVG. Es la parte PURA:
 * una plantilla por tipo, sin red ni puerto. Lo que vuelve es texto que `write_file` escribe.
 *
 * ## Por qué un generador y no un SVG tecleado por el modelo
 *
 * Un degradado son ids, `url(#…)`, offsets y coordenadas, y un error ahí no da error: XOne
 * ignora en silencio lo que no entiende y el fondo simplemente no se ve. Una plantilla no se
 * equivoca en eso, y valida los colores antes de escribir nada.
 *
 * ## Lo que se midió en un emulador Android (`docs/DECISIONES.md`, «Fondos SVG en XOne»)
 *
 * - `linearGradient`, `radialGradient` y `stop-opacity` SE PINTAN. Los FILTROS (`feGaussianBlur`,
 *   `feDropShadow`) SE IGNORAN: por eso aquí no hay ni un `<filter>`. La sombra son rectángulos
 *   apilados de opacidad baja, y el resplandor un degradado que acaba transparente.
 * - `border-corner-radius` NO recorta el `imgbk`: **la esquina se DIBUJA en el SVG**.
 * - Con `preserveAspectRatio="none"` y una proporción distinta a la del control, la esquina sale
 *   achatada; con el `viewBox` de la MISMA proporción sale limpia. Por eso se pide el ancho y el
 *   alto del control, y el `viewBox` los lleva.
 *
 * Sin `preserveAspectRatio`, XOne ya estira el SVG hasta llenar el control (medido: uno 1:1 en un
 * frame ancho se deformó a elipse, sin bandas). Se escribe `none` igualmente: es lo que se mide
 * hoy y no depende de que otro renderizador use `meet` y deje bandas vacías.
 *
 * ## Todo va RELATIVO al alto
 *
 * El `viewBox` mide 100 de alto y `ancho/alto·100` de ancho, y el radio, el margen y la sombra
 * están en esa escala. Así solo importa la PROPORCIÓN del control, no sus píxeles: el mismo SVG
 * vale en cualquier densidad mientras la relación ancho/alto se mantenga.
 */

/**
 * ## Los colores llegan COMO EN XONE, y se convierten
 *
 * XOne escribe un color `#RRGGBB` o `#AARRGGBB` —el alfa PRIMERO, como Android (la documentación:
 * `fillcolor: "#7F00FF00"`, «ARGB: semi-transparente»)—. SVG y CSS de HTML lo esperan al final,
 * `#RRGGBBAA`. Copiar un `#7F00FF00` tal cual a un SVG lo leería como rojo 7F, azul FF y alfa 0:
 * transparente y del color equivocado, sin un solo error. Por eso la tool acepta la forma de XOne
 * y aquí se separa en `#RRGGBB` + opacidad (`stop-opacity`/`fill-opacity`), que es lo que SVG
 * entiende en cualquier renderizador.
 */

export const NOMBRE_GENERAR_FONDO = "generar_fondo_svg";

/**
 * Las medidas de un control se declaran en XOne mezclando unidades (`width="90%" height="60p"`),
 * y la tool las acepta así. **Es una ESTIMACIÓN**, sobre el aparato donde se midió: un ancho de
 * pantalla de 1080 px y 1,144 px por `p` (`90%`×`90p` salieron 972×103 en el árbol de controles).
 * En otro dispositivo el `%` sigue a la pantalla y la `p` a la densidad, así que la proporción
 * cambia; la respuesta de la tool lo dice.
 */
export const ANCHO_DE_PANTALLA_DE_REFERENCIA = 1080;
export const PIXELES_POR_P = 1.144;

/** De `90%`, `60p`, `120px` o `120` a píxeles de referencia. `%` solo en el ancho. */
export function medidaEnPixeles(valor: string | number, eje: "ancho" | "alto"): { px: number } | { motivo: string } {
  if (typeof valor === "number") {
    return Number.isFinite(valor) && valor > 0 ? { px: valor } : { motivo: `el ${eje} tiene que ser positivo` };
  }
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(%|p|px)?\s*$/.exec(valor);
  if (m === null) return { motivo: `«${valor}» no es una medida: \`90%\`, \`60p\`, \`120px\` o un número` };
  const n = Number(m[1]!.replace(",", "."));
  if (!(n > 0)) return { motivo: `el ${eje} tiene que ser positivo` };
  if (m[2] === "%") {
    return eje === "ancho"
      ? { px: (n / 100) * ANCHO_DE_PANTALLA_DE_REFERENCIA }
      : { motivo: "el alto en % depende del contenedor y no se puede estimar: dalo en `p` o en píxeles" };
  }
  return { px: m[2] === "p" ? n * PIXELES_POR_P : n };
}

export const TIPOS_DE_FONDO = ["degradado-lineal", "degradado-radial", "sombra", "glow"] as const;
export type TipoDeFondo = (typeof TIPOS_DE_FONDO)[number];

/** Proporción ancho/alto aceptada: fuera de ella la tarjeta de la sombra no cabe o no es un botón. */
export const PROPORCION_MINIMA = 0.5;
export const PROPORCION_MAXIMA = 40;

const ALTO = 100;
const PORCENTAJE_DE_RADIO_POR_OMISION = 25;
/** Margen a cada lado de la tarjeta de la sombra: cabe la difusión (`DIFUSION`) sin salirse. */
const MARGEN_DE_SOMBRA = 14;
const DIFUSION_DE_SOMBRA = 12;
const CAPAS_DE_SOMBRA = 7;
const DESPLAZAMIENTO_DE_SOMBRA = 5;
const INTENSIDAD_DE_SOMBRA = { suave: 0.03, media: 0.05, fuerte: 0.08 } as const;
export type IntensidadDeSombra = keyof typeof INTENSIDAD_DE_SOMBRA;
export const INTENSIDADES = Object.keys(INTENSIDAD_DE_SOMBRA) as IntensidadDeSombra[];

/** Un color ya en la forma de SVG: el `#RRGGBB` y su opacidad aparte (1 = opaco). */
export interface ColorSvg {
  hex: string;
  opacidad: number;
}

const COLOR_DE_XONE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Por qué no vale como color de XOne, o `undefined`. Vale `#RGB`, `#RRGGBB` y `#AARRGGBB`. */
export function motivoDeColorDeXoneInaceptable(color: string): string | undefined {
  return COLOR_DE_XONE.test(color)
    ? undefined
    : `«${color}» no vale: el color va como en XOne, #RRGGBB o #AARRGGBB (alfa primero). Un nombre CSS o currentColor no se usan`;
}

/**
 * De un color de XOne al de SVG. **`#AARRGGBB` de XOne → `#RRGGBB` + opacidad**: el alfa es el
 * PRIMER byte, no el último como en el `#RRGGBBAA` de HTML.
 */
export function colorDeXoneASvg(color: string): ColorSvg {
  const h = color.slice(1);
  if (h.length === 3) return { hex: `#${[...h].map((c) => c + c).join("")}`, opacidad: 1 };
  if (h.length === 8) return { hex: `#${h.slice(2)}`, opacidad: Number((parseInt(h.slice(0, 2), 16) / 255).toFixed(2)) };
  return { hex: `#${h}`, opacidad: 1 };
}

export interface PeticionDeFondo {
  tipo: TipoDeFondo;
  /** Ancho y alto del CONTROL, en cualquier unidad: solo cuenta la proporción. */
  ancho: number;
  alto: number;
  /** Colores de XOne (`#RRGGBB` o `#AARRGGBB`). De 2 a 4 en los degradados; 1 en `sombra` y `glow`. */
  colores: string[];
  /** 0 = de izquierda a derecha, 90 = de arriba abajo. Solo `degradado-lineal`. Por omisión 90. */
  angulo?: number;
  /** Esquina, como porcentaje del alto (0 a 50; 50 es una píldora). Por omisión 25. */
  radio?: number;
  /** Solo `sombra`. */
  intensidad?: IntensidadDeSombra;
  /** Solo `glow`: el color de detrás, también de XOne. Ausente = transparente. */
  fondo?: string;
}

export interface FondoGenerado {
  svg: string;
  /** El ancho del `viewBox` (el alto es 100), para decirlo en la respuesta. */
  anchoDelViewBox: number;
}

/** Un nombre de fichero sin ruta ni punto: el fichero será `bg_<nombre>.svg`. */
export function motivoDeNombreDeFondoInaceptable(nombre: string): string | undefined {
  return /^[a-z][a-z0-9_]{0,39}$/.test(nombre)
    ? undefined
    : `«${nombre}» no vale como nombre: minúsculas, dígitos y guion bajo, empezando por letra (menú_inicio no; menu_inicio sí)`;
}

export function nombreDeFicheroDeFondo(nombre: string): string {
  return `bg_${nombre}.svg`;
}

export function rutaDeFondo(nombre: string): string {
  return `/icons/${nombreDeFicheroDeFondo(nombre)}`;
}

/** Por qué la petición no vale, o `undefined`. Las cosas que la plantilla no sabría dibujar. */
export function motivoDePeticionInaceptable(p: PeticionDeFondo): string | undefined {
  if (!Number.isFinite(p.ancho) || !Number.isFinite(p.alto) || p.ancho <= 0 || p.alto <= 0) {
    return "ancho y alto son los del control y tienen que ser positivos";
  }
  const proporcion = p.ancho / p.alto;
  if (proporcion < PROPORCION_MINIMA || proporcion > PROPORCION_MAXIMA) {
    return `la proporción ancho/alto (${redondear(proporcion)}) queda fuera de ${PROPORCION_MINIMA}–${PROPORCION_MAXIMA}`;
  }
  const [minimo, maximo] = p.tipo === "degradado-lineal" || p.tipo === "degradado-radial" ? [2, 4] : [1, 1];
  if (p.colores.length < minimo || p.colores.length > maximo) {
    return minimo === maximo
      ? `«${p.tipo}» lleva exactamente ${minimo} color en \`colores\``
      : `«${p.tipo}» lleva de ${minimo} a ${maximo} colores`;
  }
  for (const c of [...p.colores, ...(p.fondo === undefined ? [] : [p.fondo])]) {
    const motivo = motivoDeColorDeXoneInaceptable(c);
    if (motivo !== undefined) return motivo;
  }
  if (p.radio !== undefined && (!Number.isFinite(p.radio) || p.radio < 0 || p.radio > 50)) {
    return "`radio` es un porcentaje del alto entre 0 y 50";
  }
  if (p.angulo !== undefined && !Number.isFinite(p.angulo)) return "`angulo` tiene que ser un número";
  return undefined;
}

function redondear(n: number): number {
  return Number(n.toFixed(2));
}

const num = (n: number): string => String(redondear(n));

function paradas(colores: readonly ColorSvg[], opacidades?: readonly number[]): string {
  const ultimo = Math.max(colores.length - 1, 1);
  return colores
    .map((c, i) => {
      const op = redondear((opacidades?.[i] ?? 1) * c.opacidad);
      return `<stop offset="${num((i / ultimo) * 100)}%" stop-color="${c.hex}"${op < 1 ? ` stop-opacity="${op}"` : ""}/>`;
    })
    .join("");
}

const relleno = (c: ColorSvg): string => `fill="${c.hex}"${c.opacidad < 1 ? ` fill-opacity="${c.opacidad}"` : ""}`;

const envolver = (ancho: number, dentro: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(ancho)} ${ALTO}" preserveAspectRatio="none">${dentro}</svg>`;

/**
 * El SVG de la petición. **Lanza si no es válida**: quien lo llama comprueba antes con
 * `motivoDePeticionInaceptable` y devuelve el motivo como texto (la tool no lanza).
 */
export function generarFondo(p: PeticionDeFondo): FondoGenerado {
  const motivo = motivoDePeticionInaceptable(p);
  if (motivo !== undefined) throw new Error(motivo);
  const W = redondear((p.ancho / p.alto) * ALTO);
  const H = ALTO;
  const colores = p.colores.map(colorDeXoneASvg);
  const r = Math.min(p.radio ?? PORCENTAJE_DE_RADIO_POR_OMISION, 50);
  const esquina = r > 0 ? ` rx="${num(r)}" ry="${num(r)}"` : "";

  if (p.tipo === "degradado-lineal") {
    // Los extremos van de borde a borde del rectángulo a lo largo del ángulo (como el `linear-
    // gradient` de CSS) y en coordenadas ABSOLUTAS: en un rectángulo que no es cuadrado, el ángulo
    // en coordenadas relativas al objeto se tuerce.
    const a = ((p.angulo ?? 90) * Math.PI) / 180;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const largo = Math.abs((W / 2) * dx) + Math.abs((H / 2) * dy);
    const x1 = W / 2 - dx * largo;
    const y1 = H / 2 - dy * largo;
    const x2 = W / 2 + dx * largo;
    const y2 = H / 2 + dy * largo;
    return {
      anchoDelViewBox: W,
      svg: envolver(
        W,
        `<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}">${paradas(colores)}</linearGradient></defs>` +
          `<rect width="${num(W)}" height="${H}"${esquina} fill="url(#g)"/>`
      ),
    };
  }

  if (p.tipo === "degradado-radial") {
    // Circular, no estirado: el radio llega al borde del lado MÁS LARGO.
    return {
      anchoDelViewBox: W,
      svg: envolver(
        W,
        `<defs><radialGradient id="g" gradientUnits="userSpaceOnUse" cx="${num(W / 2)}" cy="${num(H / 2)}" r="${num(Math.max(W, H) / 2)}">${paradas(colores)}</radialGradient></defs>` +
          `<rect width="${num(W)}" height="${H}"${esquina} fill="url(#g)"/>`
      ),
    };
  }

  if (p.tipo === "sombra") {
    // Sin filtros —se ignoran—: rectángulos apilados, cada vez más grandes y más transparentes.
    // La tarjeta es más pequeña que el control para que la difusión quepa dentro de su caja.
    const opacidad = INTENSIDAD_DE_SOMBRA[p.intensidad ?? "media"];
    const cx = MARGEN_DE_SOMBRA;
    const cy = 8;
    const cw = W - 2 * MARGEN_DE_SOMBRA;
    const ch = H - cy - MARGEN_DE_SOMBRA - DESPLAZAMIENTO_DE_SOMBRA - DIFUSION_DE_SOMBRA + 4;
    let capas = "";
    for (let i = CAPAS_DE_SOMBRA; i >= 1; i--) {
      const s = (i / CAPAS_DE_SOMBRA) * DIFUSION_DE_SOMBRA;
      capas += `<rect x="${num(cx - s)}" y="${num(cy + DESPLAZAMIENTO_DE_SOMBRA - s)}" width="${num(cw + 2 * s)}" height="${num(ch + 2 * s)}" rx="${num(r + s)}" ry="${num(r + s)}" fill="#000000" fill-opacity="${opacidad}"/>`;
    }
    return {
      anchoDelViewBox: W,
      svg: envolver(W, `${capas}<rect x="${num(cx)}" y="${num(cy)}" width="${num(cw)}" height="${num(ch)}" rx="${num(r)}" ry="${num(r)}" ${relleno(colores[0]!)}/>`),
    };
  }

  // glow: una elipse que llena la caja, con un degradado que acaba transparente.
  const luz = colores[0]!;
  const detras = p.fondo === undefined ? "" : `<rect width="${num(W)}" height="${H}"${esquina} ${relleno(colorDeXoneASvg(p.fondo))}/>`;
  return {
    anchoDelViewBox: W,
    svg: envolver(
      W,
      `<defs><radialGradient id="g" cx="50%" cy="50%" r="50%">${paradas([luz, luz], [0.9, 0])}</radialGradient></defs>` +
        `${detras}<ellipse cx="${num(W / 2)}" cy="${num(H / 2)}" rx="${num(W / 2)}" ry="${num(H / 2)}" fill="url(#g)"/>`
    ),
  };
}
