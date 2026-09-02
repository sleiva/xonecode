import { describe, it, expect } from "vitest";
import { filasDe } from "./filas.js";

describe("filasDe: partir un texto en filas de una anchura", () => {
  it("un texto que cabe es una sola fila, y el vacío también (la fila del cursor existe siempre)", () => {
    expect(filasDe("hola", 10)).toEqual(["hola"]);
    expect(filasDe("", 10)).toEqual([""]);
  });

  it("un texto largo se parte por caracteres, sin perder ninguno ni inventar filas vacías", () => {
    expect(filasDe("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
    // Múltiplo exacto: la última fila está llena y NO hay una vacía detrás.
    expect(filasDe("abcdefgh", 4)).toEqual(["abcd", "efgh"]);
  });

  it("cuenta puntos de código, no bytes: una «ñ» o un emoji ocupan UNA celda de la cuenta", () => {
    expect(filasDe("añoñ", 2)).toEqual(["añ", "oñ"]);
    expect(filasDe("a😀b", 2)).toEqual(["a😀", "b"]);
  });

  it("una anchura no positiva no puede partir: devuelve el texto entero en una fila", () => {
    expect(filasDe("hola", 0)).toEqual(["hola"]);
  });
});
