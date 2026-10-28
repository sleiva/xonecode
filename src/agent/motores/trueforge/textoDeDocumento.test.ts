import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { backendDeAgente } from "../../grafo/proyecto.js";
import { permisosDe } from "../../grafo/perfiles.js";
import { textoDeDocumento } from "./textoDeDocumento.js";
import { pdf } from "../../../core/__pruebas__/pdf.js";
import { fuenteDeFicheros, type BackendDeFicheros } from "./toolsDeFichero.js";

const docx = (cuerpo: string): Uint8Array =>
  zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8(`<w:document><w:body>${cuerpo}</w:body></w:document>`),
    "word/media/foto.png": new Uint8Array(10),
  });

describe("textoDeDocumento (IXCODE-76)", () => {
  it("un PDF sale página a página, con su número", async () => {
    const r = await textoDeDocumento("pliego.pdf", pdf(["Pliego de condiciones", "Precio total 1200"]));
    expect(r).toEqual({ texto: expect.stringContaining("## Página 1\nPliego de condiciones") });
    expect("texto" in r && r.texto).toContain("## Página 2\nPrecio total 1200");
  });

  it("un PDF sin texto ni imágenes lo DICE, no devuelve vacío", async () => {
    const r = await textoDeDocumento("vacio.pdf", pdf(["", ""]));
    expect(r).toEqual({ motivo: "el PDF (2 páginas) no tiene ni texto ni imágenes" });
  });

  it("un PDF MIXTO: el texto de las páginas que lo tienen, y en la escaneada el aviso con la llamada para leerla", async () => {
    const r = await textoDeDocumento("/adjuntos/pliego.pdf", pdf(["Condiciones", { escaneada: [40, 60] }, ""]));
    expect(r).toEqual({
      texto:
        "## Página 1\nCondiciones\n\n" +
        '## Página 2\n[Página 2: es una imagen escaneada, sin texto. Para leerla: describe_image({"ruta": "/adjuntos/pliego.pdf", "pagina": 2})]\n\n' +
        "## Página 3\n(en blanco)",
    });
  });

  it("un PDF roto da un motivo, no lanza", async () => {
    expect(await textoDeDocumento("roto.pdf", strToU8("%PDF-1.4 basura"))).toEqual({ motivo: expect.stringContaining("no se pudo abrir el PDF") });
  });

  it("un .docx de verdad (zip) sale con sus párrafos", async () => {
    const r = await textoDeDocumento("acta.docx", docx("<w:p><w:r><w:t>Reunión del lunes</w:t></w:r></w:p><w:p><w:r><w:t>Asisten: Ana</w:t></w:r></w:p>"));
    expect(r).toEqual({ texto: "Reunión del lunes\nAsisten: Ana" });
  });

  it("un .docx que no es un zip da un motivo", async () => {
    expect(await textoDeDocumento("falso.docx", strToU8("no soy un zip"))).toEqual({ motivo: expect.stringContaining("no se pudo abrir") });
  });

  it("un .docx sin texto lo dice", async () => {
    expect(await textoDeDocumento("vacio.docx", docx(""))).toEqual({ motivo: "no tiene texto que sacar" });
  });
});

/** `read_file` de TrueForge contra el backend REAL, como en `toolsDeFichero.test.ts`. */
function proyecto() {
  const raiz = mkdtempSync(join(tmpdir(), "xc-tf-docs-"));
  mkdirSync(join(raiz, "doc"));
  const adjuntos = mkdtempSync(join(tmpdir(), "xc-tf-adj-"));
  const backend = backendDeAgente({ raiz, ficheros: new Set(), adjuntos, validar: async () => undefined }) as unknown as BackendDeFicheros;
  const fuente = fuenteDeFicheros({ backend, reglas: permisosDe({ nombre: "raiz", soloLectura: false }) });
  const leer = async (args: Record<string, unknown>) => {
    const r = (await fuente.callTool({ name: "read_file", arguments: args })) as unknown as { result: { content: { text: string }[]; isError?: boolean } };
    return { texto: r.result.content.map((c) => c.text).join(""), error: r.result.isError === true };
  };
  return { raiz, adjuntos, leer };
}

