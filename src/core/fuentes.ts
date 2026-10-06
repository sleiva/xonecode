import type { Agente } from "./agentes.js";

/**
 * Las reglas PURAS de traer una fuente de Google Fonts al proyecto: qué familia y peso valen,
 * cómo se llama el fichero, de qué URLs se aceptan respuestas y qué bytes son un `.ttf`. La red
 * es `FuentesPort` (`core/ports.ts`) y la hace `agent/config/fuentesEnRed.ts`; las tools son
 * `agent/grafo/fuentesDeGoogle.ts`.
 *
 * ## Lo medido contra la red, sin clave
 *
 * - El CATÁLOGO es `fonts.google.com/metadata/fonts`: un JSON de unos 2,7 MB con ~1.950
 *   familias, cada una con sus pesos como claves de `fonts` (`"400"`, `"700i"` es la cursiva).
 * - El FICHERO sale de la API `css2`: pedida sin cabeceras de navegador moderno, su `@font-face`
 *   apunta a un `.ttf` ESTÁTICO de ese peso en `fonts.gstatic.com` (`font/ttf`). Un peso que la
 *   familia no tiene contesta 400. Estático y por peso es justo la convención de la skill
 *   (`fontname: Roboto-Bold.ttf`); el `.ttf` variable del repo de GitHub sale con su peso por
 *   omisión y su nombre no se deduce sin listar la carpeta.
 * - Tamaños: Inter 700 son 326 KB; Noto Sans JP 400, 5,7 MB (de ahí el tope).
 */

export const NOMBRE_BUSCAR_FUENTE = "buscar_fuente";
export const NOMBRE_TRAER_FUENTE = "traer_fuente";

/** La carpeta de una app XOne de donde `fontname` toma el `.ttf`. */
export const CARPETA_DE_FUENTES = "fonts";

/**
 * Quién las recibe: quien puede dejar el `.ttf` en `fonts/`. Sin `escribeEn` escribe el proyecto
 * entero (el desarrollador); con él, solo si una de sus carpetas cubre `fonts/` (el diseñador, que
 * hace los RECURSOS: una fuente lo es, como un icono). La forma de `recibeBuscarIcono`, con otra
 * carpeta. Regla de DATO, no un nombre. Solo llega a `motor: "modelo"` (un externo no recibe tools
 * propias), y eso lo comprueba quien monta.
 */
export function recibeFuentes(a: Pick<Agente, "soloLectura" | "ejecucion" | "escribeEn">): boolean {
  if (a.soloLectura || a.ejecucion === true) return false;
  const objetivo = `/${CARPETA_DE_FUENTES}/`;
  const carpetas = a.escribeEn ?? [];
  return carpetas.length === 0 || carpetas.some((c) => objetivo.startsWith(c.endsWith("/") ? c : `${c}/`));
}

/** Tope de UNA llamada de red. El catálogo son 2,7 MB y una fuente CJK pasa de 5 MB. */
export const TOPE_DE_FUENTES_MS = 30_000;
/** Lo que se acepta como `.ttf`. Medido: Noto Sans JP 400 son 5,7 MB; esto es holgura. */
export const TOPE_DE_FUENTE_BYTES = 10 * 1024 * 1024;
/** Lo que se acepta como catálogo (2,7 MB medidos) o como hoja `css2` (unos cientos de bytes). */
export const TOPE_DE_CATALOGO_BYTES = 16 * 1024 * 1024;
export const TOPE_DE_CSS_BYTES = 64 * 1024;

export const LIMITES_DE_BUSQUEDA_DE_FUENTES = { porOmision: 8, maximo: 20 } as const;

/** Los hosts son CONSTANTES: uno distinto es una decisión, no un parámetro. */
export const URL_DEL_CATALOGO = "https://fonts.google.com/metadata/fonts";
export const BASE_DE_CSS = "https://fonts.googleapis.com/css2";
export const HOST_DE_FICHEROS = "fonts.gstatic.com";

/** Los pesos que se traen. El catálogo trae también 1 y 1000 en alguna familia variable: fuera. */
export const PESOS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export type Peso = (typeof PESOS)[number];

/** El sufijo de Google para cada peso, el de sus propios ficheros estáticos (`Roboto-SemiBold.ttf`). */
const NOMBRE_DE_PESO: Record<Peso, string> = {
  100: "Thin",
  200: "ExtraLight",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "ExtraBold",
  900: "Black",
};

/** Una familia del catálogo, recortada a lo que el agente necesita. */
export interface FamiliaDeFuente {
  familia: string;
  categoria: string;
  /** Los estilos que hay, como el catálogo: `"400"`, `"700i"`. Solo los de `PESOS`. */
  estilos: string[];
}

/** Medido: ninguna de las ~1.950 familias lleva otra cosa que letras, cifras y espacios, y la más larga 32. */
const FAMILIA = /^[A-Za-z0-9](?:[A-Za-z0-9 ]{0,62}[A-Za-z0-9])?$/;

export function motivoDeFamiliaInaceptable(familia: string): string | undefined {
  return FAMILIA.test(familia) && !familia.includes("  ")
    ? undefined
    : `«${familia}» no es un nombre de familia de Google Fonts (letras, cifras y espacios, como «Roboto Mono»)`;
}

export function motivoDePesoInaceptable(peso: number): string | undefined {
  return (PESOS as readonly number[]).includes(peso) ? undefined : `«${peso}» no es un peso: va de 100 a 900, de cien en cien`;
}

/** La clave del catálogo para un peso y estilo: `700` → `"700"`, cursiva → `"700i"`. */
export function claveDeEstilo(peso: Peso, cursiva: boolean): string {
  return `${peso}${cursiva ? "i" : ""}`;
}

