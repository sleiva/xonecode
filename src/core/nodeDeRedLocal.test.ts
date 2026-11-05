import { describe, expect, it } from "vitest";
import {
  APAGAR_NODE_DE_RED_LOCAL,
  codigoDeSalidaDelRelanzado,
  debeEnvolverNode,
  destinosDelAviso,
  infoPlistDeLaApp,
  MARCA_DE_RELANZADO,
  mismoOrigen,
  programaDelAviso,
} from "./nodeDeRedLocal.js";

describe("el node de red local", () => {
  it("solo se envuelve en un Mac, no en el proceso ya relanzado y no si se apaga", () => {
    expect(debeEnvolverNode("darwin", {})).toBe(true);
    expect(debeEnvolverNode("linux", {})).toBe(false);
    expect(debeEnvolverNode("win32", {})).toBe(false);
    expect(debeEnvolverNode("darwin", { [MARCA_DE_RELANZADO]: "1" })).toBe(false);
    expect(debeEnvolverNode("darwin", { [APAGAR_NODE_DE_RED_LOCAL]: "1" })).toBe(false);
  });

  it("la app declara el texto de Red local, sin el cual macOS deniega en silencio", () => {
    const plist = infoPlistDeLaApp();
    expect(plist).toContain("<key>NSLocalNetworkUsageDescription</key>");
    expect(plist).toContain("<key>CFBundleIdentifier</key><string>es.xone.xonecode.node</string>");
    expect(plist).toContain("<key>CFBundleExecutable</key><string>node</string>");
    expect(plist).toContain("<key>LSBackgroundOnly</key><true/>");
  });

  it("se rehace solo si cambia el node de origen", () => {
    const o = { ruta: "/n/node", tamano: 10, mtimeMs: 5 };
    expect(mismoOrigen(o, { ...o })).toBe(true);
    expect(mismoOrigen({ ...o, tamano: 11 }, o)).toBe(false);
    expect(mismoOrigen({ ...o, ruta: "/otro/node" }, o)).toBe(false);
    expect(mismoOrigen(undefined, o)).toBe(false);
    expect(mismoOrigen(null, o)).toBe(false);
  });

  it("el aviso se provoca contra el primer equipo de cada red local IPv4, sin loopback ni IPv6", () => {
    const destinos = destinosDelAviso({
      lo0: [{ family: "IPv4", internal: true, address: "127.0.0.1", netmask: "255.0.0.0" }],
      en7: [
        { family: "IPv4", internal: false, address: "101.101.101.140", netmask: "255.255.255.0" },
        { family: "IPv6", internal: false, address: "fe80::1", netmask: "ffff:ffff:ffff:ffff::" },
      ],
      en0: [{ family: 4, internal: false, address: "192.168.68.26", netmask: "255.255.252.0" }],
      utun: [{ family: "IPv4", internal: false, address: "10.0.0.5", netmask: "255.255.255.255" }],
    });
    expect(destinos).toEqual(["101.101.101.1", "192.168.68.1"]);
    expect(programaDelAviso(destinos)).toContain('["101.101.101.1","192.168.68.1"]');
  });

  it("quien relanza sale con el código del hijo, o 128 + la señal que lo mató", () => {
    const numero = (s: string) => ({ SIGTERM: 15, SIGINT: 2 })[s];
    expect(codigoDeSalidaDelRelanzado(64, null, numero)).toBe(64);
    expect(codigoDeSalidaDelRelanzado(0, null, numero)).toBe(0);
    expect(codigoDeSalidaDelRelanzado(null, "SIGTERM", numero)).toBe(143);
    expect(codigoDeSalidaDelRelanzado(null, "SIGRARA", numero)).toBe(70);
  });
});
