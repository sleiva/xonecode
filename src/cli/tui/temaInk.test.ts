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
    // `acento` y `borde` pintan cajas, `fondoInput` es el fondo del cuadro de entrada,
    // `marca` es la barra izquierda de los bloques y `fase` el color de «+ fase: Ns».
    const soloTui = ["acento", "borde", "fondoInput", "marca", "fase"];
    const conocidas = new Set(Object.keys(crearTema(true)));
    for (const clave of Object.keys(temaInk)) {
      expect(conocidas.has(clave) || soloTui.includes(clave), `token «${clave}» de temaInk`).toBe(true);
    }
  });

  it("la paleta es la de xone.es, medida en su CSS: acento, prompt, marca y fase en hex minúsculas", () => {
    // #00396f (navy) y #47abd6 (azul claro) son los dos colores dominantes de xone.es;
    // #2ac4ea es su cian. El navy NUNCA es color de texto: sobre fondo oscuro no se lee,
    // así que solo pinta barras (`marca`).
    for (const clave of ["acento", "prompt", "marca", "fase"] as const) {
      expect(temaInk[clave], clave).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(temaInk.acento).toBe("#47abd6");
    expect(temaInk.prompt).toBe("#2ac4ea");
    expect(temaInk.marca).toBe("#00396f");
    expect(temaInk.fase).toBe("#e0a458");
  });
});
