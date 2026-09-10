import { describe, it, expect } from "vitest";
import {
  alcanzables,
  nombreDelSistema,
  parsearAdbDevices,
  parsearAvds,
  parsearDevicectl,
  parsearSimctl,
  sistemaDe,
  type InformeDeDispositivos,
  recetaDeEmuladorAndroid,
  recetaDeSimuladorIos,
  parsearRuntimesDeIos,
  motivoDeSimctl,
} from "./dispositivos.js";

describe("sistemaDe", () => {
  it("traduce los tres `process.platform` que importan y no inventa un cuarto", () => {
    expect(sistemaDe("darwin")).toBe("mac");
    expect(sistemaDe("win32")).toBe("windows");
    expect(sistemaDe("linux")).toBe("linux");
    expect(sistemaDe("freebsd")).toBe("otro");
    expect(nombreDelSistema("mac")).toBe("macOS");
  });
});

describe("parsearAdbDevices", () => {
  it("lee la lista real de adb: emulador, físico autorizado, sin autorizar y offline", () => {
    const texto = [
      "* daemon not running; starting now at tcp:5037",
      "* daemon started successfully",
      "List of devices attached",
      "emulator-5554          device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a transport_id:1",
      "R58M12ABCDE            device usb:1-1 product:beyond1lteeea model:SM_G973F device:beyond1 transport_id:2",
      "0123456789ABCDEF       unauthorized transport_id:3",
      "192.168.1.20:5555      offline",
      "",
    ].join("\n");
    expect(parsearAdbDevices(texto)).toEqual([
      { id: "emulator-5554", nombre: "sdk gphone64 arm64", plataforma: "android", clase: "emulador", estado: "conectado" },
      { id: "R58M12ABCDE", nombre: "SM G973F", plataforma: "android", clase: "fisico", estado: "conectado" },
      {
        id: "0123456789ABCDEF",
        nombre: "0123456789ABCDEF",
        plataforma: "android",
        clase: "fisico",
        estado: "sin-autorizar",
        detalle: "acepta la depuración USB en el dispositivo",
      },
      { id: "192.168.1.20:5555", nombre: "192.168.1.20:5555", plataforma: "android", clase: "fisico", estado: "offline" },
    ]);
  });

  it("un estado que no conoce se enseña como no disponible CON su valor, no se pliega en «no»", () => {
    expect(parsearAdbDevices("List of devices attached\nXYZ recovery transport_id:1\n")).toEqual([
      { id: "XYZ", nombre: "XYZ", plataforma: "android", clase: "fisico", estado: "no-disponible", detalle: "estado «recovery»" },
    ]);
  });

  it("solo la cabecera, o nada, es una lista vacía", () => {
    expect(parsearAdbDevices("List of devices attached\n\n")).toEqual([]);
    expect(parsearAdbDevices("")).toEqual([]);
  });
});

describe("parsearAvds", () => {
  it("un AVD por línea, y el ruido `INFO |` de las versiones recientes se descarta", () => {
    expect(parsearAvds("INFO    | Storing crashdata in: /tmp/x\nPixel_8_API_35\r\nMedium_Phone_API_34\n\n")).toEqual([
      "Pixel_8_API_35",
      "Medium_Phone_API_34",
    ]);
  });
});

