/**
 * Iconos para quien no tiene los assets (IXCODE-18): buscar uno en Iconify y traer su SVG.
 *
 * Es la parte PURA: las reglas de qué se pide y qué se acepta de vuelta. La red entra por
 * `IconosPort` (`core/ports.ts`) y la hace `agent/config/iconosEnRed.ts`; la tool es
 * `agent/grafo/buscarIcono.ts`.
 *
 * ## Por qué se pide el color Y el tamaño, siempre
 *
 * Medido contra `api.iconify.design`: sin `color` el SVG trae `stroke="currentColor"`, y sin
 * `height` trae `width="1em" height="1em"`. La documentación de XOne no dice qué hace su render
 * con ninguna de las dos —ni tiñe por CSS ni resuelve `em`—, y XOne ignora en silencio lo que
 * no entiende: un icono sin tinte válido saldría negro, o sin tamaño, sin un solo aviso. Así
 * que el color entra como hexadecimal EXPLÍCITO, la altura como píxeles, y el SVG que vuelve
 * ya los lleva cocidos. La regla es del código, no de un prompt.
 *
 * ## Un SVG es TEXTO, y va al proyecto
 *
 * Por eso no hay tool de escritura propia: lo escribe `write_file` con su diff y su
 * aprobación de siempre. Y por eso se le pide a lo que vuelve de la red una forma mínima
 * (`svgAceptable`): un `<script>` o un `onload` dentro de un fichero que acaba en la app del
 * cliente no es un icono.
 */

import type { Agente } from "./agentes.js";

export const NOMBRE_BUSCAR_ICONO = "buscar_icono";

/**
 * Quién la recibe: quien escribe el proyecto entero, que es quien puede dejar el icono en
 * `icons/`. Regla de DATO —la misma que `recibeIncorporarAdjunto`—, no una lista de nombres: de
 * los de serie, `designer-xone` y `developer-xone`. Vive en `core/` porque la usan DOS: la tool
 * (`agent/grafo/buscarIcono.ts`) y la ficha con la que el orquestador conoce a su equipo
 * (`fichaDeAgente`), y dos copias de la regla serían dos sitios donde puede divergir.
 *
 * Solo llega a `motor: "modelo"`: un especialista de motor externo corre en otro proceso y no
 * recibe tools propias (la ficha lo comprueba aparte).
 */
export function recibeBuscarIcono(a: Pick<Agente, "soloLectura" | "ejecucion" | "escribeEn">): boolean {
  return !a.soloLectura && a.ejecucion !== true && (a.escribeEn ?? []).length === 0;
}

/** La carpeta de una app XOne donde viven los iconos (`fundamentos/plataforma-y-anatomia…`). */
export const CARPETA_DE_ICONOS = "icons";

/** Tope de la llamada de red: una búsqueda o un SVG son unos cientos de bytes. */
export const TOPE_DE_ICONOS_MS = 10_000;

/** Lo que se acepta de vuelta. Un icono de Iconify son unos cientos de bytes; esto es holgura. */
export const TOPE_DE_SVG_BYTES = 16 * 1024;

export const LIMITES_DE_BUSQUEDA = { porOmision: 12, maximo: 32 } as const;
export const LIMITES_DE_TAMANO = { porOmision: 24, minimo: 8, maximo: 512 } as const;

const ID_DE_ICONO = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PREFIJO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLOR_HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** La base es UNA constante: un host distinto es una decisión, no un parámetro. */
export const BASE_DE_ICONIFY = "https://api.iconify.design";

/** Por qué un id no vale, o `undefined`. Forma `prefijo:nombre`, en minúsculas y con guiones. */
export function motivoDeIdInaceptable(id: string): string | undefined {
  return ID_DE_ICONO.test(id) ? undefined : `«${id}» no es un id de icono: la forma es prefijo:nombre (lucide:home)`;
}

export function motivoDePrefijoInaceptable(prefijo: string): string | undefined {
  return PREFIJO.test(prefijo) ? undefined : `«${prefijo}» no es un prefijo de colección (lucide, mdi, tabler…)`;
}

