import { describe, expect, it } from "vitest";
import { inventario, seLlegaAlDispositivo } from "./inventarioDeDispositivos.js";
import type { Dispositivo, InformeDeDispositivos } from "./tipos.js";

/** Una foto mínima: lo que el inventario mira y nada más. */
const foto = (
  dispositivos: Dispositivo[],
  avds: string[] = []
): InformeDeDispositivos => ({
  medido: "2026-09-17T10:00:00.000Z",
  sistema: "mac",
  herramientas: [],
  dispositivos,
  avds,
});

const emuladorEnMarcha: Dispositivo = {
  // El serial es lo ÚNICO que ata un emulador a su AVD, y `model:` no lo dice: la imagen
  // `google_apis` contesta `sdk_gphone64_arm64` mientras el AVD se llama `pixel8`.
  id: "emulator-5554",
  nombre: "sdk gphone64 arm64",
  plataforma: "android",
  clase: "emulador",
  estado: "conectado",
  avd: "pixel8",
};

describe("el inventario no duplica un emulador arrancado", () => {
  /**
   * **El test que antes no se podía escribir.**
   *
   * El emparejamiento AVD ↔ emulador se hacía por NOMBRE VISIBLE, y los dos lados no podían
   * coincidir nunca: `emulator -list-avds` da `pixel8` y `adb devices -l` da
   * `sdk gphone64 arm64`. Así que el filtro no filtraba y el AVD arrancado se añadía además
   * como «apagado»: dos filas para un aparato, y una de ellas diciendo lo contrario de la
   * verdad. Medido en la máquina del usuario con `pixel8` en marcha.
   *
   * Lo que lo arregla es un dato que solo el host puede medir (`avd`, de
   * `adb -s <serial> emu avd name`), porque el cliente no habla con la máquina.
   */
  it("con el AVD en marcha sale UNA fila, la del emulador de verdad", () => {
    const { virtuales } = inventario(foto([emuladorEnMarcha], ["pixel8"]));
    expect(virtuales.map((d) => d.id)).toEqual(["emulator-5554"]);
  });

  it("un AVD que NO está arrancado sigue listándose como apagado: es lo que se puede arrancar", () => {
    const { virtuales } = inventario(foto([emuladorEnMarcha], ["pixel8", "tablet9"]));
    expect(virtuales.map((d) => d.id)).toEqual(["emulator-5554", "avd:tablet9"]);
    expect(virtuales.find((d) => d.id === "avd:tablet9")?.estado).toBe("apagado");
  });

  /**
   * **Límite declarado.** Sin `avd` medido no se puede atribuir, y entonces el AVD se sigue
   * listando: es el comportamiento de antes para ese caso. Se prefiere una fila de más a
   * esconder un AVD que sí se puede arrancar — y ocurre solo si la consola del emulador no
   * contesta o si es un emulador de terceros.
   */
  it("sin `avd` medido no se atribuye, y el AVD se sigue ofreciendo", () => {
    const { avd: _sinMedir, ...sinAvd } = emuladorEnMarcha;
    const { virtuales } = inventario(foto([sinAvd], ["pixel8"]));
    expect(virtuales.map((d) => d.id)).toEqual(["emulator-5554", "avd:pixel8"]);
  });
});

/**
 * **Un solo vocabulario para «se llega al dispositivo».**
 *
 * `parsearAdbDevices` dice `conectado` y `parsearSimctl` dice `arrancado` para el mismo
 * hecho, y el tipo admite los dos a propósito. El render los tenía partidos: la lista de
 * simuladores miraba solo `arrancado`, así que un emulador de Android en marcha —que llega
 * como `conectado`— salía con el punto gris en una lista donde iOS sí ponía el verde.
 */
describe("se llega al dispositivo", () => {
  it("es cierto con los DOS nombres del mismo hecho", () => {
    expect(seLlegaAlDispositivo({ ...emuladorEnMarcha, estado: "conectado" })).toBe(true);
    expect(seLlegaAlDispositivo({ ...emuladorEnMarcha, estado: "arrancado" })).toBe(true);
  });

  it("y falso en los cuatro que no son ese hecho", () => {
    for (const estado of ["apagado", "sin-autorizar", "offline", "no-disponible"] as const) {
      expect(seLlegaAlDispositivo({ ...emuladorEnMarcha, estado })).toBe(false);
    }
  });
});
