import { describe, expect, it } from "vitest";
import { DEL_XML, LIMITES_ESTILOS, pintarEstiloDeProp, type EstiloDeProp } from "./estilos.js";

const base = (extra: Partial<EstiloDeProp> = {}): EstiloDeProp => ({
  coll: "MenuPrincipal",
  prop: "btnSaludo",
  tipo: "B",
  clase: "btnPrimario",
  selectores: ["prop.btnPrimario:B", "prop.btnPrimario", ".btnPrimario"],
  deLaHoja: [{ atributo: "fontsize", valor: "14", de: "prop.btnPrimario" }],
  delXml: [],
  declaradoEn: [{ selector: "prop.btnPrimario", fichero: "default.css" }],
  ...extra,
});

describe("pintarEstiloDeProp", () => {
  it("contesta las cuatro preguntas que los greps hacían a mano", () => {
    const r = pintarEstiloDeProp(base());
    expect(r).toContain("fontsize");        // qué se aplica
    expect(r).toContain("prop.btnPrimario"); // de qué selector
    expect(r).toContain(".btnPrimario");     // qué selectores compiten
    expect(r).toContain("default.css");      // en qué fichero
  });

  it("lo del XML va PRIMERO, porque es lo que gana", () => {
    const r = pintarEstiloDeProp(base({ delXml: [{ atributo: "width", valor: "90%", de: DEL_XML }] }));
    expect(r.indexOf("width")).toBeLessThan(r.indexOf("fontsize"));
  });

  it("sin nada que aplicar lo DICE, en vez de enseñar una sección vacía", () => {
    // Una lista vacía se lee como «no lo he mirado»; la frase dice que sí se miró.
    const r = pintarEstiloDeProp(base({ deLaHoja: [], delXml: [], declaradoEn: [] }));
    expect(r).toMatch(/nada: ni la hoja ni el XML/i);
  });

  it("sin selectores explica POR QUÉ, que no es lo mismo que un fallo", () => {
    const r = pintarEstiloDeProp(base({ selectores: [], deLaHoja: [], delXml: [], declaradoEn: [] }));
    expect(r).toMatch(/no tiene clase/i);
  });

  it("lo que no cabe se CUENTA", () => {
    // Una lista recortada en silencio se lee como la lista entera, y sobre eso se concluye de
    // más: «ese atributo no lo pone nadie» cuando sí lo ponía.
    const muchos = Array.from({ length: LIMITES_ESTILOS.atributos + 4 }, (_, i) => ({
      atributo: `a${i}`,
      valor: "1",
      de: ".x",
    }));
    const r = pintarEstiloDeProp(base({ deLaHoja: muchos }));
    expect(r).toContain("y 4 más");
  });

  it("la cabecera lleva el tipo y la clase, que son lo que decide la cascada", () => {
    const r = pintarEstiloDeProp(base());
    expect(r).toContain("type=B");
    expect(r).toContain('class="btnPrimario"');
  });
});
