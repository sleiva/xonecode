/**
 * Lo que dice de sí misma una FUENTE (`.ttf`/`.otf`): familia, estilo y peso, leídos de sus tablas `name` y `OS/2`.
 *
 * Medido en la prueba de la calculadora (30-10-2026): el diseñador leyó con `read_file` once `.ttf` (dos veces algunos)
 * para saber qué familia y peso eran, y lo que recibía era el binario decodificado como texto —bytes de `GDEF`, `GPOS`…—,
 * ilegible. Un turno anterior se fue a 6,8 mil tokens de razonamiento buscando eso con una regex sobre los binarios.
 * Esto contesta lo que se quería saber, sin red ni dependencias. Puro.
 */

export interface DatosDeFuente {
  familia?: string;
  estilo?: string;
  nombreCompleto?: string;
  /** `usWeightClass` de `OS/2`: 100–900 (400 normal, 700 negrita). Ausente si la fuente no lo trae. */
  peso?: number;
  cursiva?: boolean;
  glifos?: number;
}

const NOMBRES_DE_PESO: Record<number, string> = {
  100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black",
};

/** ¿Es una fuente que sabemos leer, por su extensión? */
export function esFuenteLegible(ruta: string): boolean {
  return /\.(ttf|otf)$/i.test(ruta);
}

function texto(bytes: Buffer, inicio: number, largo: number, plataforma: number): string {
  if (inicio < 0 || inicio + largo > bytes.length) return "";
  const trozo = bytes.subarray(inicio, inicio + largo);
  // Windows (3) y Unicode (0) guardan UTF-16 BE; Mac (1), una tabla de 8 bits que para nombres latinos es ASCII.
  if (plataforma === 3 || plataforma === 0) {
    let s = "";
    for (let i = 0; i + 1 < trozo.length; i += 2) s += String.fromCharCode(trozo.readUInt16BE(i));
    return s;
  }
  return trozo.toString("latin1");
}

export function datosDeFuente(bytes: Buffer): DatosDeFuente | { motivo: string } {
  if (bytes.length < 12) return { motivo: "no es una fuente: demasiado corta" };
  const firma = bytes.readUInt32BE(0);
  // 0x00010000 TrueType, 'OTTO' OpenType con CFF, 'true' TrueType de Mac.
  if (firma !== 0x00010000 && firma !== 0x4f54544f && firma !== 0x74727565) {
    return { motivo: "no es una fuente TrueType/OpenType (una .woff/.woff2 o un fichero renombrado no se leen así)" };
  }
  const numTablas = bytes.readUInt16BE(4);
  const tablas = new Map<string, { offset: number; largo: number }>();
  for (let i = 0; i < numTablas; i++) {
    const p = 12 + i * 16;
    if (p + 16 > bytes.length) break;
    tablas.set(bytes.toString("latin1", p, p + 4), { offset: bytes.readUInt32BE(p + 8), largo: bytes.readUInt32BE(p + 12) });
  }
  const datos: DatosDeFuente = {};
  const name = tablas.get("name");
  if (name !== undefined && name.offset + 6 <= bytes.length) {
    const cuantos = bytes.readUInt16BE(name.offset + 2);
    const cadenas = name.offset + bytes.readUInt16BE(name.offset + 4);
    // Por id de nombre, el mejor registro: Windows/Unicode en inglés antes que lo demás.
    const mejor = new Map<number, { puntos: number; valor: string }>();
    for (let i = 0; i < cuantos; i++) {
      const r = name.offset + 6 + i * 12;
      if (r + 12 > bytes.length) break;
      const plataforma = bytes.readUInt16BE(r);
      const idioma = bytes.readUInt16BE(r + 4);
      const id = bytes.readUInt16BE(r + 6);
      if (![1, 2, 4, 16, 17].includes(id)) continue;
      const valor = texto(bytes, cadenas + bytes.readUInt16BE(r + 10), bytes.readUInt16BE(r + 8), plataforma).trim();
      if (valor === "") continue;
      const puntos = (plataforma === 3 ? 2 : plataforma === 0 ? 1 : 0) + (idioma === 0x409 || idioma === 0 ? 1 : 0);
      if ((mejor.get(id)?.puntos ?? -1) < puntos) mejor.set(id, { puntos, valor });
    }
    // 16/17 (tipográficos) agrupan los pesos en UNA familia; 1/2 la parten («X SemiBold» como familia aparte).
    const familia = mejor.get(16)?.valor ?? mejor.get(1)?.valor;
    const estilo = mejor.get(17)?.valor ?? mejor.get(2)?.valor;
    if (familia !== undefined) datos.familia = familia;
    if (estilo !== undefined) datos.estilo = estilo;
    if (mejor.get(4) !== undefined) datos.nombreCompleto = mejor.get(4)!.valor;
  }
  const os2 = tablas.get("OS/2");
  if (os2 !== undefined && os2.offset + 64 <= bytes.length) {
    datos.peso = bytes.readUInt16BE(os2.offset + 4);
    datos.cursiva = (bytes.readUInt16BE(os2.offset + 62) & 0x1) === 1;
  }
  const maxp = tablas.get("maxp");
  if (maxp !== undefined && maxp.offset + 6 <= bytes.length) datos.glifos = bytes.readUInt16BE(maxp.offset + 4);
  if (datos.familia === undefined && datos.peso === undefined) return { motivo: "la fuente no trae nombre ni peso legibles" };
  return datos;
}

/** El texto que recibe quien hizo `read_file` sobre una fuente. */
export function textoDeFuente(ruta: string, d: DatosDeFuente): string {
  const peso = d.peso === undefined ? undefined : `${String(d.peso)}${NOMBRES_DE_PESO[d.peso] === undefined ? "" : ` (${NOMBRES_DE_PESO[d.peso]!})`}`;
  return [
    `${ruta} es una FUENTE (binaria): no se lee como texto. Lo que dice de sí misma:`,
    ...(d.familia === undefined ? [] : [`- familia: ${d.familia}`]),
    ...(d.estilo === undefined ? [] : [`- estilo: ${d.estilo}`]),
    ...(peso === undefined ? [] : [`- peso: ${peso}`]),
    ...(d.cursiva === undefined ? [] : [`- cursiva: ${d.cursiva ? "sí" : "no"}`]),
    ...(d.nombreCompleto === undefined ? [] : [`- nombre completo: ${d.nombreCompleto}`]),
    ...(d.glifos === undefined ? [] : [`- glifos: ${String(d.glifos)}`]),
    "No hace falta abrir el binario para nada más: con esto se sabe qué fichero es cada peso.",
  ].join("\n");
}
