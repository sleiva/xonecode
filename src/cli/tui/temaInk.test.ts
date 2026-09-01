import { describe, it, expect } from "vitest";
import { temaInk } from "./temaInk.js";
import { crearTema } from "../tema.js";

describe("temaInk", () => {
  it("cada token semántico de tema.ts tiene espejo en la TUI", () => {
    for (const clave of Object.keys(crearTema(true))) {
      expect(temaInk, `token «${clave}»`).toHaveProperty(clave);
    }
  });

  it("los tokens son hex y dark-first: el acento y el borde son azules XOne", () => {
    expect(temaInk.acento).toMatch(/^#[0-9a-f]{6}$/i);
    expect(temaInk.borde).toMatch(/^#[0-9a-f]{6}$/i);
    expect(temaInk.acento.toLowerCase()).toBe("#38bdf8");
  });
});
