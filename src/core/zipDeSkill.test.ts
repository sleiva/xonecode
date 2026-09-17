import { describe, it, expect } from "vitest";
import {
  planDeInstalacion,
  rutaDeZipAceptable,
  TOPE_DESCOMPRIMIDO,
  TOPE_DE_ENTRADAS,
} from "./zipDeSkill.js";

const e = (ruta: string, bytes = 10) => ({ ruta, bytes });

describe("rutaDeZipAceptable", () => {
  it("acepta segmentos llanos separados por /", () => {
    expect(rutaDeZipAceptable("SKILL.md")).toBe(true);
    expect(rutaDeZipAceptable("reference/guia.md")).toBe(true);
    expect(rutaDeZipAceptable("a/b/c/d.json")).toBe(true);
  });

  it("rechaza el zip slip en todas sus formas", () => {
    // El agujero de verdad: una entrada llamada así escribe donde le da la gana.
    expect(rutaDeZipAceptable("../fuera.md")).toBe(false);
    expect(rutaDeZipAceptable("a/../../fuera.md")).toBe(false);
    expect(rutaDeZipAceptable("/etc/passwd")).toBe(false);
    expect(rutaDeZipAceptable("C:/Windows/x.dll")).toBe(false);
    // `\` es separador en Windows: `..\\fuera` sale igual de la carpeta.
    expect(rutaDeZipAceptable("..\\fuera.md")).toBe(false);
    expect(rutaDeZipAceptable("a\\b.md")).toBe(false);
  });

  it("rechaza lo que trunca una ruta en las capas de debajo", () => {
    // Un byte nulo hace que lo comprobado y lo abierto dejen de ser lo mismo.
    expect(rutaDeZipAceptable("SKILL.md\0.png")).toBe(false);
  });

  it("rechaza segmentos vacíos, `.` y espacios en los bordes", () => {
    expect(rutaDeZipAceptable("a//b.md")).toBe(false);
    expect(rutaDeZipAceptable("./a.md")).toBe(false);
    expect(rutaDeZipAceptable(" a.md")).toBe(false);
    expect(rutaDeZipAceptable("a.md ")).toBe(false);
    expect(rutaDeZipAceptable("")).toBe(false);
  });
});

describe("planDeInstalacion", () => {
  it("con una carpeta envolvente, el nombre sale de ELLA y la carpeta se quita", () => {
    const plan = planDeInstalacion(
      [e("mi-skill/SKILL.md"), e("mi-skill/reference/g.md")],
      "descarga-final(2).zip"
    );
    expect(plan).toEqual({
      nombre: "mi-skill",
      ficheros: ["SKILL.md", "reference/g.md"],
      prefijo: "mi-skill/",
    });
  });

  it("sin carpeta envolvente, el nombre sale del FICHERO que subió la persona", () => {
    // Es lo que ella ve en su disco, así que es lo que menos la sorprende.
    const plan = planDeInstalacion([e("SKILL.md"), e("g.md")], "mi-skill.zip");
    expect(plan).toEqual({ nombre: "mi-skill", ficheros: ["SKILL.md", "g.md"], prefijo: "" });
  });

  it("dos carpetas de primer nivel NO son una envolvente", () => {
    // Quitar una de las dos dejaría fuera la otra sin decirlo.
    const plan = planDeInstalacion([e("a/SKILL.md"), e("b/x.md")], "cosa.zip");
    expect(plan).toEqual({ error: expect.stringContaining("SKILL.md") });
  });

  it("sin SKILL.md no es una skill, y se dice", () => {
    const plan = planDeInstalacion([e("mi-skill/README.md")], "mi-skill.zip");
    expect(plan).toEqual({ error: expect.stringContaining("SKILL.md") });
  });

  it("una entrada que se sale se lleva el zip ENTERO, y el motivo NO repite su nombre", () => {
    // Fail-closed: no se instala «lo bueno» de un zip que trae una trampa. Y el nombre de la
    // entrada lo eligió quien empaquetó el zip: esto se pinta en la ventana de alguien.
    const plan = planDeInstalacion([e("mi-skill/SKILL.md"), e("../../.ssh/authorized_keys")], "x.zip");
    expect(plan).toEqual({ error: expect.stringContaining("se sale") });
    expect(JSON.stringify(plan)).not.toContain("authorized_keys");
  });

  it("un zip BOMBA se para por lo que ocupa DESCOMPRIMIDO, que es lo que el tope HTTP no ve", () => {
    const plan = planDeInstalacion(
      [e("s/SKILL.md", 10), e("s/gordo.bin", TOPE_DESCOMPRIMIDO)],
      "s.zip"
    );
    expect(plan).toEqual({ error: expect.stringContaining("descomprimido") });
  });

  it("y por el NÚMERO de entradas: una skill son unas decenas", () => {
    const muchas = Array.from({ length: TOPE_DE_ENTRADAS + 1 }, (_, i) => e(`s/f${i}.md`));
    expect(planDeInstalacion(muchas, "s.zip")).toEqual({ error: expect.stringContaining("no es una skill") });
  });

  it("un nombre que no es un slug se rechaza y se ofrece el que sí valdría", () => {
    // El nombre es la carpeta Y lo que un subagente declara: vale la misma regla de siempre.
    const plan = planDeInstalacion([e("SKILL.md")], "Mi Skill Genial.zip");
    expect(plan).toEqual({ error: expect.stringContaining("mi-skill-genial") });
  });

  it("un zip vacío se dice, en vez de instalar una carpeta sin nada", () => {
    expect(planDeInstalacion([], "x.zip")).toEqual({ error: expect.stringContaining("vacío") });
  });
});
