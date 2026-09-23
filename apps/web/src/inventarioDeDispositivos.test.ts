import { describe, expect, it } from "vitest";
import { etiquetaDeEstado, inventario, seLlegaAlDispositivo } from "./inventarioDeDispositivos.js";
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

/**
 * **Un emulador se ARRANCA, no se conecta.**
 *
 * `adb devices` contesta `device` y de ahí salía «conectado» para un emulador, mientras que un
 * simulador de iOS —el mismo hecho— salía «arrancado». Conectar es lo que se hace con un
 * cable, así que la palabra que menos encajaba era justo la que se estaba usando.
 */
describe("etiquetaDeEstado", () => {
  it("dice «arrancado» de un emulador o simulador al que se llega, y «conectado» de un físico", () => {
    expect(etiquetaDeEstado({ estado: "conectado", clase: "emulador" })).toBe("arrancado");
    expect(etiquetaDeEstado({ estado: "conectado", clase: "simulador" })).toBe("arrancado");
    expect(etiquetaDeEstado({ estado: "conectado", clase: "fisico" })).toBe("conectado");
  });

  it("y no toca los demás estados, que no son ese hecho", () => {
    expect(etiquetaDeEstado({ estado: "apagado", clase: "emulador" })).toBe("apagado");
    expect(etiquetaDeEstado({ estado: "sin-autorizar", clase: "fisico" })).toBe("sin autorizar");
    expect(etiquetaDeEstado({ estado: "offline", clase: "emulador" })).toBe("offline");
  });
});

describe("inventario: los emuladores de Android no se entierran bajo los simuladores de iOS", () => {
  it("con el AVD apagado y 46 simuladores de iOS apagados, el AVD va PRIMERO entre los apagados", () => {
    // Medido en su pantalla: «me salen simuladores de iOS apagados pero no me sale el Android».
    // El AVD se añadía al FINAL, detrás de los 46.
    const simuladores: Dispositivo[] = Array.from({ length: 46 }, (_, i) => ({
      id: `SIM-${i}`,
      nombre: `iPhone ${i}`,
      plataforma: "ios",
      clase: "simulador",
      estado: "apagado",
    }));
    const informe = {
      sistema: "mac",
      medido: "2026-09-23T10:30:00.000Z",
      herramientas: [],
      dispositivos: simuladores,
      avds: ["pixel8"],
      recetas: [],
    } as unknown as InformeDeDispositivos;
    const { virtuales } = inventario(informe);
    expect(virtuales[0]!.nombre).toBe("pixel8");
    expect(virtuales).toHaveLength(47);
  });

  it("lo que está a MANO sigue primero, sea de la plataforma que sea", () => {
    const informe = {
      sistema: "mac",
      medido: "2026-09-23T10:30:00.000Z",
      herramientas: [],
      dispositivos: [
        { id: "SIM-A", nombre: "iPhone arrancado", plataforma: "ios", clase: "simulador", estado: "arrancado" },
        { id: "SIM-B", nombre: "iPhone apagado", plataforma: "ios", clase: "simulador", estado: "apagado" },
      ],
      avds: ["pixel8"],
      recetas: [],
    } as unknown as InformeDeDispositivos;
    expect(inventario(informe).virtuales.map((d) => d.nombre)).toEqual(["iPhone arrancado", "pixel8", "iPhone apagado"]);
  });
});
