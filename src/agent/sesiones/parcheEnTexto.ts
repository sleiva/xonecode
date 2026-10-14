import { closeSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import { decodificarParche, tablaDeLosBytes, type Tabla8Bits } from "../../core/codificacion.js";

/** Lo que se mira del fichero para saber su tabla de 8 bits: el prólogo cabe de sobra. */
const CABEZA = 512;

/**
 * La tabla de 8 bits de un fichero del proyecto, por su prólogo (`tablaDeLosBytes`). Si no se puede
 * leer —un fichero borrado, cuyo diff solo tiene el ANTES—, windows-1252, que es la omisión de la
 * misma regla. Solo se lee la cabeza: el prólogo es lo único que decide.
 */
export function tablaDelFichero(raiz: string, ruta: string): Tabla8Bits {
  let fd: number | undefined;
  try {
    fd = openSync(join(raiz, ruta), "r");
    const cabeza = Buffer.alloc(CABEZA);
    const leidos = readSync(fd, cabeza, 0, CABEZA, 0);
    return tablaDeLosBytes(cabeza.subarray(0, leidos));
  } catch {
    return "windows-1252";
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** El diff de git de UN fichero, en bytes, → texto, con la codificación de ESE fichero. */
export function parcheEnTexto(bytes: Uint8Array, raiz: string, ruta: string): string {
  return decodificarParche(bytes, tablaDelFichero(raiz, ruta));
}