/**
 * El nombre del fichero, por la convención de los estáticos de Google: la familia SIN espacios,
 * un guion y el estilo (`Roboto Mono`, 700 cursiva → `RobotoMono-BoldItalic.ttf`; 400 cursiva →
 * `RobotoMono-Italic.ttf`). Es también lo que va en `fontname`, a secas: XOne lo busca en `fonts/`.
 * Medido sobre el catálogo: quitar los espacios no junta dos familias en un mismo nombre.
 */
export function nombreDeFicheroDeFuente(familia: string, peso: Peso, cursiva: boolean): string {
  const base = familia.replace(/ /g, "");
  const estilo = cursiva ? (peso === 400 ? "Italic" : `${NOMBRE_DE_PESO[peso]}Italic`) : NOMBRE_DE_PESO[peso];
  return `${base}-${estilo}.ttf`;
}

/** Dónde se escribe (ruta virtual): `/fonts/Inter-Bold.ttf`. */
export function rutaDeFuente(familia: string, peso: Peso, cursiva: boolean): string {
  return `/${CARPETA_DE_FUENTES}/${nombreDeFicheroDeFuente(familia, peso, cursiva)}`;
}

/** La hoja `css2` de UN estilo. La familia ya viene validada: solo letras, cifras y espacios. */
export function urlDeCss(familia: string, peso: Peso, cursiva: boolean): string {
  const eje = cursiva ? `ital,wght@1,${peso}` : `wght@${peso}`;
  // `URLSearchParams` codificaría la coma y la arroba; la API los quiere tal cual y el `+` por espacio.
  return `${BASE_DE_CSS}?family=${familia.replace(/ /g, "+")}:${eje}`;
}

/**
 * De la hoja `css2`, la URL del `.ttf`, o `undefined`. Solo si es HTTPS a `fonts.gstatic.com` y
 * declara `truetype`: otro host u otro formato (un `woff2`, si Google cambiara lo que sirve a un
 * cliente sin navegador) no es lo medido.
 */
export function urlDeTtfEnCss(css: string): string | undefined {
  const m = /src:\s*url\((https:\/\/[^)\s]+)\)\s*format\(['"]truetype['"]\)/.exec(css);
  if (m === null) return undefined;
  try {
    const url = new URL(m[1]!);
    return url.protocol === "https:" && url.hostname === HOST_DE_FICHEROS ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * ¿Son estos bytes un TrueType? Por su FIRMA, no por la cabecera HTTP: `00 01 00 00` (lo medido
 * en todo lo que sirve gstatic) o `true` (el de Apple). Un OpenType con CFF (`OTTO`) no se acepta:
 * lo que XOne dice cargar es `.ttf`.
 */
export function esTrueType(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const firma = ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
  return firma === 0x00010000 || firma === 0x74727565;
}

/** Del catálogo, las familias con forma conocida. Lo que no encaja no es del contrato y se salta. */
export function familiasDelCatalogo(cuerpo: unknown): Array<FamiliaDeFuente & { popularidad: number }> {
  const lista = (cuerpo as { familyMetadataList?: unknown } | null)?.familyMetadataList;
  if (!Array.isArray(lista)) return [];
  const salida: Array<FamiliaDeFuente & { popularidad: number }> = [];
  for (const f of lista) {
    const familia = (f as { family?: unknown }).family;
    const fonts = (f as { fonts?: unknown }).fonts;
    if (typeof familia !== "string" || motivoDeFamiliaInaceptable(familia) !== undefined) continue;
    if (typeof fonts !== "object" || fonts === null) continue;
    const estilos = Object.keys(fonts).filter((k) => /^[1-9]00i?$/.test(k));
    if (estilos.length === 0) continue;
    const categoria = (f as { category?: unknown }).category;
    const popularidad = (f as { popularity?: unknown }).popularity;
    salida.push({
      familia,
      categoria: typeof categoria === "string" ? categoria : "",
      estilos,
      popularidad: typeof popularidad === "number" ? popularidad : Number.MAX_SAFE_INTEGER,
    });
  }
  return salida;
}

/**
 * Buscar en el catálogo: la coincidencia EXACTA primero (sin mayúsculas ni espacios: «robotomono»
 * es «Roboto Mono», que es como lo escribe una maqueta en su `fontFamily`), luego las que la
 * contienen, por popularidad (en el catálogo, menor es más popular).
 */
export function buscarEnCatalogo(
  catalogo: ReadonlyArray<FamiliaDeFuente & { popularidad: number }>,
  consulta: string,
  limite: number
): FamiliaDeFuente[] {
  const compacta = (s: string): string => s.toLowerCase().replace(/[\s_-]+/g, "");
  const q = compacta(consulta);
  if (q === "") return [];
  const exactas = catalogo.filter((f) => compacta(f.familia) === q);
  const contienen = catalogo
    .filter((f) => compacta(f.familia) !== q && compacta(f.familia).includes(q))
    .sort((a, b) => a.popularidad - b.popularidad);
  return [...exactas, ...contienen].slice(0, limite).map(({ familia, categoria, estilos }) => ({ familia, categoria, estilos }));
}

/** Los estilos de una familia, legibles: `400, 700, 400 cursiva`. */
export function estilosLegibles(estilos: readonly string[]): string {
  const rectos = estilos.filter((e) => !e.endsWith("i")).sort();
  const cursivas = estilos.filter((e) => e.endsWith("i")).map((e) => `${e.slice(0, -1)} cursiva`).sort();
  return [...rectos, ...cursivas].join(", ");
}
