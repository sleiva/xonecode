import { describe, expect, it } from "vitest";
import {
  PUERTO_DEL_HOTSWAP,
  argsDeArranque,
  asignarPuertosDeFisicos,
  asignarPuertosPendientes,
  motivoDeNombreDeAvdInaceptable,
  motivoDePuertoInaceptable,
  puertoDeAvd,
  puertoDeDispositivo,
  puertoDeFisico,
} from "./puertosDeAvd.js";

describe("puertoDeAvd", () => {
  it("sin ajustes es el de siempre", () => {
    expect(puertoDeAvd(undefined, "pixel8")).toBe(PUERTO_DEL_HOTSWAP);
    expect(PUERTO_DEL_HOTSWAP).toBe(8443);
  });
  it("con puerto guardado, ese", () => {
    expect(puertoDeAvd({ avds: { pixel8: { puerto: 8450 } } }, "pixel8")).toBe(8450);
  });
});

describe("asignarPuertosPendientes", () => {
  it("con UN AVD lo fija en 8443: en silencio (la UI no enseña campo), pero guardado", () => {
    expect(asignarPuertosPendientes(["pixel8"], {})).toEqual({ pixel8: 8443 });
    expect(asignarPuertosPendientes([], {})).toBeUndefined();
  });
  it("el primero conserva el 8443 aunque el nuevo ordene antes", () => {
    expect(asignarPuertosPendientes(["pixel8", "aaa"], { avds: { pixel8: { puerto: 8443 } } })).toEqual({ aaa: 8444 });
  });
  it("con dos, el primero por orden conserva 8443 y el siguiente 8444", () => {
    expect(asignarPuertosPendientes(["pixel8-tagmyxone", "pixel8"], {})).toEqual({
      pixel8: 8443,
      "pixel8-tagmyxone": 8444,
    });
  });
  it("no toca un puerto guardado y salta los ocupados", () => {
    expect(
      asignarPuertosPendientes(["a", "b", "c"], { avds: { b: { puerto: 8443 } } }),
    ).toEqual({ a: 8444, c: 8445 });
  });
  it("nada pendiente es undefined", () => {
    expect(asignarPuertosPendientes(["a", "b"], { avds: { a: { puerto: 8443 }, b: { puerto: 9000 } } })).toBeUndefined();
  });
  it("salta el puerto de un móvil físico (IXCODE-32)", () => {
    expect(asignarPuertosPendientes(["pixel8"], { fisicos: { R58M123: { puerto: 8443 } } })).toEqual({ pixel8: 8444 });
  });
});

/**
 * IXCODE-32: un físico iba SIEMPRE al 8443, que es también el del primer AVD. `adb forward` es una
 * tabla de la máquina y el último que lo pide se queda el puerto, así que la sesión del móvil
 * acababa hablando con el emulador sin error.
 */
describe("el puerto de un físico", () => {
  const conAvd = { avds: { pixel8: { puerto: 8443 } } };
  it("guardado, ése", () => {
    expect(puertoDeFisico({ ...conAvd, fisicos: { R58M123: { puerto: 8450 } } }, "R58M123")).toBe(8450);
  });
  it("sin guardar, el primero libre: nunca el de un AVD", () => {
    expect(puertoDeFisico(conAvd, "R58M123")).toBe(8444);
    expect(puertoDeFisico({ avds: { a: { puerto: 8443 }, b: { puerto: 8444 } } }, "R58M123")).toBe(8445);
    expect(puertoDeFisico(undefined, "R58M123")).toBe(PUERTO_DEL_HOTSWAP);
  });
  it("puertoDeDispositivo: AVD por su AVD, físico por su serie", () => {
    const ajustes = { ...conAvd, fisicos: { R58M123: { puerto: 8444 } } };
    expect(puertoDeDispositivo(ajustes, { id: "emulator-5554", clase: "emulador", avd: "pixel8" })).toBe(8443);
    expect(puertoDeDispositivo(ajustes, { id: "R58M123", clase: "fisico" })).toBe(8444);
    // Un emulador sin AVD identificado: el de siempre, como hasta ahora.
    expect(puertoDeDispositivo(ajustes, { id: "emulator-5556", clase: "emulador" })).toBe(PUERTO_DEL_HOTSWAP);
  });
  it("asignarPuertosDeFisicos: solo añade, salta los de AVD y los de otros físicos", () => {
    expect(asignarPuertosDeFisicos(["R58M123", "ZY22"], { ...conAvd, fisicos: { ZY22: { puerto: 8444 } } })).toEqual({ R58M123: 8445 });
    expect(asignarPuertosDeFisicos(["ZY22"], { fisicos: { ZY22: { puerto: 8444 } } })).toBeUndefined();
    expect(asignarPuertosDeFisicos([], conAvd)).toBeUndefined();
    // Lo que no tiene forma de serie no se siembra.
    expect(asignarPuertosDeFisicos(["a b", ""], conAvd)).toBeUndefined();
  });
  it("el que propone la siembra es el mismo que se usa sin sembrar", () => {
    const pendientes = asignarPuertosDeFisicos(["R58M123"], conAvd);
    expect(pendientes?.["R58M123"]).toBe(puertoDeFisico(conAvd, "R58M123"));
  });
});

describe("motivoDePuertoInaceptable", () => {
  const ajustes = { avds: { pixel8: { puerto: 8443 } } };
  it.each([[80], [70000], [8443.5], [5554], [5585]])("rechaza %s", (p) => {
    expect(motivoDePuertoInaceptable(p, "otro", ajustes)).toBeTypeOf("string");
  });
  it("rechaza el de otro AVD y acepta el propio", () => {
    expect(motivoDePuertoInaceptable(8443, "otro", ajustes)).toMatch(/pixel8/);
    expect(motivoDePuertoInaceptable(8443, "pixel8", ajustes)).toBeUndefined();
    expect(motivoDePuertoInaceptable(8444, "otro", ajustes)).toBeUndefined();
  });
  it("rechaza el de un móvil físico", () => {
    expect(motivoDePuertoInaceptable(8444, "otro", { ...ajustes, fisicos: { R58M123: { puerto: 8444 } } })).toMatch(/R58M123/);
  });
});

describe("motivoDeNombreDeAvdInaceptable", () => {
  it.each([[""], ["-x"], ["a b"], ["a/b"], ["x".repeat(65)]])("rechaza «%s»", (n) => {
    expect(motivoDeNombreDeAvdInaceptable(n, [])).toBeTypeOf("string");
  });
  it("rechaza uno que ya existe y acepta uno nuevo", () => {
    expect(motivoDeNombreDeAvdInaceptable("pixel8", ["pixel8"])).toMatch(/ya existe/);
    expect(motivoDeNombreDeAvdInaceptable("pixel8-tagmyxone", ["pixel8"])).toBeUndefined();
  });
});

describe("argsDeArranque", () => {
  it("sin ventana añade las tres banderas", () => {
    expect(argsDeArranque("pixel8", { sinVentana: true })).toEqual(["-avd", "pixel8", "-no-window", "-no-audio", "-no-metrics"]);
    expect(argsDeArranque("pixel8", {})).toEqual(["-avd", "pixel8"]);
  });
});
