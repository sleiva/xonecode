/** Una fuente TrueType mínima: cabecera, tabla `name` (familia/estilo tipográficos en UTF-16 BE) y `OS/2` con su peso. */
export function fuente(familia: string, estilo: string, peso: number, cursiva = false): Buffer {
  const utf16 = (t: string): Buffer => {
    const b = Buffer.alloc(t.length * 2);
    for (let i = 0; i < t.length; i++) b.writeUInt16BE(t.charCodeAt(i), i * 2);
    return b;
  };
  const cadenas = [utf16(familia), utf16(estilo)];
  const name = Buffer.alloc(6 + 2 * 12);
  name.writeUInt16BE(0, 0);
  name.writeUInt16BE(2, 2);
  name.writeUInt16BE(6 + 2 * 12, 4);
  let desde = 0;
  [16, 17].forEach((id, i) => {
    const r = 6 + i * 12;
    name.writeUInt16BE(3, r); // Windows
    name.writeUInt16BE(1, r + 2);
    name.writeUInt16BE(0x409, r + 4); // inglés
    name.writeUInt16BE(id, r + 6);
    name.writeUInt16BE(cadenas[i]!.length, r + 8);
    name.writeUInt16BE(desde, r + 10);
    desde += cadenas[i]!.length;
  });
  const nameEntera = Buffer.concat([name, ...cadenas]);
  const os2 = Buffer.alloc(64);
  os2.writeUInt16BE(peso, 4);
  os2.writeUInt16BE(cursiva ? 1 : 0, 62);
  const cabecera = Buffer.alloc(12 + 2 * 16);
  cabecera.writeUInt32BE(0x00010000, 0);
  cabecera.writeUInt16BE(2, 4);
  const inicioName = cabecera.length;
  const inicioOs2 = inicioName + nameEntera.length;
  [["name", inicioName, nameEntera.length], ["OS/2", inicioOs2, os2.length]].forEach(([tag, off, largo], i) => {
    const p = 12 + i * 16;
    cabecera.write(tag as string, p, "latin1");
    cabecera.writeUInt32BE(off as number, p + 8);
    cabecera.writeUInt32BE(largo as number, p + 12);
  });
  return Buffer.concat([cabecera, nameEntera, os2]);
}

