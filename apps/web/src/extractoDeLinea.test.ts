import { describe, expect, it } from "vitest";
import { extractoDeLinea } from "./extractoDeLinea.js";

const TEXTO = ["uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho"].join("\n") + "\n";

describe("extractoDeLinea", () => {
  it("la línea pedida con las de alrededor, numeradas desde 1, y la suya marcada", () => {
    expect(extractoDeLinea(TEXTO, 5, 1)).toEqual({
      desde: 4,
      lineas: [
        { numero: 4, texto: "cuatro", marcada: false },
        { numero: 5, texto: "cinco", marcada: true },
        { numero: 6, texto: "seis", marcada: false },
      ],
    });
  });

  it("en los bordes se recorta sin inventar líneas, y el salto final no cuenta como una más", () => {
    expect(extractoDeLinea(TEXTO, 1, 2)!.lineas.map((l) => l.numero)).toEqual([1, 2, 3]);
    expect(extractoDeLinea(TEXTO, 8, 2)!.lineas.map((l) => l.numero)).toEqual([6, 7, 8]);
    expect(extractoDeLinea(TEXTO, 9)).toBeUndefined();
  });

  it("una línea que no existe no da un extracto falso", () => {
    expect(extractoDeLinea(TEXTO, 0)).toBeUndefined();
    expect(extractoDeLinea(TEXTO, 2.5)).toBeUndefined();
    expect(extractoDeLinea("a\r\nb\r\n", 2)!.lineas.at(-1)).toEqual({ numero: 2, texto: "b", marcada: true });
  });
});
