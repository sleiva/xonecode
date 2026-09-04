import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { render, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import { Maqueta } from "./Maqueta.js";

afterEach(cleanup);

const AQUI = dirname(fileURLToPath(import.meta.url));

describe("Maqueta", () => {
  it("la barra va PRIMERO en el DOM: a la izquierda, como pidió el usuario al final — no a la derecha, que fue lo que pidió antes", () => {
    const { container } = render(
      <Maqueta centro={<div data-testid="centro">centro</div>} barra={<div data-testid="barra">barra</div>} />
    );
    const raiz = container.firstElementChild;
    expect(raiz?.children[0]?.tagName).toBe("ASIDE");
    expect(raiz?.children[0]?.querySelector("[data-testid='barra']")).not.toBeNull();
    expect(raiz?.children[1]?.querySelector("[data-testid='centro']")).not.toBeNull();
  });

  it("el borde vive en el lado que de verdad toca al centro: border-right, no border-left", () => {
    // Una posición es una propiedad tan comprobable como un color: mover la barra sin
    // mover el borde deja un borde duplicado o ausente en el lado nuevo, y eso un test
    // de DOM no lo ve — solo mirar el CSS lo pilla.
    const css = readFileSync(join(AQUI, "Maqueta.module.css"), "utf8");
    expect(css).toMatch(/\.barra\s*\{[^}]*border-right/);
    expect(css).not.toMatch(/\.barra\s*\{[^}]*border-left/);
  });
});
