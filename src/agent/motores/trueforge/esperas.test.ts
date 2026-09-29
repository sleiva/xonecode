import { describe, expect, it } from "vitest";
import { crearEsperas } from "./esperas.js";

describe("quién no arranca hasta que otro termine", () => {
  it("sin nadie vivo ni anunciado de quien depender, no hay nadie", () => {
    const e = crearEsperas();
    e.nacio("developer-xone", "v");
    expect(e.vivos(["designer-xone"], "v")).toEqual([]);
  });

  it("un hilo vivo cuenta, y deja de contar al terminar (y consta que terminó)", () => {
    const e = crearEsperas();
    e.nacio("designer-xone", "d");
    expect(e.vivos(["designer-xone"])).toEqual(["designer-xone"]);
    e.murio("d");
    expect(e.vivos(["designer-xone"])).toEqual([]);
    expect(e.terminados(["designer-xone", "otro"])).toEqual(["designer-xone"]);
  });

  it("uno ANUNCIADO cuenta antes de nacer, así que el orden del mismo mensaje del orquestador no importa", () => {
    const e = crearEsperas();
    e.anunciar("designer-xone"); // el orquestador pidió a los dos; el desarrollador nace primero
    expect(e.vivos(["designer-xone"], "v")).toEqual(["designer-xone"]);
    e.nacio("designer-xone", "d"); // ya nació: deja de estar solo anunciado, sigue vivo
    expect(e.vivos(["designer-xone"], "v")).toEqual(["designer-xone"]);
  });

  it("su propio hilo no cuenta aunque comparta nombre", () => {
    const e = crearEsperas();
    e.nacio("designer-xone", "d");
    expect(e.vivos(["designer-xone"], "d")).toEqual([]);
  });

  it("darPorMuertos libera a los vivos y a los anunciados pero conserva lo terminado; olvidar lo borra todo", () => {
    const e = crearEsperas();
    e.nacio("designer-xone", "d1");
    e.murio("d1");
    e.anunciar("designer-xone");
    e.nacio("designer-xone", "d2");
    e.darPorMuertos();
    expect(e.vivos(["designer-xone"])).toEqual([]);
    expect(e.terminados(["designer-xone"])).toEqual(["designer-xone"]);
    e.olvidar();
    expect(e.terminados(["designer-xone"])).toEqual([]);
  });
});
