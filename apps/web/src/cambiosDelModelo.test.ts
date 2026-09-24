import { describe, expect, it } from "vitest";
import { leerCambiosDelModelo } from "./cambiosDelModelo.js";

describe("leerCambiosDelModelo", () => {
  it("copia lo que tiene forma y descarta la línea mala sin tirar el resto", () => {
    expect(
      leerCambiosDelModelo([
        {
          nombre: "Clientes",
          estado: "modificada",
          campos: [{ cambio: "tipo", nombre: "ESTADO", antes: "T", ahora: "N", colado: 1 }, { cambio: "otro", nombre: "X" }],
          referencias: [{ cambio: "nuevo", desde: "C.P", por: "mapcol", hacia: "Provincias" }, { cambio: "nuevo" }],
          eventos: [{ cambio: "borrado", nombre: "onload" }],
          nodos: "no",
          conexiones: [],
        },
        { nombre: "Rara", estado: "inventada" },
      ])
    ).toEqual([
      {
        nombre: "Clientes",
        estado: "modificada",
        campos: [{ cambio: "tipo", nombre: "ESTADO", antes: "T", ahora: "N" }],
        referencias: [{ cambio: "nuevo", desde: "C.P", por: "mapcol", hacia: "Provincias" }],
        eventos: [{ cambio: "borrado", nombre: "onload" }],
        nodos: [],
        conexiones: [],
      },
    ]);
  });

  it("lo que no es una lista no es «sin cambios»", () => {
    expect(leerCambiosDelModelo(undefined)).toBeUndefined();
    expect(leerCambiosDelModelo([])).toEqual([]);
  });
});
