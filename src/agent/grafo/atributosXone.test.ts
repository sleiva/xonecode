import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearAtributosXone } from "./atributosXone.js";

/** Contra la referencia REAL de la skill del paquete: si una tabla cambia de forma, esto lo dice. */
describe("xone_atributos, sobre la skill real", () => {
  const t = crearAtributosXone();
  it("dice en qué nodos existe un atributo, con su sección", async () => {
    const r = await t.invoke({ atributo: "imgbk" });
    expect(r).toContain("`imgbk` en <frame>");
    expect(r).toContain("`imgbk` en <prop>");
    expect(r).toContain("§3.4 Apariencia");
    expect(r).not.toContain("<coll>");
  });

  it("donde la skill se CONTRADICE, enseña los dos ficheros y lo avisa, en vez de quedarse con uno", async () => {
    // `imgbk` en <group>: `nodos-group-y-frame.md` lo trae; `atributos-coll-group-frame.md`, no.
    expect(await t.invoke({ atributo: "imgbk", nodo: "group" })).toContain("xml-ui/nodos-group-y-frame.md");
    // `border` en <frame>: máscara en uno, booleano en el otro.
    const r = await t.invoke({ atributo: "border", nodo: "frame" });
    expect(r).toContain("xml-ui/atributos-coll-group-frame.md");
    expect(r).toContain("también en xml-ui/nodos-group-y-frame.md");
    expect(r).toContain("la skill NO coincide en el tipo");
  });

  it("lo que no está en las tablas NO se da por inexistente: manda a la skill con la búsqueda hecha", async () => {
    const r = await t.invoke({ atributo: "background-gradient" });
    expect(r).toContain("Eso NO prueba que no exista");
    expect(r).toContain('grep {"pattern":"background-gradient","path":"/skills/xone-development/references/"}');
  });

  it("cada respuesta se presenta como índice rápido: el detalle y lo que manda es la skill", async () => {
    expect(await t.invoke({ atributo: "bgcolor" })).toContain("Índice de consulta rápida");
    expect(await t.invoke({ nodo: "prop" })).toContain("manda la skill");
  });

  it("con solo el nodo, la lista por sección, y las cuatro tablas se reconocen", async () => {
    const r = await t.invoke({ nodo: "frame" });
    expect(r).toMatch(/§3\.4 Apariencia: .*border-corner-radius/);
    for (const n of ["coll", "group", "prop"]) expect(await t.invoke({ nodo: n })).toContain(`Atributos de <${n}>`);
    // Los nodos hijos de <coll> (<create>, <before-edit>) no son atributos.
    expect(await t.invoke({ atributo: "before-edit" })).toContain("no aparece en las tablas");
  });

  it("sin la referencia no lanza: lo dice", async () => {
    const vacia = crearAtributosXone(mkdtempSync(join(tmpdir(), "xc-sin-skill-")));
    expect(await vacia.invoke({ atributo: "bgcolor" })).toMatch(/^Sin índice de atributos: no se pudo leer la referencia \(ENOENT\)/);
  });
});
