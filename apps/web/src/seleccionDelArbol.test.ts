import { describe, expect, it } from "vitest";
import { arbolDeRutas } from "./arbolDeRutas.js";
import { alternarCasilla, estadoDeCasilla, hojasDe, todasLasHojas } from "./seleccionDelArbol.js";

const ARBOL = arbolDeRutas(["app.xml", "fonts/a.ttf", "fonts/b.ttf", "fonts/sub/c.ttf"]);
const fonts = ARBOL.find((n) => n.nombre === "fonts")!;
const sub = fonts.hijos!.find((n) => n.nombre === "sub")!;

describe("seleccionDelArbol", () => {
  it("las hojas de una carpeta son todo lo que cuelga de ella, a cualquier profundidad", () => {
    expect(hojasDe(fonts)).toEqual(["fonts/a.ttf", "fonts/b.ttf", "fonts/sub/c.ttf"]);
    expect(todasLasHojas(ARBOL)).toHaveLength(4);
  });

  it("marcar una carpeta marca todo lo de dentro, y desmarcarla lo desmarca", () => {
    const marcadas = alternarCasilla(fonts, new Set());
    expect([...marcadas].sort()).toEqual(["fonts/a.ttf", "fonts/b.ttf", "fonts/sub/c.ttf"]);
    expect(estadoDeCasilla(sub, marcadas)).toBe("todas");
    expect(alternarCasilla(fonts, marcadas).size).toBe(0);
  });

  it("al revés: el estado de la carpeta sale de sus hijos", () => {
    let marcadas = new Set(todasLasHojas(ARBOL));
    marcadas = alternarCasilla(sub.hijos![0]!, marcadas);
    expect(estadoDeCasilla(sub, marcadas)).toBe("ninguna");
    expect(estadoDeCasilla(fonts, marcadas)).toBe("algunas");
    marcadas = alternarCasilla(fonts.hijos![0]!, alternarCasilla(fonts.hijos![1]!, marcadas));
    expect(estadoDeCasilla(fonts, marcadas)).toBe("ninguna");
  });

  it("una carpeta a medias se marca ENTERA al pulsarla", () => {
    const marcadas = alternarCasilla(fonts, new Set(["fonts/a.ttf"]));
    expect(estadoDeCasilla(fonts, marcadas)).toBe("todas");
  });
});
