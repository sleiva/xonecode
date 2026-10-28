/**
 * El TEXTO de un documento de oficina, sacado de su XML (IXCODE-76: se adjunta cualquier fichero y el agente tiene que
 * poder leerlo).
 *
 * Un `.docx`, un `.xlsx`, un `.pptx` y los OpenDocument (`.odt`, `.ods`, `.odp`) son un ZIP con XML dentro. Aquí está
 * QUÉ ficheros del zip hacen falta y CÓMO se pasa su XML a texto; quién descomprime y quién lee el PDF es
 * `agent/motores/trueforge/textoDeDocumento.ts`. Puro y sin parser de XML: lo que se saca son los nodos de texto y los
 * cierres de párrafo, fila y celda, y para eso bastan expresiones regulares sobre un XML que escribió un programa.
 *
 * **Sale texto, no el documento**: sin formato, sin imágenes y sin fórmulas (de una celda, su último valor calculado).
 * El inventario de adjuntos se lo dice al agente (`core/adjuntos.ts#conAdjuntos`).
 */

/** Lo que se lee: el texto de estos formatos se puede sacar. */
const LEGIBLES = /\.(pdf|docx|xlsx|pptx|odt|ods|odp)$/i;
/** Lo que no: los binarios viejos de Office y los de iWork no son XML, y no hay con qué abrirlos. */
const ILEGIBLES = /\.(doc|xls|ppt|pages|numbers|key)$/i;

/** ¿Se le puede sacar el texto? Por la EXTENSIÓN, como el resto de adjuntos. */
export function esDocumentoLegible(nombre: string): boolean {
  return LEGIBLES.test(nombre);
}

/** ¿Es un documento que `read_file` no abre y del que no hay texto que sacar? */
export function esDocumentoIlegible(nombre: string): boolean {
  return ILEGIBLES.test(nombre);
}

export type FormatoDeOffice = "docx" | "xlsx" | "pptx" | "odf";

export function formatoDeOffice(nombre: string): FormatoDeOffice | undefined {
  const ext = /\.([a-z]+)$/i.exec(nombre)?.[1]?.toLowerCase();
  if (ext === "docx" || ext === "xlsx" || ext === "pptx") return ext;
  if (ext === "odt" || ext === "ods" || ext === "odp") return "odf";
  return undefined;
}

/** ¿Hace falta este fichero del zip para sacar el texto? Lo demás (imágenes, estilos) ni se infla. */
export function entradaNecesaria(formato: FormatoDeOffice, ruta: string): boolean {
  switch (formato) {
    case "docx":
      return ruta === "word/document.xml";
    case "xlsx":
      return ruta === "xl/workbook.xml" || ruta === "xl/_rels/workbook.xml.rels" || ruta === "xl/sharedStrings.xml" || /^xl\/worksheets\/[^/]+\.xml$/.test(ruta);
    case "pptx":
      return ruta === "ppt/presentation.xml" || ruta === "ppt/_rels/presentation.xml.rels" || /^ppt\/slides\/slide\d+\.xml$/.test(ruta);
    case "odf":
      return ruta === "content.xml";
  }
}

/** Las entidades de XML. Una numérica fuera de rango se deja tal cual: no se inventa un carácter. */
export function sinEntidades(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entera, e: string) => {
    const nombradas: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (e[0] !== "#") return nombradas[e.toLowerCase()] ?? entera;
    const codigo = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
    return Number.isFinite(codigo) && codigo >= 0 && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : entera;
  });
}