describe("parsearSimctl", () => {
  // Forma MEDIDA en esta máquina: `xcrun simctl list -j devices available`, Xcode con iOS 26.
  const medido = JSON.stringify({
    devices: {
      "com.apple.CoreSimulator.SimRuntime.iOS-26-0": [
        {
          lastBootedAt: "2026-08-30T10:11:12Z",
          dataPath: "/Users/x/Library/Developer/CoreSimulator/Devices/EF39/data",
          dataPathSize: 12345,
          logPath: "/Users/x/Library/Logs/CoreSimulator/EF39",
          udid: "EF39A1B2-0000-4000-8000-000000000001",
          isAvailable: true,
          logPathSize: 1,
          deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro",
          state: "Shutdown",
          name: "iPhone 17 Pro",
        },
        {
          udid: "EF39A1B2-0000-4000-8000-000000000002",
          isAvailable: true,
          deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-M4",
          state: "Booted",
          name: "iPad Pro 11-inch (M4)",
        },
      ],
      "com.apple.CoreSimulator.SimRuntime.iOS-18-2": [
        {
          udid: "EF39A1B2-0000-4000-8000-000000000003",
          isAvailable: false,
          availabilityError: "runtime profile not found",
          state: "Shutdown",
          name: "iPhone 15",
        },
      ],
    },
  });

  it("el runtime sale de la clave, Booted es «arrancado» y Shutdown «apagado»", () => {
    expect(parsearSimctl(medido)).toEqual([
      {
        id: "EF39A1B2-0000-4000-8000-000000000001",
        nombre: "iPhone 17 Pro · iOS 26.0",
        plataforma: "ios",
        clase: "simulador",
        estado: "apagado",
      },
      {
        id: "EF39A1B2-0000-4000-8000-000000000002",
        nombre: "iPad Pro 11-inch (M4) · iOS 26.0",
        plataforma: "ios",
        clase: "simulador",
        estado: "arrancado",
      },
    ]);
  });

  it("un simulador con `isAvailable: false` no se lista: esta lista es la de los disponibles", () => {
    expect(parsearSimctl(medido).some((d) => d.nombre.startsWith("iPhone 15"))).toBe(false);
  });

  it("un estado intermedio se enseña con su valor", () => {
    const json = JSON.stringify({
      devices: { "com.apple.CoreSimulator.SimRuntime.iOS-26-5": [{ udid: "U", isAvailable: true, state: "Booting", name: "X" }] },
    });
    expect(parsearSimctl(json)).toEqual([
      { id: "U", nombre: "X · iOS 26.5", plataforma: "ios", clase: "simulador", estado: "no-disponible", detalle: "estado «Booting»" },
    ]);
  });

  it("un JSON roto o sin `devices` es una lista vacía, no una excepción", () => {
    expect(parsearSimctl("{no es json")).toEqual([]);
    expect(parsearSimctl("{}")).toEqual([]);
    expect(parsearSimctl("null")).toEqual([]);
  });
});

describe("parsearDevicectl", () => {
  it("la salida real de esta máquina —sin ningún dispositivo— es una lista vacía", () => {
    // Medido: `xcrun devicectl list devices --json-output f.json` con nada conectado.
    const real = JSON.stringify({
      info: { arguments: ["devicectl", "list", "devices", "--json-output", "f.json"], commandType: "devicectl.list.devices", outcome: "success", version: "443.19" },
      result: { devices: [] },
    });
    expect(parsearDevicectl(real)).toEqual([]);
  });

  it("con dispositivos (forma DOCUMENTADA, no medida): nombre, plataforma y el estado del túnel", () => {
    const documentado = JSON.stringify({
      result: {
        devices: [
          {
            identifier: "00008030-000A1B2C3D4E5F60",
            connectionProperties: { tunnelState: "connected", transportType: "wired" },
            deviceProperties: { name: "iPhone de Sergio", osVersionNumber: "26.0" },
            hardwareProperties: { platform: "iOS", udid: "00008030-000A1B2C3D4E5F60" },
          },
          {
            identifier: "00008101-0000AAAABBBBCCCC",
            connectionProperties: { tunnelState: "unavailable" },
            deviceProperties: { name: "iPad" },
            hardwareProperties: { platform: "iPadOS" },
          },
        ],
      },
    });
    expect(parsearDevicectl(documentado)).toEqual([
      { id: "00008030-000A1B2C3D4E5F60", nombre: "iPhone de Sergio · iOS", plataforma: "ios", clase: "fisico", estado: "conectado" },
      {
        id: "00008101-0000AAAABBBBCCCC",
        nombre: "iPad · iPadOS",
        plataforma: "ios",
        clase: "fisico",
        estado: "no-disponible",
        detalle: "túnel «unavailable»",
      },
    ]);
  });

  it("un JSON roto es una lista vacía", () => {
    expect(parsearDevicectl("<html>")).toEqual([]);
  });
});

