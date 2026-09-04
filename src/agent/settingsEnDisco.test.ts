import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { cargarSettings, guardarEntorno, guardarWorkspace, rutaSettings, SettingsRotosEnDisco } from "./settingsEnDisco.js";
import { SettingsConCredencial } from "../core/settings.js";

/** Cada test recibe su propia «casa» temporal: nunca toca el ~/.xonecode real. */
function casa(): string {
  return mkdtempSync(join(tmpdir(), "xonecode-settings-"));
}

describe("settingsEnDisco", () => {
  it("sin fichero, devuelve settings vacíos y no crea nada", () => {
    const c = casa();
    expect(cargarSettings(c).entornos).toEqual([]);
  });

  it("guardar un entorno NO destruye los que había", () => {
    const c = casa();
    guardarEntorno(c, { id: "a", nombre: "A", url: "https://a/mcp" });
    guardarEntorno(c, { id: "b", nombre: "B", url: "https://b/mcp" });
    guardarEntorno(c, { id: "c", nombre: "C", url: "https://c/mcp" });
    expect(cargarSettings(c).entornos.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("re-registrar el mismo id lo SUSTITUYE, no lo duplica", () => {
    const c = casa();
    guardarEntorno(c, { id: "a", nombre: "A", url: "https://a/mcp" });
    guardarEntorno(c, { id: "a", nombre: "A renombrado", url: "https://a2/mcp" });
    const { entornos } = cargarSettings(c);
    expect(entornos).toHaveLength(1);
    expect(entornos[0].url).toBe("https://a2/mcp");
  });

  it("ante un JSON roto PARA SIN ESCRIBIR: recuperarlo por su cuenta sería inventar", () => {
    const c = casa();
    // La carpeta tiene que existir ANTES de escribir el fichero corrupto: si no, el
    // writeFileSync del test fallaría por «no existe el directorio», y el toThrow de
    // abajo pasaría por esa razón en vez de por la que el test dice comprobar.
    mkdirSync(join(c, ".xonecode"), { recursive: true, mode: 0o700 });
    const ruta = join(c, ".xonecode", "settings.json");
    writeFileSync(ruta, "{ esto no es json", { flag: "w" });
    expect(() => guardarEntorno(c, { id: "a", nombre: "A", url: "https://a/mcp" }))
      .toThrow(SettingsRotosEnDisco);
    expect(readFileSync(ruta, "utf8")).toBe("{ esto no es json");
  });

  it("un settings.json con un JSON válido pero no-objeto (array) también para sin escribir", () => {
    const c = casa();
    mkdirSync(join(c, ".xonecode"), { recursive: true, mode: 0o700 });
    const ruta = join(c, ".xonecode", "settings.json");
    writeFileSync(ruta, "[1,2,3]", { flag: "w" });
    expect(() => guardarEntorno(c, { id: "a", nombre: "A", url: "https://a/mcp" }))
      .toThrow(SettingsRotosEnDisco);
    expect(readFileSync(ruta, "utf8")).toBe("[1,2,3]");
  });

  it("el fichero queda 0600 y su carpeta 0700", () => {
    const c = casa();
    guardarEntorno(c, { id: "a", nombre: "A", url: "https://a/mcp" });
    const ruta = join(c, ".xonecode", "settings.json");
    expect(statSync(ruta).mode & 0o777).toBe(0o600);
    expect(statSync(join(c, ".xonecode")).mode & 0o777).toBe(0o700);
  });

  it("guardarWorkspace fija la base sin tocar los entornos ya guardados", () => {
    const c = casa();
    guardarEntorno(c, { id: "a", nombre: "A", url: "https://a/mcp" });
    guardarWorkspace(c, "/home/u/xone-projects");
    const settings = cargarSettings(c);
    expect(settings.workspace).toBe("/home/u/xone-projects");
    expect(settings.entornos.map((e) => e.id)).toEqual(["a"]);
  });

  it("rutaSettings apunta dentro de .xonecode/settings.json de la casa dada", () => {
    const c = casa();
    expect(rutaSettings(c)).toBe(join(c, ".xonecode", "settings.json"));
  });

  it("una credencial colada a mano en el fichero SÍ hace lanzar a cargarSettings: solo el JSON roto es tolerado", () => {
    const c = casa();
    mkdirSync(join(c, ".xonecode"), { recursive: true, mode: 0o700 });
    const ruta = join(c, ".xonecode", "settings.json");
    writeFileSync(ruta, JSON.stringify({ entornos: [], apiKey: "sk-colada" }), { flag: "w" });
    // «El lector puede ser tolerante» es sobre JSON mal formado, no sobre credenciales: una
    // credencial en el fichero es el fallo de seguridad que este diseño exige que se VEA,
    // así que cargarSettings deja pasar el lanzamiento de validarSettings sin atraparlo.
    expect(() => cargarSettings(c)).toThrow(SettingsConCredencial);
  });
});
