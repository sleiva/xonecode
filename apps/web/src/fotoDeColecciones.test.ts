import { describe, expect, it } from "vitest";
import { confianzaDe, leerFotoDeColecciones } from "./fotoDeColecciones.js";

describe("leerFotoDeColecciones", () => {
  it("copia lo que tiene forma y descarta la entrada mala sin tirar la foto", () => {
    const foto = leerFotoDeColecciones({
      colecciones: [
        {
          nombre: "Clientes",
          fichero: "/Clientes.xne",
          campos: [{ nombre: "ID", tipo: "N" }, { tipo: "T" }, { nombre: "ALTA", tipo: 3 }],
          eventos: ["onload", 7],
          nodos: [],
          conexiones: [],
          apuntaA: [{ desde: "Clientes.P", por: "mapcol", hacia: "Provincias", fichero: "/Clientes.xne" }, { desde: "x" }],
          leApuntan: [],
          colado: "no",
        },
        { fichero: "/SinNombre.xne" },
      ],
      total: 2,
      entrada: ["Menu"],
      login: [],
      rotas: [],
      colado: "no",
    });
    expect(foto).toEqual({
      colecciones: [
        {
          nombre: "Clientes",
          fichero: "/Clientes.xne",
          campos: [{ nombre: "ID", tipo: "N" }, { nombre: "ALTA" }],
          eventos: ["onload"],
          nodos: [],
          conexiones: [],
          apuntaA: [{ desde: "Clientes.P", por: "mapcol", hacia: "Provincias", fichero: "/Clientes.xne" }],
          leApuntan: [],
        },
      ],
      total: 2,
      entrada: ["Menu"],
      login: [],
      rotas: [],
    });
  });

  it("lo que no es una foto no se convierte en una vacía", () => {
    expect(leerFotoDeColecciones(undefined)).toBeUndefined();
    expect(leerFotoDeColecciones({ colecciones: [] })).toBeUndefined();
  });

  it("tres confianzas, y un atributo cualquiera es «resuelta»", () => {
    const r = (por: string) => ({ desde: "a", por, hacia: "b", fichero: "/a" });
    expect([r("mapcol"), r("inherits"), r("script"), r("mencion")].map(confianzaDe)).toEqual([
      "resuelta",
      "resuelta",
      "script",
      "mencion",
    ]);
  });
});
