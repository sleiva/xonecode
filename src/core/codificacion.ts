/**
 * La codificación de un fichero de texto del proyecto, en las dos direcciones, con UNA tabla por
 * juego de caracteres.
 *
 * Los proyectos XOne traen sus `.xne` en UTF-8 o en ISO-8859 (`<?xml … encoding="iso-8859-15"?>`,
 * lo que emiten las plantillas de la skill). XOne los lee según ese `encoding=`, así que guardarlos
 * en otra codificación rompería cada tilde sin un error que leer: un bug mudo, y el mismo que la
 * skill nombra como «encoding incoherente». Lo que hace falta es escribir en la codificación que el
 * fichero YA tenía, o la que DECLARA si todavía no la delatan sus bytes.
 *
 * Dos tablas de 8 bits, y se elige UNA por fichero en las dos direcciones —leer con una y escribir
 * con otra movería caracteres—:
 * - `iso-8859-15` si el prólogo lo declara: el € en 0xA4.
 * - `windows-1252` en todo lo demás (lo que `TextDecoder("latin1")` es en WHATWG): el € en 0x80, y
 *   los cinco bytes que windows-1252 no define salen como el control C1 del mismo número.
 * Cada codificador se CONSTRUYE invirtiendo su decodificador byte a byte, no se copia de una tabla:
 * así la ida y vuelta es exacta por construcción, C1 incluidos.
 *
 * Puro: `Uint8Array` y `TextDecoder`, sin `Buffer` ni disco.
 */

export type Tabla8Bits = "windows-1252" | "iso-8859-15";
export type CodificacionDeEscritura = "utf-8" | Tabla8Bits;

interface Tabla {
  decodificar: (bytes: Uint8Array) => string;
  /** Carácter (code point) → byte. */
  byteDe: ReadonlyMap<number, number>;
}

function construir(etiqueta: string): Tabla {
  const decodificador = new TextDecoder(etiqueta);
  const byteDe = new Map<number, number>();
  for (let byte = 0; byte < 256; byte++) {
    byteDe.set(decodificador.decode(Uint8Array.of(byte)).codePointAt(0)!, byte);
  }
  return { decodificar: (bytes) => decodificador.decode(bytes), byteDe };
}

/** Se construyen una vez, al cargar el módulo. `latin1` es la etiqueta que usaba ya la lectura. */
const TABLAS: Record<Tabla8Bits, Tabla> = {
  "windows-1252": construir("latin1"),
  "iso-8859-15": construir("iso-8859-15"),
};

/** Bytes de 8 bits → texto, con la tabla del fichero. */
export function decodificar8Bits(bytes: Uint8Array, tabla: Tabla8Bits): string {
  return TABLAS[tabla].decodificar(bytes);
}

/** El carácter que no cabe y su línea (desde 1), para poder decirlo. */
export interface CaracterNoRepresentable {
  caracter: string;
  linea: number;
}

/**
 * Texto → bytes de 8 bits, o el PRIMER carácter que no cabe. Nunca se sustituye por `?`: un `?` en
 * lugar de una letra es otra forma del bug mudo. Se recorre por CODE POINT, así que un emoji (dos
 * unidades UTF-16) se nombra entero.
 */
export function codificar8Bits(texto: string, tabla: Tabla8Bits): { bytes: Uint8Array } | CaracterNoRepresentable {
  const byteDe = TABLAS[tabla].byteDe;
  const bytes = new Uint8Array(texto.length);
  let n = 0;
  let linea = 1;
  for (const caracter of texto) {
    const byte = byteDe.get(caracter.codePointAt(0)!);
    if (byte === undefined) return { caracter, linea };
    if (caracter === "\n") linea++;
    bytes[n++] = byte;
  }
  return { bytes: bytes.subarray(0, n) };
}

/** Cómo se NOMBRA la tabla en un mensaje para una persona o para el agente. */
export function nombreDeTabla(tabla: Tabla8Bits): string {
  return tabla === "iso-8859-15" ? "ISO-8859-15" : "Latin-1";
}

