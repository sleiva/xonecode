import { describe, expect, it } from "vitest";
import { categoriaDeEstado, jqlDePendientes, motivoDeClaveDeProyecto, transicionPropuesta, type TransicionDelGestor } from "./gestorDeTareas.js";

describe("jqlDePendientes", () => {
  it("las pendientes de un proyecto, lo último tocado arriba", () => {
    expect(jqlDePendientes({ proyecto: "IXCODE" })).toBe('project = "IXCODE" AND statusCategory != Done ORDER BY updated DESC');
  });
  it("el texto de búsqueda entra ESCAPADO: es una JQL", () => {
    expect(jqlDePendientes({ proyecto: "IXCODE" }, 'menú "x" \\ y')).toBe(
      'project = "IXCODE" AND statusCategory != Done AND text ~ "menú \\"x\\" \\\\ y" ORDER BY updated DESC'
    );
  });
  it("un texto vacío o de espacios no añade nada", () => {
    expect(jqlDePendientes({ proyecto: "IXCODE" }, "   ")).toBe(jqlDePendientes({ proyecto: "IXCODE" }));
  });
});

describe("motivoDeClaveDeProyecto", () => {
  it.each(["IXCODE", "HUB", "A1_B"])("%s vale", (c) => expect(motivoDeClaveDeProyecto(c)).toBeUndefined());
  it.each(["ixcode", "IX CODE", 'X" OR 1=1', "", "1ABC"])("%s no", (c) => expect(motivoDeClaveDeProyecto(c)).toBeTypeOf("string"));
});

describe("categoriaDeEstado", () => {
  it("new → por-hacer", () => expect(categoriaDeEstado("new")).toBe("por-hacer"));
  it("indeterminate → en-curso", () => expect(categoriaDeEstado("indeterminate")).toBe("en-curso"));
  it("done → terminada", () => expect(categoriaDeEstado("done")).toBe("terminada"));
  it("lo desconocido, y lo ausente, caen en por-hacer", () => {
    expect(categoriaDeEstado("otra-cosa")).toBe("por-hacer");
    expect(categoriaDeEstado(undefined)).toBe("por-hacer");
  });
});

const t = (id: string, nombre: string, destino: string, categoria: "por-hacer" | "en-curso" | "terminada"): TransicionDelGestor => ({ id, nombre, destino, categoria });
describe("transicionPropuesta", () => {
  const ts = [t("11", "Volver", "PROBLEMA", "por-hacer"), t("21", "Empezar", "EN CURSO", "en-curso"), t("2", "PROBAR", "PROBAR", "en-curso"), t("31", "Hecho", "TERMINADO", "terminada")];
  it("al empezar, la que lleva a EN CURSO", () => expect(transicionPropuesta(ts, "empezar")?.id).toBe("21"));
  it("al cerrar, PROBAR si existe", () => expect(transicionPropuesta(ts, "cerrar")?.id).toBe("2"));
  it("al cerrar sin PROBAR, la primera terminada", () => expect(transicionPropuesta(ts.filter((x) => x.id !== "2"), "cerrar")?.id).toBe("31"));
  it("sin candidata, nada", () => expect(transicionPropuesta([ts[0]!], "cerrar")).toBeUndefined());
  it("al empezar, un destino EN CURSO sin distinguir mayúsculas también vale", () => {
    const ts2 = [t("1", "x", "en curso", "por-hacer")];
    expect(transicionPropuesta(ts2, "empezar")?.id).toBe("1");
  });
  it("al empezar sin candidata, nada", () => {
    expect(transicionPropuesta([t("1", "Volver", "PROBLEMA", "por-hacer")], "empezar")).toBeUndefined();
  });
});