describe("alcanzables", () => {
  it("solo «conectado» y «arrancado» son dispositivos a los que se llega", () => {
    const informe: InformeDeDispositivos = {
      sistema: "mac",
      herramientas: [],
      avds: [],
    recetas: [],
      medido: "2026-09-06T10:00:00.000Z",
      dispositivos: [
        { id: "a", nombre: "a", plataforma: "android", clase: "fisico", estado: "conectado" },
        { id: "b", nombre: "b", plataforma: "ios", clase: "simulador", estado: "arrancado" },
        { id: "c", nombre: "c", plataforma: "ios", clase: "simulador", estado: "apagado" },
        { id: "d", nombre: "d", plataforma: "android", clase: "fisico", estado: "sin-autorizar" },
        { id: "e", nombre: "e", plataforma: "android", clase: "fisico", estado: "offline" },
      ],
    };
    expect(alcanzables(informe).map((d) => d.id)).toEqual(["a", "b"]);
  });
});

describe("recetaDeEmuladorAndroid", () => {
  const nada = { brew: false, sdkmanager: false, emulator: false, androidHome: false, jdk: false, avds: [] as string[] };

  it("en un sistema que no es macOS todavía no hay receta, y no se finge una", () => {
    // Windows y Linux son otra receta —otros gestores, otras rutas— y escribir la de macOS
    // con otro título sería el botón muerto de siempre. Se dirá que falta.
    expect(recetaDeEmuladorAndroid("win32", nada)).toBeUndefined();
    expect(recetaDeEmuladorAndroid("linux", nada)).toBeUndefined();
  });

  it("de cero, los cuatro pasos y ninguno hecho", () => {
    const receta = recetaDeEmuladorAndroid("darwin", nada)!;
    expect(receta.completa).toBe(false);
    expect(receta.pasos.map((p) => p.hecho)).toEqual([false, false, false, false]);
  });

  it("ningún comando lleva una ruta de la máquina: se derivan con `brew --prefix`", () => {
    // La misma regla por la que `ruta` se queda en el host: esto se pinta en la ventana y
    // viaja por el cable, que puede ir por un túnel. Y de paso vale en Intel y en Apple
    // Silicon, que tienen prefijos distintos.
    const receta = recetaDeEmuladorAndroid("darwin", nada)!;
    const todo = receta.pasos.flatMap((p) => p.comandos).join("\n");
    expect(todo).not.toContain("/opt/homebrew");
    expect(todo).not.toContain("/usr/local");
    expect(todo).not.toContain("/Users/");
    expect(todo).toContain("$(brew --prefix)");
  });

  it("cada paso se da por hecho por lo MEDIDO, no por recordar que se pulsó", () => {
    const conSdk = recetaDeEmuladorAndroid("darwin", { ...nada, brew: true, sdkmanager: true })!;
    expect(conSdk.pasos[0]!.hecho).toBe(true); // sdkmanager está ⇒ las herramientas están
    expect(conSdk.pasos[1]!.hecho).toBe(false); // pero ANDROID_HOME no

    const conTodo = recetaDeEmuladorAndroid("darwin", {
      brew: true, sdkmanager: true, emulator: true, androidHome: true, jdk: true, avds: ["pixel8"],
    })!;
    expect(conTodo.pasos.map((p) => p.hecho)).toEqual([true, true, true, true]);
    expect(conTodo.completa).toBe(true);
  });

  it("el tamaño se dice en la nota; las licencias van en su propio campo", () => {
    const receta = recetaDeEmuladorAndroid("darwin", nada)!;
    const notas = receta.pasos.map((p) => p.nota ?? "").join(" ");
    expect(notas).toMatch(/GB/);
    expect(receta.pasos.map((p) => p.acepta ?? "").join(" ")).toMatch(/licencia/i);
  });

  it("el paso de las variables dice que xonecode NO lo necesita, y para qué sí", () => {
    // Es la única parte que toca la shell del usuario, y desde que la detección mira la
    // carpeta de Homebrew la consola encuentra el SDK sin ella. Decirlo evita que parezca
    // que la consola no funciona hasta tocarse el `.zshrc`.
    const paso = recetaDeEmuladorAndroid("darwin", nada)!.pasos[1]!;
    expect(paso.nota).toMatch(/tu terminal/i);
    expect(paso.nota).toMatch(/xonecode/i);
  });

  it("arrancar no es un paso de la receta, pero el comando se da", () => {
    // Arrancar un emulador es un proceso de vida larga y otra capacidad; hoy no está
    // cableado y el panel no puede prometerlo. El comando sí se dice.
    const receta = recetaDeEmuladorAndroid("darwin", nada)!;
    expect(receta.pasos).toHaveLength(4);
    expect(receta.despues).toContain("emulator -avd");
  });

  /**
   * **El paso 1 es ejecutable, y eso cambió midiendo.** Antes no lo era por si `brew` pedía
   * la contraseña de administrador y el hijo se quedaba esperándola; medido, `sudo` sin
   * terminal de control falla en 57 ms en vez de colgarse. Y era el paso del que colgaba
   * todo: los pasos 3 y 4 exigen `sdkmanager`, que es justo lo que instala el 1, así que en
   * una máquina nueva la receta no tenía ningún botón vivo.
   */
  it("con Homebrew, el paso 1 ya se puede lanzar: es el que desbloquea los demás", () => {
    const deCero = recetaDeEmuladorAndroid("darwin", nada)!;
    // Sin `brew` no hay nada que lanzar, y se dice por qué: un botón que no puede cumplir es
    // el botón muerto de siempre.
    expect(deCero.pasos.map((p) => p.ejecutable)).toEqual([false, false, false, false]);
    expect(deCero.pasos[0]!.porQueNo).toMatch(/homebrew/i);
    expect(deCero.pasos[2]!.porQueNo).toMatch(/paso 1/i);

    const conBrew = recetaDeEmuladorAndroid("darwin", { ...nada, brew: true })!;
    expect(conBrew.pasos.map((p) => p.ejecutable)).toEqual([true, false, false, false]);
  });

  it("el paso de la shell NUNCA es ejecutable: es lo único que no sabríamos deshacer", () => {
    for (const estado of [nada, { ...nada, brew: true, sdkmanager: true, jdk: true, emulator: true }]) {
      expect(recetaDeEmuladorAndroid("darwin", estado)!.pasos[1]!.ejecutable).toBe(false);
    }
  });

  it("los pasos 3 y 4 se ofrecen solo cuando pueden cumplirse, y se dice qué falta", () => {
    const conHerramientas = recetaDeEmuladorAndroid("darwin", { ...nada, brew: true, sdkmanager: true, jdk: true })!;
    expect(conHerramientas.pasos.map((p) => p.ejecutable)).toEqual([true, false, true, false]);
    // El 4 necesita la imagen del sistema, que la trae el 3.
    expect(conHerramientas.pasos[3]!.porQueNo).toMatch(/paso 3/i);

    const conImagen = recetaDeEmuladorAndroid("darwin", { ...nada, brew: true, sdkmanager: true, jdk: true, emulator: true })!;
    expect(conImagen.pasos[3]!.ejecutable).toBe(true);
  });

  it("el paso que acepta licencias lo dice APARTE de su nota", () => {
    // Aceptar una licencia en nombre de alguien no puede ser un efecto de rebote de un botón
    // que dice «Ejecutar»: va en su propio campo para poder pintarlo junto al botón.
    const receta = recetaDeEmuladorAndroid("darwin", nada)!;
    expect(receta.pasos[2]!.acepta).toMatch(/licencias del SDK de Android/i);
    expect(receta.pasos[0]!.acepta).toBeUndefined();
  });
});

