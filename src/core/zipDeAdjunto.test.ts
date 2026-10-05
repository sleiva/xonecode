import { describe, expect, it } from "vitest";
import { carpetaDeExtraccion, esZip, planDeExtraccion, segmentoDeAdjunto } from "./zipDeAdjunto.js";

const e = (ruta: string, bytes = 10) => ({ ruta, bytes });

describe("planDeExtraccion", () => {
  it("el zip de Stitch: tres ficheros sueltos, tal cual", () => {
    expect(planDeExtraccion([e("code.html"), e("screen.png"), e("DESIGN.md")])).toEqual({
      ficheros: [
        { enElZip: "code.html", destino: "code.html" },
        { enElZip: "screen.png", destino: "screen.png" },
        { enElZip: "DESIGN.md", destino: "DESIGN.md" },
      ],
    });
  });

  it("quita una carpeta envolvente y la basura de un zip de Finder", () => {
    const plan = planDeExtraccion([e("diseno/screen.png"), e("diseno/css/a.css"), e("__MACOSX/diseno/._screen.png"), e("diseno/.DS_Store")]);
    expect(plan).toEqual({ ficheros: [{ enElZip: "diseno/screen.png", destino: "screen.png" }, { enElZip: "diseno/css/a.css", destino: "css/a.css" }] });
  });

  it("los nombres con espacios o tildes se arreglan en vez de tirar el zip", () => {
    expect(segmentoDeAdjunto("Captura de pantalla.png")).toBe("Captura_de_pantalla.png");
    expect(segmentoDeAdjunto("diseño final.png")).toBe("diseno_final.png");
    expect(planDeExtraccion([e("Captura de pantalla.png")])).toEqual({ ficheros: [{ enElZip: "Captura de pantalla.png", destino: "Captura_de_pantalla.png" }] });
  });

  it("zip slip: una entrada que se sale de su carpeta se lleva el zip ENTERO", () => {
    for (const mala of ["../../.ssh/authorized_keys", "/etc/passwd", "C:/x.txt", "a\\..\\b", "a/../b"]) {
      expect(planDeExtraccion([e("bien.png"), e(mala)])).toEqual({ error: "el .zip trae una ruta que se sale de su carpeta" });
    }
  });

  it("los topes contra un zip bomba se deciden con lo DECLARADO, antes de inflar", () => {
    expect(planDeExtraccion([e("a.bin", 40 * 1024 * 1024)])).toEqual({ error: "el .zip ocupa demasiado descomprimido" });
    expect(planDeExtraccion(Array.from({ length: 501 }, (_, i) => e(`f${i}.txt`)))).toMatchObject({ error: expect.stringContaining("más de 500") });
    expect(planDeExtraccion([e("a.png", 1000)], 999)).toEqual({ error: "descomprimido no cabe en los adjuntos de esta sesión" });
    expect(planDeExtraccion([e("__MACOSX/x")])).toEqual({ error: "el .zip está vacío" });
  });

  it("dos nombres que acabarían iguales no se pisan: se rechaza", () => {
    expect(planDeExtraccion([e("a b.png"), e("a_b.png")])).toMatchObject({ error: expect.stringContaining("mismo nombre") });
  });

  it("esZip y la carpeta de extracción, al lado del zip", () => {
    expect(esZip("x.ZIP")).toBe(true);
    expect(esZip("x.png")).toBe(false);
    expect(carpetaDeExtraccion("stitch_calculadora.zip")).toBe("stitch_calculadora");
    expect(carpetaDeExtraccion("/adjuntos/a-2.zip")).toBe("/adjuntos/a-2");
  });
});
