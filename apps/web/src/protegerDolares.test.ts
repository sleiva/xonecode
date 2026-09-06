import { describe, it, expect } from "vitest";
import { protegerDolares } from "./protegerDolares.js";

describe("protegerDolares", () => {
  it("escapa los dólares de la prosa: es el caso medido con «$http … $ui»", () => {
    // Medido en vivo: entre los dos dólares todo se convertía en fórmula, en cursiva y sin
    // espacios. Con el escape, `MarkdownText` pinta el `$` literal.
    expect(protegerDolares("en XOne se usa $http para peticiones y el objeto $ui no existe")).toBe(
      "en XOne se usa \\$http para peticiones y el objeto \\$ui no existe"
    );
  });

  it("no toca lo que va dentro de una valla de código", () => {
    // Dentro de una valla el `$` ya es literal, y la barra se vería.
    const texto = "Antes $x.\n```js\nvar total = $http.get(url);\n```\nDespués $y.";
    expect(protegerDolares(texto)).toBe("Antes \\$x.\n```js\nvar total = $http.get(url);\n```\nDespués \\$y.");
  });

  it("no toca un tramo entre acentos graves, ni siquiera con acentos dobles", () => {
    expect(protegerDolares("usa `$http` y no fetch, `` a`$`b `` tampoco, pero $esto sí")).toBe(
      "usa `$http` y no fetch, `` a`$`b `` tampoco, pero \\$esto sí"
    );
  });

  it("un dólar ya escapado se deja como está, sin doblar la barra", () => {
    expect(protegerDolares("vale \\$5 y $6")).toBe("vale \\$5 y \\$6");
  });

  it("los dobles también se escapan: aquí no hay LaTeX que preservar", () => {
    expect(protegerDolares("$$x$$")).toBe("\\$\\$x\\$\\$");
  });

  it("un texto sin dólares vuelve IDÉNTICO, sin tocar nada", () => {
    const texto = "## Título\n\n- una `lista`\n\n```xml\n<coll name=\"A\"/>\n```\n";
    expect(protegerDolares(texto)).toBe(texto);
  });

  it("una valla con tilde (~~~) se cierra con su propia marca, no con la de acentos", () => {
    const texto = "~~~\n$a\n```\n$b\n~~~\n$c";
    expect(protegerDolares(texto)).toBe("~~~\n$a\n```\n$b\n~~~\n\\$c");
  });
});
