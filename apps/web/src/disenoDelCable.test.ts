import { describe, expect, it } from "vitest";
import { fundirDiseno } from "./disenoDelCable.js";

describe("fundirDiseno: lista blanca y fusión por proyecto", () => {
  it("cada mensaje trae lo suyo y se FUNDE con lo del mismo proyecto; null es «sin vínculo»", () => {
    let d = fundirDiseno(undefined, { clase: "diseno", proyecto: "p1", vinculo: null });
    expect(d).toEqual({ proyecto: "p1", vinculo: null });
    d = fundirDiseno(d, { clase: "diseno", proyecto: "p1", proyectos: [{ name: "projects/9", title: "Maset", extra: 1 }] });
    expect(d).toEqual({ proyecto: "p1", vinculo: null, proyectos: [{ name: "projects/9", title: "Maset" }] });
    d = fundirDiseno(d, { clase: "diseno", proyecto: "p1", vinculo: { proyecto: "projects/9", nombre: "Maset" } });
    expect(d?.vinculo).toEqual({ proyecto: "projects/9", nombre: "Maset" });
    expect(d?.proyectos).toHaveLength(1);
  });

  it("otro proyecto empieza de cero, un error de ahora sustituye al de antes, y una miniatura que no es https no entra", () => {
    const a = fundirDiseno(undefined, { proyecto: "p1", vinculo: null, error: "x" });
    const b = fundirDiseno(a, {
      proyecto: "p2",
      pantallas: [
        { name: "projects/9/screens/aa", title: "Listado", miniatura: "https://lh3.googleusercontent.com/x" },
        { name: "projects/9/screens/bb", title: "Otra", miniatura: "javascript:alert(1)" },
      ],
    });
    expect(b).toEqual({
      proyecto: "p2",
      pantallas: [
        { name: "projects/9/screens/aa", title: "Listado", miniatura: "https://lh3.googleusercontent.com/x" },
        { name: "projects/9/screens/bb", title: "Otra" },
      ],
    });
  });
});
