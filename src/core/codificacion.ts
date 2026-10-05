/**
 * La codificación de un fichero de texto del proyecto, en las dos direcciones, y UNA sola tabla.
 *
 * Los proyectos XOne antiguos traen sus `.xne` en ISO-8859 (`<?xml … encoding="iso-8859-15"?>`),
 * hechos en Windows. XOne los lee según ese `encoding=`, así que guardarlos convertidos a UTF-8
 * rompería cada tilde sin un error que leer: un bug mudo. Lo que hace falta es escribir en la
 * codificación que el fichero YA tenía.
 *
 * La lectura (`arbolDeProyecto.ts#decodificar`, y el backend del agente) decodifica lo que no es
 * UTF-8 con `TextDecoder("latin1")`, que en WHATWG es windows-1252: 0x80 es «€», y los cinco bytes
 * que windows-1252 no define (0x81, 0x8D, 0x8F, 0x90, 0x9D) salen como el control C1 del mismo
 * número. El codificador se CONSTRUYE invirtiendo ese mismo decodificador byte a byte, no se copia
 * de una tabla: así la ida y vuelta es exacta por construcción, C1 incluidos, y si un día el
 * decodificador cambiara, las dos direcciones cambiarían juntas.
 *
 * Puro: `Uint8Array` y `TextDecoder`, sin `Buffer` ni disco.
 */

const DECODIFICADOR = new TextDecoder("latin1");

/** Carácter (code point) → byte. Se construye una vez, al cargar el módulo. */
const BYTE_DE: ReadonlyMap<number, number> = (() => {
  const tabla = new Map<number, number>();
  for (let byte = 0; byte < 256; byte++) {
    const caracter = DECODIFICADOR.decode(Uint8Array.of(byte));
    tabla.set(caracter.codePointAt(0)!, byte);
  }
  return tabla;
})();

/** Lo que leería la lectura: bytes de un fichero Latin-1 → texto. */
export function decodificarWindows1252(bytes: Uint8Array): string {
  return DECODIFICADOR.decode(bytes);
}

/** El carácter que no cabe y su línea (desde 1), para poder decirlo. */
export interface CaracterNoRepresentable {
  caracter: string;
  linea: number;
}

/**
 * Texto → bytes windows-1252, o el PRIMER carácter que no cabe. Nunca se sustituye por `?`: un
 * `?` en lugar de una letra es otra forma del bug mudo. Se recorre por CODE POINT, así que un
 * emoji (dos unidades UTF-16) se nombra entero.
 */
export function codificarWindows1252(texto: string): { bytes: Uint8Array } | CaracterNoRepresentable {
  const bytes = new Uint8Array(texto.length);
  let n = 0;
  let linea = 1;
  for (const caracter of texto) {
    const byte = BYTE_DE.get(caracter.codePointAt(0)!);
    if (byte === undefined) return { caracter, linea };
    if (caracter === "\n") linea++;
    bytes[n++] = byte;
  }
  return { bytes: bytes.subarray(0, n) };
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

/**
 * Bytes de un texto del proyecto → el texto que ve el AGENTE: UTF-8 si lo es (con el BOM dentro,
 * como `readFile(…, "utf8")`, que es lo que hace la librería), y si no, windows-1252. Es lo que
 * tiene que leer cualquiera que compare contra lo que el agente leyó —el ANTES de la tarjeta de
 * aprobación—: con UTF-8 a secas, un ancla con tilde de un Latin-1 no calzaba y cada línea con
 * tilde salía cambiada.
 */
export function decodificarComoTexto(bytes: Uint8Array): string {
  return esUtf8Valido(bytes) ? new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes) : decodificarWindows1252(bytes);
}
