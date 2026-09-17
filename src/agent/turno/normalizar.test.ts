import { describe, it, expect } from "vitest";
import { normalizar } from "./normalizar.js";

describe("normalizar", () => {
  it("acepta la forma SIN subgraphs: [modo, dato]", () => {
    expect(normalizar(["updates", { n: 1 }])).toEqual({ ns: [], modo: "updates", dato: { n: 1 } });
  });

  it("acepta la forma CON subgraphs: [namespace, modo, dato]", () => {
    expect(normalizar([["model_request:abc"], "messages", ["m", {}]])).toEqual({
      ns: ["model_request:abc"],
      modo: "messages",
      dato: ["m", {}],
    });
  });

  it("un namespace VACÍO con subgraphs es el grafo padre, no un error", () => {
    // Medido: los chunks del padre llegan con `ns: []` cuando subgraphs está activo.
    expect(normalizar([[], "updates", {}])).toEqual({ ns: [], modo: "updates", dato: {} });
  });

  it("NO confunde [namespace, modo, dato] con [modo, dato]", () => {
    // El fallo original: leer el array de namespace como si fuera el modo. Aquí eso
    // devolvería modo = un array, y el tipo lo impide.
    const r = normalizar([["ns"], "updates", {}]);
    expect(r?.modo).toBe("updates");
    expect(r?.modo).not.toEqual(["ns"]);
  });

  it("devuelve null ante lo que no sabe leer, en vez de adivinar", () => {
    expect(normalizar(null)).toBeNull();
    expect(normalizar({ modo: "updates" })).toBeNull();
    expect(normalizar([])).toBeNull();
    expect(normalizar(["updates"])).toBeNull();
    expect(normalizar([1, 2, 3, 4])).toBeNull();
    expect(normalizar([123, {}])).toBeNull();          // modo que no es cadena
    expect(normalizar(["no-es-ns", "updates", {}])).toBeNull(); // ns que no es array
  });
});