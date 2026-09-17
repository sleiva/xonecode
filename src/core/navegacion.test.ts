import { describe, it, expect } from "vitest";
import { construirIndice, partirNombre, type ModeloDeNavegacion } from "./navegacion.js";

/** Dos colecciones que se referencian, que es el caso que el diseño pide como fixture. */
const MODELO: ModeloDeNavegacion = {
  colecciones: [
    {
      nombre: "Clientes",
      fichero: "/Clientes.xne",
      campos: [
        { nombre: "ID", tipo: "N" },
        { nombre: "NOMBRE", tipo: "T" },
      ],
      referencias: [],
    },
    {
      nombre: "Pedidos",
      fichero: "/Pedidos.xne",
      campos: [{ nombre: "CLIENTE", tipo: "N" }],
      referencias: [
        { desde: "Pedidos.CLIENTE", por: "mapcol", hacia: "Clientes" },
        { desde: "Pedidos.CLIENTE", por: "mapfld", hacia: "Clientes.NOMBRE" },
      ],
    },
    {
      nombre: "PedidosDetalle",
      fichero: "/PedidosDetalle.xne",
      campos: [],
      referencias: [{ desde: "PedidosDetalle", por: "inherits", hacia: "Pedidos" }],
    },
  ],
};

describe("partirNombre", () => {
  it("separa `Coll.CAMPO`, y sin punto es una colección", () => {
    expect(partirNombre("Clientes.NOMBRE")).toEqual({ coleccion: "Clientes", campo: "NOMBRE" });
    expect(partirNombre("Clientes")).toEqual({ coleccion: "Clientes" });
  });
});

describe("inventario", () => {
  it("es la pregunta de los 18.000 tokens: todas las colecciones y dónde viven", () => {
    const i = construirIndice(MODELO);
    expect(i.inventario().map((d) => d.nombre)).toEqual(["Clientes", "Pedidos", "PedidosDetalle"]);
    expect(i.inventario()[0]).toEqual({ nombre: "Clientes", clase: "coleccion", fichero: "/Clientes.xne" });
  });
});

describe("definicion", () => {
  it("de una colección dice su fichero", () => {
    expect(construirIndice(MODELO).definicion("Clientes")).toEqual([
      { nombre: "Clientes", clase: "coleccion", fichero: "/Clientes.xne" },
    ]);
  });

  it("de un campo dice su colección y su tipo", () => {
    expect(construirIndice(MODELO).definicion("Clientes.NOMBRE")).toEqual([
      { nombre: "NOMBRE", clase: "campo", fichero: "/Clientes.xne", coleccion: "Clientes", tipo: "T" },
    ]);
  });

  it("NO distingue mayúsculas al buscar, y devuelve el nombre como está DECLARADO", () => {
    // En XOne se declara `NOMBRE` y se referencia `Nombre` con la misma intención: contestar
    // «no existe» por la caja manda a buscar un fallo que no está. Pero lo que se devuelve es
    // lo que el fichero dice, no lo que se tecleó.
    const encontrado = construirIndice(MODELO).definicion("clientes.nombre");
    expect(encontrado).toHaveLength(1);
    expect(encontrado[0]!.nombre).toBe("NOMBRE");
    expect(encontrado[0]!.coleccion).toBe("Clientes");
  });

  it("lo que no está devuelve VACÍO, que no es lo mismo que un error", () => {
    expect(construirIndice(MODELO).definicion("NoExiste")).toEqual([]);
    expect(construirIndice(MODELO).definicion("Clientes.NO_ESTA")).toEqual([]);
  });

  it("una colección DUPLICADA devuelve las dos, no la primera", () => {
    // Callarse una sería contestar a medias justo sobre el proyecto que tiene el problema.
    const dup: ModeloDeNavegacion = {
      colecciones: [
        { nombre: "Clientes", fichero: "/a/Clientes.xne", campos: [], referencias: [] },
        { nombre: "Clientes", fichero: "/b/Clientes.xne", campos: [], referencias: [] },
      ],
    };
    expect(construirIndice(dup).definicion("Clientes").map((d) => d.fichero)).toEqual([
      "/a/Clientes.xne",
      "/b/Clientes.xne",
    ]);
  });
});

describe("referencias", () => {
  it("dice quién apunta, POR QUÉ atributo y desde qué fichero", () => {
    // El atributo no es decoración: no es lo mismo un `mapcol` que un `inherits`, y quien
    // pregunta suele querer justo esa diferencia.
    expect(construirIndice(MODELO).referencias("Clientes")).toEqual([
      { desde: "Pedidos.CLIENTE", por: "mapcol", hacia: "Clientes", fichero: "/Pedidos.xne" },
      { desde: "Pedidos.CLIENTE", por: "mapfld", hacia: "Clientes.NOMBRE", fichero: "/Pedidos.xne" },
    ]);
  });

  it("por la coll entera incluye las que apuntan a un CAMPO suyo", () => {
    // «¿quién usa Clientes?» quiere también los `mapfld`: son usos de Clientes.
    expect(construirIndice(MODELO).referencias("Clientes")).toHaveLength(2);
  });

  it("y por un campo concreto solo las de ESE campo", () => {
    const soloCampo = construirIndice(MODELO).referencias("Clientes.NOMBRE");
    expect(soloCampo).toHaveLength(1);
    expect(soloCampo[0]!.por).toBe("mapfld");
  });

  it("un campo que nadie usa devuelve vacío aunque la coll sí se use", () => {
    expect(construirIndice(MODELO).referencias("Clientes.ID")).toEqual([]);
  });

  it("`inherits` cuenta como referencia: la coll entera apunta a otra", () => {
    expect(construirIndice(MODELO).referencias("Pedidos")).toEqual([
      { desde: "PedidosDetalle", por: "inherits", hacia: "Pedidos", fichero: "/PedidosDetalle.xne" },
    ]);
  });
});

describe("campos", () => {
  it("lista los campos con su tipo", () => {
    expect(construirIndice(MODELO).campos("Clientes")).toEqual([
      { nombre: "ID", clase: "campo", fichero: "/Clientes.xne", coleccion: "Clientes", tipo: "N" },
      { nombre: "NOMBRE", clase: "campo", fichero: "/Clientes.xne", coleccion: "Clientes", tipo: "T" },
    ]);
  });

  it("una colección que no existe da vacío, no una excepción", () => {
    expect(construirIndice(MODELO).campos("NoExiste")).toEqual([]);
  });

  it("acepta que le pasen `Coll.CAMPO` y se queda con la coll", () => {
    // El modelo teclea lo que tiene a mano; exigirle que recorte el punto sería gastarle un
    // viaje en una corrección que aquí cuesta una línea.
    expect(construirIndice(MODELO).campos("Clientes.NOMBRE").map((d) => d.nombre)).toEqual(["ID", "NOMBRE"]);
  });
});
