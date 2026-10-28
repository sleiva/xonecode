/**
 * Un PDF de VERDAD, escrito a mano, para los tests que leen PDF (IXCODE-76). Una página por elemento:
 * - un texto: la página con ese texto en Helvetica;
 * - `""`: una página en blanco;
 * - `{ escaneada: [ancho, alto] }`: una página que es solo una IMAGEN en gris de ese tamaño, como la de un escáner.
 * Con la tabla `xref` bien contada, que es lo que PDF.js comprueba. Fuera de la build (`tsconfig.build.json`).
 */
export type PaginaDePrueba = string | { escaneada: [number, number] };

export function pdf(paginas: readonly PaginaDePrueba[]): Uint8Array {
  // Cada objeto, en BYTES: el flujo de una imagen es binario y los desplazamientos de la `xref` son en bytes.
  const objetos: Buffer[] = [];
  const texto = (t: string): Buffer => Buffer.from(t, "latin1");
  const flujo = (diccionario: string, cuerpo: Buffer): Buffer =>
    Buffer.concat([texto(`<< ${diccionario} /Length ${cuerpo.length} >>\nstream\n`), cuerpo, texto("\nendstream")]);
  objetos.push(texto("<< /Type /Catalog /Pages 2 0 R >>"));
  objetos.push(texto("")); // las páginas: se rellena al final, cuando se saben sus números
  objetos.push(texto("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"));
  const kids: number[] = [];
  for (const p of paginas) {
    const pagina = objetos.length + 1;
    kids.push(pagina);
    if (typeof p === "string") {
      objetos.push(texto(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pagina + 1} 0 R >>`));
      objetos.push(flujo("", texto(p === "" ? "" : `BT /F1 12 Tf 72 720 Td (${p}) Tj ET`)));
    } else {
      const [ancho, alto] = p.escaneada;
      objetos.push(
        texto(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 ${pagina + 2} 0 R >> >> /Contents ${pagina + 1} 0 R >>`)
      );
      objetos.push(flujo("", texto("q 612 0 0 792 0 0 cm /Im1 Do Q")));
      // Un degradado en gris: píxeles distintos, para que la reducción tenga algo que promediar.
      const pixeles = Buffer.alloc(ancho * alto);
      for (let i = 0; i < pixeles.length; i++) pixeles[i] = (i * 7) % 256;
      objetos.push(flujo(`/Type /XObject /Subtype /Image /Width ${ancho} /Height ${alto} /ColorSpace /DeviceGray /BitsPerComponent 8`, pixeles));
    }
  }
  objetos[1] = texto(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${paginas.length} >>`);
  const partes: Buffer[] = [texto("%PDF-1.4\n")];
  let largo = partes[0]!.length;
  const desplazamientos: number[] = [];
  objetos.forEach((o, i) => {
    desplazamientos.push(largo);
    const trozo = Buffer.concat([texto(`${i + 1} 0 obj\n`), o, texto("\nendobj\n")]);
    partes.push(trozo);
    largo += trozo.length;
  });
  let cola = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const d of desplazamientos) cola += `${String(d).padStart(10, "0")} 00000 n \n`;
  cola += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${largo}\n%%EOF\n`;
  partes.push(texto(cola));
  return new Uint8Array(Buffer.concat(partes));
}
