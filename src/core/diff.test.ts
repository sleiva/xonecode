/**
 * Tests del diff de líneas de `core/diff.ts`: el ANTES contra el DESPUÉS de una
 * escritura pendiente de aprobación.
 *
 * Es PURO (cadenas dentro, cadenas fuera) porque quién aprueba y de dónde salen el
 * antes y el después no son cosa suya: aquí solo se compara texto. El recorte por
 * presupuesto (contexto alrededor de los cambios, techo de líneas) también es
 * determinista y se prueba aquí, no a ojo en el terminal.
 */

import { describe, it, expect } from "vitest";
import { diffDeLineas, conContexto, recortar } from "./diff.js";

describe("diffDeLineas", () => {
  it("un fichero NUEVO (antes vacío) sale entero como añadido", () => {
    const d = diffDeLineas("", "<coll>\n</coll>\n");
    expect(d).toEqual([
      { tipo: "anadido", texto: "<coll>" },
      { tipo: "anadido", texto: "</coll>" },
    ]);
  });

  it("dos textos IGUALES no producen líneas de cambio", () => {
    expect(diffDeLineas("a\nb\n", "a\nb\n")).toEqual([
      { tipo: "igual", texto: "a" },
      { tipo: "igual", texto: "b" },
    ]);
  });

  it("un cambio en medio deja claro qué se quita y qué se pone, con su contexto", () => {
    const antes = "<prop name=\"titulo\">Viejo</prop>\n<prop name=\"orientacion\">portrait</prop>";
    const despues = "<prop name=\"titulo\">Nuevo</prop>\n<prop name=\"orientacion\">portrait</prop>";
    expect(diffDeLineas(antes, despues)).toEqual([
      { tipo: "quitado", texto: '<prop name="titulo">Viejo</prop>' },
      { tipo: "anadido", texto: '<prop name="titulo">Nuevo</prop>' },
      { tipo: "igual", texto: '<prop name="orientacion">portrait</prop>' },
    ]);
  });

  it("una INSERCIÓN en medio no cuenta la línea desplazada como quitada y vuelta a poner", () => {
    const antes = "uno\ntres";
    const despues = "uno\ndos\ntres";
    expect(diffDeLineas(antes, despues)).toEqual([
      { tipo: "igual", texto: "uno" },
      { tipo: "anadido", texto: "dos" },
      { tipo: "igual", texto: "tres" },
    ]);
  });

  it("un borrón sale como quitado, sin inventar añadidos", () => {
    expect(diffDeLineas("uno\ndos\ntres", "uno\ntres")).toEqual([
      { tipo: "igual", texto: "uno" },
      { tipo: "quitado", texto: "dos" },
      { tipo: "igual", texto: "tres" },
    ]);
  });

  it("ficheros ENORMES no calculan el LCS: entero reescrito, quitado todo y añadido todo", () => {
    const grande = Array.from({ length: 1000 }, (_, i) => `línea ${i}`).join("\n");
    const d = diffDeLineas(grande, grande + "\nfinal");
    // 1000×1001 celdas supera el guardián: el fallback es lineal y sigue contando la
    // verdad (qué se quita, qué se pone), solo que sin deduplicar lo que se mantiene.
    expect(d.filter((l) => l.tipo === "quitado")).toHaveLength(1000);
    expect(d.filter((l) => l.tipo === "anadido")).toHaveLength(1001);
    expect(d.some((l) => l.tipo === "igual")).toBe(false);
  });
});

describe("conContexto", () => {
  const cambio = (lineas: Array<[string, string]>): ReturnType<typeof diffDeLineas> =>
    lineas.map(([tipo, texto]) => ({ tipo: tipo as "igual" | "anadido" | "quitado", texto }));

  it("una racha de iguales LARGA se recorta a 2 líneas alrededor de cada cambio", () => {
    const d = cambio([
      ["igual", "1"], ["igual", "2"], ["igual", "3"], ["igual", "4"],
      ["anadido", "NUEVA"],
      ["igual", "5"], ["igual", "6"], ["igual", "7"], ["igual", "8"],
    ]);
    expect(conContexto(d, 2)).toEqual([
      { tipo: "igual", texto: "3" },
      { tipo: "igual", texto: "4" },
      { tipo: "anadido", texto: "NUEVA" },
      { tipo: "igual", texto: "5" },
      { tipo: "igual", texto: "6" },
    ]);
  });

  it("dos cambios cercanos comparten el contexto; separarse mantiene cada uno el suyo", () => {
    const d = cambio([
      ["anadido", "A"],
      ["igual", "1"], ["igual", "2"], ["igual", "3"],
      ["quitado", "B"],
    ]);
    // gap de 3 > 2*2: son dos trozos, y el del medio se recorta a los bordes.
    expect(conContexto(d, 2)).toEqual([
      { tipo: "anadido", texto: "A" },
      { tipo: "igual", texto: "1" },
      { tipo: "igual", texto: "2" },
      { tipo: "igual", texto: "3" },
      { tipo: "quitado", texto: "B" },
    ]);
    const juntos = cambio([
      ["anadido", "A"],
      ["igual", "1"],
      ["quitado", "B"],
    ]);
    expect(conContexto(juntos, 2)).toEqual(juntos);
  });
});

describe("recortar", () => {
  it("más allá del techo, se listan las primeras y se declara cuántas faltan", () => {
    const d = diffDeLineas("", Array.from({ length: 40 }, (_, i) => `línea ${i}`).join("\n"));
    const r = recortar(d, 10);
    expect(r.lineas).toHaveLength(10);
    expect(r.recortadas).toBe(30);
    expect(r.lineas[0]).toEqual({ tipo: "anadido", texto: "línea 0" });
  });

  it("dentro del techo, todo y cero recortadas", () => {
    const d = diffDeLineas("a", "b");
    const r = recortar(d, 10);
    expect(r.lineas).toEqual([
      { tipo: "quitado", texto: "a" },
      { tipo: "anadido", texto: "b" },
    ]);
    expect(r.recortadas).toBe(0);
  });
});