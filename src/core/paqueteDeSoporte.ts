/**
 * El paquete de SOPORTE: lo que se exporta desde la pestaña Soporte para que alguien analice
 * qué hizo un chat, una tarea o el proyecto entero. Las REGLAS, puras; el disco y el zip
 * viven en `agent/soporte/paqueteEnDisco.ts`.
 *
 * ## Qué entra y qué no
 *
 * Es una LISTA NEGRA de lo que nunca viaja sobre lo que ya se recorre (el proyecto y su
 * `.xonecode/`), y no una lista blanca de extensiones, porque la pregunta de soporte es
 * «qué había»: una lista blanca dejaría fuera justo el fichero raro que explica el fallo.
 * Lo que nunca viaja es lo que da acceso a algo —claves, tokens, el `.env`— y el historial
 * de git, que el usuario no pidió (se decidió con él).
 *
 * Los secretos de xonecode viven en la CASA del usuario, no en el proyecto, así que aquí no
 * deberían aparecer nunca. Los nombres se niegan igual: es la segunda llave, por si un día
 * alguien copia uno donde no toca.
 *
 * ## Qué líneas de traza son de UN chat
 *
 * Solo las que traen su `chat`. **No se reparte nada por fechas**: las sesiones se reabren,
 * así que la ventana `creada`→`ultimoTurno` de dos chats se solapa y la mayoría de las líneas
 * caerían en el chat equivocado. Lo que no lleva `chat` —líneas anteriores a que existiera,
 * y `traza-errores.jsonl`, cuyo sumidero es de todo el proceso— va solo en el paquete del
 * PROYECTO, y el manifiesto dice por qué.
 *
 * ## Rutas de la máquina
 *
 * Los mensajes del hilo y el `detalle` de un comando de shell pueden llevar rutas absolutas.
 * Es una excepción DECLARADA a `sinRutas`: esa regla es del cable, y esto es un fichero que la
 * persona descarga y entrega a mano. El manifiesto lo avisa.
 */

export type TipoDePaquete = "proyecto" | "chat" | "tarea";

/** Lo que admite un paquete, sumado en disco. Lo que no cabe se OMITE y se dice. */
export const TOPE_DEL_PAQUETE_DE_SOPORTE = 512 * 1024 * 1024;

/** Carpetas que no viajan, estén donde estén. */
export const CARPETAS_QUE_NO_VIAJAN: ReadonlySet<string> = new Set([".git", "node_modules"]);

/** Ficheros de credenciales de xonecode. Viven en la casa; negarlos aquí es la segunda llave. */
export const SECRETOS_QUE_NO_VIAJAN: ReadonlySet<string> = new Set([
  "auth.json",
  "cloudstudio-oauth.json",
  "conectores-oauth.json",
]);

/**
 * El checkpoint no se recorre como un fichero más: con la conexión abierta, copiar sus bytes
 * da una base a medio escribir. Se copia aparte con la copia en caliente de SQLite, y sus
 * auxiliares (`-wal`, `-shm`) no viajan porque la copia ya los lleva dentro.
 */
export const NOMBRE_DEL_CHECKPOINT = "checkpoint.sqlite";

/**
 * ¿Viaja esta ruta en un paquete de soporte? `relativa` es POSIX, relativa a la raíz de lo
 * que se recorre, sin barra delante.
 */
export function viajaEnSoporte(relativa: string): boolean {
  const segmentos = relativa.split("/").filter((s) => s !== "");
  if (segmentos.length === 0) return false;
  if (segmentos.some((s) => CARPETAS_QUE_NO_VIAJAN.has(s))) return false;
  const nombre = segmentos[segmentos.length - 1]!;
  if (nombre === ".env" || nombre.startsWith(".env.")) return false;
  if (SECRETOS_QUE_NO_VIAJAN.has(nombre)) return false;
  if (nombre === NOMBRE_DEL_CHECKPOINT || nombre.startsWith(`${NOMBRE_DEL_CHECKPOINT}-`)) return false;
  return true;
}

/** Las líneas de una traza que son de ESTE chat: las que traen su id. Nada por fechas. */
export function lineasDelChat<T extends { chat?: unknown }>(lineas: readonly T[], chat: string): T[] {
  return lineas.filter((l) => l.chat === chat);
}

/** Cuántas líneas NO llevan chat: se dice en el manifiesto del proyecto. */
export function lineasSinChat(lineas: readonly { chat?: unknown }[]): number {
  return lineas.filter((l) => typeof l.chat !== "string").length;
}

/** Un trozo de nombre de fichero: sin nada que un sistema de ficheros tome por separador. */
function trozo(texto: string): string {
  const limpio = texto
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return limpio === "" ? "sin-nombre" : limpio;
}

/**
 * El nombre del zip lo DERIVA el código, nunca llega del cliente: va en una cabecera
 * `Content-Disposition` y un nombre con comillas o barras sería otra cosa.
 */
export function nombreDelPaquete(tipo: TipoDePaquete, nombre: string, ahora: Date): string {
  const fecha = ahora.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `soporte-${tipo}-${trozo(nombre)}-${fecha}.zip`;
}

export interface Candidato {
  /** La ruta DENTRO del zip. */
  ruta: string;
  bytes: number;
}

export interface Omitido {
  ruta: string;
  motivo: string;
}

/**
 * Lo que cabe bajo el tope. Si no cabe todo, se omite empezando por lo MÁS GRANDE: una imagen
 * de veinte megas explica menos que cien ficheros de texto, y soltar lo grande primero deja
 * dentro el mayor número de ficheros. Lo omitido se DICE en el manifiesto, con su tamaño.
 */
export function repartirPorTope<T extends Candidato>(candidatos: readonly T[], tope: number): { entran: T[]; omitidos: Omitido[] } {
  let total = candidatos.reduce((s, c) => s + c.bytes, 0);
  if (total <= tope) return { entran: [...candidatos], omitidos: [] };
  const porTamano = [...candidatos].sort((a, b) => b.bytes - a.bytes);
  const fuera = new Set<T>();
  for (const c of porTamano) {
    if (total <= tope) break;
    fuera.add(c);
    total -= c.bytes;
  }
  return {
    entran: candidatos.filter((c) => !fuera.has(c)),
    omitidos: candidatos.filter((c) => fuera.has(c)).map((c) => ({ ruta: c.ruta, motivo: `no cabe bajo el tope del paquete (${c.bytes} bytes)` })),
  };
}

export interface ManifiestoDeSoporte {
  v: 1;
  tipo: TipoDePaquete;
  /** Versión de xonecode que lo generó, si se sabe. */
  version?: string;
  generado: string;
  proyecto: string;
  /** El id del chat o de la tarea exportados. */
  id?: string;
  motor?: string;
  /** Había un turno o una tarea EN VUELO al exportar: la foto puede estar a medias. */
  enVuelo?: boolean;
  incluidos: string[];
  omitidos: Omitido[];
  /** Lo que el paquete NO puede afirmar, dicho en una frase cada uno. */
  avisos: string[];
}

export const AVISO_DE_RUTAS =
  "Los mensajes del hilo y los comandos de shell pueden llevar rutas absolutas de la máquina de quien exporta.";
export const AVISO_DE_TRAZA_SIN_CHAT =
  "Las líneas de traza sin id de chat (anteriores a que existiera, y toda traza-errores.jsonl) no se pueden atribuir a un chat: solo van en el paquete del proyecto.";
export const AVISO_EN_VUELO = "Había un turno o una tarea en marcha al exportar: lo último puede estar a medias.";
