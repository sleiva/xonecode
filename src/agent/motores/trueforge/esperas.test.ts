import { describe, expect, it } from "vitest";
import { crearEsperas } from "./esperas.js";

const resuelta = async (p: Promise<unknown>): Promise<boolean> => {
  let hecho = false;
  void p.then(() => (hecho = true));
  await new Promise((r) => setTimeout(r, 5));
  return hecho;
};

describe("quién espera a quién entre hijos lanzados a la vez", () => {
  it("sin nadie vivo de quien esperar, no espera y no dice a nadie", async () => {
    const e = crearEsperas();
    e.nacio("developer-xone", "h1");
    expect(await e.esperarA(["designer-xone"], "h1")).toEqual([]);
  });

  it("con el diseñador vivo espera, y se suelta al terminar diciendo a quién esperó", async () => {
    const e = crearEsperas();
    e.nacio("designer-xone", "d");
    e.nacio("developer-xone", "v");
    const espera = e.esperarA(["designer-xone"], "v");
    expect(await resuelta(espera)).toBe(false);
    e.murio("d");
    expect(await espera).toEqual(["designer-xone"]);
  });

  it("con dos hilos del mismo especialista espera a los dos", async () => {
    const e = crearEsperas();
    e.nacio("designer-xone", "d1");
    e.nacio("designer-xone", "d2");
    const espera = e.esperarA(["designer-xone"], "v");
    e.murio("d1");
    expect(await resuelta(espera)).toBe(false);
    e.murio("d2");
    expect(await espera).toEqual(["designer-xone"]);
  });

  it("su propio hilo no cuenta aunque comparta nombre", async () => {
    const e = crearEsperas();
    e.nacio("designer-xone", "d");
    expect(await e.esperarA(["designer-xone"], "d")).toEqual([]);
  });

  it("darPorMuertos libera a quien esperaba (un turno cortado no deja a nadie colgado)", async () => {
    const e = crearEsperas();
    e.nacio("designer-xone", "d");
    const espera = e.esperarA(["designer-xone"], "v");
    e.darPorMuertos();
    expect(await espera).toEqual(["designer-xone"]);
  });

  it("una espera que no se resuelve se suelta al llegar al tope", async () => {
    const e = crearEsperas(20);
    e.nacio("designer-xone", "d");
    expect(await e.esperarA(["designer-xone"], "v")).toEqual(["designer-xone"]);
  });
});
