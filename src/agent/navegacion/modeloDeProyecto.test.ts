import { describe, it, expect } from "vitest";
import { modeloDeNavegacion, rutaVirtualDelProyecto, type ModeloDelLinter } from "./modeloDeProyecto.js";

const RAIZ = "/proy";
const TODAS = new Set(["/Clientes.xne", "/Pedidos.xne", "/Vista.xne", "/Vista.xml", "/Suelto.xml"]);

const coll = (extra: Partial<NonNullable<ModeloDelLinter["colls"]>[number]> = {}) => ({
  name: "Clientes",
  location: { file: "/proy/Clientes.xne" },
  props: [],
  contents: [],
  attributes: {},
  ...extra,
});

describe("rutaVirtualDelProyecto", () => {
  it("traduce una absoluta del proyecto a su ruta virtual", () => {
    expect(rutaVirtualDelProyecto("/proy", "/proy/Clientes.xne")).toBe("/Clientes.xne");
    expect(rutaVirtualDelProyecto("/proy", "/proy/sub/Otra.xne")).toBe("/sub/Otra.xne");
  });

  it("lo de FUERA del proyecto no tiene ruta virtual", () => {
    // De aquí sale texto que va al modelo y de ahí al cable: una ruta de fuera presentada
    // como del proyecto es la fuga de `sinRutas` por la puerta de atrás.
    expect(rutaVirtualDelProyecto("/proy", "/otro/Clientes.xne")).toBeUndefined();
    expect(rutaVirtualDelProyecto("/proy", "/proy/../fuera.xne")).toBeUndefined();
  });

  it("la raíz misma tampoco: no es un fichero que abrir", () => {
    expect(rutaVirtualDelProyecto("/proy", "/proy")).toBeUndefined();
  });
});

describe("modeloDeNavegacion", () => {
  it("traduce colecciones y campos, con la ruta ya virtual", () => {
    const m = modeloDeNavegacion(
      { colls: [coll({ props: [{ name: "NOMBRE", type: "T" }] })] },
      RAIZ,
      TODAS
    );
    expect(m.colecciones).toEqual([
      {
        nombre: "Clientes",
        fichero: "/Clientes.xne",
        campos: [{ nombre: "NOMBRE", tipo: "T" }],
        referencias: [],
      },
    ]);
  });

  it("NINGUNA ruta de la máquina sobrevive a la traducción", () => {
    const m = modeloDeNavegacion({ colls: [coll()] }, RAIZ, TODAS);
    expect(JSON.stringify(m)).not.toContain("/proy");
  });

  it("una coll de FUERA del proyecto no entra en el índice", () => {
    const m = modeloDeNavegacion({ colls: [coll({ location: { file: "/otro/X.xne" } })] }, RAIZ, TODAS);
    expect(m.colecciones).toEqual([]);
  });

  it("una vista APLANADA no entra: el agente no debe abrirla", () => {
    // `Vista.xml` tiene un `Vista.xne` al lado. La regla es del proyecto, y esta tool no pasa
    // por el middleware que la aplica: hay que reaplicarla aquí.
    const m = modeloDeNavegacion(
      { colls: [coll({ name: "Vista", location: { file: "/proy/Vista.xml" } })] },
      RAIZ,
      TODAS
    );
    expect(m.colecciones).toEqual([]);
  });

  it("pero un `.xml` SUELTO sí, porque no es una vista aplanada", () => {
    const m = modeloDeNavegacion(
      { colls: [coll({ name: "Suelto", location: { file: "/proy/Suelto.xml" } })] },
      RAIZ,
      TODAS
    );
    expect(m.colecciones.map((c) => c.nombre)).toEqual(["Suelto"]);
  });

  it("una ruta DENEGADA no entra aunque esté dentro del proyecto", () => {
    const m = modeloDeNavegacion(
      { colls: [coll({ location: { file: "/proy/.xonecode/robado.xne" } })] },
      RAIZ,
      TODAS
    );
    expect(m.colecciones).toEqual([]);
  });

  it("una coll sin nombre o sin fichero se salta, en vez de entrar a medias", () => {
    const m = modeloDeNavegacion(
      { colls: [coll({ name: undefined }), coll({ location: undefined })] },
      RAIZ,
      TODAS
    );
    expect(m.colecciones).toEqual([]);
  });

  it("un modelo vacío no revienta", () => {
    expect(modeloDeNavegacion({}, RAIZ, TODAS).colecciones).toEqual([]);
  });
});

describe("las referencias que se extraen", () => {
  it("`mapcol` y su `mapfld` cuelgan del mismo prop", () => {
    // Un `mapfld` sin `mapcol` no apunta a nada que se pueda nombrar.
    const m = modeloDeNavegacion(
      {
        colls: [
          coll({
            name: "Pedidos",
            location: { file: "/proy/Pedidos.xne" },
            props: [{ name: "CLIENTE", attributes: { mapcol: "Clientes", mapfld: "NOMBRE" } }],
          }),
        ],
      },
      RAIZ,
      TODAS
    );
    expect(m.colecciones[0]!.referencias).toEqual([
      { desde: "Pedidos.CLIENTE", por: "mapcol", hacia: "Clientes" },
      { desde: "Pedidos.CLIENTE", por: "mapfld", hacia: "Clientes.NOMBRE" },
    ]);
  });

  it("un `mapfld` SIN `mapcol` no produce referencia", () => {
    const m = modeloDeNavegacion(
      { colls: [coll({ props: [{ name: "X", attributes: { mapfld: "NOMBRE" } }] })] },
      RAIZ,
      TODAS
    );
    expect(m.colecciones[0]!.referencias).toEqual([]);
  });

  it("`linkedfield` cuenta igual que `mapfld`", () => {
    const m = modeloDeNavegacion(
      {
        colls: [coll({ props: [{ name: "X", attributes: { mapcol: "Clientes", linkedfield: "ID" } }] })],
      },
      RAIZ,
      TODAS
    );
    expect(m.colecciones[0]!.referencias.map((r) => r.por)).toEqual(["mapcol", "linkedfield"]);
  });

  it("`inherits` y `contents src` son de la COLECCIÓN, no de un campo", () => {
    const m = modeloDeNavegacion(
      {
        colls: [
          coll({
            name: "Detalle",
            attributes: { inherits: "Pedidos" },
            contents: [{ src: "Lineas" }],
          }),
        ],
      },
      RAIZ,
      TODAS
    );
    expect(m.colecciones[0]!.referencias).toEqual([
      { desde: "Detalle", por: "inherits", hacia: "Pedidos" },
      { desde: "Detalle", por: "contents", hacia: "Lineas" },
    ]);
  });
});