/** Sin líneas en blanco de más ni espacios al final: lo que sobra se paga en la lectura. */
function limpio(texto: string): string {
  return texto
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/u, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Un `word/document.xml`: un párrafo por línea, `\t` en los tabuladores, y las tablas con sus celdas separadas por
 * « | » (un párrafo dentro de una celda no parte la fila).
 */
export function textoDeDocx(xml: string): string {
  let salida = "";
  let enCelda = 0;
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:(?:br|cr)(?:\s[^>]*)?\/>|<w:tc[\s>]|<\/w:tc>|<\/w:tr>|<\/w:p>/g)) {
    const t = m[0];
    if (m[1] !== undefined) salida += sinEntidades(m[1]);
    else if (t === "<w:tab/>") salida += "\t";
    else if (t.startsWith("<w:br") || t.startsWith("<w:cr")) salida += "\n";
    else if (t.startsWith("<w:tc")) enCelda++;
    else if (t === "</w:tc>") {
      enCelda = Math.max(0, enCelda - 1);
      salida = `${salida.replace(/ $/, "")} | `;
    } else if (t === "</w:tr>") salida = `${salida.replace(/ \| $/, "")}\n`;
    else if (t === "</w:p>") salida += enCelda > 0 ? " " : "\n";
  }
  return limpio(salida);
}

/** Las cadenas compartidas de un libro: cada `<si>`, con todos sus trozos de texto enriquecido juntos. */
export function cadenasCompartidas(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((si) => [...si[1]!.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((t) => sinEntidades(t[1]!)).join(""));
}

/** «B» → 1. La columna de una referencia de celda, desde 0. */
function columna(ref: string): number {
  const letras = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** Una hoja: una línea por fila, «N: a\tb\tc», con las celdas vacías en su sitio y el número de fila de Excel. */
export function textoDeHoja(xml: string, compartidas: readonly string[]): string {
  const lineas: string[] = [];
  // Una fila vacía con formato se escribe CERRADA (`<row r="5" ht="30"/>`): sin esta alternativa, su cuerpo perezoso se
  // comía la fila siguiente y sus celdas salían con el número de la vacía.
  for (const fila of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const numero = /\br="(\d+)"/.exec(fila[1]!)?.[1];
    const celdas: string[] = [];
    for (const c of (fila[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const atributos = c[1]!;
      const cuerpo = c[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(atributos)?.[1];
      const tipo = /\bt="(\w+)"/.exec(atributos)?.[1];
      const v = /<v>([^<]*)<\/v>/.exec(cuerpo)?.[1];
      let valor = "";
      if (tipo === "s" && v !== undefined) valor = compartidas[Number(v)] ?? "";
      else if (tipo === "inlineStr") valor = [...cuerpo.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((t) => sinEntidades(t[1]!)).join("");
      else if (tipo === "b" && v !== undefined) valor = v === "1" ? "VERDADERO" : "FALSO";
      else if (v !== undefined) valor = sinEntidades(v);
      const i = ref === undefined ? celdas.length : columna(ref);
      while (celdas.length < i) celdas.push("");
      celdas[i] = valor;
    }
    while (celdas.length > 0 && celdas[celdas.length - 1] === "") celdas.pop();
    if (celdas.length > 0) lineas.push(`${numero ?? lineas.length + 1}: ${celdas.join("\t")}`);
  }
  return lineas.join("\n");
}

/**
 * El libro entero: cada hoja con su NOMBRE y en el orden del libro. El nombre sale de `workbook.xml` y el fichero de su
 * relación (`workbook.xml.rels`): `sheet1.xml` no tiene por qué ser la primera pestaña.
 */
export function textoDeXlsx(ficheros: Readonly<Record<string, string>>): string {
  const compartidas = cadenasCompartidas(ficheros["xl/sharedStrings.xml"] ?? "");
  const destinos = new Map(
    [...(ficheros["xl/_rels/workbook.xml.rels"] ?? "").matchAll(/<Relationship\b[^>]*>/g)].flatMap((r) => {
      const id = /\bId="([^"]+)"/.exec(r[0])?.[1];
      const target = /\bTarget="([^"]+)"/.exec(r[0])?.[1];
      return id === undefined || target === undefined ? [] : [[id, `xl/${target.replace(/^\/?xl\//, "").replace(/^\//, "")}`] as const];
    })
  );
  const hojas = [...(ficheros["xl/workbook.xml"] ?? "").matchAll(/<sheet\b[^>]*>/g)].flatMap((s) => {
    const nombre = /\bname="([^"]*)"/.exec(s[0])?.[1];
    const id = /\br:id="([^"]+)"/.exec(s[0])?.[1];
    const ruta = id === undefined ? undefined : destinos.get(id);
    return nombre === undefined || ruta === undefined ? [] : [{ nombre: sinEntidades(nombre), ruta }];
  });
  const partes = hojas.map((h) => `## Hoja «${h.nombre}»\n${textoDeHoja(ficheros[h.ruta] ?? "", compartidas) || "(vacía)"}`);
  return limpio(partes.join("\n\n"));
}

