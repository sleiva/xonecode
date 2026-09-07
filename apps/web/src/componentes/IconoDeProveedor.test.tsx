import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { IconoDeProveedor } from "./IconoDeProveedor.js";

afterEach(cleanup);

function svgDe(proveedor: string): SVGSVGElement {
  const { container } = render(<IconoDeProveedor proveedor={proveedor} />);
  return container.querySelector("svg")!;
}

describe("IconoDeProveedor", () => {
  it("un proveedor conocido lleva su trazado, y hereda el color en vez de traerlo", () => {
    const svg = svgDe("openai");
    expect(svg.getAttribute("fill")).toBe("currentColor");
    const trazado = svg.querySelector("path")!;
    expect(trazado.getAttribute("d")!.length).toBeGreaterThan(100);
    // Ningún color literal dentro: el logo se pinta con el color de la fila, y por eso
    // funciona en claro y en oscuro sin una regla más.
    expect(svg.outerHTML.toLowerCase()).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/);
  });

  it("no se anuncia: el nombre del proveedor ya está en la fila como texto", () => {
    const svg = svgDe("anthropic");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.querySelector("title")).toBeNull();
  });

  it("Ollama Cloud comparte el logo de Ollama: es el mismo producto en otro host", () => {
    expect(svgDe("ollama-cloud").querySelector("path")!.getAttribute("d"))
      .toBe(svgDe("ollama").querySelector("path")!.getAttribute("d"));
  });

  it("un proveedor que no conocemos cae en el genérico, no en un hueco", () => {
    // Es el caso de un proveedor personalizado: no tiene marca, y un logo inventado sería
    // peor que el icono de enlace, que es exactamente lo que es.
    const svg = svgDe("custom:mi-servidor");
    const trazado = svg.querySelector("path")!;
    expect(trazado.getAttribute("stroke")).toBe("currentColor");
    expect(trazado.getAttribute("d")).not.toBe(null);
  });

  it("los ocho de serie tienen logo propio, y no hay dos iguales", () => {
    const ids = ["gemini", "openai", "anthropic", "ollama", "ollama-cloud", "nvidia", "groq", "xai"];
    const trazados = ids.map((id) => svgDe(id).querySelector("path")!.getAttribute("d")!);
    // Ninguno cae en el genérico (que es el único con `stroke`).
    for (const id of ids) expect(svgDe(id).querySelector("path")!.getAttribute("stroke")).toBeNull();
    // `ollama-cloud` comparte con `ollama` a propósito; los demás son distintos.
    expect(new Set(trazados).size).toBe(ids.length - 1);
  });
});
