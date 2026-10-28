import { describe, expect, it } from "vitest";
import {
  cadenasCompartidas,
  entradaNecesaria,
  esDocumentoIlegible,
  esDocumentoLegible,
  formatoDeOffice,
  sinEntidades,
  textoDeDocx,
  textoDeOdf,
  textoDeHoja,
  textoDePptx,
  textoDeXlsx,
} from "./textoDeOffice.js";

describe("qué se lee (IXCODE-76)", () => {
  it("PDF y los Office con XML se leen; los binarios viejos y iWork no; un texto no es un documento", () => {
    for (const n of ["a.pdf", "a.DOCX", "a.xlsx", "a.pptx", "a.odt", "a.ods", "a.odp"]) expect(esDocumentoLegible(n)).toBe(true);
    for (const n of ["a.doc", "a.XLS", "a.ppt", "a.pages", "a.numbers", "a.key"]) expect(esDocumentoIlegible(n)).toBe(true);
    for (const n of ["a.md", "a.txt", "a.xml", "a.zip", "a.png"]) {
      expect(esDocumentoLegible(n)).toBe(false);
      expect(esDocumentoIlegible(n)).toBe(false);
    }
  });

  it("de cada formato solo se infla lo que tiene el texto", () => {
    expect(formatoDeOffice("x.ods")).toBe("odf");
    expect(entradaNecesaria("docx", "word/document.xml")).toBe(true);
    expect(entradaNecesaria("docx", "word/media/foto.png")).toBe(false);
    expect(entradaNecesaria("xlsx", "xl/worksheets/sheet3.xml")).toBe(true);
    expect(entradaNecesaria("xlsx", "xl/styles.xml")).toBe(false);
    expect(entradaNecesaria("pptx", "ppt/slides/slide12.xml")).toBe(true);
    expect(entradaNecesaria("pptx", "ppt/slides/_rels/slide1.xml.rels")).toBe(false);
  });

  it("las entidades de XML, también las numéricas", () => {
    expect(sinEntidades("a &amp; b &lt;c&gt; &#233; &#xF1;")).toBe("a & b <c> é ñ");
  });
});

describe("Word", () => {
  it("un párrafo por línea, tabuladores, y una tabla con sus celdas en la misma fila", () => {
    const xml =
      '<w:p><w:r><w:t xml:space="preserve">Hola </w:t></w:r><w:r><w:t>mundo</w:t></w:r></w:p>' +
      "<w:p><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t></w:r></w:p>" +
      "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Nombre</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Edad</w:t></w:r></w:p></w:tc></w:tr>" +
      "<w:tr><w:tc><w:p><w:r><w:t>Ana</w:t></w:r></w:p><w:p><w:r><w:t>López</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>35</w:t></w:r></w:p></w:tc></w:tr></w:tbl>";
    expect(textoDeDocx(xml)).toBe("Hola mundo\nA\tB\nNombre | Edad\nAna López | 35");
  });
});

describe("Excel", () => {
  const libro = {
    "xl/workbook.xml": '<workbook><sheets><sheet name="Resumen" sheetId="2" r:id="rId2"/><sheet name="Datos &amp; más" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
    "xl/sharedStrings.xml": "<sst><si><t>Cliente</t></si><si><r><t>Im</t></r><r><t>porte</t></r></si></sst>",
    "xl/worksheets/sheet1.xml":
      '<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
      '<row r="3"><c r="A3" t="inlineStr"><is><t>Acme</t></is></c><c r="C3"><v>1200.5</v></c><c r="D3" t="b"><v>1</v></c></row></sheetData>',
    "xl/worksheets/sheet2.xml": '<sheetData><row r="1"><c r="A1"/></row></sheetData>',
  };

  it("las cadenas compartidas juntan su texto enriquecido", () => {
    expect(cadenasCompartidas(libro["xl/sharedStrings.xml"])).toEqual(["Cliente", "Importe"]);
  });

  it("una fila vacía CERRADA (`<row/>`) no se come la siguiente: cada fila con SU número", () => {
    const xml = '<sheetData><row r="5" ht="30" customHeight="1"/><row r="6"><c r="A6" t="inlineStr"><is><t>Seis</t></is></c></row></sheetData>';
    expect(textoDeHoja(xml, [])).toBe("6: Seis");
  });

  it("cada hoja con su nombre y en el orden del LIBRO; filas con su número y las celdas vacías en su sitio", () => {
    expect(textoDeXlsx(libro)).toBe("## Hoja «Resumen»\n(vacía)\n\n## Hoja «Datos & más»\n1: Cliente\t\tImporte\n3: Acme\t\t1200.5\tVERDADERO");
  });
});

describe("PowerPoint y OpenDocument", () => {
  it("sin presentation.xml, por el número del fichero (la 10 va después de la 2), numeradas por posición", () => {
    const t = textoDePptx({
      "ppt/slides/slide10.xml": "<a:p><a:r><a:t>Cierre</a:t></a:r></a:p>",
      "ppt/slides/slide2.xml": "<a:p><a:r><a:t>Índice</a:t></a:r></a:p><a:p><a:r><a:t>Punto 1</a:t></a:r></a:p>",
    });
    expect(t).toBe("## Diapositiva 1\nÍndice\nPunto 1\n\n## Diapositiva 2\nCierre");
  });

  it("con presentation.xml, en el orden en que se VEN, aunque los ficheros se crearan en otro", () => {
    const t = textoDePptx({
      "ppt/presentation.xml": '<p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst>',
      "ppt/_rels/presentation.xml.rels": '<Relationship Id="rId2" Target="slides/slide1.xml"/><Relationship Id="rId3" Target="slides/slide2.xml"/>',
      "ppt/slides/slide1.xml": "<a:p><a:r><a:t>Creada primero, va segunda</a:t></a:r></a:p>",
      "ppt/slides/slide2.xml": "<a:p><a:r><a:t>Portada</a:t></a:r></a:p>",
    });
    expect(t).toBe("## Diapositiva 1\nPortada\n\n## Diapositiva 2\nCreada primero, va segunda");
  });

  it("un content.xml: títulos y párrafos por línea, y una hoja con sus celdas", () => {
    const xml =
      "<office:body><text:h>Informe</text:h><text:p>Uno<text:tab/>dos<text:s/>tres</text:p>" +
      '<table:table table:name="Ventas"><table:table-row><table:table-cell><text:p>Mes</text:p></table:table-cell><table:table-cell><text:p>Total</text:p></table:table-cell></table:table-row></table:table></office:body>';
    expect(textoDeOdf(xml)).toBe("Informe\nUno\tdos tres\n\n## Hoja «Ventas»\nMes\tTotal");
  });
});
