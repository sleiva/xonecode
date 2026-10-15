import { describe, expect, it } from "vitest";

describe("un encabezado al empezar no es el título", () => {
  it("la petición de Maset: «Resumen» y luego la frase", async () => {
    const { tituloDesde } = await import("./textos.js");
    expect(tituloDesde("Resumen\n\nImplementar el nuevo diseño del menú principal para el proyecto de Stish.\n\nContexto")).toBe(
      "Implementar el nuevo diseño del menú principal para el…"
    );
    expect(tituloDesde("## Contexto:\nArregla el login")).toBe("Arregla el login");
    // Una sola palabra y nada más sigue siendo el título.
    expect(tituloDesde("Hola")).toBe("Hola");
  });
});
