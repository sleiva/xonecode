import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { cargarSettings, guardarDispositivos, guardarEntorno, guardarSinAprobacion, guardarWorkspace, rutaSettings, SettingsRotosEnDisco } from "./settingsEnDisco.js";

/** Cada test recibe su propia «casa» temporal: nunca toca el ~/.xonecode real. */
function casa(): string {
  return mkdtempSync(join(tmpdir(), "xonecode-settings-"));
}

describe("settingsEnDisco", () => {
  it("sin fichero, devuelve settings vacíos y no crea nada", () => {
    const c = casa();
    expect(cargarSettings(c).settings.entornos).toEqual([]);
  });

  it("guardar un entorno NO destruye los que había", () => {
    const c = casa();
    guardarEntorno(c, { id: "a", nombre: "A", url: "https://a/mcp" });
    guardarEntorno(c, { id: "b", nombre: "B", url: "https://b/mcp" });
    guardarEntorno(c, { id: "c", nombre: "C", url: "https://c/mcp" });
    expect(cargarSettings(c).settings.entornos.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("re-registrar el mismo id lo SUSTITUYE, no lo duplica", () => {
    const c = casa();
    guardarEntorno(c, { id: "a", nombre: "A", url: "https://a/mcp" });
    guardarEntorno(c, { id: "a", nombre: "A renombrado", url: "https://a2/mcp" });
    const { entornos } = cargarSettings(c).settings;
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

  it("guardarDispositivos escribe los cuatro interruptores sin tocar los entornos", () => {
    const c = casa();
    guardarEntorno(c, { id: "a", nombre: "A", url: "https://a/mcp" });
    guardarDispositivos(c, { android: true, ios: false });
    const { settings } = cargarSettings(c);
    expect(settings.dispositivos).toEqual({ android: true, ios: false });
    expect(settings.entornos.map((e) => e.id)).toEqual(["a"]);
  });

  it("guardarDispositivos SUSTITUYE, no fusiona: lo que ya no viene deja de estar apagado", () => {
    // Son cuatro interruptores que la ventana manda juntos. Fusionando, un `ios: false` de
    // antes seguiría vivo después de encenderlo en la interfaz — apagado sin que nadie lo
    // haya pedido y sin que se vea dónde.
    const c = casa();
    guardarDispositivos(c, { ios: false, iosSimulador: false });
    guardarDispositivos(c, { ios: false });
    expect(cargarSettings(c).settings.dispositivos).toEqual({ ios: false });
  });

  it("guardar TODO encendido borra la clave: ausente y «todos» significan lo mismo", () => {
    const c = casa();
    guardarEntorno(c, { id: "a", nombre: "A", url: "https://a/mcp" });
    guardarDispositivos(c, { ios: false });
    guardarDispositivos(c, {});
    const crudo = JSON.parse(readFileSync(join(c, ".xonecode", "settings.json"), "utf8")) as Record<string, unknown>;
    expect("dispositivos" in crudo).toBe(false);
    expect(cargarSettings(c).settings.entornos.map((e) => e.id)).toEqual(["a"]);
  });

  it("guardarWorkspace fija la base sin tocar los entornos ya guardados", () => {
    const c = casa();
    guardarEntorno(c, { id: "a", nombre: "A", url: "https://a/mcp" });
    guardarWorkspace(c, "/home/u/xone-projects");
    const { settings } = cargarSettings(c);
    expect(settings.workspace).toBe("/home/u/xone-projects");
    expect(settings.entornos.map((e) => e.id)).toEqual(["a"]);
  });

  it("rutaSettings apunta dentro de .xonecode/settings.json de la casa dada", () => {
    const c = casa();
    expect(rutaSettings(c)).toBe(join(c, ".xonecode", "settings.json"));
  });

  it("una credencial colada a mano en el fichero deja un AVISO grave al leer, no un lanzamiento", () => {
    const c = casa();
    mkdirSync(join(c, ".xonecode"), { recursive: true, mode: 0o700 });
    const ruta = join(c, ".xonecode", "settings.json");
    writeFileSync(ruta, JSON.stringify({ entornos: [], apiKey: "sk-colada" }), { flag: "w" });
    // El escritor no vigila credenciales (fusiona sobre el crudo, deuda compartida con
    // configEnDisco.ts); es la LECTURA la que la detecta — y ahora como aviso, no como
    // excepción: un fallo del área de CloudStudio no puede tumbar el arranque.
    const { settings, avisos } = cargarSettings(c);
    expect(settings.entornos).toEqual([]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidad).toBe("grave");
    expect(avisos[0].texto).toContain("apiKey");
    expect(avisos[0].texto).not.toContain("sk-colada");
  });

  it("un JSON roto en disco también sale como aviso al leer, nunca como excepción", () => {
    const c = casa();
    mkdirSync(join(c, ".xonecode"), { recursive: true, mode: 0o700 });
    writeFileSync(join(c, ".xonecode", "settings.json"), "{ esto no es json", { flag: "w" });
    const { settings, avisos } = cargarSettings(c);
    expect(settings.entornos).toEqual([]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidad).toBe("aviso");
  });
});

describe("guardarSinAprobacion", () => {
  /**
   * Se fusiona proyecto a proyecto, al revés que `guardarDispositivos`: allí son cuatro
   * interruptores que la ventana manda juntos, y aquí cada entrada es una decisión distinta
   * tomada en otro momento. Escribir el objeto entero borraría las de los demás.
   */
  it("cada proyecto es su propia decisión, y no se pisan", () => {
    const c = casa();
    guardarEntorno(c, { id: "a", nombre: "A", url: "https://a/mcp" });
    guardarSinAprobacion(c, "/proy/uno", true);
    guardarSinAprobacion(c, "/proy/dos", true);
    expect(cargarSettings(c).settings.sinAprobacion).toEqual({ "/proy/uno": true, "/proy/dos": true });

    guardarSinAprobacion(c, "/proy/uno", false);
    expect(cargarSettings(c).settings.sinAprobacion).toEqual({ "/proy/dos": true });
    // Y no se lleva por delante lo que había alrededor.
    expect(cargarSettings(c).settings.entornos.map((e) => e.id)).toEqual(["a"]);
  });

  it("quitar la última BORRA la clave en vez de dejar un `false`", () => {
    // `false` y «no está» significan lo mismo —pedir aprobación— y dos formas de decirlo
    // es una de más, además de basura en el fichero.
    const c = casa();
    guardarSinAprobacion(c, "/proy/uno", true);
    guardarSinAprobacion(c, "/proy/uno", false);
    expect(cargarSettings(c).settings.sinAprobacion).toBeUndefined();
    expect(readFileSync(rutaSettings(c), "utf8")).not.toContain("sinAprobacion");
  });
});
