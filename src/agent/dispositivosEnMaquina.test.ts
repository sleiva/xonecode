import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { describirFallo, detectarDispositivos, TOPES_MS, type DependenciasDeDeteccion, type Ejecucion } from "./dispositivosEnMaquina.js";

/** Un ejecutor de pega: responde según el binario y apunta qué se le pidió. */
function ejecutorDe(respuestas: Record<string, Ejecucion | Error>) {
  const llamadas: { binario: string; args: string[]; timeout: number }[] = [];
  const ejecutar: NonNullable<DependenciasDeDeteccion["ejecutar"]> = async (binario, args, opciones) => {
    llamadas.push({ binario, args, timeout: opciones.timeout });
    const clave = Object.keys(respuestas).find((k) => binario === k || binario.endsWith(k) || `${binario} ${args[0]}` === k);
    const r = clave === undefined ? new Error(`sin respuesta preparada para ${binario} ${args.join(" ")}`) : respuestas[clave]!;
    if (r instanceof Error) throw r;
    return r;
  };
  return { ejecutar, llamadas };
}

const salida = (stdout: string): Ejecucion => ({ stdout, stderr: "" });

describe("detectarDispositivos", () => {
  it("en Windows sin SDK: adb y emulator no encontrados, e iOS «no aplica» —no «no hay»—", async () => {
    const { ejecutar, llamadas } = ejecutorDe({});
    const informe = await detectarDispositivos({
      plataforma: "win32",
      entorno: { Path: "C:\\Windows\\System32" },
      home: "C:\\Users\\yo",
      existe: () => false,
      ejecutar,
      ahora: () => new Date("2026-09-06T10:00:00Z"),
    });
    expect(informe.sistema).toBe("windows");
    expect(informe.medido).toBe("2026-09-06T10:00:00.000Z");
    expect(informe.herramientas.map((h) => [h.nombre, h.estado])).toEqual([
      ["adb", "no-encontrada"],
      ["emulator", "no-encontrada"],
      ["xcrun", "no-aplica"],
      ["devicectl", "no-aplica"],
    ]);
    expect(informe.dispositivos).toEqual([]);
    // Ni un proceso lanzado: sin binario no hay a quién preguntar, y en Windows xcrun no se intenta.
    expect(llamadas).toEqual([]);
  });

  it("en Windows busca `adb.exe` en el PATH y luego en `%LOCALAPPDATA%\\Android\\Sdk`", async () => {
    const sdk = join("C:\\Users\\yo\\AppData\\Local", "Android", "Sdk");
    const adb = join(sdk, "platform-tools", "adb.exe");
    const { ejecutar, llamadas } = ejecutorDe({ "adb.exe": salida("List of devices attached\nABC device model:Pixel_8\n") });
    const informe = await detectarDispositivos({
      plataforma: "win32",
      entorno: { Path: "C:\\Windows", LOCALAPPDATA: "C:\\Users\\yo\\AppData\\Local" },
      home: "C:\\Users\\yo",
      existe: (ruta) => ruta === adb,
      ejecutar,
    });
    expect(informe.herramientas.find((h) => h.nombre === "adb")).toEqual({ nombre: "adb", estado: "ok", ruta: adb });
    expect(llamadas[0]).toEqual({ binario: adb, args: ["devices", "-l"], timeout: TOPES_MS.adb });
    expect(informe.dispositivos).toEqual([{ id: "ABC", nombre: "Pixel 8", plataforma: "android", clase: "fisico", estado: "conectado" }]);
  });

  it("en macOS con Xcode y ANDROID_HOME: los cuatro «ok», simuladores y AVDs listados", async () => {
    const adb = "/opt/android/platform-tools/adb";
    const emulator = "/opt/android/emulator/emulator";
    const simctl = JSON.stringify({
      devices: { "com.apple.CoreSimulator.SimRuntime.iOS-26-0": [{ udid: "U1", isAvailable: true, state: "Booted", name: "iPhone 17" }] },
    });
    const devicectl = JSON.stringify({ result: { devices: [] } });
    const { ejecutar, llamadas } = ejecutorDe({
      "/opt/android/platform-tools/adb": salida("List of devices attached\nemulator-5554 device model:sdk_gphone64\n"),
      "/opt/android/emulator/emulator": salida("INFO | ruido\nPixel_8_API_35\n"),
      "xcode-select": salida("/Applications/Xcode.app/Contents/Developer\n"),
      "xcrun simctl": salida(simctl),
      "xcrun devicectl": salida(""),
    });
    let leido: string | undefined;
    const informe = await detectarDispositivos({
      plataforma: "darwin",
      entorno: { PATH: "/usr/bin:/bin", ANDROID_HOME: "/opt/android" },
      home: "/Users/yo",
      existe: (ruta) => ruta === adb || ruta === emulator,
      ejecutar,
      ficheroTemporal: () => "/tmp/devicectl.json",
      leer: async (ruta) => {
        leido = ruta;
        return devicectl;
      },
      borrar: async () => undefined,
    });
    expect(informe.sistema).toBe("mac");
    expect(informe.herramientas.map((h) => `${h.nombre}:${h.estado}`)).toEqual(["adb:ok", "emulator:ok", "xcrun:ok", "devicectl:ok"]);
    expect(informe.avds).toEqual(["Pixel_8_API_35"]);
    expect(informe.dispositivos.map((d) => `${d.plataforma}/${d.clase}/${d.estado}`)).toEqual([
      "android/emulador/conectado",
      "ios/simulador/arrancado",
    ]);
    // El JSON de devicectl se lee del fichero que se le pidió escribir, no de stdout.
    expect(leido).toBe("/tmp/devicectl.json");
    expect(llamadas.find((l) => l.args[0] === "devicectl")?.args).toEqual(["devicectl", "list", "devices", "--json-output", "/tmp/devicectl.json"]);
    // Y xcode-select va ANTES que cualquier xcrun: es la guarda contra el diálogo de instalar.
    expect(llamadas.findIndex((l) => l.binario === "xcode-select")).toBeLessThan(llamadas.findIndex((l) => l.binario === "xcrun"));
  });

  it("el fichero de devicectl se borra TAMBIÉN cuando xcrun falla: no se deja basura en tmp", async () => {
    const borrados: string[] = [];
    const { ejecutar } = ejecutorDe({
      "xcode-select": salida("/Applications/Xcode.app/Contents/Developer\n"),
      "xcrun simctl": salida("{}"),
      "xcrun devicectl": Object.assign(new Error("Command failed"), { killed: true }),
    });
    const informe = await detectarDispositivos({
      plataforma: "darwin",
      entorno: {},
      home: "/Users/yo",
      existe: () => false,
      ejecutar,
      ficheroTemporal: () => "/tmp/d.json",
      leer: async () => {
        throw new Error("no debería leerse");
      },
      borrar: async (ruta) => {
        borrados.push(ruta);
      },
    });
    expect(informe.herramientas.find((h) => h.nombre === "devicectl")?.estado).toBe("fallo");
    expect(borrados).toEqual(["/tmp/d.json"]);
  });

  it("en macOS sin herramientas de desarrollo NO se llama a xcrun: se dice que faltan", async () => {
    const { ejecutar, llamadas } = ejecutorDe({ "xcode-select": Object.assign(new Error("xcode-select: error: unable to get active developer directory"), { code: 2 }) });
    const informe = await detectarDispositivos({ plataforma: "darwin", entorno: {}, home: "/Users/yo", existe: () => false, ejecutar });
    expect(informe.herramientas.filter((h) => h.nombre === "xcrun" || h.nombre === "devicectl").map((h) => h.estado)).toEqual([
      "no-encontrada",
      "no-encontrada",
    ]);
    expect(llamadas.some((l) => l.binario === "xcrun")).toBe(false);
  });

  it("una herramienta que se cuelga se reporta como «no respondió», con el tope, y no tumba a las demás", async () => {
    const colgado = Object.assign(new Error("Command failed: adb devices -l"), { killed: true, signal: "SIGTERM" });
    const { ejecutar } = ejecutorDe({ "/sdk/platform-tools/adb": colgado, "/sdk/emulator/emulator": salida("AVD_1\n") });
    const informe = await detectarDispositivos({
      plataforma: "linux",
      entorno: { PATH: "", ANDROID_SDK_ROOT: "/sdk" },
      home: "/home/yo",
      existe: (ruta) => ruta.startsWith("/sdk/"),
      ejecutar,
    });
    expect(informe.herramientas.find((h) => h.nombre === "adb")).toEqual({
      nombre: "adb",
      estado: "fallo",
      ruta: "/sdk/platform-tools/adb",
      detalle: "no respondió en 15 s",
    });
    expect(informe.herramientas.find((h) => h.nombre === "emulator")?.estado).toBe("ok");
    expect(informe.avds).toEqual(["AVD_1"]);
  });

  it("en Linux la carpeta por omisión es ~/Android/Sdk", async () => {
    const adb = join("/home/yo", "Android", "Sdk", "platform-tools", "adb");
    const { ejecutar } = ejecutorDe({ [adb]: salida("List of devices attached\n") });
    const informe = await detectarDispositivos({ plataforma: "linux", entorno: { PATH: "/usr/bin" }, home: "/home/yo", existe: (r) => r === adb, ejecutar });
    expect(informe.herramientas.find((h) => h.nombre === "adb")).toEqual({ nombre: "adb", estado: "ok", ruta: adb });
  });
});

describe("describirFallo", () => {
  it("prefiere la primera línea de stderr, recortada, y nunca la salida entera", () => {
    const largo = "x".repeat(300);
    expect(describirFallo(Object.assign(new Error("Command failed: adb"), { stderr: `\n${largo}\nsegunda` }), 1000)).toBe(`${"x".repeat(159)}…`);
  });
  it("sin stderr, salta la línea «Command failed» y se queda con la siguiente", () => {
    expect(describirFallo(new Error("Command failed: adb devices\nerror: no devices/emulators found"), 1000)).toBe("error: no devices/emulators found");
  });
  it("ENOENT se dice como que el ejecutable no existe", () => {
    expect(describirFallo(Object.assign(new Error("spawn adb ENOENT"), { code: "ENOENT" }), 1000)).toBe("el ejecutable no existe");
  });
});