describe("recetaDeSimuladorIos", () => {
  const nada = { xcode: false, licencia: false, runtimes: [] as string[] };

  it("solo en macOS: fuera no hay receta, y no se finge una", () => {
    // Y aquí no es una decisión de alcance: los simuladores de iOS los da Xcode, que no
    // existe en ningún otro sistema. Fuera de macOS la respuesta no es otra receta.
    expect(recetaDeSimuladorIos("win32", nada)).toBeUndefined();
    expect(recetaDeSimuladorIos("linux", nada)).toBeUndefined();
  });

  it("de cero, los tres pasos y ninguno hecho", () => {
    const receta = recetaDeSimuladorIos("darwin", nada)!;
    expect(receta.id).toBe("ios-simulador");
    expect(receta.pasos.map((p) => p.hecho)).toEqual([false, false, false]);
    expect(receta.completa).toBe(false);
  });

  /**
   * **NINGUNO se lanza desde aquí, y los tres dicen por qué.** No es que falte cablearlos:
   * Xcode se instala del App Store (no hay comando que lo haga), la licencia lleva `sudo`
   * escrito —y sin terminal de control `sudo` falla siempre, medido— y `-downloadPlatform`
   * pide autorización en una ventana del sistema, que no se contesta por `stdin`. Un botón
   * que falla siempre es la otra forma del botón muerto.
   */
  it("ningún paso es ejecutable, y cada uno dice por qué no", () => {
    const receta = recetaDeSimuladorIos("darwin", { xcode: true, licencia: true, runtimes: [] })!;
    expect(receta.pasos.map((p) => p.ejecutable)).toEqual([false, false, false]);
    expect(receta.pasos[0]!.porQueNo).toMatch(/App Store/i);
    expect(receta.pasos[1]!.porQueNo).toMatch(/sudo/i);
    expect(receta.pasos[2]!.porQueNo).toMatch(/ventana/i);
  });

  it("cada paso sale de lo MEDIDO, y con todo puesto la receta está completa", () => {
    const soloXcode = recetaDeSimuladorIos("darwin", { ...nada, xcode: true })!;
    expect(soloXcode.pasos.map((p) => p.hecho)).toEqual([true, false, false]);

    const todo = recetaDeSimuladorIos("darwin", { xcode: true, licencia: true, runtimes: ["iOS 26.0"] })!;
    expect(todo.pasos.map((p) => p.hecho)).toEqual([true, true, true]);
    expect(todo.completa).toBe(true);
  });

  /**
   * La distinción que sostiene el paso 1: las Command Line Tools traen `xcrun` y `simctl`
   * —así que la detección contesta— y no traen NI UN simulador. Sin decirlo, quien solo las
   * tenga vería «Xcode: ok» y una lista vacía sin nada que le dijera qué le falta.
   */
  it("el paso 1 dice que las Command Line Tools no bastan", () => {
    const receta = recetaDeSimuladorIos("darwin", nada)!;
    expect(receta.pasos[0]!.titulo).toMatch(/no solo las herramientas de línea de comandos/i);
    expect(receta.pasos[0]!.nota).toMatch(/no traen ning[úu]n simulador/i);
  });

  it("ningún comando lleva el home de nadie", () => {
    // La misma regla que la receta de Android: esto viaja por el cable, que puede ir por un
    // túnel. `/Applications/Xcode.app` sí aparece, y no es la excepción: es una constante de
    // macOS —igual en todas— y no una ruta MEDIDA de esta máquina.
    const todo = recetaDeSimuladorIos("darwin", { xcode: true, licencia: true, runtimes: ["iOS 26.0"] })!;
    const comandos = todo.pasos.flatMap((p) => p.comandos).join("\n");
    expect(comandos).not.toContain("/Users/");
    expect(comandos).toContain("/Applications/Xcode.app");
  });

  it("los runtime que hay se NOMBRAN, y sin ninguno se dice qué pasará al instalarlo", () => {
    // Crear un simulador no es un paso: Xcode deja una lista hecha con cada runtime que
    // instalas. Decirlo evita que se busque un botón de «crear» que no tiene que existir.
    expect(recetaDeSimuladorIos("darwin", { xcode: true, licencia: true, runtimes: ["iOS 26.0", "iOS 18.2"] })!.despues).toContain(
      "iOS 26.0, iOS 18.2"
    );
    expect(recetaDeSimuladorIos("darwin", nada)!.despues).toMatch(/lista de simuladores hecha/i);
  });
});

