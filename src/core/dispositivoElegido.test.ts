import { describe, expect, it } from "vitest";
import {
  aparatoDeEjecutar,
  DISPOSITIVO_DE_GRANJA,
  dispositivoSegunOrigen,
  eleccionDeAparatoDelProyecto,
  origenEnVigor,
  type DispositivoDeLaSesion,
} from "./dispositivoElegido.js";

const emulador: DispositivoDeLaSesion = { id: "emulator-5554", nombre: "Pixel 8", plataforma: "android", clase: "emulador" };
const movil: DispositivoDeLaSesion = { id: "R58N", nombre: "Galaxy", plataforma: "android", clase: "fisico" };
const iphone: DispositivoDeLaSesion = { id: "UDID-1", nombre: "iPhone 16", plataforma: "ios", clase: "simulador" };

describe("dispositivoSegunOrigen", () => {
  it("en la granja, ningún aparato o un Android de este equipo pasan a ser la granja", () => {
    expect(dispositivoSegunOrigen(undefined, "granja")).toEqual(DISPOSITIVO_DE_GRANJA);
    expect(dispositivoSegunOrigen(emulador, "granja")).toEqual(DISPOSITIVO_DE_GRANJA);
    expect(dispositivoSegunOrigen(movil, "granja")).toEqual(DISPOSITIVO_DE_GRANJA);
  });

  it("en la granja un iPhone se queda: la granja es solo Android", () => {
    expect(dispositivoSegunOrigen(iphone, "granja")).toBe(iphone);
  });

  it("en este equipo la granja pasa a «ninguno» y lo demás no se toca", () => {
    expect(dispositivoSegunOrigen(DISPOSITIVO_DE_GRANJA, "local")).toBeUndefined();
    expect(dispositivoSegunOrigen(emulador, "local")).toBe(emulador);
    expect(dispositivoSegunOrigen(iphone, "local")).toBe(iphone);
    expect(dispositivoSegunOrigen(undefined, "local")).toBeUndefined();
  });
});

describe("origenEnVigor", () => {
  it("el del proyecto manda; sin él, la granja solo si el global es la granja", () => {
    expect(origenEnVigor("local", DISPOSITIVO_DE_GRANJA)).toBe("local");
    expect(origenEnVigor("granja", emulador)).toBe("granja");
    expect(origenEnVigor(undefined, DISPOSITIVO_DE_GRANJA)).toBe("granja");
    expect(origenEnVigor(undefined, emulador)).toBe("local");
    expect(origenEnVigor(undefined, undefined)).toBe("local");
  });
});

describe("aparatoDeEjecutar", () => {
  const medida = [
    { id: "emulator-5554", estado: "arrancado" },
    { id: "R58N", estado: "conectado" },
    { id: "UDID-1", estado: "apagado" },
  ];
  it("la primera preferencia A MANO manda; una apagada o desconocida se salta", () => {
    expect(aparatoDeEjecutar(medida, ["R58N", "emulator-5554"])?.id).toBe("R58N");
    expect(aparatoDeEjecutar(medida, ["UDID-1", undefined, "emulator-5554"])?.id).toBe("emulator-5554");
  });
  it("la granja nunca: no está en la medida, y sin preferencia a mano va el primero a mano", () => {
    expect(aparatoDeEjecutar(medida, [DISPOSITIVO_DE_GRANJA.id])?.id).toBe("emulator-5554");
  });
  it("sin nada a mano, o sin medida, ninguno", () => {
    expect(aparatoDeEjecutar([{ id: "UDID-1", estado: "apagado" }], ["UDID-1"])).toBeUndefined();
    expect(aparatoDeEjecutar(undefined, ["R58N"])).toBeUndefined();
  });
});

describe("eleccionDeAparatoDelProyecto", () => {
  it("global sin nada; la granja por su origen; un aparato por su id; «este equipo» sin aparato, ninguna", () => {
    expect(eleccionDeAparatoDelProyecto({})).toBe("global");
    expect(eleccionDeAparatoDelProyecto({ origen: "granja", dispositivo: emulador })).toBe("granja");
    expect(eleccionDeAparatoDelProyecto({ origen: "local", dispositivo: emulador })).toBe("emulator-5554");
    expect(eleccionDeAparatoDelProyecto({ origen: "local" })).toBeUndefined();
  });
});
