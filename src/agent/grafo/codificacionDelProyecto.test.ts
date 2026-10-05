/**
 * El agente lee y escribe un texto del proyecto en la codificación que YA tenía, y esto se mira
 * contra el backend de PRODUCCIÓN (`backendDeAgente`, con el validador de verdad), no contra el
 * envoltorio suelto: compuesto en otro sitio quedaría escrito y no probado.
 *
 * La medida que lo justifica, ANTES del arreglo, sobre esta misma composición: un `.xne` en
 * windows-1252 con «Tamaño», «acción» y «€» se LEÍA con «�» en cada uno, y un `edit` que solo
 * cambiaba una línea SIN tildes reescribía el fichero entero en UTF-8 con U+FFFD en lugar de
 * cada letra —la ñ, la ó y el € perdidos para siempre— contestando que bien.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backendDeAgente } from "./proyecto.js";

interface Backend {
  read(ruta: string, offset?: number, limit?: number): Promise<Record<string, unknown>>;
  write(ruta: string, contenido: string): Promise<Record<string, unknown>>;
  edit(ruta: string, viejo: string, nuevo: string, todas?: boolean): Promise<Record<string, unknown>>;
}

const TEXTO =
  '<?xml version="1.0" encoding="iso-8859-15"?>\r\n<coll name="Tamaño" title="acción €">\r\n<prop name="uno"/>\r\n</coll>\r\n';

/** Lo que dejaría XOne Studio: un byte por carácter, windows-1252. */
function enLatin1(texto: string): Buffer {
  return Buffer.from([...texto].map((c) => (c === "€" ? 0x80 : c.charCodeAt(0))));
}

const RAMAS = [
  ["sin shell", undefined],
  ["con EJECUCIÓN (LocalShellBackend)", { entorno: {} }],
] as const;

describe.each(RAMAS)("backendDeAgente %s: un .xne Latin-1 se conserva en Latin-1", (_nombre, ejecucion) => {
  function proyecto() {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-latin1-"));
    writeFileSync(join(raiz, "Datos.xne"), enLatin1(TEXTO));
    const backend = backendDeAgente({
      raiz,
      ficheros: new Set(["/Datos.xne"]),
      ...(ejecucion === undefined ? {} : { ejecucion }),
    }) as unknown as Backend;
    return { raiz, backend, disco: () => readFileSync(join(raiz, "Datos.xne")) };
  }

  it("leer da las tildes y el € bien, nunca «�»", async () => {
    const { backend } = proyecto();
    const r = await backend.read("/Datos.xne");
    expect(r["content"]).toBe(TEXTO);
  });

  it("editar una línea sin tildes deja el resto de bytes IDÉNTICO", async () => {
    const { backend, disco } = proyecto();
    const r = await backend.edit("/Datos.xne", '<prop name="uno"/>', '<prop name="dos"/>');
    expect(r["error"]).toBeUndefined();
    expect(disco().equals(enLatin1(TEXTO.replace("uno", "dos")))).toBe(true);
  });

  it("y lo nuevo va en windows-1252, buscando el ancla sobre el texto bien decodificado", async () => {
    const { backend, disco } = proyecto();
    const r = await backend.edit("/Datos.xne", 'title="acción €"', 'title="opción ñ €"');
    expect(r["error"]).toBeUndefined();
    expect(disco().equals(enLatin1(TEXTO.replace("acción €", "opción ñ €")))).toBe(true);
  });

  it("un carácter que no cabe se DEVUELVE como error, con cuál y su línea, y el disco no se toca", async () => {
    const { backend, disco } = proyecto();
    const r = await backend.edit("/Datos.xne", '<prop name="uno"/>', '<prop name="😀"/>');
    expect(r["error"]).toEqual(expect.stringContaining("😀"));
    expect(r["error"]).toEqual(expect.stringContaining("línea 3"));
    expect(disco().equals(enLatin1(TEXTO))).toBe(true);
  });

  it("reescribirlo entero también sale en windows-1252, y el no representable igual se rechaza", async () => {
    const { backend, disco } = proyecto();
    const nuevo = TEXTO.replace("Tamaño", "Año");
    expect((await backend.write("/Datos.xne", nuevo))["error"]).toBeUndefined();
    expect(disco().equals(enLatin1(nuevo))).toBe(true);
    const r = await backend.write("/Datos.xne", "Ω");
    expect(r["error"]).toEqual(expect.stringContaining("Ω"));
    expect(disco().equals(enLatin1(nuevo))).toBe(true);
  });

  it("la paginación de `read` es la misma que la de la librería sobre el mismo texto en UTF-8", async () => {
    const { raiz } = proyecto();
    const largo = Array.from({ length: 12 }, (_, i) => `<linea n="${i}" t="ñandú €"/>`).join("\n") + "\n";
    writeFileSync(join(raiz, "Latin.xne"), enLatin1(largo));
    writeFileSync(join(raiz, "Utf.xne"), largo, "utf8");
    writeFileSync(join(raiz, "latin.js"), enLatin1(largo));
    writeFileSync(join(raiz, "utf.js"), largo, "utf8");
    const conCodificacion = backendDeAgente({
      raiz,
      ficheros: new Set(["/Latin.xne", "/Utf.xne", "/latin.js", "/utf.js"]),
      ...(ejecucion === undefined ? {} : { ejecucion }),
    }) as unknown as Backend;
    for (const [offset, limit] of [[0, 500], [0, 3], [4, 4], [10, 5], [11, 1], [12, 1], [0, 0]] as const) {
      expect(await conCodificacion.read("/Latin.xne", offset, limit)).toEqual(
        await conCodificacion.read("/Utf.xne", offset, limit)
      );
      // Y el `mimeType` es el que la librería da por extensión, no uno fijo.
      expect(await conCodificacion.read("/latin.js", offset, limit)).toEqual(
        await conCodificacion.read("/utf.js", offset, limit)
      );
    }
  });
});

