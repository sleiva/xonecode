import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import type { ImagenRgba } from "../../core/compararCapturas.js";

/**
 * De un PNG o un JPEG a píxeles RGBA, para `core/compararCapturas.ts` (que no importa librerías).
 *
 * **Se comprueban las dimensiones ANTES de descomprimir.** Un PNG de unos cientos de bytes puede
 * declarar 60.000×60.000 y agotar la memoria al abrirlo (una bomba de descompresión, la misma
 * clase que el `.zip` de una skill), así que se lee la cabecera —los primeros bytes— y se rechaza
 * lo que pase de `MAX_LADO`/`MAX_PIXELES` sin decodificar nada. Una captura de móvil va de
 * 1080×2400 a 1440×3200 (~4,6 millones), lejos del tope.
 *
 * **Lanza con un mensaje sin ruta ni contenido**: quien lo llama (la tool) lo devuelve como texto.
 */
export const MAX_LADO = 8192;
export const MAX_PIXELES = 40_000_000;
export const MAX_BYTES = 30 * 1024 * 1024;

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function dimensionesPng(b: Buffer): { ancho: number; alto: number } {
  // Firma (8) + longitud del trozo (4) + «IHDR» (4) + ancho (4) + alto (4).
  if (b.length < 24 || b.toString("ascii", 12, 16) !== "IHDR") throw new Error("PNG con la cabecera dañada");
  return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
}

function dimensionesJpeg(b: Buffer): { ancho: number; alto: number } {
  // Se recorren los marcadores hasta el de tamaño (SOF0–SOF15, salvo DHT/JPG/DAC).
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) throw new Error("JPEG con la cabecera dañada");
    const marcador = b[i + 1]!;
    if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
      return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error("JPEG sin tamaño declarado");
}

export function decodificarImagen(bytes: Buffer): ImagenRgba {
  if (bytes.length > MAX_BYTES) throw new Error("la imagen es demasiado grande");
  const esPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(FIRMA_PNG);
  const esJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!esPng && !esJpeg) throw new Error("no es un PNG ni un JPEG");
  const { ancho, alto } = esPng ? dimensionesPng(bytes) : dimensionesJpeg(bytes);
  if (ancho < 1 || alto < 1 || ancho > MAX_LADO || alto > MAX_LADO || ancho * alto > MAX_PIXELES) {
    throw new Error(`la imagen declara ${ancho}×${alto} píxeles, por encima del tope`);
  }
  try {
    if (esPng) {
      const png = PNG.sync.read(bytes);
      return { ancho: png.width, alto: png.height, datos: png.data };
    }
    const j = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: 40 });
    return { ancho: j.width, alto: j.height, datos: j.data };
  } catch {
    // El mensaje de la librería puede llevar trozos del fichero: solo se dice que no se pudo.
    throw new Error("la imagen está dañada y no se pudo decodificar");
  }
}
