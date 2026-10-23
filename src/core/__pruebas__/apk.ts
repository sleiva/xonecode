/**
 * Ayudantes de PRUEBA que comparten varias suites. Fuera del build (`tsconfig.build.json`) y fuera de
 * los `.test.ts` para que importarlos no registre tests ajenos.
 */
import { zipSync } from "fflate";

/**
 * Un `AndroidManifest.xml` binario mínimo, montado byte a byte con el formato AXML: cabecera XML,
 * tabla de cadenas y un elemento con sus atributos. Lo justo para que el lector tenga algo REAL que
 * leer sin meter un APK en el repo.
 */
export function axml(opciones: {
  cadenas: string[];
  utf8?: boolean;
  elemento: string;
  atributos: { nombre: string; crudo?: string; tipado?: string }[];
}): Uint8Array {
  const { cadenas } = opciones;
  const idx = (s: string): number => {
    const i = cadenas.indexOf(s);
    if (i < 0) throw new Error(`falta «${s}» en la tabla`);
    return i;
  };
  const datos: number[] = [];
  const offsets: number[] = [];
  for (const s of cadenas) {
    offsets.push(datos.length);
    if (opciones.utf8) {
      const b = [...new TextEncoder().encode(s)];
      datos.push(s.length, b.length, ...b, 0);
    } else {
      datos.push(s.length & 0xff, s.length >> 8);
      for (const c of s) datos.push(c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8);
      datos.push(0, 0);
    }
  }
  while (datos.length % 4 !== 0) datos.push(0);

  const tabla = new DataView(new ArrayBuffer(28 + offsets.length * 4 + datos.length));
  tabla.setUint16(0, 0x0001, true);
  tabla.setUint16(2, 28, true);
  tabla.setUint32(4, tabla.byteLength, true);
  tabla.setUint32(8, cadenas.length, true);
  tabla.setUint32(16, opciones.utf8 ? 0x100 : 0, true);
  tabla.setUint32(20, 28 + offsets.length * 4, true);
  offsets.forEach((o, i) => tabla.setUint32(28 + i * 4, o, true));
  datos.forEach((b, i) => tabla.setUint8(28 + offsets.length * 4 + i, b));

  const el = new DataView(new ArrayBuffer(36 + opciones.atributos.length * 20));
  el.setUint16(0, 0x0102, true);
  el.setUint16(2, 16, true);
  el.setUint32(4, el.byteLength, true);
  el.setUint32(12, 0xffffffff, true);
  el.setUint32(16, 0xffffffff, true);
  el.setUint32(20, idx(opciones.elemento), true);
  el.setUint16(24, 20, true);
  el.setUint16(26, 20, true);
  el.setUint16(28, opciones.atributos.length, true);
  opciones.atributos.forEach((a, i) => {
    const p = 36 + i * 20;
    el.setUint32(p, 0xffffffff, true);
    el.setUint32(p + 4, idx(a.nombre), true);
    el.setUint32(p + 8, a.crudo === undefined ? 0xffffffff : idx(a.crudo), true);
    el.setUint16(p + 12, 8, true);
    el.setUint8(p + 15, a.tipado === undefined ? 0x10 : 0x03);
    el.setUint32(p + 16, a.tipado === undefined ? 1 : idx(a.tipado), true);
  });

  const total = 8 + tabla.byteLength + el.byteLength;
  const out = new Uint8Array(total);
  const cab = new DataView(out.buffer);
  cab.setUint16(0, 0x0003, true);
  cab.setUint16(2, 8, true);
  cab.setUint32(4, total, true);
  out.set(new Uint8Array(tabla.buffer), 8);
  out.set(new Uint8Array(el.buffer), 8 + tabla.byteLength);
  return out;
}

/** Un APK de prueba: un zip con su manifiesto binario y un relleno, del paquete pedido. */
export function apkDePrueba(paquete: string, relleno = 1024): Uint8Array {
  const manifiesto = axml({ cadenas: ["package", "manifest", paquete], elemento: "manifest", atributos: [{ nombre: "package", crudo: paquete }] });
  return zipSync({ "AndroidManifest.xml": manifiesto, "classes.dex": new Uint8Array(relleno).fill(7) });
}
