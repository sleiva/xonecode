import { describe, it, expect } from "vitest";
import { aHtml } from "./markdown.js";

describe("markdown", () => {
  it("renderiza lo básico", () => {
    expect(aHtml("# Hola")).toContain("<h1");
    expect(aHtml("- uno\n- dos")).toContain("<li");
    expect(aHtml("`x`")).toContain("<code");
  });

  it("SANEA: el texto lo escribe un modelo, y un script no puede sobrevivir", () => {
    expect(aHtml("<script>alert(1)</script>")).not.toContain("<script");
    expect(aHtml('<img src=x onerror="alert(1)">')).not.toContain("onerror");
    expect(aHtml("[pincha](javascript:alert(1))")).not.toContain("javascript:");
  });
});
