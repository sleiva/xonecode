import { describe, expect, it } from "vitest";
import { tipoDeArtefacto } from "./tipoDeArtefacto.js";

describe("tipoDeArtefacto", () => {
  it("reconoce los que el agente escribe, sin mirar mayúsculas", () => {
    expect(tipoDeArtefacto("flujo.HTML")).toEqual({ etiqueta: "HTML", forma: "pagina" });
    expect(tipoDeArtefacto("panel.openui")).toEqual({ etiqueta: "OpenUI", forma: "panel" });
    expect(tipoDeArtefacto("informe.md")).toEqual({ etiqueta: "Markdown", forma: "texto" });
    expect(tipoDeArtefacto("diagrama.svg")).toEqual({ etiqueta: "SVG", forma: "imagen" });
    expect(tipoDeArtefacto("captura.jpg")).toEqual({ etiqueta: "Imagen", forma: "imagen" });
  });

  it("lo que no conoce dice su extensión, y sin ella «Fichero»: nunca un tipo adivinado", () => {
    expect(tipoDeArtefacto("datos.xlsx")).toEqual({ etiqueta: "XLSX", forma: "fichero" });
    expect(tipoDeArtefacto("LEEME")).toEqual({ etiqueta: "Fichero", forma: "fichero" });
    // Un punto al principio es un fichero oculto, no una extensión.
    expect(tipoDeArtefacto(".notas")).toEqual({ etiqueta: "Fichero", forma: "fichero" });
  });
});
