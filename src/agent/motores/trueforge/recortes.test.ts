import { describe, expect, it } from "vitest";
import { OPCIONES_BUSQUEDA_FICHEROS } from "../../grafo/xoneAgent.js";
// Desde xoneAgent A PROPÓSITO: es la constante que usa deepagents, reexportada.
import { CARACTERES_ANTES_DE_DESALOJAR, CARACTERES_ANTES_DE_TRUNCAR, desalojarSiGrande, MAXIMO_DE_COINCIDENCIAS, truncarSiLargo, vistaPrevia } from "./recortes.js";

describe("los recortes de deepagents, en TrueForge", () => {
  it("los umbrales son los NUESTROS de deepagents, no una copia", () => {
    expect(CARACTERES_ANTES_DE_DESALOJAR).toBe(OPCIONES_BUSQUEDA_FICHEROS.toolTokenLimitBeforeEvict * 4);
    expect(MAXIMO_DE_COINCIDENCIAS).toBe(OPCIONES_BUSQUEDA_FICHEROS.grepMaxCount);
  });

  it("lo que cabe pasa igual; lo largo se trunca y lo dice", () => {
    expect(truncarSiLargo("corto")).toBe("corto");
    const largo = truncarSiLargo("x".repeat(CARACTERES_ANTES_DE_TRUNCAR + 1));
    expect(largo.length).toBeLessThan(CARACTERES_ANTES_DE_TRUNCAR + 100);
    expect(largo).toMatch(/truncados/);
  });

  it("la vista previa lleva cabeza, cola y cuántas se saltan", () => {
    const texto = Array.from({ length: 30 }, (_, i) => `l${i + 1}`).join("\n");
    const v = vistaPrevia(texto);
    expect(v).toContain("l1");
    expect(v).toContain("l30");
    expect(v).not.toContain("l15");
    expect(v).toMatch(/20 líneas omitidas/);
  });

  it("un resultado grande se GUARDA aparte y al modelo le llega la ruta y el extracto", async () => {
    const escritos: [string, string][] = [];
    const texto = Array.from({ length: 5000 }, (_, i) => `linea ${i} ${"y".repeat(20)}`).join("\n");
    const visto = await desalojarSiGrande(texto, { write: (r: string, c: string) => void escritos.push([r, c]) });
    expect(escritos).toHaveLength(1);
    expect(escritos[0]![0]).toMatch(/^\/large_tool_results\/.+\.txt$/);
    expect(escritos[0]![1]).toBe(texto);
    expect(visto).toContain(escritos[0]![0]);
    expect(visto.length).toBeLessThan(2000);
  });

  it("si no se puede guardar, se DICE y va el extracto — nunca el resultado entero", async () => {
    const texto = "z".repeat(CARACTERES_ANTES_DE_DESALOJAR + 10);
    const visto = await desalojarSiGrande(texto, { write: () => ({ error: "no montado" }) });
    expect(visto).toMatch(/no se pudo guardar aparte \(no montado\)/);
    expect(visto.length).toBeLessThan(CARACTERES_ANTES_DE_DESALOJAR);
  });

  it("lo pequeño no toca el disco", async () => {
    let escrituras = 0;
    expect(await desalojarSiGrande("hola", { write: () => void (escrituras += 1) })).toBe("hola");
    expect(escrituras).toBe(0);
  });
});
