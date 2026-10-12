import { describe, expect, it } from "vitest";
import { MOTIVOS_DEL_TUNEL } from "../../core/tunel.js";
import { configTieneAuthtoken, guardarAuthtoken, localizarNgrok, medirNgrok, type ResultadoDeEjecucion } from "./ngrokEnMaquina.js";

/** Un ngrok de mentira: contesta por argumentos y apunta lo que se le pidió. */
function ngrokFalso(respuestas: Record<string, ResultadoDeEjecucion>) {
  const llamadas: string[][] = [];
  return {
    llamadas,
    ejecutar: async (_binario: string, args: string[]) => {
      llamadas.push(args);
      return respuestas[args.join(" ")] ?? { ok: false, salida: "" };
    },
  };
}

const RUTA = "/Users/usuario/Library/Application Support/ngrok/ngrok.yml";

describe("configTieneAuthtoken", () => {
  it("v3 (dentro de agent:) y v2 (arriba) cuentan; vacío o comentado no", () => {
    expect(configTieneAuthtoken('version: "3"\nagent:\n    authtoken: 2abcDEF_ghi\n')).toBe(true);
    expect(configTieneAuthtoken("authtoken: 2abcDEF_ghi\nregion: eu\n")).toBe(true);
    expect(configTieneAuthtoken('agent:\n  authtoken: ""\n')).toBe(false);
    expect(configTieneAuthtoken("agent:\n  authtoken:\n")).toBe(false);
    expect(configTieneAuthtoken("agent:\n  authtoken:   # nada\n")).toBe(false);
    expect(configTieneAuthtoken("# authtoken: 2abc\nversion: 3\n")).toBe(false);
    expect(configTieneAuthtoken('version: "3"\n')).toBe(false);
  });
});

describe("localizarNgrok", () => {
  it("busca en el PATH, con .exe en Windows", () => {
    expect(localizarNgrok({ plataforma: "darwin", entorno: { PATH: "/a:/opt/homebrew/bin" }, existe: (r) => r === "/opt/homebrew/bin/ngrok" })).toBe(
      "/opt/homebrew/bin/ngrok"
    );
    expect(localizarNgrok({ plataforma: "darwin", entorno: { PATH: "/a" }, existe: () => false })).toBeUndefined();
    expect(localizarNgrok({ plataforma: "win32", entorno: { Path: "C:\\ngrok" }, existe: (r) => r === "C:\\ngrok\\ngrok.exe" })).toBe(
      "C:\\ngrok\\ngrok.exe"
    );
  });
});