describe("read_file sobre documentos y textos (IXCODE-76)", () => {
  it("un PDF devuelve su TEXTO numerado, no «fichero binario»", async () => {
    const { raiz, leer } = proyecto();
    writeFileSync(join(raiz, "doc", "pliego.pdf"), pdf(["Pliego de condiciones"]));
    const r = await leer({ file_path: "/doc/pliego.pdf" });
    expect(r.error).toBe(false);
    expect(r.texto).toBe("     1\t## Página 1\n     2\tPliego de condiciones");
  });

  it("y se PAGINA: offset/limit cortan el texto sacado y dice por dónde seguir", async () => {
    const { raiz, leer } = proyecto();
    writeFileSync(join(raiz, "doc", "tres.pdf"), pdf(["uno", "dos", "tres"]));
    const r = await leer({ file_path: "/doc/tres.pdf", offset: 3, limit: 2 });
    expect(r.texto).toBe("     4\t## Página 2\n     5\tdos\n... [8 líneas en total: sigue con offset=5]");
    expect(r.texto).toContain("[8 líneas en total: sigue con offset=5]");
    expect(r.texto).not.toContain("uno");
  });

  it("un .docx devuelve sus párrafos", async () => {
    const { raiz, leer } = proyecto();
    writeFileSync(join(raiz, "doc", "acta.docx"), docx("<w:p><w:r><w:t>Orden del día</w:t></w:r></w:p>"));
    expect((await leer({ file_path: "/doc/acta.docx" })).texto).toBe("     1\tOrden del día");
  });

  it("un .doc antiguo dice que no se puede y qué pedir, sin «fichero binario» a secas", async () => {
    const { raiz, leer } = proyecto();
    writeFileSync(join(raiz, "doc", "viejo.doc"), Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]));
    const r = await leer({ file_path: "/doc/viejo.doc" });
    expect(r.error).toBe(true);
    expect(r.texto).toMatch(/no describas lo que dice; pide que lo pasen a PDF/);
  });

  it("un PDF ADJUNTO (`/adjuntos/`) se lee igual", async () => {
    const { adjuntos, leer } = proyecto();
    writeFileSync(join(adjuntos, "pliego.pdf"), pdf(["Adjunto de Rafa"]));
    const r = await leer({ file_path: "/adjuntos/pliego.pdf" });
    expect(r.error).toBe(false);
    expect(r.texto).toContain("Adjunto de Rafa");
  });

  it("un .docx que es un ENLACE a fuera del proyecto no se lee: los bytes solo se piden tras un `read` que pasó las guardas", async () => {
    const { raiz, leer } = proyecto();
    const fuera = mkdtempSync(join(tmpdir(), "xc-tf-fuera-"));
    writeFileSync(join(fuera, "secreto.docx"), docx("<w:p><w:r><w:t>SECRETO</w:t></w:r></w:p>"));
    symlinkSync(join(fuera, "secreto.docx"), join(raiz, "doc", "enlace.docx"));
    const r = await leer({ file_path: "/doc/enlace.docx" });
    expect(r.error).toBe(true);
    expect(r.texto).not.toContain("SECRETO");
  });

  it("con el backend COMPUESTO como en producción (`sesionTrueforge.ts#montarBackend`): artefactos, adjuntos, aUtf8 y shell", async () => {
    // El patrón de fallo de siempre: si alguna capa de la composición real no deja pasar `downloadFiles`, un .docx
    // fallaría en producción con todos los tests en verde (el PDF no, que sale de `read`).
    for (const ejecucion of [undefined, { entorno: {} }]) {
      const raiz = mkdtempSync(join(tmpdir(), "xc-tf-prod-"));
      const adjuntos = mkdtempSync(join(tmpdir(), "xc-tf-prod-adj-"));
      const artefactos = mkdtempSync(join(tmpdir(), "xc-tf-prod-art-"));
      writeFileSync(join(raiz, "Clientes.xne"), "<coll/>\n");
      writeFileSync(join(raiz, "Clientes.xml"), "<vista/>\n");
      writeFileSync(join(adjuntos, "acta.docx"), docx("<w:p><w:r><w:t>Desde adjuntos</w:t></w:r></w:p>"));
      writeFileSync(join(adjuntos, "Clientes.xml"), "<adjunto/>\n");
      writeFileSync(join(raiz, "informe.xlsx"), zipSync({
        "xl/workbook.xml": strToU8('<sheets><sheet name="H" r:id="r1"/></sheets>'),
        "xl/_rels/workbook.xml.rels": strToU8('<Relationship Id="r1" Target="worksheets/sheet1.xml"/>'),
        "xl/worksheets/sheet1.xml": strToU8('<row r="1"><c r="A1" t="inlineStr"><is><t>Desde el proyecto</t></is></c></row>'),
      }));
      const backend = backendDeAgente({
        raiz,
        ficheros: new Set(["/Clientes.xne", "/Clientes.xml"]),
        artefactos: { carpeta: artefactos, alEscribir: () => undefined },
        adjuntos,
        ...(ejecucion === undefined ? {} : { ejecucion }),
        aUtf8: true,
      }) as unknown as BackendDeFicheros;
      const fuente = fuenteDeFicheros({ backend, reglas: permisosDe({ nombre: "raiz", soloLectura: false }) });
      const leer = async (file_path: string) =>
        ((await fuente.callTool({ name: "read_file", arguments: { file_path } })) as unknown as { result: { content: { text: string }[] } }).result.content
          .map((c) => c.text)
          .join("");
      expect(await leer("/adjuntos/acta.docx")).toBe("     1\tDesde adjuntos");
      expect(await leer("/informe.xlsx")).toContain("1: Desde el proyecto");
      // Un .xml ADJUNTO con el nombre de una vista aplanada del proyecto se lee: la guarda va por ruta, no por nombre.
      expect(await leer("/adjuntos/Clientes.xml")).toBe("     1\t<adjunto/>");
    }
  });

  it("los ficheros de TEXTO se leen tal cual: .md, .txt, .xml", async () => {
    const { raiz, leer } = proyecto();
    writeFileSync(join(raiz, "doc", "notas.md"), "# Notas\nuna\n");
    writeFileSync(join(raiz, "doc", "datos.txt"), "linea de datos\n");
    writeFileSync(join(raiz, "doc", "config.xml"), "<config valor=\"1\"/>\n");
    expect((await leer({ file_path: "/doc/notas.md" })).texto).toBe("     1\t# Notas\n     2\tuna");
    expect((await leer({ file_path: "/doc/datos.txt" })).texto).toBe("     1\tlinea de datos");
    expect((await leer({ file_path: "/doc/config.xml" })).texto).toBe('     1\t<config valor="1"/>');
  });
});
