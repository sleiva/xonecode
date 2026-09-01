import { describe, it, expect } from "vitest";
import { temaInk } from "./temaInk.js";
import { crearTema } from "../tema.js";

describe("temaInk", () => {
  it("cada token semántico de tema.ts tiene espejo en la TUI", () => {
    for (const clave of Object.keys(crearTema(true))) {
      expect(temaInk, `token «${clave}»`).toHaveProperty(clave);
    }
  });

  it("espejo inverso: temaInk no inventa claves que tema.ts no conoce (salvo las de TUI, declaradas)", () => {
    // La mitad que falta del contrato: si `temaInk` creara una clave propia sin
    // declararla, la TUI estaría hablando en un vocabulario que el tema semántico
    // no comparte — y un token nuevo de tema.ts podría quedarse sin espejo sin
    // que nadie lo vea. Las de TUI son de LAYOUT/pantalla, no de significado:
    // `acento` y `borde` pintan cajas, `fondoInput` es el fondo del cuadro de entrada.
    const soloTui = ["acento", "borde", "fondoInput"];
    const conocidas = new Set(Object.keys(crearTema(true)));
    for (const clave of Object.keys(temaInk)) {
      expect(conocidas.has(clave) || soloTui.includes(clave), `token «${clave}» de temaInk`).toBe(true);
    }
  });

  it("los tokens son hex y dark-first: el acento y el borde son azules XOne", () => {
    expect(temaInk.acento).toMatch(/^#[0-9a-f]{6}$/i);
    expect(temaInk.borde).toMatch(/^#[0-9a-f]{6}$/i);
    expect(temaInk.acento.toLowerCase()).toBe("#38bdf8");
  });
});
