import { describe, expect, it } from "vitest";
import { programaDeOpenui } from "./programa.js";

describe("programaDeOpenui", () => {
  it("con valla o sin ella, el mismo programa", () => {
    const p = 'root = Stack([t])\nt = TextContent("hola")';
    expect(programaDeOpenui(p)).toBe(p);
    expect(programaDeOpenui("Aquí va:\n```openui\n" + p + "\n```\nfin")).toBe(p);
  });

  it("con varios bloques, el primero", () => {
    expect(programaDeOpenui("```openui\nroot = A\n```\n```openui\nroot = B\n```")).toBe("root = A");
  });
});
