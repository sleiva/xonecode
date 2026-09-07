import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
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
