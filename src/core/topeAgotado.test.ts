import { describe, expect, it } from "vitest";
import { mensajeDeTopeAgotado, TOPE_DE_PARCIAL } from "./topeAgotado.js";

describe("mensajeDeTopeAgotado", () => {
  it("dice el tope de verdad, sin inventarse la cifra", () => {
    expect(mensajeDeTopeAgotado({ limite: 15 })).toContain("15 llamadas");
  });

  it("devuelve el trabajo parcial, que es lo que se iba a tirar", () => {
    const r = mensajeDeTopeAgotado({ limite: 15, parcial: "El título vive en AcercaDe.xne" });
    expect(r).toContain("El título vive en AcercaDe.xne");
  });

  it("lo marca como PARCIAL: quien lo lee no puede tomarlo por una conclusión", () => {
    // El orquestador lee esto como la respuesta del especialista. Sin la marca trataría medio
    // análisis como el análisis entero, que es peor que no recibir nada.
    expect(mensajeDeTopeAgotado({ limite: 15, parcial: "x" })).toContain("PARCIAL");
  });

  it("sin nada que devolver lo DICE, en vez de fingir un hallazgo", () => {
    const r = mensajeDeTopeAgotado({ limite: 15 });
    expect(r).toMatch(/no llegué a dejar nada/i);
    expect(r).not.toContain("PARCIAL");
  });

  it("dice qué NO hacer, que es lo que se midió que pasa", () => {
    // Medido: el orquestador recibe casi nada y le encarga lo mismo al siguiente especialista,
    // que gasta su presupuesto en volver a averiguar lo mismo. La cadena sale de ahí.
    const r = mensajeDeTopeAgotado({ limite: 15, parcial: "x" });
    expect(r).toContain("HANDOFF DE ANÁLISIS");
    expect(r).toMatch(/no se lo encargues igual a otro/i);
  });

  it("lo que no cabe se RECORTA y se CUENTA", () => {
    const largo = "a".repeat(TOPE_DE_PARCIAL + 500);
    const r = mensajeDeTopeAgotado({ limite: 15, parcial: largo });
    expect(r.length).toBeLessThan(largo.length + 1_000);
    expect(r).toContain(`había ${largo.length} caracteres`);
  });

  it("un parcial en blanco cuenta como no tener nada", () => {
    expect(mensajeDeTopeAgotado({ limite: 15, parcial: "   " })).toMatch(/no llegué a dejar nada/i);
  });
});
