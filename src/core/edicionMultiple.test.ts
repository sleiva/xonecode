import { describe, expect, it } from "vitest";
import { aplicarCambios, cambiosDeLaLlamada, TOPE_DE_CAMBIOS_POR_EDICION } from "./edicionMultiple.js";

describe("varios cambios a un fichero en una llamada", () => {
  it("sin edits, el old_string/new_string de siempre es un cambio", () => {
    expect(cambiosDeLaLlamada({ old_string: "a", new_string: "b", replace_all: true })).toEqual({ cambios: [{ viejo: "a", nuevo: "b", todas: true }] });
  });

  it("con edits, cada uno en su orden", () => {
    expect(cambiosDeLaLlamada({ edits: [{ old_string: "a", new_string: "b" }, { old_string: "c", new_string: "d", replace_all: true }] })).toEqual({
      cambios: [
        { viejo: "a", nuevo: "b", todas: false },
        { viejo: "c", nuevo: "d", todas: true },
      ],
    });
  });

  it("un edits mal formado o vacío es un motivo, no un intento a medias", () => {
    expect("motivo" in cambiosDeLaLlamada({ edits: [] })).toBe(true);
    expect(cambiosDeLaLlamada({ edits: [{ old_string: "a", new_string: "b" }, { old_string: "c" }] })).toEqual({ motivo: "El cambio 2 de edits no tiene old_string y new_string." });
    expect("motivo" in cambiosDeLaLlamada({ edits: Array.from({ length: TOPE_DE_CAMBIOS_POR_EDICION + 1 }, () => ({ old_string: "a", new_string: "b" })) })).toBe(true);
    expect("motivo" in cambiosDeLaLlamada({ file_path: "/a" })).toBe(true);
  });

  it("se aplican en orden, cada uno sobre lo que dejó el anterior", () => {
    expect(aplicarCambios("color=red\nsize=10", [{ viejo: "red", nuevo: "blue", todas: false }, { viejo: "blue\nsize=10", nuevo: "blue\nsize=12", todas: false }])).toEqual({
      texto: "color=blue\nsize=12",
      ocurrencias: 2,
    });
  });

  it("si uno no encaja no se aplica NINGUNO, y se dice cuál", () => {
    const r = aplicarCambios("a b c", [{ viejo: "a", nuevo: "A", todas: false }, { viejo: "zz", nuevo: "Z", todas: false }]);
    expect(r).toEqual({ motivo: expect.stringContaining("El cambio 2 de 2 no encaja") });
    expect((r as { motivo: string }).motivo).toContain("No se aplicó ninguno");
  });

  it("la regla de deepagents: varias veces sin replace_all es un motivo; con él, todas", () => {
    expect("motivo" in aplicarCambios("x x", [{ viejo: "x", nuevo: "y", todas: false }])).toBe(true);
    expect(aplicarCambios("x x", [{ viejo: "x", nuevo: "y", todas: true }])).toEqual({ texto: "y y", ocurrencias: 2 });
    expect("motivo" in aplicarCambios("x", [{ viejo: "", nuevo: "y", todas: false }])).toBe(true);
  });
});