describe("medirNgrok", () => {
  it("sin binario: ni instalado ni cuenta, y no ejecuta nada", async () => {
    const f = ngrokFalso({});
    expect(await medirNgrok({ localizar: () => undefined, ejecutar: f.ejecutar, entorno: {} })).toEqual({ instalado: false, cuenta: false });
    expect(f.llamadas).toEqual([]);
  });

  it("`version` que no contesta: no instalado", async () => {
    const f = ngrokFalso({});
    expect(await medirNgrok({ localizar: () => "/x/ngrok", ejecutar: f.ejecutar, entorno: {} })).toEqual({ instalado: false, cuenta: false });
  });

  it("instalado, con la versión, y la cuenta leída del fichero que NOMBRA `config check`", async () => {
    const f = ngrokFalso({
      version: { ok: true, salida: "ngrok version 3.36.1\n" },
      "config check": { ok: true, salida: `Valid configuration file at ${RUTA}\n` },
    });
    const leidas: string[] = [];
    const m = await medirNgrok({
      localizar: () => "/x/ngrok",
      ejecutar: f.ejecutar,
      leer: (r) => (leidas.push(r), 'version: "3"\nagent:\n    authtoken: 2abcDEF_ghi\n'),
      entorno: {},
    });
    expect(m).toEqual({ instalado: true, version: "3.36.1", cuenta: true });
    expect(leidas).toEqual([RUTA]);
    // La ruta no sale de la función.
    expect(JSON.stringify(m)).not.toContain("/Users/");
  });

  it("sin authtoken en la configuración, o sin configuración legible: sin cuenta", async () => {
    const base = { version: { ok: true, salida: "ngrok version 3.36.1\n" } };
    const sinToken = ngrokFalso({ ...base, "config check": { ok: true, salida: `Valid configuration file at ${RUTA}\n` } });
    expect((await medirNgrok({ localizar: () => "/x/ngrok", ejecutar: sinToken.ejecutar, leer: () => 'version: "3"\n', entorno: {} })).cuenta).toBe(false);
    const ilegible = ngrokFalso({ ...base, "config check": { ok: true, salida: `Valid configuration file at ${RUTA}\n` } });
    const leerQueFalla = () => {
      throw Object.assign(new Error(`ENOENT ${RUTA}`), { code: "ENOENT" });
    };
    expect((await medirNgrok({ localizar: () => "/x/ngrok", ejecutar: ilegible.ejecutar, leer: leerQueFalla, entorno: {} })).cuenta).toBe(false);
    const invalida = ngrokFalso({ ...base });
    expect((await medirNgrok({ localizar: () => "/x/ngrok", ejecutar: invalida.ejecutar, leer: () => "authtoken: x1", entorno: {} })).cuenta).toBe(false);
  });

  it("NGROK_AUTHTOKEN en el entorno cuenta (ngrok la lee y el túnel le pasa el entorno)", async () => {
    const f = ngrokFalso({ version: { ok: true, salida: "ngrok version 3.36.1\n" } });
    expect(await medirNgrok({ localizar: () => "/x/ngrok", ejecutar: f.ejecutar, entorno: { NGROK_AUTHTOKEN: "2abc" } })).toEqual({
      instalado: true,
      version: "3.36.1",
      cuenta: true,
    });
    expect(f.llamadas).toEqual([["version"]]);
  });
});

describe("guardarAuthtoken", () => {
  const TOKEN = "2abcDEFghiJKL_mnoPQRstuVWXyz0123456789";

  it("lo pasa a `ngrok config add-authtoken` sin espacios alrededor", async () => {
    const f = ngrokFalso({ [`config add-authtoken ${TOKEN}`]: { ok: true, salida: "Authtoken saved" } });
    expect(await guardarAuthtoken(`  ${TOKEN}\n`, { localizar: () => "/x/ngrok", ejecutar: f.ejecutar })).toEqual({ ok: true });
    expect(f.llamadas).toEqual([["config", "add-authtoken", TOKEN]]);
  });

  it("lo que no tiene forma de token no llega a ngrok", async () => {
    const f = ngrokFalso({});
    for (const malo of ["", "corto", "con espacio dentro 1234", "a;rm -rf /xxxxxxxx", `x${"a".repeat(300)}`]) {
      expect(await guardarAuthtoken(malo, { localizar: () => "/x/ngrok", ejecutar: f.ejecutar })).toEqual({
        ok: false,
        motivo: MOTIVOS_DEL_TUNEL.authtokenSinForma,
      });
    }
    expect(f.llamadas).toEqual([]);
  });

  it("sin ngrok, o si ngrok falla, un motivo FIJO que no lleva el token", async () => {
    const f = ngrokFalso({});
    expect(await guardarAuthtoken(TOKEN, { localizar: () => undefined, ejecutar: f.ejecutar })).toEqual({
      ok: false,
      motivo: MOTIVOS_DEL_TUNEL.noInstalado,
    });
    const r = await guardarAuthtoken(TOKEN, { localizar: () => "/x/ngrok", ejecutar: f.ejecutar });
    expect(r).toEqual({ ok: false, motivo: MOTIVOS_DEL_TUNEL.authtokenNoGuardado });
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });
});
