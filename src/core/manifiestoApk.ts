/**
 * El PAQUETE de un APK, leído de su `AndroidManifest.xml` BINARIO (el formato AXML de Android), sin
 * `aapt2` ni ninguna herramienta del SDK: instalar el framework (`instalacionDeFramework.ts`) tiene
 * que saber QUÉ va a instalar ANTES de llamar a `adb`, porque un APK del otro flavor quedaría al lado
 * del estándar y dos frameworks se pelean por el puerto del canal.
 *
 * Solo se lee lo que hace falta: la tabla de cadenas y el PRIMER elemento, que en un manifiesto es
 * `<manifest package="…">`. Nada de recursos, ni de espacios de nombres, ni del resto del árbol.
 * Puro y sin lanzar: lo que no se entiende devuelve `undefined`, y quien llama lo trata como «no se
 * sabe qué es», que es un NO.
 *
 * El formato (little-endian):
 * - cada trozo empieza por `tipo u16, cabecera u16, tamaño u32`;
 * - el fichero es un trozo XML (`0x0003`) que contiene una tabla de cadenas (`0x0001`) y, más
 *   adelante, los elementos (`0x0102` abre uno);
 * - un atributo son 20 bytes: `ns, nombre, valorCrudo` (índices a la tabla, `0xFFFFFFFF` es ninguno)
 *   y un valor tipado (`tamaño u16, 0 u8, tipo u8, dato u32`; tipo `0x03` es una cadena).
 */

const XML = 0x0003;
const TABLA_DE_CADENAS = 0x0001;
const ABRE_ELEMENTO = 0x0102;
const UTF8 = 0x100;
const NINGUNO = 0xffffffff;
const TIPO_CADENA = 0x03;

export function paqueteDelManifiesto(bytes: Uint8Array): string | undefined {
  try {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.byteLength < 8 || v.getUint16(0, true) !== XML) return undefined;
    let cadenas: string[] | undefined;
    let pos = v.getUint16(2, true);
    while (pos + 8 <= bytes.byteLength) {
      const tipo = v.getUint16(pos, true);
      const cabecera = v.getUint16(pos + 2, true);
      const tamano = v.getUint32(pos + 4, true);
      if (tamano < 8 || pos + tamano > bytes.byteLength) return undefined;
      if (tipo === TABLA_DE_CADENAS) cadenas = leerCadenas(v, pos);
      if (tipo === ABRE_ELEMENTO) {
        if (cadenas === undefined) return undefined;
        const nombre = cadenas[v.getUint32(pos + 20, true)];
        if (nombre !== "manifest") return undefined;
        const inicio = pos + cabecera + v.getUint16(pos + 24, true);
        const ancho = v.getUint16(pos + 26, true);
        const cuantos = v.getUint16(pos + 28, true);
        for (let i = 0; i < cuantos; i++) {
          const a = inicio + i * ancho;
          if (cadenas[v.getUint32(a + 4, true)] !== "package") continue;
          const crudo = v.getUint32(a + 8, true);
          if (crudo !== NINGUNO) return cadenas[crudo];
          if (v.getUint8(a + 15) === TIPO_CADENA) return cadenas[v.getUint32(a + 16, true)];
          return undefined;
        }
        return undefined;
      }
      pos += tamano;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function leerCadenas(v: DataView, trozo: number): string[] {
  const cuantas = v.getUint32(trozo + 8, true);
  const banderas = v.getUint32(trozo + 16, true);
  const desde = trozo + v.getUint32(trozo + 20, true);
  const utf8 = (banderas & UTF8) !== 0;
  const cadenas: string[] = [];
  for (let i = 0; i < cuantas; i++) {
    let p = desde + v.getUint32(trozo + v.getUint16(trozo + 2, true) + i * 4, true);
    if (utf8) {
      // Primero la longitud en UTF-16 (que no hace falta) y luego la de bytes: 1 o 2 bytes cada una.
      p += (v.getUint8(p) & 0x80) !== 0 ? 2 : 1;
      let largo = v.getUint8(p);
      if ((largo & 0x80) !== 0) {
        largo = ((largo & 0x7f) << 8) | v.getUint8(p + 1);
        p += 2;
      } else p += 1;
      cadenas.push(new TextDecoder("utf-8").decode(new Uint8Array(v.buffer, v.byteOffset + p, largo)));
    } else {
      let largo = v.getUint16(p, true);
      if ((largo & 0x8000) !== 0) {
        largo = ((largo & 0x7fff) << 16) | v.getUint16(p + 2, true);
        p += 4;
      } else p += 2;
      let s = "";
      for (let c = 0; c < largo; c++) s += String.fromCharCode(v.getUint16(p + c * 2, true));
      cadenas.push(s);
    }
  }
  return cadenas;
}