describe("backendDeAgente: lo que no es Latin-1 sigue exactamente como antes", () => {
  function proyecto() {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-utf8-"));
    const backend = backendDeAgente({ raiz, ficheros: new Set() }) as unknown as Backend;
    return { raiz, backend };
  }

  it("un .xne UTF-8 se edita en UTF-8 (con su BOM)", async () => {
    const { raiz, backend } = proyecto();
    writeFileSync(join(raiz, "Utf.xne"), "﻿<coll name=\"Tamaño\"/>\n", "utf8");
    await backend.edit("/Utf.xne", "Tamaño", "Año €");
    expect(readFileSync(join(raiz, "Utf.xne"), "utf8")).toBe("﻿<coll name=\"Año €\"/>\n");
  });

  it("un fichero NUEVO se escribe en UTF-8", async () => {
    const { raiz, backend } = proyecto();
    await backend.write("/Nuevo.xne", "<coll name=\"Año €\"/>\n");
    expect(readFileSync(join(raiz, "Nuevo.xne"), "utf8")).toBe("<coll name=\"Año €\"/>\n");
  });

  it("una imagen sigue siendo binaria: sobrescribir un PNG decodifica el base64, no lo codifica a windows-1252", async () => {
    const { raiz, backend } = proyecto();
    // Bytes que no son UTF-8 y sin NUL: lo que un olfateo ingenuo tomaría por Latin-1.
    writeFileSync(join(raiz, "icono.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe]));
    const nuevo = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xaa, 0xbb]);
    await backend.write("/icono.png", nuevo.toString("base64"));
    expect(readFileSync(join(raiz, "icono.png")).equals(nuevo)).toBe(true);
  });
});

describe("motivoDeNoRepresentable", () => {
  it("en un XML ofrece la entidad; en JavaScript, el escape ES5 por unidades UTF-16", async () => {
    const { motivoDeNoRepresentable } = await import("./codificacionDelProyecto.js");
    expect(motivoDeNoRepresentable("/Datos.xne", "Ω", 2)).toContain("&#937;");
    expect(motivoDeNoRepresentable("/script.js", "😀", 1)).toContain("\\uD83D\\uDE00");
  });
});
