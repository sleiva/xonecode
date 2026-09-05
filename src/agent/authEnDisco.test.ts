/**
 * Tests de `authEnDisco.ts` (el ESCRITOR de `~/.xonecode/auth.json`).
 *
 * REGLA CRÍTICA (misma que en configEnDisco.test.ts): ningún test toca el
 * `~/.xonecode` real de esta máquina (puede tener claves válidas). Todo test
 * que derive rutas desde HOME stubea primero `HOME` a un directorio temporal
 * con `vi.stubEnv`: `homedir()` de node:os lee `HOME` en el momento de la
 * llamada, así que el stubeo llega hasta `rutaAuth()`.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { borrarCredencial, guardarCredencial, AuthRotoEnDisco } from "./authEnDisco.js";
import { rutaAuth } from "./configEnDisco.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Acepta las DOS formas válidas de credencial: string suelto o { key }. */
function valorCredencial(v: unknown): unknown {
  if (typeof v === "string") return v;
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    return (v as Record<string, unknown>).key;
  }
  return undefined;
}

/** Igual que el writer: fusiona sobre el objeto CRUDO, sin validar. */
function escribirAuthInicial(): string {
  return JSON.stringify({
    anthropic: { key: "sk-ya-existente-1" },
    openai: "sk-ya-existente-2",
  });
}

describe("guardarCredencial", () => {
  it("fichero nuevo: modo 0600 del fichero y 0700 de la carpeta, leídos de disco", () => {
    const h = mkdtempSync(join(tmpdir(), "xc-authw-"));
    vi.stubEnv("HOME", h);
    const ruta = rutaAuth();
    guardarCredencial("anthropic", "sk-secreta-12345");
    const modoFichero = statSync(ruta).mode & 0o777;
    const modoCarpeta = statSync(dirname(ruta)).mode & 0o777;
    expect(modoFichero).toBe(0o600);
    expect(modoCarpeta).toBe(0o700);
    const datos = JSON.parse(readFileSync(ruta, "utf8")) as Record<string, unknown>;
    expect(valorCredencial(datos.anthropic)).toBe("sk-secreta-12345");
    rmSync(h, { recursive: true, force: true });
  });

  it("preserva lo que ya había, mezclando objeto y string suelto", () => {
    const h = mkdtempSync(join(tmpdir(), "xc-authw-"));
    vi.stubEnv("HOME", h);
    const ruta = rutaAuth();
    mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
    writeFileSync(ruta, escribirAuthInicial(), { mode: 0o600 });
    // Force por si la umask degradó los modos de creación.
    chmodSync(dirname(ruta), 0o700);
    chmodSync(ruta, 0o600);
    guardarCredencial("gemini", "sk-nueva-3");
    expect(statSync(ruta).mode & 0o777).toBe(0o600);
    const datos = JSON.parse(readFileSync(ruta, "utf8")) as Record<string, unknown>;
    expect(valorCredencial(datos.anthropic)).toBe("sk-ya-existente-1");
    expect(valorCredencial(datos.openai)).toBe("sk-ya-existente-2");
    expect(valorCredencial(datos.gemini)).toBe("sk-nueva-3");
    rmSync(h, { recursive: true, force: true });
  });

  it("auth.json con JSON inválido: lanza AuthRotoEnDisco y NO se sobrescribe", () => {
    const h = mkdtempSync(join(tmpdir(), "xc-authw-"));
    vi.stubEnv("HOME", h);
    const ruta = rutaAuth();
    mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
    const roto = "esto no es json{{{";
    writeFileSync(ruta, roto, { mode: 0o600 });
    chmodSync(ruta, 0o600);
    const antes = readFileSync(ruta, "utf8");
    expect(() => guardarCredencial("openai", "sk-otra")).toThrow(AuthRotoEnDisco);
    expect(readFileSync(ruta, "utf8")).toBe(antes);
    rmSync(h, { recursive: true, force: true });
  });

  it("auth.json con raíz no-objeto (array): también es roto, y no cambia", () => {
    const h = mkdtempSync(join(tmpdir(), "xc-authw-"));
    vi.stubEnv("HOME", h);
    const ruta = rutaAuth();
    mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
    const antes = "[1,2,3]";
    writeFileSync(ruta, antes, { mode: 0o600 });
    chmodSync(ruta, 0o600);
    expect(() => guardarCredencial("openai", "sk-otra")).toThrow(AuthRotoEnDisco);
    expect(readFileSync(ruta, "utf8")).toBe(antes);
    rmSync(h, { recursive: true, force: true });
  });

  /**
   * El fichero es para la próxima ejecución; la variable es para ÉSTA. Sin esto, la clave
   * que el asistente de cuenta acaba de pedir no existía para `CatalogoModelos` —que la
   * lee de `process.env`—, así que validar la conexión fallaba con «falta la credencial
   * para …» justo después de haberla escrito.
   */
  it("aplica la credencial al proceso vivo, machacando lo que hubiera en la variable", () => {
    const h = mkdtempSync(join(tmpdir(), "xc-authw-"));
    vi.stubEnv("HOME", h);
    // Una clave vieja en el entorno: aquí SÍ se machaca, al revés que en `aplicarAuth`
    // (arranque), porque esto es una orden explícita de un humano y es lo último dicho.
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-vieja");
    guardarCredencial("anthropic", "sk-recien-tecleada");
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-recien-tecleada");
    rmSync(h, { recursive: true, force: true });
  });

  it("ollama no tiene variable que aplicar: no se inventa ninguna", () => {
    const h = mkdtempSync(join(tmpdir(), "xc-authw-"));
    vi.stubEnv("HOME", h);
    const antes = { ...process.env };
    guardarCredencial("ollama", "no-hace-falta");
    expect(Object.keys(process.env).filter((k) => !(k in antes))).toEqual([]);
    rmSync(h, { recursive: true, force: true });
  });

  it("devuelve avisos que mencionan un proveedor desconocido ya presente", () => {
    const h = mkdtempSync(join(tmpdir(), "xc-authw-"));
    vi.stubEnv("HOME", h);
    const ruta = rutaAuth();
    mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
    writeFileSync(
      ruta,
      JSON.stringify({ "proveedor-que-no-existe": "x" }),
      { mode: 0o600 },
    );
    chmodSync(ruta, 0o600);
    const { avisos } = guardarCredencial("anthropic", "sk-test");
    expect(avisos.length).toBeGreaterThan(0);
    expect(avisos.map((a) => a.texto).join("\n")).toContain("proveedor-que-no-existe");
    rmSync(h, { recursive: true, force: true });
  });
});

