import { describe, expect, it } from "vitest";
import { fotoDeColecciones } from "./fotoDeColecciones.js";
import type { ModeloDeNavegacion } from "./navegacion.js";

const MODELO: ModeloDeNavegacion = {
  colecciones: [
    {
      nombre: "Clientes",
      fichero: "/Clientes.xne",
      campos: [{ nombre: "NOMBRE", tipo: "T" }, { nombre: "ALTA" }],
      referencias: [{ desde: "Clientes.PROV", por: "mapcol", hacia: "Provincias" }],
      eventos: ["onload"],
      nodos: [],
      conexiones: [],
    },
    {
      nombre: "Menu",
      fichero: "/Menu.xne",
      campos: [],
      referencias: [],
      eventos: [],
      nodos: [],
      conexiones: [],
    },
  ],
  app: { entrada: ["Menu"], login: [], estilos: ["x.css"], conexiones: [] },
  referenciasDeScript: [
    { desde: "Menu.BTN", por: "script", hacia: "Clientes", fichero: "/Menu.xne" },
    { desde: "/lib/nav.js", por: "mencion", hacia: "Clientes", fichero: "/lib/nav.js" },
    { desde: "Menu:onload", por: "script", hacia: "Login", fichero: "/Menu.xne" },
  ],
};

describe("fotoDeColecciones", () => {
  const foto = fotoDeColecciones(MODELO);

  it("cada colección con lo que apunta —atributos y SUS scripts— y lo que le apunta", () => {
    const menu = foto.colecciones.find((c) => c.nombre === "Menu")!;
    // Los scripts de su `.xne`, por el fichero: `Menu.BTN` y `Menu:onload`, no el `.js` suelto.
    expect(menu.apuntaA.map((r) => r.hacia)).toEqual(["Clientes", "Login"]);
    const clientes = foto.colecciones.find((c) => c.nombre === "Clientes")!;
    expect(clientes.apuntaA).toEqual([{ desde: "Clientes.PROV", por: "mapcol", hacia: "Provincias", fichero: "/Clientes.xne" }]);
    // Lo que le llega, con las dos confianzas separadas por `por`.
    expect(clientes.leApuntan.map((r) => [r.desde, r.por])).toEqual([
      ["Menu.BTN", "script"],
      ["/lib/nav.js", "mencion"],
    ]);
    expect(clientes.campos).toEqual([{ nombre: "NOMBRE", tipo: "T" }, { nombre: "ALTA" }]);
  });

  it("dice por dónde arranca y lo que está roto, igual que la tool", () => {
    expect(foto.entrada).toEqual(["Menu"]);
    expect(foto.rotas.map((r) => r.hacia).sort()).toEqual(["Login", "Provincias"]);
  });

  it("con más colecciones que el tope, recorta y CUENTA el total", () => {
    const recortada = fotoDeColecciones(MODELO, 1);
    expect(recortada.colecciones).toHaveLength(1);
    expect(recortada.total).toBe(2);
  });
});
