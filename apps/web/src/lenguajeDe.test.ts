import { describe, expect, it } from "vitest";
import { lenguajeDe } from "./lenguajeDe.js";

describe("lenguajeDe", () => {
  it("es una tabla CERRADA por extensión, sin distinguir mayúsculas", () => {
    expect(lenguajeDe("app/Clientes.XNE")).toBe("xml");
    expect(lenguajeDe("app.xml")).toBe("xml");
    expect(lenguajeDe("scripts/a.js")).toBe("javascript");
    expect(lenguajeDe("a.css")).toBe("css");
    expect(lenguajeDe("a.ini")).toBe("ini");
    expect(lenguajeDe("a.json")).toBe("json");
    expect(lenguajeDe("README.md")).toBe("markdown");
    // El HTML entró con los ARTEFACTOS: su fuente es lo que más se lee en esa pestaña, y
    // sin esto salía plana y sin números de línea (medido en el navegador).
    expect(lenguajeDe("/artefactos/diagrama.html")).toBe("html");
    expect(lenguajeDe("notas.txt")).toBeUndefined();
    expect(lenguajeDe("Makefile")).toBeUndefined();
    expect(lenguajeDe("x.bin")).toBeUndefined();
    // Un nombre que es una propiedad heredada no puede resolver nada.
    expect(lenguajeDe("x.constructor")).toBeUndefined();
  });
});
