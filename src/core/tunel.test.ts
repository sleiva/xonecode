import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MOTIVOS_DEL_TUNEL,
  motivoDeDominioInaceptable,
  motivoDeSalidaDeNgrok,
  servidorDeTunel,
  authtokenDeConfig,
  rutasDeConfigDeNgrok,
} from "./tunel.js";

const oro = (n: string): string[] =>
  readFileSync(new URL(`./__oro__/${n}`, import.meta.url), "utf8").split("\n").filter(Boolean);

describe("servidorDeTunel", () => {
  it("compone wss://host/ws, sin puerto ni ruta de más", () => {
    expect(servidorDeTunel("https://1a2b-203-0-113-7.ngrok-free.app")).toBe("wss://1a2b-203-0-113-7.ngrok-free.app/ws");
    expect(servidorDeTunel("https://x.ngrok.app/")).toBe("wss://x.ngrok.app/ws");
  });
  it("rechaza lo que no es https", () => {
    expect(() => servidorDeTunel("http://x.ngrok.app")).toThrow();
    expect(() => servidorDeTunel("no es url")).toThrow();
  });
});

describe("motivoDeDominioInaceptable", () => {
  it("acepta un nombre de host", () => {
    expect(motivoDeDominioInaceptable("mi-app.ngrok.app")).toBeUndefined();
    expect(motivoDeDominioInaceptable("remoto.ejemplo.com")).toBeUndefined();
  });
  it("rechaza esquema, ruta, puerto, espacios, vacío y sin punto", () => {
    for (const malo of ["https://a.ngrok.app", "a.ngrok.app/ws", "a.ngrok.app:443", "a b.app", "", "localhost", "-a.app", "a..app", 7 as unknown as string]) {
      expect(motivoDeDominioInaceptable(malo), String(malo)).toBeTypeOf("string");
    }
  });
});

describe("motivoDeSalidaDeNgrok, por CÓDIGO y nunca por texto", () => {
  it("el authtoken malo es autenticación", () => {
    expect(motivoDeSalidaDeNgrok(oro("ngrok-v3-authtoken-invalido.jsonl"))).toBe("autenticacion");
  });
  it("un dominio que no es tuyo es dominio", () => {
    expect(motivoDeSalidaDeNgrok(oro("ngrok-v3-dominio-ajeno.jsonl"))).toBe("dominio");
  });
  it("108 (límite de sesiones simultáneas) es otra sesión, no autenticación", () => {
    expect(motivoDeSalidaDeNgrok(["ERROR:  ERR_NGROK_108"])).toBe("otraSesion");
  });
  it("334 (el endpoint ya está en línea en otra sesión) es otra sesión, no dominio", () => {
    expect(motivoDeSalidaDeNgrok(['{"err":"failed to start tunnel\\r\\n\\r\\nERR_NGROK_334\\r\\n","lvl":"crit"}'])).toBe("otraSesion");
  });
  it("lo demás es otro", () => {
    expect(motivoDeSalidaDeNgrok(oro("ngrok-v3.jsonl"))).toBe("otro");
    expect(motivoDeSalidaDeNgrok([])).toBe("otro");
    expect(motivoDeSalidaDeNgrok(["authentication failed sin código"])).toBe("otro");
  });
});

describe("MOTIVOS_DEL_TUNEL", () => {
  it("son textos fijos, sin rutas ni correos", () => {
    for (const t of Object.values(MOTIVOS_DEL_TUNEL)) {
      expect(t.length).toBeGreaterThan(10);
      expect(t).not.toMatch(/\/Users\/|@|authtoken: /);
    }
    expect(Object.keys(MOTIVOS_DEL_TUNEL).sort()).toEqual(
      [
        "autenticacion",
        "authtokenNoGuardado",
        "authtokenSinForma",
        "dominio",
        "noInstalado",
        "otraSesion",
        "otro",
        "paqueteViejo",
        "puente",
        "seCerro",
        "sinDireccion",
      ]
    );
  });
});

describe("la configuración del programa ngrok, por si ya lo usabas", () => {
  it("rutas v3 por plataforma y la v2 de siempre", () => {
    expect(rutasDeConfigDeNgrok("darwin", {}, "/Users/a")).toEqual([
      "/Users/a/Library/Application Support/ngrok/ngrok.yml",
      "/Users/a/.ngrok2/ngrok.yml",
    ]);
    expect(rutasDeConfigDeNgrok("linux", { XDG_CONFIG_HOME: "/x" }, "/home/a")[0]).toBe("/x/ngrok/ngrok.yml");
    expect(rutasDeConfigDeNgrok("linux", {}, "/home/a")[0]).toBe("/home/a/.config/ngrok/ngrok.yml");
    expect(rutasDeConfigDeNgrok("win32", { LOCALAPPDATA: "C:\\U\\AppData\\Local" }, "C:\\U")[0]).toBe("C:\\U\\AppData\\Local\\ngrok\\ngrok.yml");
  });
  it("saca el authtoken de v2 y de v3, y un valor vacío no es cuenta", () => {
    expect(authtokenDeConfig('version: "3"\nagent:\n    authtoken: abc123def456\n')).toBe("abc123def456");
    expect(authtokenDeConfig("authtoken: 'xyz789xyz789' # mío\n")).toBe("xyz789xyz789");
    expect(authtokenDeConfig('agent:\n  authtoken: ""\n')).toBeUndefined();
    expect(authtokenDeConfig("region: eu\n")).toBeUndefined();
  });
});