/** Solo hexadecimal: `currentColor` o un nombre CSS dejarían el tinte a merced del render. */
export function motivoDeColorInaceptable(color: string): string | undefined {
  // Un color de XOne con alfa (#AARRGGBB): no se acepta en silencio sin el alfa, ni se lee como
  // #RRGGBBAA. El icono no lleva transparencia en su color, así que se dice.
  if (/^#[0-9a-fA-F]{8}$/.test(color)) {
    if (color.slice(1, 3).toUpperCase() === "FF") return undefined; // opaco: vale, y se normaliza
    return `«${color}» es #AARRGGBB (XOne, alfa primero) y no es opaco: un icono no lleva transparencia en el color. Usa #${color.slice(3)} (#RRGGBB)`;
  }
  return COLOR_HEX.test(color)
    ? undefined
    : `«${color}» no vale: el color va como hexadecimal (#1a73e8). currentColor y los nombres CSS no se usan, porque XOne no los documenta`;
}

/**
 * El color como lo pide Iconify: `#RRGGBB`. Un `#FFRRGGBB` de XOne (opaco) pierde su alfa `FF`, que
 * no dice nada; uno con alfa menor ya lo rechazó `motivoDeColorInaceptable`. Se llama DESPUÉS de validar.
 */
export function colorParaIconify(color: string): string {
  return /^#[0-9a-fA-F]{8}$/.test(color) ? `#${color.slice(3)}` : color;
}

export function urlDeBusqueda(consulta: string, limite: number, prefijo?: string): string {
  const url = new URL(`${BASE_DE_ICONIFY}/search`);
  url.searchParams.set("query", consulta);
  url.searchParams.set("limit", String(limite));
  if (prefijo !== undefined) url.searchParams.set("prefix", prefijo);
  return url.toString();
}

/** El id ya viene validado: sin barras ni `..` no hay forma de salirse de `/prefijo/nombre.svg`. */
export function urlDeSvg(id: string, color: string, tamano: number): string {
  const [prefijo, nombre] = id.split(":") as [string, string];
  const url = new URL(`${BASE_DE_ICONIFY}/${prefijo}/${nombre}.svg`);
  url.searchParams.set("color", color);
  url.searchParams.set("height", String(tamano));
  return url.toString();
}

/** De la respuesta de `/search`, solo los ids con forma de id: lo demás no es del contrato. */
export function idsDeBusqueda(cuerpo: unknown): string[] {
  if (typeof cuerpo !== "object" || cuerpo === null) return [];
  const iconos = (cuerpo as { icons?: unknown }).icons;
  if (!Array.isArray(iconos)) return [];
  return iconos.filter((i): i is string => typeof i === "string" && motivoDeIdInaceptable(i) === undefined);
}

/**
 * Por qué lo que volvió de la red no se acepta como icono, o `undefined`.
 *
 * Lista de rechazo corta y a propósito: el SVG de Iconify no lleva nada de esto, así que
 * cualquier aparición es señal de que lo devuelto no es lo pedido.
 */
export function motivoDeSvgInaceptable(svg: string): string | undefined {
  if (Buffer.byteLength(svg, "utf8") > TOPE_DE_SVG_BYTES) return "el SVG supera el tope de tamaño";
  if (!/^\s*<svg[\s>]/.test(svg)) return "la respuesta no es un SVG";
  if (/<\s*(script|foreignObject|iframe|object|embed)\b|\son\w+\s*=|javascript:/i.test(svg)) {
    return "el SVG trae contenido activo";
  }
  return undefined;
}

/**
 * El nombre del fichero, por la convención de XOne (`ic_<descripcion>`, guiones bajos):
 * `lucide:arrow-right` → `ic_arrow_right.svg`. Es también lo que se pone en `img`/`path`: los
 * ejemplos de la plataforma referencian el nombre A SECAS (`img="add.png"`) y XOne lo busca en
 * `icons/`; con `icons/` delante buscaría `icons/icons/…` y el icono no saldría, sin un aviso.
 * El prefijo de la colección no entra: la regla es UNA colección por app, y así el nombre no
 * cambia si se cambia de colección.
 */
export function nombreDeFicheroDeIcono(id: string): string {
  const nombre = id.split(":")[1] ?? id;
  return `ic_${nombre.replace(/-/g, "_")}.svg`;
}

/** Dónde escribirlo (ruta virtual del backend): `/icons/ic_home.svg`. */
export function rutaDeIcono(id: string): string {
  return `/${CARPETA_DE_ICONOS}/${nombreDeFicheroDeIcono(id)}`;
}
