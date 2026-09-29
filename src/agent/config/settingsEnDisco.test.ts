import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { cerrarCheckpointerDeProyecto, crearCheckpointerDeProyecto } from "../sesiones/checkpointer.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  cargarSettings,
  guardarConcurrenciaDeTareas,
  guardarDepurar,
  guardarDispositivos,
  guardarEntorno,
  guardarWorkspace,
  olvidarEntornoDeSettings,
  borrarCopiaDeProyecto,
  borrarCopiasDeEntorno,
  copiasDeEntorno,
  rutaSettings,
  SettingsRotosEnDisco,
} from "./settingsEnDisco.js";

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

  it("guardarConcurrenciaDeTareas escribe el tope sin tocar los entornos", () => {
    const c = casa();
    guardarEntorno(c, { id: "a", nombre: "A", url: "https://a/mcp" });
    guardarConcurrenciaDeTareas(c, 5);
    const { settings } = cargarSettings(c);
    expect(settings.concurrenciaDeTareas).toBe(5);
    expect(settings.entornos.map((e) => e.id)).toEqual(["a"]);
  });

  it("guardarConcurrenciaDeTareas acepta CERO: es cómo se pausa la cola", () => {
    const c = casa();
    guardarConcurrenciaDeTareas(c, 0);
    expect(cargarSettings(c).settings.concurrenciaDeTareas).toBe(0);
  });

  it("guardarConcurrenciaDeTareas acota fuera de rango en vez de escribir basura", () => {
    const c = casa();
    guardarConcurrenciaDeTareas(c, -3);
    expect(cargarSettings(c).settings.concurrenciaDeTareas).toBe(0);
    guardarConcurrenciaDeTareas(c, 99);
    expect(cargarSettings(c).settings.concurrenciaDeTareas).toBe(8);
  });

  it("guardarDepurar(false) escribe el apagado sin tocar los entornos", () => {
    const c = casa();
    guardarEntorno(c, { id: "a", nombre: "A", url: "https://a/mcp" });
    guardarDepurar(c, false);
    const { settings } = cargarSettings(c);
    expect(settings.depurar).toBe(false);
    expect(settings.entornos.map((e) => e.id)).toEqual(["a"]);
  });

  it("guardarDepurar(true) BORRA la clave: ausente y encendida significan lo mismo aquí", () => {
    const c = casa();
    guardarDepurar(c, false);
    guardarDepurar(c, true);
    const crudo = JSON.parse(readFileSync(join(c, ".xonecode", "settings.json"), "utf8")) as Record<string, unknown>;
    expect("depurar" in crudo).toBe(false);
    expect(cargarSettings(c).settings.depurar).toBeUndefined();
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



describe("olvidarEntornoDeSettings", () => {
  it("quita ESE entorno y deja los demás y el resto del fichero", () => {
    const c = casa();
    guardarEntorno(c, { id: "a", nombre: "A", url: "https://a/mcp" });
    guardarEntorno(c, { id: "b", nombre: "B", url: "https://b/mcp" });
    guardarWorkspace(c, "/mi/ws");
    olvidarEntornoDeSettings(c, "a");
    const { settings } = cargarSettings(c);
    expect(settings.entornos.map((e) => e.id)).toEqual(["b"]);
    expect(settings.workspace).toBe("/mi/ws");
  });
});


describe("borrarCopiasDeEntorno", () => {
  it("borra `<workspace>/<entorno>/` entera y dice cuántas copias había; los demás entornos quedan", () => {
    const base = casa();
    mkdirSync(join(base, "manager", "A", ".xonecode"), { recursive: true });
    mkdirSync(join(base, "manager", "B"), { recursive: true });
    mkdirSync(join(base, "webstudio", "C"), { recursive: true });
    expect(copiasDeEntorno(base, "manager")).toBe(2);
    expect(borrarCopiasDeEntorno(base, "manager")).toBe(2);
    expect(existsSync(join(base, "manager"))).toBe(false);
    expect(existsSync(join(base, "webstudio", "C"))).toBe(true);
  });

  it("un id que no es un segmento llano, o un enlace que sale del workspace, se NIEGA", () => {
    const base = casa();
    expect(() => borrarCopiasDeEntorno(base, "..")).toThrow();
    const fuera = casa();
    mkdirSync(join(fuera, "importante"));
    symlinkSync(fuera, join(base, "enlace"));
    expect(() => borrarCopiasDeEntorno(base, "enlace")).toThrow(/fuera del workspace/);
    expect(existsSync(join(fuera, "importante"))).toBe(true);
  });
});

describe("borrarCopiaDeProyecto", () => {
  it("borra SOLO `<workspace>/<entorno>/<proyecto>/`, y dice si había algo", () => {
    const base = casa();
    mkdirSync(join(base, "manager", "A", ".xonecode"), { recursive: true });
    writeFileSync(join(base, "manager", "A", ".xonecode", "checkpoint.sqlite"), "");
    mkdirSync(join(base, "manager", "B"), { recursive: true });
    expect(borrarCopiaDeProyecto(base, "manager", "A")).toBe("borrada");
    expect(existsSync(join(base, "manager", "A"))).toBe(false);
    expect(existsSync(join(base, "manager", "B"))).toBe(true);
    // Ni la lápida se queda: la carpeta del entorno solo tiene a B.
    expect(readdirSync(join(base, "manager"))).toEqual(["B"]);
    // Lo que ya no está no es un fallo: no había nada que borrar.
    expect(borrarCopiaDeProyecto(base, "manager", "A")).toBe("nada");
  });

  /**
   * EL caso de Windows: algo tiene abierto un fichero de la copia —aquí, un checkpointer que
   * NO se suelta, como el de otro proceso de xonecode—. Lo que no puede pasar es una copia a
   * medias: o se va entera de su sitio, o se queda intacta. En Windows se queda intacta (el
   * renombrado falla antes de tocar nada); en Linux y macOS se va.
   */
  it("con un fichero ABIERTO dentro, o se va entera o se queda intacta: nunca a medias", async () => {
    const base = casa();
    const raiz = join(base, "manager", "A");
    mkdirSync(raiz, { recursive: true });
    writeFileSync(join(raiz, "app.xne"), "<app/>");
    const saver = crearCheckpointerDeProyecto(raiz)!;
    await saver.put(
      { configurable: { thread_id: "s1" } },
      { v: 4, id: "1", ts: new Date().toISOString(), channel_values: {}, channel_versions: {}, versions_seen: {} } as never,
      { source: "input", step: 0, parents: {} } as never,
      {}
    );
    let resultado: string;
    try {
      resultado = borrarCopiaDeProyecto(base, "manager", "A");
    } catch {
      resultado = "negado";
    }
    if (resultado === "negado") expect(existsSync(join(raiz, "app.xne"))).toBe(true);
    else expect(existsSync(raiz)).toBe(false);
    cerrarCheckpointerDeProyecto(raiz);
  });

  it("un segmento que no es llano, o un enlace que sale del workspace, se NIEGA", () => {
    const base = casa();
    expect(() => borrarCopiaDeProyecto(base, "manager", "..")).toThrow();
    expect(() => borrarCopiaDeProyecto(base, "..", "A")).toThrow();
    const fuera = casa();
    mkdirSync(join(fuera, "importante"));
    mkdirSync(join(base, "manager"));
    symlinkSync(fuera, join(base, "manager", "enlace"), "junction");
    expect(() => borrarCopiaDeProyecto(base, "manager", "enlace")).toThrow(/fuera del workspace/);
    expect(existsSync(join(fuera, "importante"))).toBe(true);
  });

  it("los fijados de un entorno se guardan y se leen: la ida y vuelta entera", () => {
    const c = casa();
    guardarEntorno(c, { id: "a", nombre: "A", url: "https://a/mcp", proyectos: ["p1"], fijados: ["p2"] });
    const [a] = cargarSettings(c).settings.entornos;
    expect(a?.fijados).toEqual(["p2"]);
    // Y los visibles siguen ahí: una lista no se come a la otra.
    expect(a?.proyectos).toEqual(["p1"]);
  });
});
