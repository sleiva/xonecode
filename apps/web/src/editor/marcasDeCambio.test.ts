import { describe, expect, it } from "vitest";
import { cambioDeDeshacer, marcasDeCambio, todoNuevo, trozoDeLaLinea, trozosDeLineas, type TrozoDeLineas } from "./marcasDeCambio.js";

const marcas = (base: string, actual: string) => marcasDeCambio(trozosDeLineas(base, actual));
/** Aplica el cambio de «Deshacer este cambio» sobre el texto unido con «\n». */
const aplicar = (actual: string, trozo: TrozoDeLineas): string => {
  const c = cambioDeDeshacer(actual.split("\n"), trozo);
  return actual.slice(0, c.desde) + c.insertar + actual.slice(c.hasta);
};

describe("marcasDeCambio", () => {
  it("sin cambios no hay ninguna marca", () => {
    const m = marcas("a\nb\nc", "a\nb\nc");
    expect(m.trozos).toEqual([]);
    expect(m.cuentas).toEqual({ cambiadas: 0, nuevas: 0, borradas: 0 });
  });

  it("una línea cambiada", () => {
    const m = marcas("a\nb\nc", "a\nB\nc");
    expect([...m.lineas]).toEqual([[2, { clase: "cambiada", trozo: 0 }]]);
    expect(m.borrados).toEqual([]);
    expect(m.cuentas).toEqual({ cambiadas: 1, nuevas: 0, borradas: 0 });
  });

  it("una línea nueva en medio", () => {
    const m = marcas("a\nb\nc", "a\nb\nx\nc");
    expect([...m.lineas]).toEqual([[3, { clase: "nueva", trozo: 0 }]]);
    expect(m.cuentas).toEqual({ cambiadas: 0, nuevas: 1, borradas: 0 });
  });

  it("un borrado en medio va ENTRE líneas: detrás de la que queda arriba", () => {
    const m = marcas("a\nb\nc", "a\nc");
    expect([...m.lineas]).toEqual([]);
    expect(m.borrados).toEqual([{ trasLinea: 1, trozo: 0 }]);
    expect(m.cuentas).toEqual({ cambiadas: 0, nuevas: 0, borradas: 1 });
  });

  it("borrar la última línea no marca como cambiada la de arriba, aunque perdiera su salto", () => {
    // El diff de CodeMirror trae aquí «b\nc» contra «b»: se recortan las líneas iguales de los bordes.
    const m = marcas("a\nb\nc", "a\nb");
    expect([...m.lineas]).toEqual([]);
    expect(m.borrados).toEqual([{ trasLinea: 2, trozo: 0 }]);
  });

  it("borrar la primera línea pone el borrado ANTES de la primera (trasLinea 0)", () => {
    const m = marcas("a\nb\nc", "b\nc");
    expect(m.borrados).toEqual([{ trasLinea: 0, trozo: 0 }]);
    expect(trozoDeLaLinea(m, 1)).toBe(0);
  });

  it("todo nuevo: cada línea es nueva", () => {
    const m = marcasDeCambio(todoNuevo("x\ny"));
    expect([...m.lineas]).toEqual([
      [1, { clase: "nueva", trozo: 0 }],
      [2, { clase: "nueva", trozo: 0 }],
    ]);
    expect(m.cuentas).toEqual({ cambiadas: 0, nuevas: 2, borradas: 0 });
  });

  it("el mismo texto en CRLF contra la base en LF no tiene marcas", () => {
    expect(marcas("a\nb\n", "a\r\nb\r\n").trozos).toEqual([]);
  });

  it("tres líneas que se vuelven una: una cambiada y dos borradas debajo", () => {
    const m = marcas("a\nb\nc\nd\ne", "a\nX\ne");
    expect([...m.lineas]).toEqual([[2, { clase: "cambiada", trozo: 0 }]]);
    expect(m.borrados).toEqual([{ trasLinea: 2, trozo: 0 }]);
    expect(m.cuentas).toEqual({ cambiadas: 1, nuevas: 0, borradas: 2 });
  });

  it("trozoDeLaLinea encuentra el trozo de una línea marcada, y nada en una sin marca", () => {
    const m = marcas("a\nb\nc", "a\nB\nc");
    expect(trozoDeLaLinea(m, 2)).toBe(0);
    expect(trozoDeLaLinea(m, 1)).toBeUndefined();
  });
});

describe("cambioDeDeshacer devuelve SOLO ese trozo a la base", () => {
  it.each([
    ["cambiada", "a\nb\nc", "a\nB\nc"],
    ["nueva en medio", "a\nb\nc", "a\nb\nx\nc"],
    ["nueva al final", "a\nb\nc", "a\nb\nc\nd"],
    ["borrado en medio", "a\nb\nc", "a\nc"],
    ["borrado al principio", "a\nb\nc", "b\nc"],
    ["borrado al final", "a\nb\nc", "a\nb"],
    ["mixto", "a\nb\nc\nd\ne", "a\nX\ne"],
  ])("%s", (_caso, base, actual) => {
    const m = marcas(base, actual);
    expect(m.trozos).toHaveLength(1);
    expect(aplicar(actual, m.trozos[0]!)).toBe(base);
  });

  it("todo nuevo: deshacerlo deja el documento vacío", () => {
    const m = marcasDeCambio(todoNuevo("x\ny"));
    expect(aplicar("x\ny", m.trozos[0]!)).toBe("");
  });

  it("con dos trozos, deshacer uno deja el otro como estaba", () => {
    const m = marcas("a\nb\nc\nd", "A\nb\nc\nD");
    expect(m.trozos).toHaveLength(2);
    expect(aplicar("A\nb\nc\nD", m.trozos[1]!)).toBe("A\nb\nc\nd");
  });
});