describe("borrarCredencial", () => {
  it("quita SOLO la del proveedor pedido y conserva el resto del fichero", () => {
    const h = mkdtempSync(join(tmpdir(), "xc-authw-"));
    vi.stubEnv("HOME", h);
    const ruta = rutaAuth();
    mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
    writeFileSync(
      ruta,
      JSON.stringify({ anthropic: { key: "sk-a" }, openai: "sk-o", "algo-raro": 7 }),
      { mode: 0o600 },
    );
    chmodSync(ruta, 0o600);

    const { borrada } = borrarCredencial("anthropic");
    expect(borrada).toBe(true);
    const despues = JSON.parse(readFileSync(ruta, "utf8")) as Record<string, unknown>;
    expect(despues.anthropic).toBeUndefined();
    // Lo que este fichero no entiende se conserva igual que al escribir: la base de la
    // fusión es el objeto CRUDO.
    expect(despues.openai).toBe("sk-o");
    expect(despues["algo-raro"]).toBe(7);
    rmSync(h, { recursive: true, force: true });
  });

  it("borrar lo que no estaba no es un error: es el estado que se pedía", () => {
    const h = mkdtempSync(join(tmpdir(), "xc-authw-"));
    vi.stubEnv("HOME", h);
    expect(borrarCredencial("gemini").borrada).toBe(false);
    rmSync(h, { recursive: true, force: true });
  });

  /**
   * De `process.env` se quita solo si la variable llevaba EXACTAMENTE la clave borrada —el
   * caso de `aplicarAuth`, que copia `auth.json` al entorno en el arranque—. Una variable
   * con otro valor es del usuario: no se toca, y se dice que la credencial sigue puesta,
   * porque el punto verde se va a quedar verde y callarlo parecería un fallo del botón.
   */
  it("limpia la variable del proceso si llevaba esa misma clave", () => {
    const h = mkdtempSync(join(tmpdir(), "xc-authw-"));
    vi.stubEnv("HOME", h);
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-a");
    guardarCredencial("anthropic", "sk-a");
    const { quedaEnEntorno } = borrarCredencial("anthropic");
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(quedaEnEntorno).toBe(false);
    rmSync(h, { recursive: true, force: true });
  });

  it("una variable del USUARIO con otro valor no se toca, y se avisa de que sigue puesta", () => {
    const h = mkdtempSync(join(tmpdir(), "xc-authw-"));
    vi.stubEnv("HOME", h);
    const ruta = rutaAuth();
    mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
    writeFileSync(ruta, JSON.stringify({ anthropic: { key: "sk-del-fichero" } }), { mode: 0o600 });
    chmodSync(ruta, 0o600);
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-exportada-a-mano");

    const { borrada, quedaEnEntorno } = borrarCredencial("anthropic");
    expect(borrada).toBe(true);
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-exportada-a-mano");
    expect(quedaEnEntorno).toBe(true);
    rmSync(h, { recursive: true, force: true });
  });

  it("un auth.json roto no se sobrescribe ni a medias", () => {
    const h = mkdtempSync(join(tmpdir(), "xc-authw-"));
    vi.stubEnv("HOME", h);
    const ruta = rutaAuth();
    mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
    writeFileSync(ruta, "{ roto", { mode: 0o600 });
    chmodSync(ruta, 0o600);
    expect(() => borrarCredencial("anthropic")).toThrow(AuthRotoEnDisco);
    expect(readFileSync(ruta, "utf8")).toBe("{ roto");
    rmSync(h, { recursive: true, force: true });
  });
});
