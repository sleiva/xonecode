import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { puertoDeAvd } from "./puertosDeAvd.js";

type Deps = { casa?: string; leer?: (ruta: string) => string; ejecutar?: (bin: string, args: string[]) => string };
type Lib = {
  avdDeLaSerie: (serie: string | undefined, deps?: Deps) => string | undefined;
  puertoAndroid: (explicito: string | undefined, serie: string | undefined, deps?: Deps) => number;
};

// La skill no puede importar TypeScript: la regla vive dos veces, y esto es lo que impide que diverjan.
const lib = (await import(
  pathToFileURL(resolve(__dirname, "../../skills/xone-hotswap/lib/dispositivo.mjs")).href
)) as Lib;

const settings = { dispositivos: { avds: { pixel8: { puerto: 8443 }, "pixel8-tagmyxone": { puerto: 8444, sinVentana: true as const } } } };
const leer = () => JSON.stringify(settings);
const ejecutar = (_bin: string, args: string[]) => (args[1] === "emulator-5556" ? "pixel8-tagmyxone\nOK\n" : "pixel8\nOK\n");

describe("puerto del aparato, visto desde la skill", () => {
  it("avdDeLaSerie lee la consola del emulador", () => {
    expect(lib.avdDeLaSerie("emulator-5556", { ejecutar })).toBe("pixel8-tagmyxone");
    expect(lib.avdDeLaSerie("R58M123", { ejecutar: () => { throw new Error("no debería llamarse"); } })).toBeUndefined();
    expect(lib.avdDeLaSerie("emulator-5554", { ejecutar: () => { throw new Error("adb caído"); } })).toBeUndefined();
  });

  it.each([
    ["emulator-5554", undefined, 8443],
    ["emulator-5556", undefined, 8444],
    ["emulator-5556", "9001", 9001],
    ["R58M123", undefined, 8443],
    [undefined, undefined, 8443],
  ])("serie %s, --puerto %s → %s", (serie, explicito, esperado) => {
    expect(lib.puertoAndroid(explicito, serie, { casa: "/casa", leer, ejecutar })).toBe(esperado);
  });

  it("dice lo mismo que core", () => {
    for (const avd of ["pixel8", "pixel8-tagmyxone", "otro"]) {
      // La consola del emulador contesta con el nombre del AVD que se está probando.
      const ej = () => `${avd}\nOK\n`;
      expect(lib.puertoAndroid(undefined, "emulator-5554", { casa: "/casa", leer, ejecutar: ej })).toBe(puertoDeAvd(settings.dispositivos, avd));
    }
  });

  it("un settings roto o ausente es el puerto de siempre", () => {
    expect(lib.puertoAndroid(undefined, "emulator-5556", { casa: "/casa", leer: () => "{roto", ejecutar })).toBe(8443);
    expect(lib.puertoAndroid(undefined, "emulator-5556", { casa: "/casa", leer: () => { throw Object.assign(new Error(), { code: "ENOENT" }); }, ejecutar })).toBe(8443);
  });
});
