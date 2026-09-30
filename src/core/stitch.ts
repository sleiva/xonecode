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
