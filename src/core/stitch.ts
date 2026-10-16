/**
 * Traer una pantalla de Stitch a la sesión: lo que se decide sin red ni disco.
 *
 * Stitch no devuelve la imagen ni el HTML de una pantalla: devuelve ENLACES de descarga
 * (`get_screen` → `screenshot.downloadUrl`, `htmlCode.downloadUrl`), y el agente no puede bajar
 * una URL. Lo baja el harness (`agent/motores/trueforge/traerDeStitch.ts`), y solo URLs que vienen
 * de la respuesta de Stitch —nunca una que escriba el modelo—, de los hosts MEDIDOS, con tope de
 * tamaño y tipo comprobado.
 *
 * El destino es FIJO, `/artefactos/diseno/`: es donde el harness ya espera una maqueta (`buscarMaqueta`),
 * de donde `ultimaCaptura` y el crítico de pantalla NO toman capturas del aparato, y la misma carpeta
 * que deja descomprimir un export de Stitch a mano.
 */

import { RUTA_ARTEFACTOS } from "./artefactos.js";
import type { DisenoVinculado } from "./disenoVinculado.js";
export { motivoDeProyectoDeStitchInaceptable, type DisenoVinculado } from "./disenoVinculado.js";

/** La carpeta, dentro de la de artefactos, donde vive la maqueta traída. */
export const CARPETA_DE_DISENO = "diseno";
export const RUTA_DE_DISENO = `${RUTA_ARTEFACTOS}${CARPETA_DE_DISENO}/`;

/** ¿Es esta ruta virtual algo de la maqueta traída (y no una captura del aparato)? */
export function esDeLaMaqueta(ruta: string): boolean {
  return ruta.startsWith(RUTA_DE_DISENO);
}

/** Medidos el 30-09-2026: la imagen viene de `lh3`, el HTML de `contribution`. Nada más se baja. */
export const HOSTS_DE_DESCARGA = ["lh3.googleusercontent.com", "contribution.usercontent.google.com"] as const;
/** Una pantalla de Stitch a tamaño completo son ~150 KB; el tope es holgado y es un tope. */
export const TOPE_DE_IMAGEN = 15 * 1024 * 1024;
export const TOPE_DE_HTML = 2 * 1024 * 1024;

/** Lo que admite la imagen: el tipo manda sobre la extensión del fichero que se escribe. */
export const TIPOS_DE_IMAGEN: Readonly<Record<string, string>> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** `projects/<id>/screens/<id>`, la forma que Stitch da en `name`. */
const PANTALLA = /^projects\/(\d+)\/screens\/([0-9a-f]+)$/;

export function motivoDePantallaInaceptable(pantalla: string): string | undefined {
  return PANTALLA.test(pantalla)
    ? undefined
    : `«${pantalla}» no es una pantalla de Stitch: se escribe como su \`name\`, projects/<id>/screens/<id> (lo da list_screens o get_screen).`;
}

/** El proyecto de una pantalla: `projects/<id>`. */
export function proyectoDePantalla(pantalla: string): string {
  return pantalla.split("/screens/")[0]!;
}

/**
 * ¿Se puede bajar esta URL? HTTPS, sin credenciales, de un host medido. Se aplica a URLs que vienen
 * de la respuesta de Stitch, y aun así se comprueba: la respuesta la escribe otro.
 */
export function motivoDeDescargaInaceptable(url: string): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "Stitch devolvió un enlace de descarga que no es una URL";
  }
  if (u.protocol !== "https:" || u.username !== "" || u.password !== "") return "Stitch devolvió un enlace de descarga que no es HTTPS limpio";
  if (!(HOSTS_DE_DESCARGA as readonly string[]).includes(u.hostname)) return `Stitch devolvió un enlace de descarga de un sitio que no se baja (${u.hostname})`;
  return undefined;
}

/**
 * La imagen a su tamaño REAL. Medido: el enlace de `lh3` sin sufijo da una miniatura (226×512 de una
 * pantalla de 780×1768); con `=s0`, la de verdad. Solo si el enlace no trae ya su propio tamaño.
 */
export function urlDeImagenCompleta(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname !== "lh3.googleusercontent.com" || u.pathname.includes("=")) return url;
    return `${url}=s0`;
  } catch {
    return url;
  }
}

export interface PantallaDeStitch {
  titulo: string;
  ancho?: number;
  alto?: number;
  imagen: string;
  html?: string;
}

/** Lo que interesa de la respuesta de `get_screen`, o el motivo de que no se entienda. */
export function leerPantalla(texto: string): PantallaDeStitch | string {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(texto) as Record<string, unknown>;
  } catch {
    return "la respuesta de Stitch a get_screen no es JSON";
  }
  const url = (campo: string): string | undefined => {
    const v = (d[campo] as { downloadUrl?: unknown } | undefined)?.downloadUrl;
    return typeof v === "string" && v !== "" ? v : undefined;
  };
  const imagen = url("screenshot");
  if (imagen === undefined) return "Stitch no dio la imagen de esa pantalla (¿se está generando todavía?)";
  const numero = (campo: string): number | undefined => {
    const n = Number(d[campo]);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const ancho = numero("width");
  const alto = numero("height");
  const html = url("htmlCode");
  return {
    titulo: typeof d["title"] === "string" ? d["title"] : "(sin título)",
    imagen,
    ...(ancho === undefined ? {} : { ancho }),
    ...(alto === undefined ? {} : { alto }),
    ...(html === undefined ? {} : { html }),
  };
}

