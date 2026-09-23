import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ficheroDeDispositivoDeSesion, lineaDelDispositivo } from "./dispositivoDeSesion.js";
import { carpetaDeArtefactosDeSesion } from "./artefactos.js";

describe("el dispositivo de la sesión, para el agente", () => {
  it("el fichero va AL LADO de los artefactos, no dentro: lo de dentro se anuncia", () => {
    const f = ficheroDeDispositivoDeSesion("/p", "s1");
    expect(f).toBe("/p/.xonecode/sesiones/s1/dispositivo.json");
    expect(f.startsWith(carpetaDeArtefactosDeSesion("/p", "s1"))).toBe(false);
  });

  it("la línea del turno nombra el elegido, o dice que se prefiere un emulador", () => {
    expect(lineaDelDispositivo({ id: "emulator-5554", nombre: "Pixel 8", plataforma: "android", clase: "emulador" })).toMatch(
      /Pixel 8 \(emulador Android, id emulator-5554\)/
    );
    expect(lineaDelDispositivo(undefined)).toMatch(/ninguno elegido.*EMULADOR/);
  });
});

/**
 * La regla que de verdad decide, la de los SCRIPTS (`skills/xone-hotswap/lib/dispositivo.mjs`).
 * Se prueba desde aquí para que `npm test` la cubra: los scripts no tienen suite propia.
 */
describe("los scripts de xone-hotswap eligen aparato", () => {
  const lib = async (): Promise<{
    serieAndroid: (e: string | undefined, o: { entorno: Record<string, string | undefined>; adb: string }) => { serie?: string; porque: string };
    preferirEmulador: (s: string) => string | undefined;
    udidIos: (e: string | undefined, entorno: Record<string, string | undefined>) => string | undefined;
  }> => import(pathToFileURL(resolve(__dirname, "../../skills/xone-hotswap/lib/dispositivo.mjs")).href);

  const conFichero = (d: unknown): Record<string, string> => {
    const f = join(mkdtempSync(join(tmpdir(), "xc-disp-")), "dispositivo.json");
    writeFileSync(f, JSON.stringify(d));
    return { XONECODE_DISPOSITIVO: f };
  };

  it("`--serie` manda; si no, el de la SESIÓN, aunque haya otros conectados", async () => {
    const { serieAndroid } = await lib();
    const entorno = conFichero({ id: "R58N", nombre: "Galaxy", plataforma: "android", clase: "fisico" });
    expect(serieAndroid("emulator-5556", { entorno, adb: "/no/existe" }).serie).toBe("emulator-5556");
    expect(serieAndroid(undefined, { entorno, adb: "/no/existe" }).serie).toBe("R58N");
  });

  it("sin elección, un EMULADOR antes que un físico; con varios físicos, no adivina", async () => {
    const { preferirEmulador } = await lib();
    expect(preferirEmulador("List of devices attached\nR58N\tdevice\nemulator-5556\tdevice\n")).toBe("emulator-5556");
    expect(preferirEmulador("List of devices attached\nR58N\tdevice\n")).toBe("R58N");
    expect(preferirEmulador("List of devices attached\nA\tdevice\nB\tdevice\n")).toBeUndefined();
    // Uno `offline` o sin autorizar no cuenta como disponible.
    expect(preferirEmulador("List of devices attached\nemulator-5554\toffline\nR58N\tdevice\n")).toBe("R58N");
  });

  it("en iOS solo cuenta un SIMULADOR elegido; un fichero roto es «no hay elección»", async () => {
    const { udidIos } = await lib();
    expect(udidIos(undefined, conFichero({ id: "UDID-1", nombre: "iPhone", plataforma: "ios", clase: "simulador" }))).toBe("UDID-1");
    expect(udidIos(undefined, conFichero({ id: "X", nombre: "iPhone", plataforma: "ios", clase: "fisico" }))).toBeUndefined();
    const roto = join(mkdtempSync(join(tmpdir(), "xc-disp-")), "dispositivo.json");
    writeFileSync(roto, "{no es json");
    expect(udidIos(undefined, { XONECODE_DISPOSITIVO: roto })).toBeUndefined();
  });
});
