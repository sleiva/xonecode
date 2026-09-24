import { describe, expect, it } from "vitest";

import {
  POLITICA_SIN_SCRIPTS,
  conPoliticaSinScripts,
  documentoImprimible,
  esMarkdown,
  motivoDeExportacionInaceptable,
  rutaDePdf,
} from "./exportacion.js";

describe("qué se puede exportar", () => {
  it("markdown y html, que es lo que el agente escribe", () => {
    expect(motivoDeExportacionInaceptable("doc/DOCUMENTACION.md")).toBeUndefined();
    expect(motivoDeExportacionInaceptable("doc/informe.html")).toBeUndefined();
    expect(motivoDeExportacionInaceptable("doc/informe.htm")).toBeUndefined();
  });

  it("y nada más: la lista es CERRADA", () => {
    // Imprimir código fuente a PDF no es una necesidad de nadie, y ofrecerlo sería un botón
    // que nadie pulsa sobre cada fichero del árbol.
    expect(motivoDeExportacionInaceptable("Clientes.xne")).toBeDefined();
    expect(motivoDeExportacionInaceptable("funciones.js")).toBeDefined();
    expect(motivoDeExportacionInaceptable("doc/informe")).toBeDefined();
  });

  it("la extensión se mira sin importar mayúsculas", () => {
    expect(motivoDeExportacionInaceptable("doc/LEEME.MD")).toBeUndefined();
    expect(esMarkdown("doc/LEEME.MD")).toBe(true);
    expect(esMarkdown("doc/informe.html")).toBe(false);
  });
});

describe("rutaDePdf: el destino lo DERIVA el código", () => {
  it("al lado del original y con su mismo nombre", () => {
    // Con un destino por parámetro, exportar sería una forma de escribir cualquier fichero
    // del proyecto sin pasar por ninguna aprobación.
    expect(rutaDePdf("doc/DOCUMENTACION.md")).toBe("doc/DOCUMENTACION.pdf");
    expect(rutaDePdf("informe.html")).toBe("informe.pdf");
  });

  it("un punto en una CARPETA no se confunde con la extensión", () => {
    expect(rutaDePdf("doc.v2/informe.md")).toBe("doc.v2/informe.pdf");
  });

  it("un nombre que empieza por punto conserva su nombre", () => {
    // `.leeme` es el nombre entero, no una extensión: cortar ahí dejaría el fichero sin él.
    expect(rutaDePdf(".leeme")).toBe(".leeme.pdf");
  });
});

describe("documentoImprimible", () => {
  it("mete el cuerpo dentro de una hoja de PÁGINA", () => {
    const doc = documentoImprimible("<h1>Hola</h1>", "Informe");
    expect(doc).toContain("<h1>Hola</h1>");
    expect(doc).toContain("@page");
  });

  it("y las reglas que impiden partir una tabla o dejar un título al pie", () => {
    // Comprobado imprimiendo uno de verdad: sin esto una tabla se corta entre dos hojas.
    const doc = documentoImprimible("", "x");
    expect(doc).toMatch(/table\s*\{[^}]*break-inside:\s*avoid/);
    expect(doc).toMatch(/h1, h2, h3, h4\s*\{[^}]*break-after:\s*avoid/);
  });

  it("el título va ESCAPADO: sale de un nombre de fichero del proyecto", () => {
    const doc = documentoImprimible("", '<script>alert(1)</script>');
    expect(doc).toContain("&lt;script&gt;");
    expect(doc).not.toContain("<title><script>");
  });
});

describe("la política que impide que imprimir EJECUTE nada", () => {
  it("nuestra plantilla la lleva puesta", () => {
    // Y es una CSP y no un flag del navegador porque los flags NO lo hacen: medido contra el
    // Chrome instalado, ni `--disable-javascript` ni `--blink-settings=scriptEnabled=false`
    // desactivan el script — y el segundo además deja el PDF sin escribir, en silencio.
    expect(documentoImprimible("", "x")).toContain(POLITICA_SIN_SCRIPTS);
  });

  it("corta también la RED, no solo los scripts", () => {
    // Un documento del proyecto puede llevar un `<img src="https://…">` que se lleve fuera
    // el hecho de que se está imprimiendo.
    expect(POLITICA_SIN_SCRIPTS).toContain("default-src 'none'");
  });

  it("y a un HTML ajeno se le inyecta dentro de su `head`", () => {
    const con = conPoliticaSinScripts("<!doctype html><html><head><title>x</title></head><body>y</body></html>");
    expect(con.indexOf(POLITICA_SIN_SCRIPTS)).toBeLessThan(con.indexOf("<title>"));
  });

  it("sin `head`, dentro del `html`; y sin ninguno de los dos, al principio", () => {
    expect(conPoliticaSinScripts("<html><body>y</body></html>")).toContain(`<html>${POLITICA_SIN_SCRIPTS}`);
    expect(conPoliticaSinScripts("<p>suelto</p>")).toBe(`${POLITICA_SIN_SCRIPTS}<p>suelto</p>`);
  });

  it("inyectarla TENSA y nunca afloja", () => {
    // Con varias políticas el navegador exige que TODAS permitan cada carga, así que añadir
    // la nuestra no puede ampliar lo que el documento ya se permitía. Lo que se fija es que
    // la suya se CONSERVA: quitarla sí podría aflojar.
    const suya = '<meta http-equiv="Content-Security-Policy" content="default-src *">';
    const con = conPoliticaSinScripts(`<html><head>${suya}</head><body></body></html>`);
    expect(con).toContain(suya);
    expect(con).toContain(POLITICA_SIN_SCRIPTS);
  });
});

describe("una imagen en la hoja de impresión", () => {
  it("se limita en ALTO además de en ancho: una captura de móvil no puede pasar de una página", () => {
    // Medido con una de 1080×2400: con solo `max-width` el PDF salía en tres hojas, con el título
    // solo en la primera y la captura partida en las otras dos.
    const hoja = documentoImprimible("<p>x</p>", "t");
    expect(hoja).toMatch(/img \{[^}]*max-width: 100%/);
    expect(hoja).toMatch(/img \{[^}]*max-height: \d+mm/);
  });
});
