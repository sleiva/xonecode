import { describe, expect, it } from "vitest";
import { DISPOSITIVO_DE_GRANJA, dispositivoSegunOrigen, origenEnVigor, type DispositivoDeLaSesion } from "./dispositivoElegido.js";

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
