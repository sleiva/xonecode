import { describe, expect, it } from "vitest";
import { partirPorOrigen, rotuloDeOrigen } from "./porOrigen.js";

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

describe("partirPorOrigen", () => {
  it("conserva el ORDEN: dos especialistas que se alternan son tres trozos, no dos bloques", () => {
    const { trozos, ultimo } = partirPorOrigen(["a", "b", "c", "d"], [orq, dev, dis, dev], undefined);
    expect(trozos).toEqual([
      { rotulo: "orquestador", lineas: ["a"] },
      { rotulo: "developer-xone", lineas: ["b"] },
      { rotulo: "designer-xone", lineas: ["c"] },
      { rotulo: "developer-xone", lineas: ["d"] },
    ]);
    expect(ultimo).toBe("developer-xone");
  });

  it("las seguidas del mismo origen van juntas, y el rótulo no se repite en el acto siguiente", () => {
    const primero = partirPorOrigen(["a", "b"], [dev, dev], undefined);
    expect(primero.trozos).toEqual([{ rotulo: "developer-xone", lineas: ["a", "b"] }]);
    // Un razonamiento en medio parte el acto, pero no cambia quién trabaja.
    const segundo = partirPorOrigen(["c"], [dev], primero.ultimo);
    expect(segundo.trozos).toEqual([{ lineas: ["c"] }]);
  });

  it("una sesión anterior —sin `detalles`— es un solo trozo sin rótulo, como se pintaba", () => {
    expect(partirPorOrigen(["a", "b"], undefined, undefined).trozos).toEqual([{ lineas: ["a", "b"] }]);
  });

  it("una línea sin origen no se rotula, y lo que viene después vuelve a decir quién", () => {
    const { trozos } = partirPorOrigen(["a", "plan", "b"], [dev, {}, dev], undefined);
    expect(trozos).toEqual([
      { rotulo: "developer-xone", lineas: ["a"] },
      { lineas: ["plan"] },
      { rotulo: "developer-xone", lineas: ["b"] },
    ]);
  });
});