/** El `DESIGN.md` del proyecto (`get_project` → `designTheme.designMd`), si lo trae. */
export function designMdDeProyecto(texto: string): string | undefined {
  try {
    const md = (JSON.parse(texto) as { designTheme?: { designMd?: unknown } }).designTheme?.designMd;
    return typeof md === "string" && md.trim() !== "" ? md : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Buscar una pantalla por su TÍTULO, y no por su `name`. Medido en Maset: con solo el `name`, el orquestador listaba las
 * pantallas de TODOS los proyectos de Stitch (diecinueve llamadas) para dar con la que la persona había nombrado, y esos
 * listados se quedaban en su contexto el turno entero. Puro: las respuestas entran como texto.
 */
export interface EntradaDeStitch {
  name: string;
  title: string;
}

/** Un título comparable: sin mayúsculas, sin tildes y con los espacios reducidos. */
export function tituloComparable(titulo: string): string {
  return titulo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** El JSON de una respuesta de Stitch, aunque el harness le haya añadido su nota de recorte detrás. */
function jsonDe(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    const fin = texto.lastIndexOf("}");
    try {
      return fin < 0 ? undefined : JSON.parse(texto.slice(0, fin + 1));
    } catch {
      return undefined;
    }
  }
}

/** Las entradas `{name, title}` de la lista `clave` (`projects` o `screens`) de una respuesta. Lo que no tiene forma, fuera. */
export function entradasDeStitch(texto: string, clave: "projects" | "screens"): EntradaDeStitch[] {
  const lista = (jsonDe(texto) as Record<string, unknown> | undefined)?.[clave];
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((e) =>
    typeof e === "object" && e !== null && typeof (e as EntradaDeStitch).name === "string" && typeof (e as EntradaDeStitch).title === "string"
      ? [{ name: (e as EntradaDeStitch).name, title: (e as EntradaDeStitch).title }]
      : []
  );
}

/**
 * Las que casan con el título: las de título IGUAL si hay alguna (comparable), y si no las que lo CONTIENEN. Sin título,
 * todas. Una pantalla con el título exacto no se ensucia con las que solo lo contienen.
 */
export function casanConTitulo<T extends EntradaDeStitch>(entradas: readonly T[], titulo: string | undefined): T[] {
  if (titulo === undefined || titulo.trim() === "") return [...entradas];
  const buscado = tituloComparable(titulo);
  const iguales = entradas.filter((e) => tituloComparable(e.title) === buscado);
  if (iguales.length > 0) return iguales;
  const contienen = entradas.filter((e) => tituloComparable(e.title).includes(buscado));
  if (contienen.length > 0) return contienen;
  // Y por PALABRAS: todas las que distinguen lo buscado están en el título (`palabrasQueDistinguen`). Medido en Maset:
  // «Menu Listado Entregas» no CONTIENE como cadena a «Listado de Entregas - Maset Logística», y la búsqueda decía que no
  // existía; el orquestador construyó entonces con otra pantalla.
  const buscadas = palabrasQueDistinguen(titulo, entradas);
  if (buscadas.length === 0) return [];
  return entradas.filter((e) => {
    const del = new Set(palabras(e.title));
    return buscadas.every((p) => del.has(p));
  });
}

/** Palabras de relleno de un título de pantalla: no distinguen una de otra. */
const PALABRAS_VACIAS = new Set([
  "de", "del", "la", "el", "los", "las", "y", "e", "a", "en", "con", "para", "por", "un", "una", "al",
  "menu", "pantalla", "ventana", "vista", "screen", "the", "of",
]);

/**
 * Las palabras de un título, comparables y por su RAÍZ, sin las vacías: singular y plural valen lo mismo (`entregas` y
 * `entrega`, `albaranes` y `albaran`, `pendientes` y `pendiente`). Se quita `-es`/`-s` y luego una `e` final.
 */
export function palabras(titulo: string): string[] {
  return tituloComparable(titulo)
    .split(/[^a-z0-9]+/)
    .filter((p) => p !== "" && !PALABRAS_VACIAS.has(p))
    .map(raiz);
}

function raiz(palabra: string): string {
  if (palabra.length <= 4) return palabra;
  const sinPlural = palabra.replace(/(?:es|s)$/, "");
  return sinPlural.length > 4 ? sinPlural.replace(/e$/, "") : sinPlural;
}

/**
 * Las palabras de lo buscado que DISTINGUEN una pantalla de otra: sin las vacías y sin las que salen en la MAYORÍA de
 * los títulos del proyecto («Maset», «Logística» en «X - Maset Logística»), que no distinguen nada.
 */
export function palabrasQueDistinguen(titulo: string, entradas: readonly EntradaDeStitch[]): string[] {
  const comunes = new Set<string>();
  if (entradas.length >= 3) {
    const cuenta = new Map<string, number>();
    for (const e of entradas) for (const p of new Set(palabras(e.title))) cuenta.set(p, (cuenta.get(p) ?? 0) + 1);
    for (const [p, n] of cuenta) if (n > entradas.length / 2) comunes.add(p);
  }
  return [...new Set(palabras(titulo))].filter((p) => !comunes.has(p));
}

/** El id de un proyecto (`projects/<id>` → `<id>`), que es lo que pide `list_screens`. */
export function idDeProyecto(name: string): string {
  return name.replace(/^projects\//, "");
}

/** Una pantalla para el selector: su `name`, su título y la miniatura (solo de los hosts medidos). */
export interface PantallaConMiniatura extends EntradaDeStitch {
  miniatura?: string;
}

/**
 * Las pantallas de una respuesta de `list_screens`, con su miniatura (`screenshot.downloadUrl`, medido: la traen todas).
 * Una miniatura fuera de los hosts medidos no se da: la pantalla se ofrece sin imagen.
 */
export function pantallasConMiniatura(texto: string): PantallaConMiniatura[] {
  const lista = (jsonDe(texto) as Record<string, unknown> | undefined)?.["screens"];
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((e) => {
    if (typeof e !== "object" || e === null) return [];
    const v = e as Record<string, unknown>;
    if (typeof v["name"] !== "string" || typeof v["title"] !== "string" || motivoDePantallaInaceptable(v["name"]) !== undefined) return [];
    const url = (v["screenshot"] as Record<string, unknown> | undefined)?.["downloadUrl"];
    const miniatura = typeof url === "string" && motivoDeDescargaInaceptable(url) === undefined ? url : undefined;
    return [{ name: v["name"], title: v["title"], ...(miniatura === undefined ? {} : { miniatura }) }];
  });
}

/**
 * La pantalla elegida para una tarea, si vale: un `name` de pantalla bien formado, DEL proyecto de Stitch vinculado, y
 * un título corto. Lo que llega del cable no se cree: sin vínculo, o de otro proyecto, `undefined`.
 */
export function pantallaElegidaValida(
  valor: unknown,
  vinculo: DisenoVinculado | undefined
): { name: string; titulo: string; proyecto: string } | undefined {
  if (vinculo === undefined || typeof valor !== "object" || valor === null) return undefined;
  const v = valor as Record<string, unknown>;
  const name = v["name"];
  const titulo = v["titulo"];
  if (typeof name !== "string" || motivoDePantallaInaceptable(name) !== undefined) return undefined;
  if (!name.startsWith(`${vinculo.proyecto}/screens/`)) return undefined;
  if (typeof titulo !== "string" || titulo.trim() === "" || titulo.length > 200) return undefined;
  // El nombre del proyecto lo pone el VÍNCULO, no el cable: va en el contexto de la tarea con su id.
  return { name, titulo: titulo.trim(), proyecto: vinculo.nombre };
}

/**
 * La línea que se añade al encargo de una tarea con pantalla ELEGIDA: si ya está traída, dónde está y que es LA
 * referencia; si no se pudo traer antes de empezar, con qué `name` traerla. En los dos casos, que no se busque otra por
 * título ni se sustituya (decisión suya: el diseño lo elige la persona).
 */
export function textoDePantallaElegida(
  pantalla: { name: string; titulo: string; proyecto?: string },
  traida: { ok: true } | { ok: false; motivo: string }
): string {
  // Los datos van SIEMPRE en el contexto de la tarea (petición suya): la pantalla y el proyecto, con sus ids.
  const deProyecto = `del proyecto de Stitch ${pantalla.proyecto === undefined ? "" : `«${pantalla.proyecto}» `}(id \`${proyectoDePantalla(pantalla.name)}\`)`;
  const noOtra = "Es LA referencia de diseño de esta tarea: no busques otra pantalla en Stitch por su título ni la sustituyas por una parecida.";
  return traida.ok
    ? `MAQUETA ELEGIDA: la pantalla «${pantalla.titulo}», id \`${pantalla.name}\`, ${deProyecto}, ya está traída en ${RUTA_DE_DISENO} (screen, code.html y DESIGN.md). ` +
        `Si hay que volver a traerla, por ese id: traer_pantalla_de_stitch con \`pantalla: "${pantalla.name}"\`. ${noOtra}`
    : `MAQUETA ELEGIDA: la pantalla «${pantalla.titulo}», id \`${pantalla.name}\`, ${deProyecto}. No se pudo traer antes de empezar (${traida.motivo}): ` +
        `tráela con traer_pantalla_de_stitch pasándole \`pantalla: "${pantalla.name}"\`. ${noOtra}`;
}
