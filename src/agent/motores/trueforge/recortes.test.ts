import { describe, expect, it } from "vitest";
import { OPCIONES_BUSQUEDA_FICHEROS } from "../../grafo/xoneAgent.js";
// Desde xoneAgent A PROPÓSITO: es la constante que usa deepagents, reexportada.
import { CARACTERES_DE_UN_ERROR, CARACTERES_DEL_PASO, recortarPaso, type ResultadoDelPaso, CARACTERES_ANTES_DE_DESALOJAR, CARACTERES_ANTES_DE_TRUNCAR, desalojarSiGrande, MAXIMO_DE_COINCIDENCIAS, truncarSiLargo, vistaPrevia } from "./recortes.js";

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

  it("el PASO tiene presupuesto: varias respuestas que caben solas pero no juntas se desalojan las mayores", async () => {
    const escritos: string[] = [];
    const trozo = (n: number): ResultadoDelPaso => ({ message: { content: "q".repeat(n) } });
    const resultados = [trozo(20_000), trozo(18_000), trozo(5_000)];
    await recortarPaso(resultados, { write: (r: string) => void escritos.push(r) });
    const total = resultados.reduce((s, r) => s + String(r.message.content).length, 0);
    expect(total).toBeLessThanOrEqual(CARACTERES_DEL_PASO);
    // La MAYOR primero, y la pequeña intacta.
    expect(String(resultados[0]!.message.content)).toMatch(/se guardó en \/large_tool_results\//);
    expect(resultados[2]!.message.content).toBe("q".repeat(5_000));
    expect(escritos.length).toBeGreaterThanOrEqual(1);
  });

  it("un error ENORME se trunca a su tope, no se desaloja: ahí no hay nada que releer", async () => {
    let escrituras = 0;
    const resultados: ResultadoDelPaso[] = [{ message: { content: "E".repeat(CARACTERES_ANTES_DE_DESALOJAR + 1) }, failure: true }];
    await recortarPaso(resultados, { write: () => void (escrituras += 1) });
    expect(String(resultados[0]!.message.content).length).toBeLessThan(CARACTERES_DE_UN_ERROR + 100);
    expect(escrituras).toBe(0);
  });

  it("lo que cabe no se toca", async () => {
    const resultados: ResultadoDelPaso[] = [{ message: { content: "corto" } }, { message: { content: "fallo" }, failure: true }];
    await recortarPaso(resultados, { write: () => undefined });
    expect(resultados.map((r) => r.message.content)).toEqual(["corto", "fallo"]);
  });
});
