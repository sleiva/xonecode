import { describe, it, expect } from "vitest";
import { pasosDe } from "./pasos.js";

describe("pasosDe", () => {
  it("cuenta LLAMADAS: una racha con sus veces, el resto una por línea", () => {
    expect(
      pasosDe([
        { tipo: "herramientas", lineas: ["Leyó ×6", "Consultó"], detalles: [{ nombre: "read_file", veces: 6 }, { nombre: "xone_navegacion", blanco: "problemas" }] },
        // Una sesión de antes: sin `detalles`, cada línea es una.
        { tipo: "herramientas", lineas: ["→ lee ×3 — a, b, c"] },
      ])
    ).toBe(8);
  });

  it("el razonamiento, las fases, los veredictos y los artefactos no son pasos", () => {
    expect(
      pasosDe([
        { tipo: "razonamiento", texto: "pienso" },
        { tipo: "fase", texto: "verificando", ms: 10 },
        { tipo: "verificacion", verde: true, errores: 0, avisos: 0 },
        { tipo: "artefacto", ruta: "/artefactos/a.png", nombre: "a.png", bytes: 1 },
        { tipo: "asistente", texto: "hecho" },
      ])
    ).toBe(0);
  });
});