/**
 * Las relaciones `Id → ruta` de un `.rels`, con la ruta completa dentro del zip. `Target` es relativa a la carpeta de
 * quien la declara (`base`), o absoluta con «/».
 */
function relaciones(xml: string, base: string): Map<string, string> {
  return new Map(
    [...xml.matchAll(/<Relationship\b[^>]*>/g)].flatMap((r) => {
      const id = /\bId="([^"]+)"/.exec(r[0])?.[1];
      const target = /\bTarget="([^"]+)"/.exec(r[0])?.[1];
      if (id === undefined || target === undefined) return [];
      return [[id, target.startsWith("/") ? target.slice(1) : `${base}${target}`] as const];
    })
  );
}

/**
 * Una presentación: cada diapositiva en el ORDEN en que se ve, un párrafo por línea. El orden sale de
 * `presentation.xml` (`sldIdLst`) y sus relaciones: el número del fichero (`slide7.xml`) es el de creación y deja de
 * coincidir en cuanto alguien reordena. Sin esa lista (un zip incompleto), por el número del fichero.
 */
export function textoDePptx(ficheros: Readonly<Record<string, string>>): string {
  const rels = relaciones(ficheros["ppt/_rels/presentation.xml.rels"] ?? "", "ppt/");
  const enOrden = [...(ficheros["ppt/presentation.xml"] ?? "").matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"[^>]*>/g)]
    .map((m) => rels.get(m[1]!))
    .filter((r): r is string => r !== undefined && ficheros[r] !== undefined);
  const rutas =
    enOrden.length > 0
      ? enOrden
      : Object.keys(ficheros)
          .filter((r) => /^ppt\/slides\/slide\d+\.xml$/.test(r))
          .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
  const partes = rutas.map((ruta, i) => {
    let texto = "";
    for (const m of ficheros[ruta]!.matchAll(/<a:t>([^<]*)<\/a:t>|<a:br\/>|<\/a:p>/g)) {
      if (m[1] !== undefined) texto += sinEntidades(m[1]);
      else texto += "\n";
    }
    return `## Diapositiva ${i + 1}\n${limpio(texto) || "(sin texto)"}`;
  });
  return limpio(partes.join("\n\n"));
}

/** Un `content.xml` de OpenDocument: párrafos y títulos por línea, celdas con «\t», filas por línea, hojas con nombre. */
export function textoDeOdf(xml: string): string {
  let salida = "";
  for (const m of xml.matchAll(
    /<table:table\b[^>]*\btable:name="([^"]*)"[^>]*>|<\/text:(?:p|h)>|<text:tab\/>|<text:line-break\/>|<text:s(?:\s[^>]*)?\/>|<\/table:table-cell>|<\/table:table-row>|<[^>]+>|([^<]+)/g
  )) {
    const t = m[0];
    if (m[2] !== undefined) salida += sinEntidades(m[2]);
    else if (m[1] !== undefined) salida += `\n## Hoja «${sinEntidades(m[1])}»\n`;
    else if (t === "</text:p>" || t === "</text:h>" || t === "<text:line-break/>") salida += "\n";
    else if (t === "<text:tab/>") salida += "\t";
    else if (t.startsWith("<text:s")) salida += " ";
    else if (t === "</table:table-cell>") salida = `${salida.replace(/\n$/, "")}\t`;
    else if (t === "</table:table-row>") salida = `${salida.replace(/\t+$/, "")}\n`;
  }
  return limpio(salida);
}
