import { describe, expect, it } from "vitest";
import { diffDeColecciones } from "./diffDeColecciones.js";
import type { ColeccionDeNavegacion } from "./navegacion.js";

const coll = (c: Partial<ColeccionDeNavegacion> & { nombre: string }): ColeccionDeNavegacion => ({
  fichero: "/Clientes.xne",
  campos: [],
  referencias: [],
  eventos: [],
  nodos: [],
  conexiones: [],
  ...c,
});

describe("diffDeColecciones", () => {
  it("campos que entran, salen y cambian de tipo; lo que no cambió no sale", () => {
    const antes = [coll({ nombre: "Clientes", campos: [{ nombre: "ID", tipo: "N" }, { nombre: "ESTADO", tipo: "T" }, { nombre: "VIEJO" }] })];
    const ahora = [coll({ nombre: "Clientes", campos: [{ nombre: "ID", tipo: "N" }, { nombre: "ESTADO", tipo: "N" }, { nombre: "FECHA_ALTA", tipo: "D" }] })];
    expect(diffDeColecciones(antes, ahora)).toEqual([
      {
        nombre: "Clientes",
        estado: "modificada",
        campos: [
          { cambio: "tipo", nombre: "ESTADO", antes: "T", ahora: "N" },
          { cambio: "nuevo", nombre: "FECHA_ALTA", ahora: "D" },
          { cambio: "borrado", nombre: "VIEJO" },
        ],
        referencias: [],
        eventos: [],
        nodos: [],
        conexiones: [],
      },
    ]);
  });

  it("la caja no es un cambio: `NOMBRE` y `Nombre` son el mismo campo", () => {
    const antes = [coll({ nombre: "Clientes", campos: [{ nombre: "NOMBRE", tipo: "T" }] })];
    const ahora = [coll({ nombre: "clientes", campos: [{ nombre: "Nombre", tipo: "T" }] })];
    expect(diffDeColecciones(antes, ahora)).toEqual([]);
  });

  it("referencias y eventos que entran y salen", () => {
    const antes = [coll({ nombre: "Pedidos", referencias: [{ desde: "Pedidos.CLI", por: "mapcol", hacia: "Clientes" }], eventos: ["onload"] })];
    const ahora = [coll({ nombre: "Pedidos", referencias: [{ desde: "Pedidos.CLI", por: "mapcol", hacia: "Contactos" }], eventos: ["onload", "onchange(CLI)"] })];
    const [c] = diffDeColecciones(antes, ahora);
    expect(c!.referencias).toEqual([
      { cambio: "nuevo", desde: "Pedidos.CLI", por: "mapcol", hacia: "Contactos" },
      { cambio: "borrado", desde: "Pedidos.CLI", por: "mapcol", hacia: "Clientes" },
    ]);
    expect(c!.eventos).toEqual([{ cambio: "nuevo", nombre: "onchange(CLI)" }]);
  });

  it("una colección nueva lo es entera, y una que desaparece del fichero, borrada entera", () => {
    const nueva = diffDeColecciones([], [coll({ nombre: "Visitas", campos: [{ nombre: "FECHA", tipo: "D" }] })]);
    expect(nueva[0]).toMatchObject({ nombre: "Visitas", estado: "nueva", campos: [{ cambio: "nuevo", nombre: "FECHA", ahora: "D" }] });
    const borrada = diffDeColecciones([coll({ nombre: "Visitas" })], []);
    // Aunque no tuviera campos: la colección entera se fue, y eso es un cambio.
    expect(borrada).toEqual([{ nombre: "Visitas", estado: "borrada", campos: [], referencias: [], eventos: [], nodos: [], conexiones: [] }]);
  });
});
