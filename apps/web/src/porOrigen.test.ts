import { describe, expect, it } from "vitest";
import { partirPorOrigen, toolsFallidas, rotuloDeOrigen, type TrozoPorOrigen } from "./porOrigen.js";

const dev = { nombre: "read_file", origen: { rol: "especialista", nombre: "developer-xone" } } as const;
const dis = { nombre: "read_file", origen: { rol: "especialista", nombre: "designer-xone" } } as const;
const orq = { nombre: "task", origen: { rol: "orquestador" } } as const;

describe("rotuloDeOrigen", () => {
  it("rotula solo lo que consta", () => {
    expect(rotuloDeOrigen({ rol: "orquestador" })).toBe("orquestador");
    expect(rotuloDeOrigen({ rol: "especialista", nombre: "developer-xone" })).toBe("developer-xone");
    // Un hijo de deepagents: es un especialista, y de cuál no consta.
    expect(rotuloDeOrigen({ rol: "especialista" })).toBe("especialista");
    expect(rotuloDeOrigen(undefined)).toBeUndefined();
  });
});

/** Las comparaciones de FORMA de abajo son de rótulos, líneas y fallos: los `detalles` en paralelo
 *  tienen su propio test, y aquí se quitan para que cada uno diga una sola cosa. */
const sinDetalles = (trozos: readonly TrozoPorOrigen[]) => trozos.map(({ detalles: _d, ...resto }) => resto);

describe("partirPorOrigen", () => {
  it("conserva el ORDEN: dos especialistas que se alternan son tres trozos, no dos bloques", () => {
    const { trozos, ultimo } = partirPorOrigen(["a", "b", "c", "d"], [orq, dev, dis, dev], undefined);
    expect(sinDetalles(trozos)).toEqual([
      { rotulo: "orquestador", lineas: ["a"] },
      { rotulo: "developer-xone", lineas: ["b"] },
      { rotulo: "designer-xone", lineas: ["c"] },
      { rotulo: "developer-xone", lineas: ["d"] },
    ]);
    expect(ultimo).toBe("developer-xone");
  });

  it("las seguidas del mismo origen van juntas, y el rótulo no se repite en el acto siguiente", () => {
    const primero = partirPorOrigen(["a", "b"], [dev, dev], undefined);
    expect(sinDetalles(primero.trozos)).toEqual([{ rotulo: "developer-xone", lineas: ["a", "b"] }]);
    // Un razonamiento en medio parte el acto, pero no cambia quién trabaja.
    const segundo = partirPorOrigen(["c"], [dev], primero.ultimo);
    expect(sinDetalles(segundo.trozos)).toEqual([{ lineas: ["c"] }]);
  });

  it("cada trozo lleva el detalle de SUS líneas, en paralelo (el raíl con verbos lo lee)", () => {
    const dev = { rol: "especialista", nombre: "developer-xone" } as const;
    const { trozos } = partirPorOrigen(
      ["a", "b"],
      [{ nombre: "task", blanco: "developer-xone", origen: { rol: "orquestador" } }, { nombre: "read_file", blanco: "/x", origen: dev }],
      undefined
    );
    expect(trozos.map((t) => t.detalles?.map((d) => d.blanco))).toEqual([["developer-xone"], ["/x"]]);
  });

  it("una sesión anterior —sin `detalles`— es un solo trozo sin rótulo, como se pintaba", () => {
    expect(partirPorOrigen(["a", "b"], undefined, undefined).trozos).toEqual([{ lineas: ["a", "b"] }]);
  });

  it("una línea sin origen no se rotula, y lo que viene después vuelve a decir quién", () => {
    const { trozos } = partirPorOrigen(["a", "plan", "b"], [dev, {}, dev], undefined);
    expect(sinDetalles(trozos)).toEqual([
      { rotulo: "developer-xone", lineas: ["a"] },
      { lineas: ["plan"] },
      { rotulo: "developer-xone", lineas: ["b"] },
    ]);
  });
});

describe("las tools que fallaron", () => {
  it("se marcan por su detalle.error, con el índice DENTRO de su trozo", () => {
    const { trozos } = partirPorOrigen(
      ["a", "✗ b: no existe", "c"],
      [
        { origen: { rol: "orquestador" } },
        { origen: { rol: "especialista", nombre: "developer-xone" }, error: "no existe" },
        { origen: { rol: "especialista", nombre: "developer-xone" } },
      ],
      undefined
    );
    expect(sinDetalles(trozos)).toEqual([
      { rotulo: "orquestador", lineas: ["a"] },
      { rotulo: "developer-xone", lineas: ["✗ b: no existe", "c"], fallidas: [0] },
    ]);
  });

  it("el `✗` del TEXTO no decide nada: sin error en el dato, no hay fallo", () => {
    expect(sinDetalles(partirPorOrigen(["✗ parece un fallo"], [{}], undefined).trozos)).toEqual([{ lineas: ["✗ parece un fallo"] }]);
  });

  it("se cuentan en todo el tramo, y solo en actos de herramientas", () => {
    expect(
      toolsFallidas([
        { tipo: "herramientas", detalles: [{ error: "x" }, {}] },
        { tipo: "razonamiento" },
        { tipo: "herramientas", detalles: [{ error: "y" }] },
        { tipo: "herramientas" },
      ])
    ).toBe(2);
  });
});