describe("parsearRuntimesDeIos", () => {
  /** La forma MEDIDA de `xcrun simctl list -j runtimes devices` en esta máquina. */
  const medido = JSON.stringify({
    runtimes: [
      { name: "iOS 18.2", version: "18.2", isAvailable: true, platform: "iOS", identifier: "…iOS-18-2" },
      { name: "iOS 26.0", version: "26.0.1", isAvailable: true, platform: "iOS", identifier: "…iOS-26-0" },
      { name: "watchOS 26.0", version: "26.0", isAvailable: true, platform: "watchOS", identifier: "…watchOS" },
    ],
    devices: {},
  });

  it("lee los de iOS del mismo listado que trae los dispositivos", () => {
    expect(parsearRuntimesDeIos(medido)).toEqual(["iOS 18.2", "iOS 26.0"]);
  });

  it("uno a medio descargar no cuenta: no arranca nada", () => {
    const json = JSON.stringify({ runtimes: [{ name: "iOS 26.0", isAvailable: false, platform: "iOS" }] });
    expect(parsearRuntimesDeIos(json)).toEqual([]);
  });

  /** Ausente cuenta como disponible: este listado ya se pide con `available`, así que quien
   *  no lo esté no llega — y descartarlo diría que no hay runtime teniéndolos. */
  it("sin `isAvailable` se cuenta igual, que es el lado que no esconde nada", () => {
    const json = JSON.stringify({ runtimes: [{ version: "26.0", platform: "iOS" }] });
    expect(parsearRuntimesDeIos(json)).toEqual(["iOS 26.0"]);
  });

  it("un JSON roto o sin runtimes es una lista vacía, no un fallo", () => {
    expect(parsearRuntimesDeIos("<html>")).toEqual([]);
    expect(parsearRuntimesDeIos(JSON.stringify({ devices: {} }))).toEqual([]);
  });
});

describe("motivoDeSimctl", () => {
  /**
   * El texto MEDIDO al hacer `xcrun simctl spawn` sobre un simulador apagado. La primera
   * línea es papeleo —un dominio y un número— y `describirFallo` se queda justo con esa: sin
   * esta función, verificar un simulador apagado contestaba un código de error en vez de
   * «no está arrancado».
   */
  const real = [
    "An error was encountered processing the command (domain=com.apple.CoreSimulator.SimError, code=405):",
    "Process spawn via launchd failed because device is not booted.",
    "Underlying error (domain=com.apple.SimLaunchHostService.RequestError, code=3):",
  ].join("\n");

  it("se queda con la línea que explica algo, no con la del dominio y el código", () => {
    expect(motivoDeSimctl(real)).toBe("Process spawn via launchd failed because device is not booted.");
  });

  it("sin ninguna línea útil no se inventa una", () => {
    expect(motivoDeSimctl("")).toBeUndefined();
    expect(motivoDeSimctl("An error was encountered processing the command (code=1):")).toBeUndefined();
  });
});
