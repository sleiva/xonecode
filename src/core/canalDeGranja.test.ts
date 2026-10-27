import { describe, expect, it } from "vitest";
import { EnrutadorDeCanal, copiasLibres, nombreDeCopia } from "./canalDeGranja.js";

const telefono = (serial: string, modelo: string, estado: string, slots: unknown[]) => ({ serial, state: estado, info: { model: modelo }, slots });

describe("copiasLibres", () => {
  const estado = {
    devices: [
      telefono("P3", "Pixel 3", "ready", [
        { number: 2, owner: null, state: "running" },
        { number: 1, owner: "luis", state: "running" },
      ]),
      telefono("A14", "SM-A145R", "ready", [
        { number: 2, owner: null, state: "running" },
        { number: 1, owner: null, state: "running" },
        { number: 3, owner: null, state: "error" },
      ]),
      telefono("X", "Otro", "installing", [{ number: 1, owner: null, state: "running" }]),
    ],
  };

  it("solo libres y running de teléfonos ready; primero el teléfono con más libres, y por número", () => {
    expect(copiasLibres(estado)).toEqual([
      { serial: "A14", numero: 1, telefono: "SM-A145R" },
      { serial: "A14", numero: 2, telefono: "SM-A145R" },
      { serial: "P3", numero: 2, telefono: "Pixel 3" },
    ]);
  });

  it("las descartadas no vuelven a salir; lo que no es una granja, ninguna", () => {
    // Con una libre en cada teléfono hay empate, y manda el orden de la granja.
    expect(copiasLibres(estado, [{ serial: "A14", numero: 1, telefono: "SM-A145R" }]).map((c) => `${c.serial}/${c.numero}`)).toEqual([
      "P3/2",
      "A14/2",
    ]);
    expect(copiasLibres(null)).toEqual([]);
    expect(copiasLibres({ devices: "no" })).toEqual([]);
  });

  it("una copia con el canal marcado como caído (hotswap.ok false) no se pide", () => {
    const e = { devices: [telefono("P3", "Pixel 3", "ready", [{ number: 1, owner: null, state: "running", hotswap: { ok: false } }, { number: 2, owner: null, state: "running", hotswap: { ok: true } }])] };
    expect(copiasLibres(e).map((c) => c.numero)).toEqual([2]);
  });

  it("se nombra por teléfono y número", () => {
    expect(nombreDeCopia({ serial: "P3", numero: 2, telefono: "Pixel 3" })).toBe("Pixel 3 · copia 2");
  });
});

describe("EnrutadorDeCanal", () => {
  const HOLA = JSON.stringify({ command: "server_hello", protocol_version: 6 });

  it("el saludo no consume turno y se guarda; las respuestas van por orden a quien mandó", () => {
    const e = new EnrutadorDeCanal<string>();
    expect(e.recibido(HOLA)).toBeUndefined();
    expect(e.saludo).toBe(HOLA);
    e.enviado("a");
    e.enviado("b");
    e.enviado("a");
    expect(e.recibido('{"result":1}')).toBe("a");
    expect(e.recibido('{"result":2}')).toBe("b");
    expect(e.recibido('{"result":3}')).toBe("a");
    // Una respuesta que nadie pidió no se le da a nadie.
    expect(e.recibido('{"result":4}')).toBeUndefined();
  });

  it("un cliente que se va deja su hueco: la siguiente respuesta no se desplaza a otro", () => {
    const e = new EnrutadorDeCanal<string>();
    e.enviado("a");
    e.enviado("b");
    e.olvidar("a", "-");
    expect(e.recibido("{}")).toBe("-");
    expect(e.recibido("{}")).toBe("b");
  });

  it("vaciar devuelve a quienes esperaban y olvida el saludo", () => {
    const e = new EnrutadorDeCanal<string>();
    e.recibido(HOLA);
    e.enviado("a");
    expect(e.vaciar()).toEqual(["a"]);
    expect(e.saludo).toBeUndefined();
    expect(e.recibido("{}")).toBeUndefined();
  });
});
