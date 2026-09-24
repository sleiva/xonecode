import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Visor } from "./Visor.js";

afterEach(cleanup);

describe("Visor", () => {
  /**
   * D6 del spec: el visor reutiliza `CodeBlock` y los números de línea van por CSS sobre
   * los `.line` que emite shiki, UNO por línea. Este test es la comprobación de que ese
   * marcado existe; json es gramática de arranque del paquete, así que resalta en el
   * primer render y sin esperar a ninguna carga.
   */
  it("con una gramática cargada hay un nodo .line por línea", () => {
    const { container } = render(<Visor texto={'{"a": 1}\n{"b": 2}'} lenguaje="json" />);
    expect(container.querySelectorAll(".line")).toHaveLength(2);
  });

  it("sin lenguaje pinta el texto plano, entero", () => {
    const { container } = render(<Visor texto={"uno\ndos"} />);
    expect(container.textContent).toContain("uno");
    expect(container.textContent).toContain("dos");
  });
});

const TEXTO = Array.from({ length: 20 }, (_, i) => `var linea${i + 1} = ${i + 1};`).join("\n");

describe("Visor, llegando a una línea", () => {
  it("enseña SIEMPRE el extracto numerado, con la línea pedida marcada", () => {
    render(<Visor texto={TEXTO} linea={12} />);
    const extracto = screen.getByLabelText("Línea 12");
    const filas = [...extracto.children].map((f) => [f.textContent, f.hasAttribute("data-marcada")]);
    expect(filas).toEqual([
      ["9var linea9 = 9;", false],
      ["10var linea10 = 10;", false],
      ["11var linea11 = 11;", false],
      ["12var linea12 = 12;", true],
      ["13var linea13 = 13;", false],
      ["14var linea14 = 14;", false],
      ["15var linea15 = 15;", false],
    ]);
  });

  it("una línea que el fichero ya no tiene se dice, sin extracto inventado", () => {
    render(<Visor texto={TEXTO} linea={99} />);
    expect(screen.getByText("El fichero ya no tiene línea 99: ha cambiado desde el hallazgo.")).toBeTruthy();
    expect(screen.queryByLabelText("Línea 99")).toBeNull();
  });

  it("sin línea, el visor de siempre", () => {
    const { container } = render(<Visor texto={TEXTO} />);
    expect(container.querySelector("[aria-label^='Línea']")).toBeNull();
  });

  it("con el código partido en `.line` (json resalta ya en el primer render), marca la SUYA y solo esa", () => {
    const json = Array.from({ length: 6 }, (_, i) => (i === 0 ? "{" : i === 5 ? "}" : `  "k${i}": ${i}${i < 4 ? "," : ""}`)).join("\n");
    const { container } = render(<Visor texto={json} lenguaje="json" linea={3} />);
    const lineas = container.querySelectorAll(".bloque .line, .line");
    // El intento necesita dónde: que haya líneas es lo que el test de arriba ya garantiza para json.
    expect(lineas.length).toBeGreaterThan(0);
    const marcadas = container.querySelectorAll(".line[data-marcada]");
    expect(marcadas).toHaveLength(1);
    expect(marcadas[0]!.textContent).toContain('"k2"');
  });
});
