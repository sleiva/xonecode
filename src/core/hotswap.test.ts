import { describe, expect, it } from "vitest";
import { carpetaDeHotswap, RUTA_HOTSWAP } from "./hotswap.js";

describe("dónde cae lo que una shell saca del contexto", () => {
  it("es HERMANA de la de artefactos, no una subcarpeta suya", () => {
    // Hermana y no dentro: `anunciarArtefactosDeLaShell` fotografía la carpeta de artefactos
    // ENTERA —desde que la foto es recursiva—, así que un `hotswap/` colgando de ella
    // volvería a llenar la pestaña de volcados. La misma razón, y el mismo sitio, que
    // `carpetaDeDescargas`.
    const artefactos = "/w/proy/.xonecode/sesiones/s1/artefactos";
    expect(carpetaDeHotswap(artefactos)).toBe("/w/proy/.xonecode/sesiones/s1/hotswap");
  });

  it("y sigue a la sesión, porque de ella se deriva", () => {
    expect(carpetaDeHotswap("/w/proy/.xonecode/sesiones/otra/artefactos")).toBe(
      "/w/proy/.xonecode/sesiones/otra/hotswap"
    );
    // En el terminal no hay sesión con identidad y la carpeta es del proyecto: el mismo
    // reparto que las descargas, sin decisión propia que tomar.
    expect(carpetaDeHotswap("/w/proy/.xonecode/artefactos")).toBe("/w/proy/.xonecode/hotswap");
  });

  it("la ruta virtual lleva barra final, como todas las raíces montadas", () => {
    // `CompositeBackend` la retira antes de delegar; sin ella reconstruye `//nombre`, fuera
    // de la raíz montada. La trampa medida con `/skills/`.
    expect(RUTA_HOTSWAP.endsWith("/")).toBe(true);
    expect(RUTA_HOTSWAP.startsWith("/")).toBe(true);
  });
});