/**
 * La codificación que DECLARA el prólogo XML, mirada como la mira `xone-linter`
 * (`XmlParser.js#detectEncoding`): la cabeza del texto, `<?xml … encoding="…"`, y «8859-15» antes
 * que «8859-1» (que lo contiene). Lo que no es un prólogo al principio —sin contar el BOM y los
 * blancos— no declara nada, y una codificación que no sabemos escribir tampoco.
 */
export function codificacionDeclarada(cabeza: string): CodificacionDeEscritura | undefined {
  const m = /^﻿?\s*<\?xml[^?]*?encoding\s*=\s*["']([^"']+)["']/i.exec(cabeza.slice(0, 256));
  if (m === null) return undefined;
  const declarada = m[1]!.toLowerCase();
  if (declarada.includes("8859-15") || declarada === "latin-9" || declarada === "latin9") return "iso-8859-15";
  if (declarada.includes("8859-1") || declarada === "latin1" || declarada === "latin-1" || declarada.includes("1252")) {
    return "windows-1252";
  }
  if (declarada === "utf-8" || declarada === "utf8") return "utf-8";
  return undefined;
}

/** La tabla de 8 bits de unos bytes que NO son UTF-8: la que declare su prólogo, o windows-1252. */
export function tablaDeLosBytes(bytes: Uint8Array): Tabla8Bits {
  // La cabeza se mira byte a byte (como `latin1`): el prólogo es ASCII en cualquier tabla.
  const cabeza = decodificar8Bits(bytes.subarray(0, 256), "windows-1252");
  return codificacionDeclarada(cabeza) === "iso-8859-15" ? "iso-8859-15" : "windows-1252";
}

/** UTF-8 ESTRICTO, el mismo criterio que la lectura para decidir que un fichero no lo es. */
export function esUtf8Valido(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function esAscii(bytes: Uint8Array): boolean {
  return bytes.every((b) => b < 0x80);
}

/**
 * En qué bytes se guarda `texto` sobre lo que hay (`actual`, ausente si el fichero es NUEVO). En
 * orden:
 * 1. Lo que ya no es UTF-8 sigue en 8 bits: con la tabla que declare lo que se escribe, si declara
 *    una de 8 bits (la que usará la próxima lectura), o si no con la de sus bytes (`tablaDeLosBytes`).
 * 2. Un UTF-8 con algo que no es ASCII se queda en UTF-8: nunca se transcodifica lo que nadie tocó.
 * 3. Un ASCII puro —que es UTF-8 válido y no delata nada— o un fichero nuevo siguen lo que DECLARE el
 *    texto que se escribe; sin declaración, UTF-8. Es el caso de toda colección nueva con la
 *    plantilla de la skill (`encoding="iso-8859-15"`): sin esto, su primera tilde iba en UTF-8 bajo
 *    una declaración de 8 bits.
 */
export function codificacionParaEscribir(actual: Uint8Array | undefined, texto: string): CodificacionDeEscritura {
  if (actual !== undefined && !esUtf8Valido(actual)) {
    // Si lo que se escribe CAMBIA la declaración a otra tabla de 8 bits, manda la nueva: es con la
    // que se volverá a leer, y escribir con la vieja dejaría un € en 0x80 leído luego como control.
    const declarada = codificacionDeclarada(texto);
    return declarada !== undefined && declarada !== "utf-8" ? declarada : tablaDeLosBytes(actual);
  }
  if (actual !== undefined && !esAscii(actual)) return "utf-8";
  return codificacionDeclarada(texto) ?? "utf-8";
}

/**
 * Bytes de un texto del proyecto → el texto que ve el AGENTE: UTF-8 si lo es (con el BOM dentro,
 * como `readFile(…, "utf8")`, que es lo que hace la librería), y si no, su tabla de 8 bits. Es lo
 * que tiene que leer cualquiera que compare contra lo que el agente leyó —el ANTES de la tarjeta de
 * aprobación—: con UTF-8 a secas, un ancla con tilde no calzaba y cada línea con tilde salía cambiada.
 */
export function decodificarComoTexto(bytes: Uint8Array): string {
  return esUtf8Valido(bytes)
    ? new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)
    : decodificar8Bits(bytes, tablaDeLosBytes(bytes));
}
