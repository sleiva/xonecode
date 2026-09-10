import { describe, it, expect } from "vitest";
import type { Dispositivo } from "../core/dispositivos.js";
import { join } from "node:path";
import {
  describirFallo,
  detectarDispositivos,
  instalarHerramientaDeDispositivos,
  verificarDispositivo,
  TOPES_MS,
  type DependenciasDeDeteccion,
  type Ejecucion,
} from "./dispositivosEnMaquina.js";

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

  it("un destino apagado NO lanza su proceso, y su herramienta se declara «desactivada»", async () => {
    // El sentido del ajuste es este: medir cuesta procesos en el equipo del usuario —adb
    // arranca un demonio que se queda vivo, xcrun tarda segundos—, así que apagar tiene que
    // dejar de lanzarlos de verdad y no solo esconder filas.
    const { ejecutar, llamadas } = ejecutorDe({ adb: salida("List of devices attached\nABC device model:Pixel_8\n") });
    const informe = await detectarDispositivos(
      {
        plataforma: "darwin",
        entorno: { PATH: "/bin" },
        home: "/Users/yo",
        existe: (r) => r === "/bin/adb" || r === "/bin/emulator",
        ejecutar,
        ahora: () => new Date("2026-09-07T10:00:00Z"),
      },
      { androidEmulador: false, ios: false, iosSimulador: false }
    );
    expect(informe.herramientas.map((h) => [h.nombre, h.estado])).toEqual([
      ["adb", "ok"],
      ["emulator", "desactivada"],
      ["xcrun", "desactivada"],
      ["devicectl", "desactivada"],
    ]);
    // Solo adb: ni `emulator -list-avds`, ni siquiera `xcode-select -p`. Apagar los dos
    // destinos de iOS ahorra TODOS sus procesos, no solo los dos `xcrun` del final.
    expect(llamadas.map((l) => l.binario)).toEqual(["/bin/adb"]);
    expect(informe.dispositivos.map((d) => d.nombre)).toEqual(["Pixel 8"]);
    expect(informe.avds).toEqual([]);
  });

  it("con «Android físico» apagado y el emulador encendido, adb SÍ se llama y la lista se filtra", async () => {
    // adb no distingue: trae los físicos y los emuladores en la misma lista, y un emulador
    // arrancado no aparece en ningún otro sitio. Así que se llama igual y se filtra después.
    const { ejecutar, llamadas } = ejecutorDe({
      adb: salida("List of devices attached\nemulator-5554 device model:sdk_gphone64\nR58M12 device model:Galaxy_S21\n"),
      emulator: salida("Pixel_8_API_34\n"),
    });
    const informe = await detectarDispositivos(
      {
        plataforma: "linux",
        entorno: { PATH: "/bin" },
        home: "/home/yo",
        existe: (r) => r === "/bin/adb" || r === "/bin/emulator",
        ejecutar,
      },
      { android: false }
    );
    expect(llamadas.map((l) => l.binario)).toEqual(["/bin/adb", "/bin/emulator"]);
    expect(informe.dispositivos.map((d) => d.nombre)).toEqual(["sdk gphone64"]);
    expect(informe.avds).toEqual(["Pixel_8_API_34"]);
  });

  it("sin ajustes se mira todo: ausente no es «no»", async () => {
    const { ejecutar, llamadas } = ejecutorDe({ adb: salida("List of devices attached\n"), emulator: salida("") });
    await detectarDispositivos({
      plataforma: "linux",
      entorno: { PATH: "/bin" },
      home: "/home/yo",
      existe: (r) => r === "/bin/adb" || r === "/bin/emulator",
      ejecutar,
    });
    expect(llamadas.map((l) => l.binario)).toEqual(["/bin/adb", "/bin/emulator"]);
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

  it("en macOS encuentra el SDK que instala Homebrew, sin ANDROID_HOME", async () => {
    // Medido: `brew install --cask android-commandlinetools` deja el SDK en
    // `<prefijo>/share/android-commandlinetools`, que NO es la carpeta por omisión de
    // Android Studio. Sin esto, seguir los pasos de instalación al pie de la letra dejaba
    // el panel diciendo «emulator no está instalado» hasta tocarse el `.zshrc` — la consola
    // pidiendo un cambio en la shell del usuario para ver lo que ya estaba en el disco.
    const raiz = "/opt/homebrew/share/android-commandlinetools";
    const { ejecutar } = ejecutorDe({
      [`${raiz}/platform-tools/adb`]: salida("List of devices attached\n"),
      [`${raiz}/emulator/emulator`]: salida("pixel8\n"),
      "xcode-select": new Error("no"),
    });
    const informe = await detectarDispositivos({
      plataforma: "darwin",
      entorno: { PATH: "/usr/bin" },
      home: "/Users/yo",
      existe: (ruta) => ruta.startsWith(raiz),
      ejecutar,
      ahora: () => new Date("2026-09-07T10:00:00Z"),
    });
    const porNombre = Object.fromEntries(informe.herramientas.map((h) => [h.nombre, h]));
    expect(porNombre["adb"]!.estado).toBe("ok");
    expect(porNombre["emulator"]!.estado).toBe("ok");
    expect(informe.avds).toEqual(["pixel8"]);
  });

  it("y también el prefijo de Intel, que es otro", async () => {
    const raiz = "/usr/local/share/android-commandlinetools";
    const { ejecutar } = ejecutorDe({
      [`${raiz}/platform-tools/adb`]: salida("List of devices attached\n"),
      [`${raiz}/emulator/emulator`]: salida(""),
      "xcode-select": new Error("no"),
    });
    const informe = await detectarDispositivos({
      plataforma: "darwin",
      entorno: { PATH: "/usr/bin" },
      home: "/Users/yo",
      existe: (ruta) => ruta.startsWith(raiz),
      ejecutar,
      ahora: () => new Date("2026-09-07T10:00:00Z"),
    });
    expect(informe.herramientas.find((h) => h.nombre === "adb")!.estado).toBe("ok");
  });

  it("la receta del emulador viaja con el informe, y en Windows no se inventa ninguna", async () => {
    const { ejecutar } = ejecutorDe({ "xcode-select": new Error("no") });
    const deps = (plataforma: string): DependenciasDeDeteccion => ({
      plataforma,
      entorno: { PATH: "/usr/bin", Path: "C:\\W" },
      home: "/Users/yo",
      existe: () => false,
      ejecutar,
      ahora: () => new Date("2026-09-07T10:00:00Z"),
    });
    const mac = await detectarDispositivos(deps("darwin"));
    // Las DOS de macOS. La de iOS sale aunque `xcode-select` falle: entonces su primer paso
    // es «instala Xcode», que es exactamente lo que hace falta.
    expect(mac.recetas.map((r) => r.id)).toEqual(["android-emulador", "ios-simulador"]);
    expect(mac.recetas.every((r) => !r.completa)).toBe(true);
    expect(JSON.stringify(mac.recetas)).not.toContain("/Users/yo");

    const win = await detectarDispositivos(deps("win32"));
    expect(win.recetas).toEqual([]);
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

describe("cómo se instala lo que falta", () => {
  it("propone brew para adb cuando está, y NUNCA un comando con una ruta dentro", async () => {
    // El comando se pinta en Ajustes y viaja por el cable, que puede ir por un túnel: una
    // ruta del home del usuario ahí es la misma fuga que `sinRutas` evita con `ruta`.
    const { ejecutar } = ejecutorDe({});
    const informe = await detectarDispositivos({
      plataforma: "darwin",
      entorno: { PATH: "/opt/homebrew/bin" },
      home: "/Users/yo",
      existe: (r) => r === "/opt/homebrew/bin/brew",
      ejecutar,
    });
    const adb = informe.herramientas.find((h) => h.nombre === "adb")!;
    expect(adb.instalar).toEqual({ comando: "brew install --cask android-platform-tools", automatico: false });
    for (const h of informe.herramientas) expect(h.instalar?.comando ?? "").not.toContain("/Users/yo");
  });

  it("sin sdkmanager ni brew no se inventa un instalador", async () => {
    const { ejecutar } = ejecutorDe({});
    const informe = await detectarDispositivos({
      plataforma: "linux",
      entorno: { PATH: "/bin" },
      home: "/home/yo",
      existe: () => false,
      ejecutar,
    });
    expect(informe.herramientas.find((h) => h.nombre === "adb")!.instalar).toBeUndefined();
    // Y en Linux tampoco se propone Xcode: no es que falte, es que no aplica.
    expect(informe.herramientas.find((h) => h.nombre === "xcrun")!.instalar).toBeUndefined();
  });

  it("solo `xcode-select --install` es automático: lo demás se copia", async () => {
    const { ejecutar } = ejecutorDe({ "xcode-select": salida("") });
    const informe = await detectarDispositivos({
      plataforma: "darwin",
      entorno: { PATH: "/usr/bin" },
      home: "/Users/yo",
      existe: () => false,
      ejecutar,
    });
    expect(informe.herramientas.find((h) => h.nombre === "xcrun")!.instalar).toEqual({
      comando: "xcode-select --install",
      automatico: true,
    });
  });
});

describe("instalarHerramientaDeDispositivos", () => {
  it("lanza xcode-select --install en macOS, y nada en otro sistema", async () => {
    const mac = ejecutorDe({ "xcode-select": salida("") });
    await instalarHerramientaDeDispositivos("xcrun", { plataforma: "darwin", ejecutar: mac.ejecutar });
    expect(mac.llamadas.map((l) => [l.binario, l.args])).toEqual([["xcode-select", ["--install"]]]);

    const linux = ejecutorDe({});
    await instalarHerramientaDeDispositivos("xcrun", { plataforma: "linux", ejecutar: linux.ejecutar });
    expect(linux.llamadas).toEqual([]);
  });

  it("no hay instalador para adb: no se lanza nada", async () => {
    const { ejecutar, llamadas } = ejecutorDe({});
    await instalarHerramientaDeDispositivos("adb", { plataforma: "darwin", ejecutar });
    expect(llamadas).toEqual([]);
  });

  it("un código de salida no nulo NO es un fallo: xcode-select sale con error si ya están puestas", async () => {
    const fallo = Object.assign(new Error("already installed"), { code: 1 });
    const { ejecutar } = ejecutorDe({ "xcode-select": fallo });
    await expect(instalarHerramientaDeDispositivos("xcrun", { plataforma: "darwin", ejecutar })).resolves.toBeUndefined();
  });

  it("un cuelgue SÍ se propaga: eso no lo arregla medir después", async () => {
    const colgado = Object.assign(new Error("timeout"), { killed: true });
    const { ejecutar } = ejecutorDe({ "xcode-select": colgado });
    await expect(instalarHerramientaDeDispositivos("xcrun", { plataforma: "darwin", ejecutar })).rejects.toThrow();
  });
});

describe("la receta del simulador de iOS", () => {
  /** Una máquina con Xcode completo, la licencia aceptada y un runtime instalado. */
  const conXcode = () =>
    ejecutorDe({
      "xcode-select": salida("/Applications/Xcode.app/Contents/Developer\n"),
      xcodebuild: salida("Xcode 26.6\nBuild version 17F113\n"),
      xcrun: salida(
        JSON.stringify({
          runtimes: [{ name: "iOS 26.0", version: "26.0.1", isAvailable: true, platform: "iOS" }],
          devices: {},
        })
      ),
    });

  const deps = (ejecutar: NonNullable<DependenciasDeDeteccion["ejecutar"]>): DependenciasDeDeteccion => ({
    plataforma: "darwin",
    entorno: { PATH: "/bin" },
    home: "/Users/yo",
    existe: () => false,
    ejecutar,
    leer: async () => JSON.stringify({ result: { devices: [] } }),
    borrar: async () => undefined,
    ficheroTemporal: () => "/tmp/x.json",
    ahora: () => new Date("2026-09-10T10:00:00Z"),
  });

  it("con Xcode y un runtime sale COMPLETA, y los runtime salen del mismo simctl", async () => {
    const { ejecutar, llamadas } = conXcode();
    const informe = await detectarDispositivos(deps(ejecutar));
    const receta = informe.recetas.find((r) => r.id === "ios-simulador")!;
    expect(receta.completa).toBe(true);
    // Un solo listado para las dos cosas: medir cuesta procesos en el equipo del usuario.
    const simctl = llamadas.find((l) => l.args[0] === "simctl")!;
    expect(simctl.args).toContain("runtimes");
    expect(simctl.args).toContain("devices");
    expect(llamadas.filter((l) => l.args[0] === "simctl")).toHaveLength(1);
  });

  it("las Command Line Tools NO son Xcode: el primer paso se queda pendiente", async () => {
    // `xcode-select -p` contesta y `simctl` funciona, así que la detección va bien y aun así
    // no hay ningún simulador que instalar sin Xcode completo. Es la mitad de esta receta.
    const { ejecutar } = ejecutorDe({
      "xcode-select": salida("/Library/Developer/CommandLineTools\n"),
      xcrun: salida(JSON.stringify({ runtimes: [], devices: {} })),
    });
    const informe = await detectarDispositivos(deps(ejecutar));
    const receta = informe.recetas.find((r) => r.id === "ios-simulador")!;
    expect(receta.pasos[0]!.hecho).toBe(false);
    expect(receta.completa).toBe(false);
  });

  it("sin Xcode completo no se pregunta por la licencia: es un proceso que no diría nada", async () => {
    const { ejecutar, llamadas } = ejecutorDe({
      "xcode-select": salida("/Library/Developer/CommandLineTools\n"),
      xcrun: salida(JSON.stringify({ runtimes: [], devices: {} })),
    });
    await detectarDispositivos(deps(ejecutar));
    expect(llamadas.filter((l) => l.binario === "xcodebuild")).toEqual([]);
  });

  /**
   * Con el destino de simuladores apagado no hay receta, y eso no es simetría con la de
   * Android: la de Android se compone de lo que ya se sabía (mirar el PATH no lanza nada) y
   * esta necesita haber medido. Sin medir, sus tres pasos saldrían «pendientes» en una
   * máquina que los tiene hechos — peor que ninguna receta.
   */
  it("con los simuladores apagados en Ajustes no viaja receta de iOS ni se llama a xcodebuild", async () => {
    const { ejecutar, llamadas } = conXcode();
    const informe = await detectarDispositivos(deps(ejecutar), { iosSimulador: false });
    expect(informe.recetas.map((r) => r.id)).toEqual(["android-emulador"]);
    expect(llamadas.filter((l) => l.binario === "xcodebuild")).toEqual([]);
  });
});

describe("verificarDispositivo", () => {
  const android: Dispositivo = {
    id: "R58M12ABCDE",
    nombre: "Pixel 8",
    plataforma: "android",
    clase: "fisico",
    estado: "conectado",
  };
  const simulador: Dispositivo = {
    id: "EF39AE73",
    nombre: "iPhone 17 Pro · iOS 26.0",
    plataforma: "ios",
    clase: "simulador",
    estado: "apagado",
  };

  const conAdb = { plataforma: "darwin", entorno: { PATH: "/opt/homebrew/bin" }, home: "/Users/yo", existe: (r: string) => r === "/opt/homebrew/bin/adb" };

  it("en Android habla por la SHELL, no relee la lista, y dice el modelo", async () => {
    // `adb devices` puede decir «device» de un teléfono cuyo `adb shell` no contesta: eso es
    // lo que esto distingue, y por eso el comando ejecuta algo AL OTRO LADO.
    const { ejecutar, llamadas } = ejecutorDe({ adb: salida("sdk_gphone64_arm64\n") });
    const v = await verificarDispositivo(android, { ...conAdb, ejecutar });
    expect(v).toEqual({ ok: true, detalle: "responde: sdk_gphone64_arm64" });
    expect(llamadas[0]!.binario).toBe("/opt/homebrew/bin/adb");
    expect(llamadas[0]!.args).toEqual(["-s", "R58M12ABCDE", "shell", "getprop", "ro.product.model"]);
    expect(llamadas[0]!.timeout).toBe(TOPES_MS.adb);
  });

  it("contestar sin decir el modelo sigue siendo contestar", async () => {
    // La pregunta era si hay una shell viva. Inventar un modelo vacío sería afirmar de más.
    const { ejecutar } = ejecutorDe({ adb: salida("\n") });
    expect(await verificarDispositivo(android, { ...conAdb, ejecutar })).toEqual({
      ok: true,
      detalle: "responde a la shell",
    });
  });

  it("un dispositivo sin autorizar falla con SU motivo, que es lo accionable", async () => {
    const error = Object.assign(new Error("Command failed"), { stderr: "error: device unauthorized.\n" });
    const { ejecutar } = ejecutorDe({ adb: error });
    const v = await verificarDispositivo(android, { ...conAdb, ejecutar });
    expect(v.ok).toBe(false);
    expect(v.detalle).toContain("device unauthorized");
  });

  it("sin adb en la máquina se dice qué falta, y no se lanza nada", async () => {
    const { ejecutar, llamadas } = ejecutorDe({});
    const v = await verificarDispositivo(android, { plataforma: "darwin", entorno: {}, home: "/Users/yo", existe: () => false, ejecutar });
    expect(v.ok).toBe(false);
    expect(v.detalle).toMatch(/no está adb/i);
    expect(llamadas).toEqual([]);
  });

  it("un simulador se verifica EJECUTANDO algo dentro, que es lo que exige que esté vivo", async () => {
    // Medido: `simctl getenv` contesta la ruta de datos de un simulador APAGADO, así que no
    // vale como comprobación de nada. `spawn` sí.
    const { ejecutar, llamadas } = ejecutorDe({ xcrun: salida("25.6.0\n") });
    const v = await verificarDispositivo(simulador, { plataforma: "darwin", ejecutar });
    expect(v.ok).toBe(true);
    expect(llamadas[0]!.args.slice(0, 3)).toEqual(["simctl", "spawn", "EF39AE73"]);
  });

  it("un simulador apagado contesta lo que se puede leer, no el código de error", async () => {
    // El texto real de simctl, medido: la primera línea es un dominio y un número.
    const error = Object.assign(new Error("Command failed"), {
      stderr: [
        "An error was encountered processing the command (domain=com.apple.CoreSimulator.SimError, code=405):",
        "Process spawn via launchd failed because device is not booted.",
      ].join("\n"),
    });
    const { ejecutar } = ejecutorDe({ xcrun: error });
    const v = await verificarDispositivo(simulador, { plataforma: "darwin", ejecutar });
    expect(v).toEqual({ ok: false, detalle: "Process spawn via launchd failed because device is not booted." });
  });

  it("un iPhone físico se verifica con devicectl, y se LEE lo que escribió", async () => {
    // `devicectl` no imprime el JSON por stdout: un código 0 sin fichero legible no es una
    // respuesta. Y el temporal se borra siempre.
    const { ejecutar, llamadas } = ejecutorDe({ xcrun: salida("") });
    const borrados: string[] = [];
    const fisico: Dispositivo = { id: "00008120-ABC", nombre: "iPhone de Sergio", plataforma: "ios", clase: "fisico", estado: "conectado" };
    const v = await verificarDispositivo(fisico, {
      plataforma: "darwin",
      ejecutar,
      leer: async () => JSON.stringify({ result: { devices: [] } }),
      borrar: async (r) => void borrados.push(r),
      ficheroTemporal: () => "/tmp/dc.json",
    });
    expect(v.ok).toBe(true);
    expect(llamadas[0]!.args.slice(0, 5)).toEqual(["devicectl", "device", "info", "details", "--device"]);
    expect(borrados).toEqual(["/tmp/dc.json"]);
  });

  it("si el fichero de devicectl no se puede leer, se dice ESO y no «el ejecutable no existe»", async () => {
    // El binario acaba de ejecutarse bien: el `ENOENT` es del FICHERO. Pasado por
    // `describirFallo` salía «el ejecutable no existe», que es un motivo falso — peor que
    // uno vago, porque manda a mirar donde no hay nada.
    const { ejecutar } = ejecutorDe({ xcrun: salida("") });
    const borrados: string[] = [];
    const fisico: Dispositivo = { id: "00008120-ABC", nombre: "iPhone", plataforma: "ios", clase: "fisico", estado: "conectado" };
    const v = await verificarDispositivo(fisico, {
      plataforma: "darwin",
      ejecutar,
      leer: async () => {
        throw Object.assign(new Error("no such file"), { code: "ENOENT" });
      },
      borrar: async (r) => void borrados.push(r),
      ficheroTemporal: () => "/tmp/dc.json",
    });
    expect(v).toEqual({ ok: false, detalle: "devicectl no dejó su respuesta donde se le pidió" });
    // Y el temporal se va pase lo que pase.
    expect(borrados).toEqual(["/tmp/dc.json"]);
  });

  it("fuera de macOS un dispositivo iOS no se verifica: la máquina no puede", async () => {
    const { ejecutar, llamadas } = ejecutorDe({});
    const v = await verificarDispositivo(simulador, { plataforma: "linux", ejecutar });
    expect(v.ok).toBe(false);
    expect(v.detalle).toMatch(/solo se verifican en macOS/i);
    expect(llamadas).toEqual([]);
  });

  it("nunca lanza: un fallo raro también vuelve como respuesta", async () => {
    const { ejecutar } = ejecutorDe({ adb: new Error("boom") });
    await expect(verificarDispositivo(android, { ...conAdb, ejecutar })).resolves.toMatchObject({ ok: false });
  });
});
