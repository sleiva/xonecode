/**
 * Un `.zip` que la persona adjunta en el chat se DESCOMPRIME al guardarlo: QUÉ se extrae y dónde.
 *
 * Existe por una conversación de MyAllXOne: la persona adjuntó el diseño de Stitch en un `.zip`
 * (`screen.png`, `code.html`, `DESIGN.md`) y ningún agente tenía con qué abrirlo — `read_file` y
 * `describe_image` no entran en un zip—. Siete minutos y 2,6 millones de tokens de entrada después,
 * con herramientas inventadas (`unzip`, `extraer_zip`, `bash`…), el turno acabó pidiendo los ficheros
 * sueltos. Lo hace el HARNESS, no el agente: el modelo no tiene que saber nada de zips, ve una carpeta.
 *
 * **Este módulo es PURO** (la regla); quien descomprime y escribe es
 * `agent/sesiones/adjuntosDeSesion.ts`. Las barreras son las de instalar una skill desde un `.zip`
 * (`core/zipDeSkill.ts`), porque es la misma entrada de poca confianza:
 * - **forma de ruta en lista BLANCA** (`rutaDeZipAceptable`: el «zip slip» no se para con
 *   `includes("..")`), y además cada segmento tiene que ser un nombre de adjunto válido
 *   (`nombreDeAdjuntoAceptable`): es lo que luego lee el agente bajo `/adjuntos/`;
 * - **topes contra un zip BOMBA**: cuántas entradas y cuánto ocupa todo descomprimido, decididos con
 *   el tamaño que DECLARA cada entrada, ANTES de inflar nada;
 * - **una mala se lleva el zip entero**: se decide todo antes de escribir.
 * Lo que un empaquetador arrastra sin que nadie lo pida (`__MACOSX/`, `.DS_Store`) se descarta, y una
 * única carpeta envolvente se quita, como en las skills.
 */
import { nombreDeAdjuntoAceptable } from "./adjuntos.js";
import { carpetaComun, rutaDeZipAceptable, TOPE_DE_ENTRADAS, TOPE_DESCOMPRIMIDO, type EntradaDeZip } from "./zipDeSkill.js";

export { TOPE_DE_ENTRADAS as TOPE_DE_ENTRADAS_DE_ADJUNTO, TOPE_DESCOMPRIMIDO as TOPE_DESCOMPRIMIDO_DE_ADJUNTO };

/** ¿Es un `.zip` por su nombre? Lo que se descomprime lo decide la extensión, como el resto de adjuntos. */
export function esZip(nombre: string): boolean {
  return /\.zip$/i.test(nombre);
}

/** La carpeta donde se extrae `x.zip`: `x`, al lado del zip. */
export function carpetaDeExtraccion(nombreDelZip: string): string {
  return nombreDelZip.replace(/\.zip$/i, "");
}

/** Lo que arrastra un empaquetador y nadie pidió. */
function esBasura(ruta: string): boolean {
  const segmentos = ruta.split("/");
  return segmentos[0] === "__MACOSX" || segmentos.some((s) => s === ".DS_Store" || s.startsWith("._"));
}

/**
 * Un segmento como nombre de adjunto: lo que no es letra o cifra ASCII, punto, guion o guion bajo pasa
 * a «_» («Captura de pantalla.png» → «Captura_de_pantalla.png»), en vez de tirar el zip entero por un
 * espacio. Es SEGURO porque va DESPUÉS de `rutaDeZipAceptable`: la ruta ya es de segmentos llanos, sin
 * `..` ni barras; y lo que salga se vuelve a mirar con `nombreDeAdjuntoAceptable`.
 */
export function segmentoDeAdjunto(segmento: string): string {
  return segmento.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._-]/g, "_");
}

export interface PlanDeExtraccion {
  /** Cada entrada aceptada: su ruta EN el zip y la ruta relativa a la carpeta de extracción, con `/`. */
  ficheros: { enElZip: string; destino: string }[];
}

/**
 * Qué se extrae. `entradas` son los FICHEROS del zip (sin las carpetas) con el tamaño que declaran
 * descomprimidos. Devuelve el motivo si no se extrae nada; nunca lanza. `disponible` es lo que aún
 * cabe en los adjuntos de la sesión.
 */
export function planDeExtraccion(entradas: readonly EntradaDeZip[], disponible: number = TOPE_DESCOMPRIMIDO): PlanDeExtraccion | { error: string } {
  const utiles = entradas.filter((e) => !esBasura(e.ruta));
  if (utiles.length === 0) return { error: "el .zip está vacío" };
  if (utiles.length > TOPE_DE_ENTRADAS) return { error: `el .zip trae más de ${TOPE_DE_ENTRADAS} ficheros` };
  // El nombre de la entrada mala NO se devuelve: lo eligió quien empaquetó el zip.
  if (utiles.some((e) => !rutaDeZipAceptable(e.ruta))) return { error: "el .zip trae una ruta que se sale de su carpeta" };
  const total = utiles.reduce((suma, e) => suma + e.bytes, 0);
  if (total > TOPE_DESCOMPRIMIDO) return { error: "el .zip ocupa demasiado descomprimido" };
  if (total > disponible) return { error: "descomprimido no cabe en los adjuntos de esta sesión" };

  const prefijo = carpetaComun(utiles.map((e) => e.ruta));
  const ficheros = utiles.map((e) => ({
    enElZip: e.ruta,
    destino: (prefijo === undefined ? e.ruta : e.ruta.slice(prefijo.length + 1)).split("/").map(segmentoDeAdjunto).join("/"),
  }));
  if (ficheros.some((f) => !f.destino.split("/").every(nombreDeAdjuntoAceptable))) {
    return { error: "el .zip trae nombres que no valen para un adjunto" };
  }
  if (new Set(ficheros.map((f) => f.destino.toLowerCase())).size !== ficheros.length) {
    return { error: "el .zip trae dos ficheros que quedarían con el mismo nombre" };
  }
  return { ficheros };
}
