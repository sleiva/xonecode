import { describe, expect, it } from "vitest";
import {
  PUERTO_DEL_HOTSWAP,
  argsDeArranque,
  asignarPuertosPendientes,
  motivoDeNombreDeAvdInaceptable,
  motivoDePuertoInaceptable,
  puertoDeAvd,
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
