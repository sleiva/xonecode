import { describe, it, expect } from "vitest";
import { filasDeTrazas } from "./Trazas.js";

describe("Trazas", () => {
  it("una fila por acto, etiquetada por tipo", () => {
    const filas = filasDeTrazas([
      { tipo: "usuario", texto: "haz algo" },
      { tipo: "herramientas", lineas: ["read_file  src/app.xne", "grep  coleccion"] },
      { tipo: "asistente", texto: "hecho" },
    ]);
    expect(filas.map((f) => f.etiqueta)).toEqual(["USUARIO", "TOOL", "TOOL", "ASISTENTE"]);
  });

  it("NINGUNA fila lleva argumentos de tool: deepseek los enseña, nosotros no podemos", () => {
    const filas = filasDeTrazas([
      { tipo: "herramientas", lineas: ["write_file  src/app.xne", "grep  ^function"] },
    ]);
    for (const f of filas) {
      expect(f.texto).not.toMatch(/[{}]/);
      expect(f.texto).not.toMatch(/"(command|content|file_text)"/);
    }
  });

  it("cada fila se trunca a una línea: las trazas es paisaje, no lectura", () => {
    const filas = filasDeTrazas([{ tipo: "asistente", texto: "a".repeat(500) }]);
    expect(filas[0].texto.length).toBeLessThanOrEqual(200);
  });
});
