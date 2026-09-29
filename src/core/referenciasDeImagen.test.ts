import { describe, expect, it } from "vitest";
import { imagenReferida } from "./referenciasDeImagen.js";

describe("imagenReferida", () => {
  it("acepta los tres orígenes, con su ruta relativa", () => {
    expect(imagenReferida("/artefactos/maqueta.png")).toEqual({ origen: "artefactos", relativa: "maqueta.png", nombre: "maqueta.png" });
    expect(imagenReferida("/artefactos/diseno/screen.png")).toEqual({ origen: "artefactos", relativa: "diseno/screen.png", nombre: "screen.png" });
    expect(imagenReferida("/adjuntos/Mockup.JPG")).toEqual({ origen: "adjuntos", relativa: "Mockup.JPG", nombre: "Mockup.JPG" });
    expect(imagenReferida("/diseno/screen.png")).toEqual({ origen: "proyecto", relativa: "diseno/screen.png", nombre: "screen.png" });
  });

  it("nada de travesía ni formas raras", () => {
    for (const mala of ["/diseno/../.env", "/artefactos/../x.png", "/diseno//a.png", "/diseno/./a.png", "/dis\\eno/a.png", "/diseno/a\0.png", "/diseno/%2e%2e/a.png", "diseno/a.png"]) {
      expect(typeof imagenReferida(mala), mala).toBe("string");
    }
  });

  it("en el proyecto no se lee ningún dotfile: .env, .git, .xonecode", () => {
    for (const mala of ["/.env/a.png", "/.git/a.png", "/.xonecode/sesiones/x/adjuntos/a.png", "/diseno/.oculto/a.png", "/diseno/.a.png"]) {
      expect(imagenReferida(mala), mala).toMatch(/punto|no es/);
    }
  });

  it("solo PNG y JPEG, y las carpetas del harness no cuentan como proyecto", () => {
    for (const mala of ["/diseno/code.html", "/diseno/DESIGN.md", "/diseno/a.svg", "/diseno/sin-extension", "/skills/x/a.png", "/hotswap/a.png"]) {
      expect(typeof imagenReferida(mala), mala).toBe("string");
    }
  });

  it("una raíz sin fichero no apunta a nada", () => {
    expect(typeof imagenReferida("/artefactos/")).toBe("string");
    expect(typeof imagenReferida("/adjuntos")).toBe("string");
  });
});
