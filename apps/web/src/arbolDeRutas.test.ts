import { describe, expect, it } from "vitest";
import { arbolDeRutas } from "./arbolDeRutas.js";

describe("arbolDeRutas", () => {
  it("agrupa por carpeta y conserva el orden en que llegan", () => {
    expect(arbolDeRutas(["app.xml", "src/a.xne", "src/b.xne"])).toEqual([
      { nombre: "app.xml", ruta: "app.xml" },
      {
        nombre: "src",
        ruta: "src",
        hijos: [
          { nombre: "a.xne", ruta: "src/a.xne" },
          { nombre: "b.xne", ruta: "src/b.xne" },
        ],
      },
    ]);
  });

  it("anida varios niveles con la ruta acumulada en cada nodo", () => {
    expect(arbolDeRutas(["src/ui/x.css"])).toEqual([
      {
        nombre: "src",
        ruta: "src",
        hijos: [{ nombre: "ui", ruta: "src/ui", hijos: [{ nombre: "x.css", ruta: "src/ui/x.css" }] }],
      },
    ]);
  });

  it("vacío da vacío, y una ruta suelta es una hoja", () => {
    expect(arbolDeRutas([])).toEqual([]);
    expect(arbolDeRutas(["a.js"])).toEqual([{ nombre: "a.js", ruta: "a.js" }]);
  });
});
