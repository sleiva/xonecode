import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { argsDeArranque, puertoDeAvd } from "./puertosDeAvd.js";
import { validarSettings } from "./settings.js";

type Deps = { casa?: string; leer?: (ruta: string) => string; ejecutar?: (bin: string, args: string[]) => string };
type Lib = {
  avdDeLaSerie: (serie: string | undefined, deps?: Deps) => string | undefined;
  serieAndroid: (explicita: string | undefined, deps?: Deps & { entorno?: Record<string, string>; adb?: string }) => { serie: string | undefined; porque: string };
  puertoConMotivo: (explicito: string | undefined, serie: string | undefined, deps?: Deps) => { puerto: number; porque?: string };
  BANDERAS_SIN_VENTANA: string[];
  retirarOpciones: (a: string[], n: string[]) => { opciones: Record<string, string | undefined>; resto: string[] };
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

  it("con datos raros guardados, el mismo puerto que core tras validar", () => {
    for (const puerto of [80, "8444", 1023, 65536, 8443.5, 9001]) {
      const crudo = { dispositivos: { avds: { pixel8: { puerto } } } };
      const enCore = puertoDeAvd(validarSettings(crudo).settings.dispositivos, "pixel8");
      const ej = () => "pixel8\nOK\n";
      expect(lib.puertoAndroid(undefined, "emulator-5554", { casa: "/casa", leer: () => JSON.stringify(crudo), ejecutar: ej }), String(puerto)).toBe(enCore);
    }
    // Un nombre sin la forma de AVD tampoco cuenta.
    const crudo = { dispositivos: { avds: { "-x": { puerto: 9001 } } } };
    expect(lib.puertoAndroid(undefined, "emulator-5554", { casa: "/casa", leer: () => JSON.stringify(crudo), ejecutar: () => "-x\nOK\n" })).toBe(8443);
  });

  it("las banderas de «sin ventana» son las de core", () => {
    expect(lib.BANDERAS_SIN_VENTANA).toEqual(argsDeArranque("x", { sinVentana: true }).slice(2));
  });

  it("la vuelta a 8443 por no saber el AVD se dice; un físico o un AVD sin puerto, no", () => {
    const cae = () => { throw new Error("adb caído"); };
    expect(lib.puertoConMotivo(undefined, "emulator-5556", { casa: "/casa", leer, ejecutar: cae })).toMatchObject({ puerto: 8443, porque: expect.stringContaining("emulator-5556") });
    expect(lib.puertoConMotivo(undefined, "R58M123", { casa: "/casa", leer, ejecutar: cae }).porque).toBeUndefined();
    expect(lib.puertoConMotivo(undefined, "emulator-5556", { casa: "/casa", leer, ejecutar }).porque).toBeUndefined();
    expect(lib.puertoConMotivo("9001", "emulator-5556", { casa: "/casa", leer, ejecutar: cae })).toEqual({ puerto: 9001 });
  });

  it("serieAndroid: un adb que falla o vence no cuelga ni tumba, cae en «sin elegir»", () => {
    const entorno = {} as Record<string, string>;
    expect(lib.serieAndroid(undefined, { entorno, ejecutar: () => { throw new Error("ETIMEDOUT"); } })).toEqual({ serie: undefined, porque: "sin elegir" });
    const r = lib.serieAndroid(undefined, { entorno, ejecutar: () => "List of devices attached\nemulator-5556\tdevice\n" });
    expect(r.serie).toBe("emulator-5556");
  });

  describe("retirarOpciones", () => {
    const n = ["--puerto", "--serie"];
    it("sin banderas, el resto es la entrada", () => {
      const e = ["click", "name=X", "--", "click", "name=Y", "--dry-run"];
      expect(lib.retirarOpciones(e, n)).toEqual({ opciones: {}, resto: e });
    });
    it.each([
      [["--puerto", "9000", "click", "name=X"]],
      [["click", "--puerto", "9000", "name=X"]],
      [["click", "name=X", "--puerto", "9000"]],
    ])("--puerto en cualquier sitio: %j", (e) => {
      expect(lib.retirarOpciones(e, n)).toEqual({ opciones: { "--puerto": "9000" }, resto: ["click", "name=X"] });
    });
    it("--serie y --puerto juntos, o solo --serie", () => {
      expect(lib.retirarOpciones(["--serie", "emulator-5556", "click", "--puerto", "9000", "name=X", "--", "screen"], n)).toEqual({
        opciones: { "--serie": "emulator-5556", "--puerto": "9000" },
        resto: ["click", "name=X", "--", "screen"],
      });
      expect(lib.retirarOpciones(["getAllElements", "--serie", "emulator-5556"], n).resto).toEqual(["getAllElements"]);
    });
  });
});

describe("el script xone-hotswap real, con --dry-run", () => {
  const script = resolve(__dirname, "../../skills/xone-hotswap/scripts/xone-hotswap");
  const correr = (...args: string[]) =>
    execFileSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...process.env, HOTSWAP_URL: "wss://127.0.0.1:1/hotswap", XONECODE_DISPOSITIVO: "" } }).trim();
  it.each([
    [["getAllElements", "--dry-run"], '{"command":"getAllElements"}'],
    [["click", "name=X", "--dry-run"], '{"command":"click","name":"X"}'],
    [["--serie", "emulator-5556", "click", "name=X", "--dry-run"], '{"command":"click","name":"X"}'],
    [["--dry-run", "click", "name=X", "--", "click", "name=Y"], '{"command":"click","name":"X"}\n{"command":"click","name":"Y"}'],
  ])("%j", (args, esperado) => {
    expect(correr(...args)).toBe(esperado);
  });
});
