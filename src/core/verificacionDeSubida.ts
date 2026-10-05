/**
 * La comprobación de lo que una subida dejó en CloudStudio: lo que se mandó contra lo que se
 * relee. PURA, para poder probar el motivo sin red.
 *
 * Existe porque hay ficheros que se CORTAN al subirlos a Studio y la causa no se ha encontrado.
 * Mientras tanto, cada texto subido se relee y se compara; un corte tiene que salir como fallo
 * con cifras que se puedan medir —cuánto había, cuánto llegó, desde dónde difiere—, no como un
 * «subido» que miente.
 *
 * La comparación es EXACTA, sin normalizar nada: no hay medida de que Studio cambie un texto
 * de forma legítima (finales de línea, BOM…), y normalizar a ciegas es justo cómo se esconde
 * un corte. Si algún día se mide una transformación legítima, se añade aquí con su medida.
 */
import { createHash } from "node:crypto";

/** sha256 en hexadecimal minúsculo: el mismo formato que pide `studio_upload_file`. */
export function sha256Hex(datos: string | Uint8Array): string {
  return createHash("sha256").update(datos).digest("hex");
}

/** Un número con el punto de miles del castellano, sin depender del ICU de la máquina. */
export function conMiles(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export interface DiferenciaDeTexto {
  /** Legible y medible: «llegó distinto a Studio: 39.990 B en local, 12.004 B en Studio (…)». */
  motivo: string;
  sha256Local: string;
  sha256Studio: string;
}

/** `undefined` = llegó igual. Si no, el motivo con las cifras y los dos hashes. */
export function diferenciaDeTexto(local: string, studio: string): DiferenciaDeTexto | undefined {
  if (local === studio) return undefined;
  let desde = 0;
  const tope = Math.min(local.length, studio.length);
  while (desde < tope && local[desde] === studio[desde]) desde++;
  const bytesLocal = Buffer.byteLength(local, "utf8");
  const bytesStudio = Buffer.byteLength(studio, "utf8");
  return {
    motivo:
      `llegó distinto a Studio: ${conMiles(bytesLocal)} B en local, ${conMiles(bytesStudio)} B en Studio ` +
      `(difieren desde el carácter ${conMiles(desde)})`,
    sha256Local: sha256Hex(local),
    sha256Studio: sha256Hex(studio),
  };
}

/** Cuánto de un motivo de error remoto se deja en un fallo: lo justo para reconocerlo. */
const TOPE_DE_MOTIVO = 200;

/** El motivo de una relectura que no se pudo hacer: el fichero se escribió pero NO está comprobado. */
export function motivoSinComprobar(error: string): string {
  const corto = error.length > TOPE_DE_MOTIVO ? `${error.slice(0, TOPE_DE_MOTIVO)}…` : error;
  return `subido pero no se pudo comprobar: ${corto}`;
}
