/**
 * El TEXTO de un PDF o de un documento de oficina, para que `read_file` lo devuelva (IXCODE-76).
 *
 * Se saca al LEER y no al guardar el adjunto: así vale igual para un adjunto de tarea, uno del chat y un fichero del
 * proyecto, y no deja ficheros derivados que copiar, listar y borrar a la par. Las reglas de qué se lee y cómo se pasa
 * el XML a texto son puras (`core/textoDeOffice.ts`); aquí solo el zip y el PDF.
 *
 * Las barreras son las de cualquier zip que llega de fuera (`core/zipDeAdjunto.ts`): se infla SOLO lo que hace falta
 * (`entradaNecesaria`) y con un tope de lo que DECLARA cada entrada, decidido antes de inflar. Todo fallo se DEVUELVE
 * como motivo, nunca se lanza: una excepción en una tool se lleva el turno.
 */
import { unzipSync } from "fflate";
import { paginasDePdf, textoDePaginas } from "../../grafo/paginasDePdf.js";
import { TOPE_DESCOMPRIMIDO } from "../../../core/zipDeSkill.js";
import { entradaNecesaria, formatoDeOffice, textoDeDocx, textoDeOdf, textoDePptx, textoDeXlsx } from "../../../core/textoDeOffice.js";

/** El texto, o por qué no lo hay. */
export type TextoDeDocumento = { texto: string } | { motivo: string };

export async function textoDeDocumento(nombre: string, bytes: Uint8Array): Promise<TextoDeDocumento> {
  if (/\.pdf$/i.test(nombre)) return textoDePdf(nombre, bytes);
  const formato = formatoDeOffice(nombre);
  if (formato === undefined) return { motivo: "no es un formato del que se pueda sacar el texto" };
  let ficheros: Record<string, string>;
  try {
    let declarado = 0;
    const inflado = unzipSync(bytes, {
      filter: (f) => {
        if (!entradaNecesaria(formato, f.name)) return false;
        declarado += f.originalSize;
        if (declarado > TOPE_DESCOMPRIMIDO) throw new Error("demasiado grande");
        return true;
      },
    });
    const utf8 = new TextDecoder("utf-8");
    ficheros = Object.fromEntries(Object.entries(inflado).map(([r, b]) => [r, utf8.decode(b)]));
  } catch {
    return { motivo: "no se pudo abrir: ¿está dañado, protegido con contraseña o es demasiado grande?" };
  }
  const texto =
    formato === "docx"
      ? textoDeDocx(ficheros["word/document.xml"] ?? "")
      : formato === "xlsx"
        ? textoDeXlsx(ficheros)
        : formato === "pptx"
          ? textoDePptx(ficheros)
          : textoDeOdf(ficheros["content.xml"] ?? "");
  return texto === "" ? { motivo: "no tiene texto que sacar" } : { texto };
}

/**
 * Un PDF, página a página con su número: «## Página N». Una página ESCANEADA no tiene texto: va el aviso con la llamada
 * a `describe_image` que la lee (`paginasDePdf.ts`). `ruta` es la que pidió el agente, la que va en esa llamada.
 */
async function textoDePdf(ruta: string, bytes: Uint8Array): Promise<TextoDeDocumento> {
  let paginas;
  try {
    paginas = await paginasDePdf(bytes);
  } catch {
    return { motivo: "no se pudo abrir el PDF: ¿está dañado o protegido con contraseña?" };
  }
  if (paginas.every((p) => "enBlanco" in p)) return { motivo: `el PDF (${paginas.length} página${paginas.length === 1 ? "" : "s"}) no tiene ni texto ni imágenes` };
  return { texto: textoDePaginas(ruta, paginas) };
}
