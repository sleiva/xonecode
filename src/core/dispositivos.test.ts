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
  const nada = { brew: false, sdkmanager: false, emulator: false, androidHome: false, avds: [] as string[] };

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
      brew: true, sdkmanager: true, emulator: true, androidHome: true, avds: ["pixel8"],
    })!;
    expect(conTodo.pasos.map((p) => p.hecho)).toEqual([true, true, true, true]);
    expect(conTodo.completa).toBe(true);
  });

  it("el paso de las licencias lo DICE, y el del tamaño también", () => {
    const receta = recetaDeEmuladorAndroid("darwin", nada)!;
    const notas = receta.pasos.map((p) => p.nota ?? "").join(" ");
    expect(notas).toMatch(/licencia/i);
    expect(notas).toMatch(/GB/);
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
});
