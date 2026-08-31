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
import { guardarCredencial, AuthRotoEnDisco } from "./authEnDisco.js";
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