import { describe, it, expect } from "vitest";
import type { Dispositivo } from "../../core/dispositivos.js";
import { join, win32 } from "node:path";
import {
  describirFallo,
  detectarDispositivos,
  frameworkEnDispositivo,
  instalarHerramientaDeDispositivos,
  verificarDispositivo,
  jdkDeLaMaquina,
  localizadorDeAndroid,
  TOPES_MS,
  type DependenciasDeDeteccion,
  type Ejecucion,
  pathConCarpetas,
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

  it("con `rutaAdb`/`rutaEmulator` puestas y existentes, se usan DIRECTO —ni PATH ni SDK—", async () => {
    const { ejecutar, llamadas } = ejecutorDe({
      "/opt/a-mano/adb devices": salida("List of devices attached\n"),
      "/opt/a-mano/emulator": salida(""),
    });
    const informe = await detectarDispositivos(
      {
        plataforma: "darwin",
        entorno: { PATH: "/bin" }, // adb/emulator NO están aquí: si se buscara por PATH, fallaría.
        home: "/Users/yo",
        existe: (r) => r === "/opt/a-mano/adb" || r === "/opt/a-mano/emulator",
        ejecutar,
      },
      { ios: false, iosSimulador: false, rutaAdb: " /opt/a-mano/adb ", rutaEmulator: "/opt/a-mano/emulator" }
    );
    expect(informe.herramientas.map((h) => [h.nombre, h.estado, h.ruta])).toEqual([
      ["adb", "ok", "/opt/a-mano/adb"],
      ["emulator", "ok", "/opt/a-mano/emulator"],
      ["xcrun", "desactivada", undefined],
      ["devicectl", "desactivada", undefined],
    ]);
    expect(llamadas.map((l) => l.binario)).toEqual(["/opt/a-mano/adb", "/opt/a-mano/emulator"]);
  });

  it("con `rutaAdb`/`rutaEmulator` puestas pero que NO existen, «no-encontrada» con la ruta en el detalle y sin oferta de instalar", async () => {
    const { ejecutar, llamadas } = ejecutorDe({});
    const informe = await detectarDispositivos(
      {
        plataforma: "darwin",
        entorno: { PATH: "/bin" },
        home: "/Users/yo",
        existe: () => false,
        ejecutar,
      },
      { ios: false, iosSimulador: false, rutaAdb: "/no/existe/adb", rutaEmulator: "/no/existe/emulator" }
    );
    const adb = informe.herramientas.find((h) => h.nombre === "adb")!;
    const emulator = informe.herramientas.find((h) => h.nombre === "emulator")!;
    expect(adb.estado).toBe("no-encontrada");
    expect(adb.detalle).toBe("la ruta configurada no existe: /no/existe/adb");
    expect(adb.instalar).toBeUndefined();
    expect(emulator.estado).toBe("no-encontrada");
    expect(emulator.detalle).toBe("la ruta configurada no existe: /no/existe/emulator");
    expect(emulator.instalar).toBeUndefined();
    // Ni una búsqueda por PATH/SDK: la ruta a mano manda, y no existe, así que no hay nada
    // que ejecutar.
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
      // Las claves van EXACTAS (`<binario> <primer arg>`) y no como `adb` a secas: el doble se
      // queda con el primer nombre que casa, y `adb` casa por sufijo con TODAS las llamadas —
      // así `emu avd name` recibía la lista de aparatos, no parseaba, y se disparaba la fuente
      // de respaldo: tres llamadas donde la máquina de verdad hace dos.
      "/bin/adb devices": salida("List of devices attached\nemulator-5554 device model:sdk_gphone64\nR58M12 device model:Galaxy_S21\n"),
      "/bin/adb -s": salida("Pixel_8_API_34\nOK\n"),
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
    /**
     * **Tres procesos, y el segundo `adb` es el que identifica el AVD.**
     *
     * `adb devices` no dice de qué AVD es un emulador —`model:` es de la imagen—, así que hay
     * que preguntárselo a su consola. El coste se declara aquí porque la regla de esta
     * pantalla es que medir cuesta procesos en el equipo de quien la mira: es UNA llamada por
     * emulador CONECTADO, y aquí hay uno. El `R58M12` de la lista es físico y no se le
     * pregunta; un emulador `offline` tampoco, que no contestaría.
     */
    expect(llamadas.map((l) => l.binario)).toEqual(["/bin/adb", "/bin/adb", "/bin/emulator"]);
    expect(llamadas[1]?.args).toEqual(["-s", "emulator-5554", "emu", "avd", "name"]);
    // Y se llama como su AVD, no como su imagen: `model:` decía `sdk gphone64`, y el mismo
    // aparato salía con ese nombre arrancado y con el del AVD apagado — un aparato, dos
    // nombres, que es lo que el usuario pidió quitar.
    expect(informe.dispositivos.map((d) => d.nombre)).toEqual(["Pixel_8_API_34"]);
    // `avds` sigue CRUDO: de él depende el paso de la receta que crea el AVD.
    expect(informe.avds).toEqual(["Pixel_8_API_34"]);
  });

  /**
   * **De qué AVD es el emulador, medido y puesto en su fila.**
   *
   * Es el dato que no existía y sin el cual el AVD arrancado se listaba ADEMÁS como apagado:
   * `adb devices -l` da `model:sdk_gphone64_arm64` y `emulator -list-avds` da `pixel8`, y no
   * hay forma de atar uno con otro salvo preguntándole a la consola del emulador por su
   * serial. La respuesta son DOS líneas —el nombre y el `OK` del acuse—, medido con `pixel8`
   * arrancado en la máquina del usuario.
   */
  it("el AVD de un emulador se mide por su serial, y el `OK` de la consola no se cuela", async () => {
    const { ejecutar } = ejecutorDe({
      "/bin/adb devices": salida("List of devices attached\nemulator-5554 device model:sdk_gphone64\n"),
      "/bin/adb -s": salida("pixel8\nOK\n"),
      emulator: salida("pixel8\n"),
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
    expect(informe.dispositivos.map((d) => ({ id: d.id, avd: d.avd }))).toEqual([
      { id: "emulator-5554", avd: "pixel8" },
    ]);
    // `avds` sigue CRUDO: de él depende el paso «Crear el dispositivo virtual» de la receta
    // (`core/dispositivos.ts`), que con la lista reducida se habría creído no hecho.
    expect(informe.avds).toEqual(["pixel8"]);
  });

  /**
   * Y si la consola no contesta, el campo se queda AUSENTE: «no se pudo identificar», que no
   * es «no tiene». `adb` no pasa a fallo — la herramienta contestó y su lista es buena.
   */
  /**
   * **La consola es UN canal, así que hay una segunda fuente.** Mientras el bucle de
   * «Arrancar» sondea `emu avd name` esperando a que el aparato aparezca, una medida que
   * pregunte a la vez se lleva un error — y sin `avd` el AVD volvía a salir DUPLICADO
   * («sdk gphone64 arm64 · arrancado» y «pixel8 · apagado» a la vez). Medido en la pantalla
   * del usuario justo después de pulsar el botón.
   *
   * `ro.boot.qemu.avd_name` contesta lo mismo (medido segundo a segundo en un arranque en
   * frío: los dos dicen `pixel8` en cuanto adb da el aparato por `device`) y falla por cosas
   * distintas, que es lo que lo hace un respaldo y no una copia.
   */
  it("con la consola ocupada, el AVD se saca de la propiedad de la imagen", async () => {
    let cual = 0;
    const { ejecutar } = ejecutorDe({
      "/bin/adb devices": salida("List of devices attached\nemulator-5554 device model:sdk_gphone64\n"),
      emulator: salida("pixel8\n"),
    });
    // El doble no distingue las dos preguntas por `-s`, así que se envuelve: la primera
    // (la consola) falla como cuando está ocupada, y la segunda (getprop) contesta.
    const conConsolaOcupada: typeof ejecutar = async (binario, args, opciones) => {
      if (args[0] === "-s") {
        cual += 1;
        if (cual === 1) throw new Error("error: could not connect to TCP port 5554");
        return { stdout: "pixel8\n", stderr: "" };
      }
      return ejecutar(binario, args, opciones);
    };
    const informe = await detectarDispositivos(
      {
        plataforma: "linux",
        entorno: { PATH: "/bin" },
        home: "/home/yo",
        existe: (r) => r === "/bin/adb" || r === "/bin/emulator",
        ejecutar: conConsolaOcupada,
      },
      { android: false }
    );
    expect(cual).toBe(2);
    expect(informe.dispositivos[0]?.avd).toBe("pixel8");
    expect(informe.dispositivos[0]?.nombre).toBe("pixel8");
  });

  it("si la consola del emulador falla, no hay `avd` y adb sigue en ok", async () => {
    const { ejecutar } = ejecutorDe({
      "/bin/adb devices": salida("List of devices attached\nemulator-5554 device model:sdk_gphone64\n"),
      "/bin/adb -s": new Error("device offline"),
      emulator: salida("pixel8\n"),
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
    expect(informe.dispositivos[0]?.avd).toBeUndefined();
    expect(informe.herramientas.find((h) => h.nombre === "adb")?.estado).toBe("ok");
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
    const sdk = win32.join("C:\\Users\\yo\\AppData\\Local", "Android", "Sdk");
    const adb = win32.join(sdk, "platform-tools", "adb.exe");
    const { ejecutar, llamadas } = ejecutorDe({ "adb.exe": salida("List of devices attached\nABC device model:Pixel_8\n") });
    const informe = await detectarDispositivos({
      plataforma: "win32",
      entorno: { Path: "C:\\Windows", LOCALAPPDATA: "C:\\Users\\yo\\AppData\\Local" },
      home: "C:\\Users\\yo",
      existe: (ruta) => ruta === adb,
      ejecutar,
    });
    expect(informe.herramientas.find((h) => h.nombre === "adb")).toEqual({ nombre: "adb", plataforma: "android", estado: "ok", ruta: adb });
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
      plataforma: "android",
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
    expect(informe.herramientas.find((h) => h.nombre === "adb")).toEqual({ nombre: "adb", plataforma: "android", estado: "ok", ruta: adb });
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

  it("la receta del emulador viaja con el informe, en macOS con SUS dos y en Windows con la del emulador", async () => {
    const { ejecutar } = ejecutorDe({ "xcode-select": new Error("no") });
    const deps = (plataforma: string): DependenciasDeDeteccion => ({
      plataforma,
      entorno: { PATH: "/usr/bin", Path: "C:\\W", LOCALAPPDATA: "C:\\Users\\yo\\AppData\\Local" },
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

    // En Windows hay receta del emulador —ya no se dice que falta sin más—, pero SIGUE sin
    // haber la de iOS: los simuladores de iOS los da Xcode, que no existe fuera de macOS.
    const win = await detectarDispositivos(deps("win32"));
    expect(win.recetas.map((r) => r.id)).toEqual(["android-emulador"]);
    expect(win.recetas[0]!.pasos).toHaveLength(5);
    expect(JSON.stringify(win.recetas)).not.toContain("C:\\Users\\yo");
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

describe("frameworkEnDispositivo", () => {
  const android: Dispositivo = {
    id: "R58M12ABCDE",
    nombre: "Pixel 8",
    plataforma: "android",
    clase: "fisico",
    estado: "conectado",
  };
  const iphone: Dispositivo = {
    id: "EF39AE73",
    nombre: "iPhone 17 Pro · iOS 26.0",
    plataforma: "ios",
    clase: "simulador",
    estado: "apagado",
  };

  const conAdb = { plataforma: "darwin", entorno: { PATH: "/opt/homebrew/bin" }, home: "/Users/yo", existe: (r: string) => r === "/opt/homebrew/bin/adb" };

  it("se pregunta por el PAQUETE, en un solo viaje, y con el tope de adb", async () => {
    // El servidor vive dentro del proceso de la app: antes de arrancarla no hay a quién
    // preguntar por el protocolo, así que lo que decide si se puede empezar es el paquete.
    const { ejecutar, llamadas } = ejecutorDe({ adb: salida("package:com.xone.android.framework\n") });
    await frameworkEnDispositivo(android, { ...conAdb, ejecutar });
    expect(llamadas).toEqual([
      {
        binario: "/opt/homebrew/bin/adb",
        args: ["-s", "R58M12ABCDE", "shell", "pm", "list", "packages", "com.xone.android"],
        timeout: TOPES_MS.adb,
      },
    ]);
  });

  it("con los dos flavors instalados gana el standalone, que es el medido", async () => {
    const { ejecutar } = ejecutorDe({
      adb: salida("package:com.xone.android.framework\npackage:com.xone.android.developer.framework\n"),
    });
    expect(await frameworkEnDispositivo(android, { ...conAdb, ejecutar })).toEqual({
      instalado: true,
      paquete: "com.xone.android.framework",
      detalle: "framework instalado: com.xone.android.framework",
    });
  });

  it("con solo el de Play Store, ese: el paquete viaja porque el reinicio depende de él", async () => {
    const { ejecutar } = ejecutorDe({ adb: salida("package:com.xone.android.developer.framework\n") });
    const r = await frameworkEnDispositivo(android, { ...conAdb, ejecutar });
    expect(r.paquete).toBe("com.xone.android.developer.framework");
    expect(r.instalado).toBe(true);
  });

  it("un paquete que solo se PARECE no cuenta: el filtro de `pm` es por subcadena", async () => {
    // `pm list packages com.xone.android` filtra por subcadena, así que la lista puede traer
    // vecinos. Dar por instalado lo que solo se parece a lo que se busca es afirmar de más.
    const { ejecutar } = ejecutorDe({ adb: salida("package:com.xone.android.frameworkdemo\n") });
    const r = await frameworkEnDispositivo(android, { ...conAdb, ejecutar });
    expect(r).toEqual({ instalado: false, detalle: "no aparece ni el standalone ni el de Play Store: no está instalado" });
    expect(r.paquete).toBeUndefined();
  });

  it("sin el framework, `instalado: false` con UNA línea de detalle", async () => {
    const { ejecutar } = ejecutorDe({ adb: salida("") });
    const r = await frameworkEnDispositivo(android, { ...conAdb, ejecutar });
    expect(r).toEqual({ instalado: false, detalle: "no aparece ni el standalone ni el de Play Store: no está instalado" });
    expect(r.detalle).not.toContain("\n");
  });

  it("un fallo de adb se cuenta con su motivo, UNA línea, y sin paquete", async () => {
    const error = Object.assign(new Error("Command failed"), { stderr: "error: device unauthorized.\n" });
    const { ejecutar } = ejecutorDe({ adb: error });
    const r = await frameworkEnDispositivo(android, { ...conAdb, ejecutar });
    expect(r).toEqual({ instalado: false, detalle: "error: device unauthorized." });
    expect(r.paquete).toBeUndefined();
  });

  it("un adb colgado se dice con el tope de adb, que no es uno nuevo", async () => {
    const { ejecutar } = ejecutorDe({ adb: Object.assign(new Error("timeout"), { killed: true }) });
    const r = await frameworkEnDispositivo(android, { ...conAdb, ejecutar });
    expect(r.detalle).toBe("no respondió en 15 s");
  });

  it("sin adb en la máquina se dice qué falta, y no se lanza nada", async () => {
    const { ejecutar, llamadas } = ejecutorDe({});
    const r = await frameworkEnDispositivo(android, { plataforma: "darwin", entorno: {}, home: "/Users/yo", existe: () => false, ejecutar });
    expect(r.instalado).toBe(false);
    expect(r.detalle).toMatch(/no está adb/i);
    expect(llamadas).toEqual([]);
  });

  it("un iPhone contesta «iOS todavía no» SIN lanzar ningún proceso", async () => {
    // No hay `adb` que preguntarle a un iPhone: buscarlo siquiera sería un proceso gastado,
    // y ahí el doble que cuenta llamadas es lo que lo fija.
    const { ejecutar, llamadas } = ejecutorDe({});
    expect(await frameworkEnDispositivo(iphone, { plataforma: "darwin", entorno: { PATH: "/bin" }, home: "/Users/yo", existe: () => true, ejecutar })).toEqual({
      instalado: false,
      detalle: "iOS todavía no",
    });
    expect(llamadas).toEqual([]);
  });
});

describe("jdkDeLaMaquina", () => {
  it("`JAVA_HOME` manda si está puesta y existe, en cualquier sistema", () => {
    expect(jdkDeLaMaquina({ JAVA_HOME: "/mi/jdk" }, (r) => r === "/mi/jdk", "darwin")).toBe("/mi/jdk");
    expect(jdkDeLaMaquina({ JAVA_HOME: "C:\\mi\\jdk" }, (r) => r === "C:\\mi\\jdk", "win32")).toBe("C:\\mi\\jdk");
  });

  it("en Windows sin JAVA_HOME, mira la ruta FIJA donde cae el paso 2 de la receta", () => {
    const localAppData = "C:\\Users\\yo\\AppData\\Local";
    const jdk17 = win32.join(localAppData, "Android", "jdk17");
    expect(jdkDeLaMaquina({ LOCALAPPDATA: localAppData }, (r) => r === jdk17, "win32")).toBe(jdk17);
    // Y si esa carpeta no está, ausente: no se inventa un sitio.
    expect(jdkDeLaMaquina({ LOCALAPPDATA: localAppData }, () => false, "win32")).toBeUndefined();
  });

  it("sin `%LOCALAPPDATA%` en Windows, ausente — no hay dónde mirar", () => {
    expect(jdkDeLaMaquina({}, () => true, "win32")).toBeUndefined();
  });

  it("en macOS sin JAVA_HOME, los dos prefijos de Homebrew — Windows no los mira", () => {
    // `join()` para construir el esperado y no un literal con `/`: en `path.win32` (lo que
    // corre este `npm test` en una máquina Windows) una barra `/` suelta en un literal no es
    // el mismo separador que compone `join`, y comparar contra el literal daría un falso rojo
    // que no tiene nada que ver con lo que se está probando aquí.
    const candidato = join("/opt/homebrew", "opt", "openjdk@17");
    expect(jdkDeLaMaquina({}, (r) => r === candidato, "darwin")).toBe(candidato);
    expect(jdkDeLaMaquina({ LOCALAPPDATA: "C:\\x" }, (r) => r === candidato, "win32")).toBeUndefined();
  });
});

describe("localizadorDeAndroid — la extensión en Windows es POR BINARIO", () => {
  // El bug que esto arregla: `sdkmanager`/`avdmanager` son `.bat` en Windows, nunca `.exe` —
  // y antes de esto se les añadía `.exe` como a cualquier otro, así que nunca se localizaban
  // aunque las cmdline-tools ya estuvieran instaladas a mano.
  it("adb y emulator llevan `.exe`; sdkmanager y avdmanager llevan `.bat`", () => {
    const { enPath } = localizadorDeAndroid({
      plataforma: "win32",
      entorno: { Path: "C:\\Sdk\\platform-tools;C:\\Sdk\\cmdline-tools\\latest\\bin" },
      home: "C:\\Users\\yo",
      existe: (r) =>
        r === "C:\\Sdk\\platform-tools\\adb.exe" ||
        r === "C:\\Sdk\\platform-tools\\emulator.exe" ||
        r === "C:\\Sdk\\cmdline-tools\\latest\\bin\\sdkmanager.bat" ||
        r === "C:\\Sdk\\cmdline-tools\\latest\\bin\\avdmanager.bat",
    });
    expect(enPath("adb")).toBe("C:\\Sdk\\platform-tools\\adb.exe");
    expect(enPath("sdkmanager")).toBe("C:\\Sdk\\cmdline-tools\\latest\\bin\\sdkmanager.bat");
    expect(enPath("avdmanager")).toBe("C:\\Sdk\\cmdline-tools\\latest\\bin\\avdmanager.bat");
  });

  it("con solo el `.exe` puesto (el bug de antes), sdkmanager NO se encuentra", () => {
    // Confirma el ANTES: si alguien dejara sdkmanager.exe por error, esto sigue sin
    // encontrarlo — `.bat` es lo único que las cmdline-tools de Windows traen de verdad.
    const { enPath } = localizadorDeAndroid({
      plataforma: "win32",
      entorno: { Path: "C:\\Sdk\\cmdline-tools\\latest\\bin" },
      home: "C:\\Users\\yo",
      existe: (r) => r === "C:\\Sdk\\cmdline-tools\\latest\\bin\\sdkmanager.exe",
    });
    expect(enPath("sdkmanager")).toBeUndefined();
  });

  it("fuera de Windows, sin extensión para nadie", () => {
    // Mismo motivo que arriba: el esperado sale de `join()`, no de un literal con `/`.
    const sdkmanager = join("/usr/local/bin", "sdkmanager");
    const adb = join("/usr/local/bin", "adb");
    const { enPath } = localizadorDeAndroid({
      plataforma: "darwin",
      entorno: { PATH: "/usr/local/bin" },
      home: "/Users/yo",
      existe: (r) => r === sdkmanager || r === adb,
    });
    expect(enPath("sdkmanager")).toBe(sdkmanager);
    expect(enPath("adb")).toBe(adb);
  });
});


describe("pathConCarpetas — el PATH de un hijo con las reglas de la plataforma", () => {
  it("en macOS, `:` y la variable `PATH` de siempre", () => {
    expect(pathConCarpetas({ PATH: "/usr/bin" }, ["/sdk/emulator"], "darwin")).toEqual({
      nombre: "PATH",
      valor: "/usr/bin:/sdk/emulator",
    });
  });

  it("en Windows, `;` y el nombre con el que llegó", () => {
    expect(pathConCarpetas({ Path: "C:\\Windows" }, ["C:\\Sdk\\emulator"], "win32")).toEqual({
      nombre: "Path",
      valor: "C:\\Windows;C:\\Sdk\\emulator",
    });
  });

  it("sin variable puesta no deja un separador colgando delante", () => {
    expect(pathConCarpetas({}, ["C:\\a", "C:\\b"], "win32")).toEqual({ nombre: "PATH", valor: "C:\\a;C:\\b" });
  });
});
