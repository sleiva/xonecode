/**
 * Un PDF página a página: el TEXTO de las que lo tienen y, de las ESCANEADAS, la imagen para que la lea un modelo con
 * visión (IXCODE-76).
 *
 * Una página escaneada es una IMAGEN: no tiene texto que sacar. Se reconoce página a página —sin texto y con al menos
 * una imagen—, así que un PDF mixto (un pliego con anexos escaneados) sale con su texto y con un aviso en cada página
 * escaneada. **No se transcribe al leer**: cada página es una llamada al modelo con visión, y un escaneado de ochenta
 * páginas transcrito en cada `read_file` sería caro y lento cuando casi siempre hacen falta dos o tres. El aviso trae la
 * llamada a `describe_image` ya escrita, con su `pagina`, como `read_file` hace con un PNG.
 *
 * Sin dependencias nativas: las imágenes salen de `unpdf` (PDF.js) como píxeles y se codifican a PNG con `pngjs`.
 */
import { PNG } from "pngjs";
import { extractImages, extractText, getDocumentProxy } from "unpdf";

/** El nombre de la tool que mira imágenes. Repetido y no importado: `describirImagen.ts` importa este módulo. */
const DESCRIBIR = "describe_image";

/** Una página del PDF, ya leída. */
export type PaginaDePdf = { numero: number; texto: string } | { numero: number; escaneada: true } | { numero: number; enBlanco: true };

/** Una COPIA: PDF.js se queda el búfer (lo transfiere) y el del backend no es nuestro. */
const abrir = (bytes: Uint8Array) => getDocumentProxy(new Uint8Array(bytes));

/** Las páginas, con su texto o lo que son. Lanza si el PDF no se abre: quien llama lo devuelve como motivo. */
export async function paginasDePdf(bytes: Uint8Array): Promise<PaginaDePdf[]> {
  const pdf = await abrir(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  const paginas: PaginaDePdf[] = [];
  for (const [i, t] of text.entries()) {
    const numero = i + 1;
    if (t.trim() !== "") {
      paginas.push({ numero, texto: t.trim() });
      continue;
    }
    // Solo se miran las imágenes de las páginas SIN texto: sacarlas cuesta, y una con texto ya se lee.
    let imagenes = 0;
    try {
      imagenes = (await extractImages(pdf, numero)).length;
    } catch {
      imagenes = 0;
    }
    paginas.push(imagenes > 0 ? { numero, escaneada: true } : { numero, enBlanco: true });
  }
  return paginas;
}

/** El aviso de una página escaneada, con la llamada para leerla ya escrita. */
export function avisoDePaginaEscaneada(ruta: string, numero: number): string {
  return `[Página ${numero}: es una imagen escaneada, sin texto. Para leerla: ${DESCRIBIR}({"ruta": ${JSON.stringify(ruta)}, "pagina": ${numero}})]`;
}

/** El texto de un PDF para `read_file`: «## Página N» y su texto, o el aviso si es escaneada. */
export function textoDePaginas(ruta: string, paginas: readonly PaginaDePdf[]): string {
  return paginas
    .map((p) => `## Página ${p.numero}\n${"texto" in p ? p.texto : "escaneada" in p ? avisoDePaginaEscaneada(ruta, p.numero) : "(en blanco)"}`)
    .join("\n\n");
}

/**
 * Lado mayor de la imagen que se manda. Un escaneado a 300 ppp mide 2480×3508: los proveedores la reducen igual (el de
 * Anthropic, a unos 1568) y mandarla entera es pagar bytes para nada. Con 1600 un A4 queda a unos 137 ppp, que se lee.
 */
export const LADO_MAXIMO_DE_PAGINA = 1600;

/**
 * La imagen de una página escaneada, en PNG y reducida a `LADO_MAXIMO_DE_PAGINA`. Si la página trae varias imágenes
 * (tiras de un escáner), la MAYOR, que es la página. Devuelve el motivo si no hay página o no tiene imagen; nunca lanza.
 */
export async function imagenDePagina(bytes: Uint8Array, numero: number): Promise<{ png: Buffer } | { motivo: string }> {
  try {
    const pdf = await abrir(bytes);
    if (!Number.isInteger(numero) || numero < 1 || numero > pdf.numPages) {
      return { motivo: `el PDF tiene ${pdf.numPages} página${pdf.numPages === 1 ? "" : "s"}: la ${numero} no existe` };
    }
    const imagenes = await extractImages(pdf, numero);
    const mayor = imagenes.reduce<(typeof imagenes)[number] | undefined>((m, i) => (m === undefined || i.width * i.height > m.width * m.height ? i : m), undefined);
    if (mayor === undefined) return { motivo: `la página ${numero} no tiene ninguna imagen` };
    return { png: aPng(mayor.data, mayor.width, mayor.height, mayor.channels) };
  } catch {
    return { motivo: "no se pudo abrir el PDF: ¿está dañado o protegido con contraseña?" };
  }
}

/**
 * Píxeles de 1, 3 o 4 canales a un PNG, reducido por PROMEDIO de cada bloque (no saltando píxeles: en un texto
 * escaneado saltar se come los trazos finos). En gris si la imagen lo es: pesa un tercio y para leer basta.
 */
export function aPng(datos: Uint8ClampedArray, ancho: number, alto: number, canales: 1 | 3 | 4): Buffer {
  const escala = Math.min(1, LADO_MAXIMO_DE_PAGINA / Math.max(ancho, alto));
  const w = Math.max(1, Math.round(ancho * escala));
  const h = Math.max(1, Math.round(alto * escala));
  const gris = canales === 1 || esGris(datos, canales);
  const png = new PNG({ width: w, height: h, colorType: gris ? 0 : 2, inputColorType: 6, inputHasAlpha: true });
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * alto) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * alto) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * ancho) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * ancho) / w));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * ancho + xx) * canales;
          if (canales === 1) {
            r += datos[i]!;
            g += datos[i]!;
            b += datos[i]!;
          } else {
            r += datos[i]!;
            g += datos[i + 1]!;
            b += datos[i + 2]!;
          }
          n++;
        }
      }
      const o = (y * w + x) * 4;
      png.data[o] = Math.round(r / n);
      png.data[o + 1] = Math.round(g / n);
      png.data[o + 2] = Math.round(b / n);
      png.data[o + 3] = 255;
    }
  }
  return PNG.sync.write(png, { colorType: gris ? 0 : 2, inputColorType: 6, inputHasAlpha: true });
}

/** ¿Es gris aunque venga en color? PDF.js entrega en RGB una imagen `DeviceGray` (medido): los tres canales iguales. */
function esGris(datos: Uint8ClampedArray, canales: 3 | 4): boolean {
  for (let i = 0; i < datos.length; i += canales) if (datos[i] !== datos[i + 1] || datos[i] !== datos[i + 2]) return false;
  return true;
}
