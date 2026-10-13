import { describe, expect, it } from "vitest";
import { MOTIVOS_DEL_TUNEL } from "../../core/tunel.js";
import { authtokenDeNgrok, guardarAuthtoken, medirNgrok, rutaDeAuthtoken, type SdkDeNgrok } from "./ngrokEnMaquina.js";

const SDK: SdkDeNgrok = { forward: async () => ({ url: () => null, close: async () => {} }) };
/** Un disco de mentira: ruta → contenido; lo que no está, lanza como `readFileSync`. */
const disco = (ficheros: Record<string, string>) => (ruta: string) => {
  const texto = ficheros[ruta];
  if (texto === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  return texto;
};
const CASA = "/Users/a";
const CONFIG_V3 = "/Users/a/Library/Application Support/ngrok/ngrok.yml";

describe("medirNgrok", () => {
  it("instalado es que el SDK CARGA (viene con xonecode), no que haya un ngrok en el PATH", async () => {
    expect(await medirNgrok({ cargarSdk: async () => SDK, entorno: {}, casa: CASA, plataforma: "darwin", leer: disco({}) })).toEqual({ instalado: true, cuenta: false });
    expect(await medirNgrok({ cargarSdk: async () => undefined, entorno: {}, casa: CASA, plataforma: "darwin", leer: disco({}) })).toEqual({ instalado: false, cuenta: false });
  });
});

describe("authtokenDeNgrok: de dónde sale el authtoken, por orden", () => {
  const base = { casa: CASA, plataforma: "darwin" };
  it("NGROK_AUTHTOKEN del entorno manda", () => {
    expect(authtokenDeNgrok({ ...base, entorno: { NGROK_AUTHTOKEN: " delentorno123 " }, leer: disco({ [rutaDeAuthtoken(CASA)]: '{"authtoken":"nuestro1234567"}' }) })).toBe("delentorno123");
  });
  it("después, el fichero NUESTRO (donde lo guarda Ajustes)", () => {
    expect(authtokenDeNgrok({ ...base, entorno: {}, leer: disco({ [rutaDeAuthtoken(CASA)]: '{"version":1,"authtoken":"nuestro1234567"}', [CONFIG_V3]: "agent:\n  authtoken: delprograma123\n" }) })).toBe("nuestro1234567");
  });
  it("y si ya usabas el programa ngrok, su configuración: no hay que volver a pedírtelo", () => {
    expect(authtokenDeNgrok({ ...base, entorno: {}, leer: disco({ [CONFIG_V3]: 'version: "3"\nagent:\n  authtoken: delprograma123\n' }) })).toBe("delprograma123");
    expect(authtokenDeNgrok({ ...base, entorno: {}, leer: disco({ "/Users/a/.ngrok2/ngrok.yml": "authtoken: delav2v2v2v2\n" }) })).toBe("delav2v2v2v2");
  });
  it("sin ninguno, o con uno ilegible, no hay cuenta", () => {
    expect(authtokenDeNgrok({ ...base, entorno: {}, leer: disco({}) })).toBeUndefined();
    expect(authtokenDeNgrok({ ...base, entorno: {}, leer: disco({ [rutaDeAuthtoken(CASA)]: "no es json" }) })).toBeUndefined();
  });
});

describe("guardarAuthtoken", () => {
  it("lo escribe en NUESTRO fichero, sin espacios alrededor, y nunca lo pasa a un proceso", async () => {
    const escritos: [string, string][] = [];
    expect(await guardarAuthtoken("  abc123def456ghi  ", { casa: CASA, escribir: (r, c) => void escritos.push([r, c]) })).toEqual({ ok: true });
    expect(escritos).toEqual([[rutaDeAuthtoken(CASA), '{\n  "version": 1,\n  "authtoken": "abc123def456ghi"\n}\n']]);
  });
  it("lo que no tiene forma de token no se escribe", async () => {
    const escritos: string[] = [];
    for (const malo of ["", "corto", "con espacio dentro123", "-empiezaporguion123"]) {
      expect(await guardarAuthtoken(malo, { casa: CASA, escribir: (r) => void escritos.push(r) })).toEqual({ ok: false, motivo: MOTIVOS_DEL_TUNEL.authtokenSinForma });
    }
    expect(escritos).toEqual([]);
  });
  it("si no se puede escribir, un motivo FIJO que no lleva el token", async () => {
    const r = await guardarAuthtoken("abc123def456ghi", {
      casa: CASA,
      escribir: () => {
        throw new Error("EACCES /Users/a/.xonecode/ngrok.json abc123def456ghi");
      },
    });
    expect(r).toEqual({ ok: false, motivo: MOTIVOS_DEL_TUNEL.authtokenNoGuardado });
  });
});
