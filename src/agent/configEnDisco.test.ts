/**
 * Tests de `configEnDisco.ts`: rutas, carga de los ficheros y volcado de claves
 * al entorno.
 *
 * REGLA CRÍTICA: ningún test toca el `~/.xonecode` real de esta máquina (puede
 * tener claves válidas). Todo test que derive rutas desde HOME stubea primero
 * `HOME` a un directorio temporal con `vi.stubEnv`: `homedir()` de node:os lee
 * `HOME` en el momento de la llamada, así que el stubeo llega hasta las rutas.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  NOMBRE_CARPETA,
  rutaConfigGlobal,
  rutaConfigDeProyecto,
  rutaAuth,
  cargar,
  aplicarAuth,
} from "./configEnDisco.js";

// Valores originales de las dos variables que `aplicarAuth` puede escribir con
// una asignación directa (no con vi.stubEnv): hay que restaurarlas a mano para
// no contaminar ni otros tests ni la sesión real.
let antropicaOriginal: string | undefined;
let openaiOriginal: string | undefined;

beforeEach(() => {
  antropicaOriginal = process.env.ANTHROPIC_API_KEY;
  openaiOriginal = process.env.OPENAI_API_KEY;
});

afterEach(() => {
  vi.unstubAllEnvs();
  // `aplicarAuth` escribe en process.env con asignación normal, así que
  // `vi.unstubAllEnvs()` NO deshace su efecto: restauración manual.
  if (antropicaOriginal === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = antropicaOriginal;
  if (openaiOriginal === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = openaiOriginal;
});

it("rutaConfigGlobal, rutaConfigDeProyecto y rutaAuth usan HOME/raiz stubeados", () => {
  const h = mkdtempSync(join(tmpdir(), "xc-home-"));
  const p = mkdtempSync(join(tmpdir(), "xc-cfg-"));
  vi.stubEnv("HOME", h);
  expect(rutaConfigGlobal()).toBe(join(h, ".xonecode", "config.json"));
  expect(rutaConfigDeProyecto(p)).toBe(join(p, ".xonecode", "config.json"));
  expect(rutaAuth()).toBe(join(h, ".xonecode", "auth.json"));
  rmSync(h, { recursive: true, force: true });
  rmSync(p, { recursive: true, force: true });
});

it("cargar con los tres ficheros presentes y válidos", () => {
  const h = mkdtempSync(join(tmpdir(), "xc-home-"));
  const p = mkdtempSync(join(tmpdir(), "xc-cfg-"));
  vi.stubEnv("HOME", h);
  mkdirSync(join(p, NOMBRE_CARPETA), { recursive: true });
  mkdirSync(join(h, NOMBRE_CARPETA), { recursive: true });
  writeFileSync(join(p, NOMBRE_CARPETA, "config.json"), '{"modelo":"ollama/x"}');
  writeFileSync(join(h, NOMBRE_CARPETA, "config.json"), '{"modelo":"gemini/y"}');
  const rutaAuthTemp = join(h, NOMBRE_CARPETA, "auth.json");
  writeFileSync(rutaAuthTemp, '{"anthropic":{"key":"sk-test"}}');
  chmodSync(rutaAuthTemp, 0o600);
  const r = cargar(p);
  expect(r.rutas).toHaveLength(3);
  for (const entrada of r.rutas) expect(entrada.existe).toBe(true);
  expect(r.config.proyecto?.modelo).toBe("ollama/x");
  expect(r.config.global?.modelo).toBe("gemini/y");
  expect(r.auth.anthropic?.key).toBe("sk-test");
  rmSync(h, { recursive: true, force: true });
  rmSync(p, { recursive: true, force: true });
});

it("cargar sin ningún fichero", () => {
  const h = mkdtempSync(join(tmpdir(), "xc-home-"));
  const p = mkdtempSync(join(tmpdir(), "xc-cfg-"));
  // Sin el stubeo, `cargar` vería el ~/.xonecode REAL de esta máquina y las
  // rutas globales saldrían con existe:true.
  vi.stubEnv("HOME", h);
  const r = cargar(p);
  expect(r.rutas).toHaveLength(3);
  for (const entrada of r.rutas) expect(entrada.existe).toBe(false);
  expect(r.config).toEqual({});
  expect(r.auth).toEqual({});
  expect(r.avisos).toEqual([]);
  rmSync(h, { recursive: true, force: true });
  rmSync(p, { recursive: true, force: true });
});

it("cargar con config.json de proyecto con JSON roto no lanza", () => {
  const h = mkdtempSync(join(tmpdir(), "xc-home-"));
  const p = mkdtempSync(join(tmpdir(), "xc-cfg-"));
  vi.stubEnv("HOME", h);
  mkdirSync(join(p, NOMBRE_CARPETA), { recursive: true });
  writeFileSync(join(p, NOMBRE_CARPETA, "config.json"), "{ roto");
  expect(() => cargar(p)).not.toThrow();
  const r = cargar(p);
  expect(r.config.proyecto).toBeUndefined();
  expect(r.avisos.length).toBeGreaterThanOrEqual(1);
  const entradaProyecto = r.rutas.find((e) => e.procedencia === "proyecto");
  expect(entradaProyecto?.existe).toBe(true);
  // El aviso dice QUÉ fichero falló pero nunca interpola su contenido:
  // «{ roto» no puede acabar en el texto de ningún aviso ni en los logs.
  for (const a of r.avisos) expect(a.texto).not.toContain("{ roto");
  rmSync(h, { recursive: true, force: true });
  rmSync(p, { recursive: true, force: true });
});

it(
  "cargar llama a validarAuth con el modo real: auth.json con permisos 0o644 " +
    "produce un aviso grave",
  () => {
    const h = mkdtempSync(join(tmpdir(), "xc-home-"));
    const p = mkdtempSync(join(tmpdir(), "xc-cfg-"));
    vi.stubEnv("HOME", h);
    mkdirSync(join(h, NOMBRE_CARPETA), { recursive: true });
    const rutaAuthTemp = join(h, NOMBRE_CARPETA, "auth.json");
    writeFileSync(rutaAuthTemp, '{"anthropic":{"key":"sk-test"}}');
    // Legible por otros: lo que debe validar es el modo REAL del fichero.
    chmodSync(rutaAuthTemp, 0o644);
    const r = cargar(p);
    expect(r.avisos.some((a) => a.severidad === "grave")).toBe(true);
    rmSync(h, { recursive: true, force: true });
    rmSync(p, { recursive: true, force: true });
  },
);

it("aplicarAuth no pisa una variable de entorno que ya existía", () => {
  // Asignación directa, igual que hace el código bajo test (no vi.stubEnv).
  process.env.ANTHROPIC_API_KEY = "ya-estaba";
  const aplicadas = aplicarAuth({ anthropic: { key: "nueva" } });
  expect(process.env.ANTHROPIC_API_KEY).toBe("ya-estaba");
  expect(aplicadas).not.toContain("anthropic");
});

it("aplicarAuth sí pone la clave si la variable no estaba definida", () => {
  delete process.env.OPENAI_API_KEY;
  const aplicadas = aplicarAuth({ openai: { key: "nueva-clave" } });
  expect(process.env.OPENAI_API_KEY).toBe("nueva-clave");
  expect(aplicadas).toContain("openai");
});

it("aplicarAuth ignora una entrada ollama", () => {
  let aplicadas: string[] = [];
  expect(() => {
    aplicadas = aplicarAuth({ ollama: { key: "algo" } });
  }).not.toThrow();
  expect(aplicadas).toEqual([]);
});