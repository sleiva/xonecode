import { describe, expect, it, vi } from "vitest";
import { recetaDeEmuladorAndroid, recetaDeSimuladorIos } from "../../core/dispositivos.js";
import { EventEmitter } from "node:events";
import { join, win32 } from "node:path";
import { zipSync } from "fflate";
import {
  correrPasoDeReceta,
  PASOS_EJECUTABLES,
  TOPE_SIN_SALIDA_MS,
  TOPE_DE_TRABAJO_MS,
  type ProcesoHijo,
} from "./instalacionEnMaquina.js";

/** Un hijo de mentira: se le dan datos y se le hace terminar a mano. */
function hijoFalso() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const escrito: string[] = [];
  const sucesos = new EventEmitter();
  let matado: string | undefined;
  const hijo = {
    stdout,
    stderr,
    stdin: { write: (t: string) => void escrito.push(t), end: () => void escrito.push("<end>") },
    on: (evento: string, cb: (...a: unknown[]) => void) => void sucesos.on(evento, cb),
    kill: (senal?: string) => {
      matado = senal ?? "SIGTERM";
      return true;
    },
  } as unknown as ProcesoHijo;
  return {
    hijo,
    escrito,
    get matado() {
      return matado;
    },
    salida: (texto: string) => stdout.emit("data", Buffer.from(texto)),
    error: (texto: string) => stderr.emit("data", Buffer.from(texto)),
    cerrar: (codigo: number | null) => sucesos.emit("close", codigo),
    reventar: (e: Error) => sucesos.emit("error", e),
  };
}

const ANDROID = {
  plataforma: "darwin",
  entorno: { PATH: "/opt/homebrew/bin" },
  home: "/Users/yo",
  // Los binarios en el PATH de Homebrew, la RAÍZ del SDK y el JDK: los tres hacen falta.
  // El hijo necesita `ANDROID_HOME`, así que tener el binario y no la carpeta no vale.
  existe: (ruta: string) =>
    ruta === "/opt/homebrew/bin/brew" ||
    ruta === "/opt/homebrew/bin/sdkmanager" ||
    ruta === "/opt/homebrew/bin/avdmanager" ||
    ruta === "/opt/homebrew/share/android-commandlinetools" ||
    ruta === "/opt/homebrew/opt/openjdk@17",
};

describe("PASOS_EJECUTABLES", () => {
  it("es una tabla CERRADA: solo lo que no se puede quedar esperando a nadie", () => {
    // Los tres pasos de macOS y los cinco de Windows están, y la PLATAFORMA es parte de la
    // clave: los 1-3 de Windows (descargas) y los 1-3 de macOS (Homebrew) son acciones
    // completamente distintas bajo el mismo número, así que sin la plataforma se pisarían en
    // este mapa. Lo que sigue fuera no es un paso —los `export` se fueron a `Receta.aparte`—
    // y la receta de iOS no tiene ninguno: un `sudo` escrito en el comando fallaría siempre,
    // y `-downloadPlatform` pide autorización en una ventana del sistema.
    expect([...PASOS_EJECUTABLES.keys()].sort()).toEqual([
      "android-emulador:darwin:1",
      "android-emulador:darwin:2",
      "android-emulador:darwin:3",
      "android-emulador:win32:1",
      "android-emulador:win32:2",
      "android-emulador:win32:3",
      "android-emulador:win32:4",
      "android-emulador:win32:5",
    ]);
  });
});

describe("correrPasoDeReceta", () => {
  /**
   * Un `lanzar` que devuelve un hijo NUEVO por llamada, porque un paso puede ser dos
   * procesos: el paso 3 acepta las licencias en uno y descarga en otro. Con un solo hijo
   * compartido, el `close` del primero resolvía también el segundo y el trabajo no
   * terminaba nunca — que es justo el fallo que este helper tiene que poder distinguir.
   */
  const lanzador = () => {
    const llamadas: { binario: string; args: string[]; env: Record<string, string | undefined> }[] = [];
    const hijos: ReturnType<typeof hijoFalso>[] = [];
    return {
      llamadas,
      hijos,
      lanzar: (binario: string, args: string[], opciones: { env: Record<string, string | undefined> }) => {
        llamadas.push({ binario, args, env: opciones.env });
        const h = hijoFalso();
        hijos.push(h);
        return h.hijo;
      },
    };
  };

  it("un paso que no está en la tabla no se lanza", async () => {
    // Los tres pasos de iOS piden algo que no se contesta desde aquí —el App Store, un `sudo`
    // del comando, una ventana de autorización—, así que ninguno está en la tabla y todos se
    // siguen copiando. Un botón que no puede cumplir es el botón muerto de siempre.
    const l = lanzador();
    const trabajo = correrPasoDeReceta("ios-simulador", 1, { ...ANDROID, lanzar: l.lanzar });
    expect(await trabajo.terminado).toMatchObject({ estado: "fallo" });
    expect(l.llamadas).toEqual([]);
  });

  /** El paso 2 son DOS procesos: primero las licencias, después la descarga. */
  const arrancarPaso2 = (extra: Partial<Parameters<typeof correrPasoDeReceta>[2]> = {}) => {
    const l = lanzador();
    const lineas: string[] = [];
    const trabajo = correrPasoDeReceta("android-emulador", 2, {
      ...ANDROID,
      lanzar: l.lanzar,
      alSalirLinea: (x) => lineas.push(x),
      ...extra,
    });
    return { l, lineas, trabajo, licencias: () => l.hijos[0]!, instalar: () => l.hijos[1]! };
  };

  it("acepta las licencias ANTES de instalar, y con las respuestas alimentadas", async () => {
    // Sin TTY, el prompt de licencias cuelga el proceso para siempre: se le teclea.
    const p2 = arrancarPaso2();
    expect(p2.l.llamadas[0]!.args).toContain("--licenses");
    expect(p2.licencias().escrito.filter((x) => x === "y\n").length).toBeGreaterThan(0);
    // Y se DICE en el log qué se está aceptando y por qué.
    expect(p2.lineas.join(" ")).toMatch(/licencias/i);
    p2.licencias().cerrar(0);
    await Promise.resolve();
    expect(p2.l.llamadas[1]!.args).toContain("--install");
  });

  it("lanza `sdkmanager` con la RUTA resuelta y el entorno puesto", async () => {
    const p2 = arrancarPaso2();
    p2.licencias().cerrar(0);
    await Promise.resolve();
    p2.instalar().salida("Loading package information...\nInstalling emulator\n");
    p2.instalar().cerrar(0);
    expect(await p2.trabajo.terminado).toMatchObject({ estado: "ok" });

    // La ruta la resuelve el HOST: ni el cliente manda un comando ni un binario.
    expect(p2.l.llamadas[1]!.binario).toBe("/opt/homebrew/bin/sdkmanager");
    expect(p2.l.llamadas[1]!.args.join(" ")).toContain("system-images;android-35;google_apis;arm64-v8a");
    // El hijo necesita el SDK y el JDK, y eso son rutas de la MÁQUINA: van en su entorno,
    // que no viaja a ninguna parte.
    expect(p2.l.llamadas[1]!.env["ANDROID_HOME"]).toBe("/opt/homebrew/share/android-commandlinetools");
    expect(p2.l.llamadas[1]!.env["JAVA_HOME"]).toBe("/opt/homebrew/opt/openjdk@17");
    expect(p2.lineas).toContain("Loading package information...");
    expect(p2.lineas).toContain("Installing emulator");
  });

  it("una línea partida en dos trozos no sale partida", async () => {
    // Un `data` no es una línea: puede traer media, o tres. Emitir trozos dejaría el log
    // cortado por la mitad en la ventana.
    const p2 = arrancarPaso2();
    p2.licencias().cerrar(0);
    await Promise.resolve();
    p2.instalar().salida("Downloading ");
    p2.instalar().salida("emulator 58%\nDone\n");
    p2.instalar().cerrar(0);
    await p2.trabajo.terminado;
    expect(p2.lineas).toContain("Downloading emulator 58%");
    expect(p2.lineas).toContain("Done");
  });

  it("stderr también se cuenta: `sdkmanager` avisa por ahí", async () => {
    const l = lanzador();
    const lineas: string[] = [];
    const trabajo = correrPasoDeReceta("android-emulador", 3, {
      ...ANDROID,
      lanzar: l.lanzar,
      alSalirLinea: (x) => lineas.push(x),
    });
    l.hijos[0]!.error("Warning: something\n");
    l.hijos[0]!.cerrar(0);
    await trabajo.terminado;
    expect(lineas).toEqual(["Warning: something"]);
  });

  it("al crear el AVD se contesta `no` al perfil de hardware", async () => {
    const l = lanzador();
    correrPasoDeReceta("android-emulador", 3, { ...ANDROID, lanzar: l.lanzar });
    expect(l.llamadas[0]!.binario).toBe("/opt/homebrew/bin/avdmanager");
    expect(l.hijos[0]!.escrito).toContain("no\n");
  });

  it("un código distinto de cero es FALLO, con la última línea como motivo", async () => {
    const p2 = arrancarPaso2();
    p2.licencias().cerrar(0);
    await Promise.resolve();
    p2.instalar().error("Warning: Failed to find package\n");
    p2.instalar().cerrar(1);
    expect(await p2.trabajo.terminado).toMatchObject({ estado: "fallo", motivo: "Warning: Failed to find package" });
  });

  it("un fallo de las LICENCIAS no corta: puede que ya estuvieran aceptadas", async () => {
    const p2 = arrancarPaso2();
    p2.licencias().cerrar(1);
    await Promise.resolve();
    expect(p2.l.llamadas[1]!.args).toContain("--install");
    p2.instalar().cerrar(0);
    expect(await p2.trabajo.terminado).toMatchObject({ estado: "ok" });
  });

  it("cancelar mata al hijo y se reporta como cancelada, no como fallo", async () => {
    const p2 = arrancarPaso2();
    p2.trabajo.cancelar();
    expect(p2.licencias().matado).toBeDefined();
    p2.licencias().cerrar(null);
    expect(await p2.trabajo.terminado).toMatchObject({ estado: "cancelada" });
  });

  it("sin salida durante mucho rato se da por COLGADA y se mata", async () => {
    vi.useFakeTimers();
    const p2 = arrancarPaso2();
    const hijo = p2.licencias();
    // Mientras habla, no se toca: una descarga de 3 GB puede tardar, y matarla por lenta
    // sería peor que esperarla.
    vi.advanceTimersByTime(TOPE_SIN_SALIDA_MS - 1000);
    hijo.salida("58%\n");
    vi.advanceTimersByTime(TOPE_SIN_SALIDA_MS - 1000);
    expect(hijo.matado).toBeUndefined();
    // Callada del todo: se da por colgada.
    vi.advanceTimersByTime(2000);
    expect(hijo.matado).toBeDefined();
    hijo.cerrar(null);
    expect(await p2.trabajo.terminado).toMatchObject({ estado: "colgada" });
    vi.useRealTimers();
  });

  it("el tope total existe, y es holgado: una descarga de 3 GB no es un cuelgue", () => {
    expect(TOPE_DE_TRABAJO_MS).toBeGreaterThanOrEqual(30 * 60_000);
    expect(TOPE_SIN_SALIDA_MS).toBeLessThan(TOPE_DE_TRABAJO_MS);
  });

  it("si el proceso no arranca, se dice y no se queda esperando", async () => {
    const p2 = arrancarPaso2();
    p2.licencias().reventar(Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));
    await Promise.resolve();
    p2.instalar().reventar(Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));
    expect(await p2.trabajo.terminado).toMatchObject({ estado: "fallo", motivo: "el ejecutable no existe" });
  });

  it("sin sdkmanager en la máquina no se lanza nada: se dice qué falta", async () => {
    const l = lanzador();
    const trabajo = correrPasoDeReceta("android-emulador", 2, { ...ANDROID, existe: () => false, lanzar: l.lanzar });
    const r = await trabajo.terminado;
    expect(r.estado).toBe("fallo");
    expect(r.motivo).toMatch(/paso 1/i);
    expect(l.llamadas).toEqual([]);
  });
});

/**
 * **La tabla de aquí y el `ejecutable` de la receta tienen que decir lo mismo**, y es la
 * clase de regla que en este repo se ha caído seis veces viviendo en dos sitios: un paso con
 * botón que no esté en la tabla es un botón muerto, y uno lanzable sin botón es una capacidad
 * que nadie puede usar. Se comparan las DOS direcciones.
 */
describe("la tabla y las recetas dicen lo mismo", () => {
  /** Una máquina con todo puesto: es donde cada receta ofrece todo lo que puede ofrecer.
   *  Con su PLATAFORMA al lado, porque `receta.id` sola no distingue la de macOS de la de
   *  Windows —las dos se llaman "android-emulador"— y la clave de la tabla la necesita. */
  const conTodo: { plataforma: string; receta: ReturnType<typeof recetaDeEmuladorAndroid> }[] = [
    {
      plataforma: "darwin",
      receta: recetaDeEmuladorAndroid("darwin", {
        brew: true,
        adb: true,
        sdkmanager: true,
        emulator: true,
        jdk: true,
        avds: ["pixel8"],
      }),
    },
    {
      plataforma: "win32",
      receta: recetaDeEmuladorAndroid("win32", {
        brew: false,
        adb: true,
        sdkmanager: true,
        emulator: true,
        jdk: true,
        avds: ["pixel8"],
      }),
    },
    { plataforma: "darwin", receta: recetaDeSimuladorIos("darwin", { xcode: true, licencia: true, runtimes: ["iOS 26.0"] }) },
  ];

  it("todo paso marcado ejecutable está en la tabla", () => {
    for (const { plataforma, receta } of conTodo) {
      receta!.pasos.forEach((paso, i) => {
        if (!paso.ejecutable) return;
        const clave = `${receta!.id}:${plataforma}:${i + 1}`;
        expect(PASOS_EJECUTABLES.has(clave), clave).toBe(true);
      });
    }
  });

  it("y toda entrada de la tabla es un paso que se ofrece", () => {
    for (const clave of PASOS_EJECUTABLES.keys()) {
      const [id, plataforma, numero] = clave.split(":");
      const par = conTodo.find((c) => c.receta!.id === id && c.plataforma === plataforma);
      expect(par, clave).toBeDefined();
      expect(par!.receta!.pasos[Number(numero) - 1]?.ejecutable, clave).toBe(true);
    }
  });

  /** Lo que un paso `tipo: "proceso"` PIDE a `sdkmanager`, leído en frío. Lanza si la clave
   *  no es un paso de proceso: aquí siempre lo es, y un `as` a ciegas se tragaría el error. */
  const paquetesQueSeLanzan = (clave: string): string[] => {
    const paso = PASOS_EJECUTABLES.get(clave)!;
    if (paso.tipo !== "proceso") throw new Error(`${clave} no es un paso de proceso`);
    return (paso.invocaciones.find((i) => i.args.includes("--install"))?.args ?? []).filter((a) => a !== "--install");
  };

  it("y los paquetes que la ventana ENSEÑA son los que se LANZAN, en macOS y en Windows", () => {
    // La lista está escrita DOS veces —el comando que se copia, en `core/dispositivos.ts`, y
    // los `args` que se ejecutan, aquí— y nada la ataba: es la clase de regla que en este repo
    // se ha caído por vivir en dos sitios. Divergir no da error, da un botón que instala algo
    // distinto de lo que la ventana dice, que es el peor sitio donde puede mentir.
    const macOs = conTodo.find((c) => c.plataforma === "darwin" && c.receta!.id === "android-emulador")!.receta!;
    const mostradosMac = [...macOs.pasos[1]!.comandos[0]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    expect(new Set(paquetesQueSeLanzan("android-emulador:darwin:2"))).toEqual(new Set(mostradosMac));

    const windows = conTodo.find((c) => c.plataforma === "win32")!.receta!;
    const mostradosWin = [...windows.pasos[3]!.comandos[0]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    expect(new Set(paquetesQueSeLanzan("android-emulador:win32:4"))).toEqual(new Set(mostradosWin));
  });

  it("y `platform-tools` está entre ellos: sin ellos el emulador no arranca", () => {
    // **Medido el 16-sep-2026, y es el motivo de que estén en esa línea.** El emulador se niega
    // a dar por buena la raíz del SDK que no tenga `<sdk>/platform-tools` dentro —dice
    // `guessed sdk root … does not seem to be valid` y luego `Cannot find AVD system path` con
    // `ANDROID_HOME` apuntando a la raíz CORRECTA—, y el cask `android-commandlinetools` no los
    // trae: el `adb` del PATH viene del cask aparte, que los deja fuera. Sin esta palabra los
    // tres pasos salían «hechos» y `emulator -avd pixel8` fallaba igual.
    expect(paquetesQueSeLanzan("android-emulador:darwin:2")).toContain("platform-tools");
    expect(paquetesQueSeLanzan("android-emulador:win32:4")).toContain("platform-tools");
  });
});

describe("el paso 1: brew", () => {
  const lanzadorConPid = (pid?: number) => {
    const llamadas: { binario: string; args: string[]; env: Record<string, string | undefined> }[] = [];
    const hijos: ReturnType<typeof hijoFalso>[] = [];
    return {
      llamadas,
      hijos,
      lanzar: (binario: string, args: string[], opciones: { env: Record<string, string | undefined> }) => {
        llamadas.push({ binario, args, env: opciones.env });
        const h = hijoFalso();
        hijos.push(h);
        return pid === undefined ? h.hijo : Object.assign(h.hijo, { pid });
      },
    };
  };

  /**
   * **Y este es el paso del que colgaba todo.** No estaba en la tabla por si `brew` pedía la
   * contraseña de administrador y el hijo se quedaba esperándola; medido, `sudo` lee de
   * `/dev/tty` y sin terminal de control falla en 26 ms. Sin este botón, en una máquina nueva
   * la receta entera no tenía ninguno: los pasos 2 y 3 exigen `sdkmanager`, que es justo lo
   * que instala este.
   */
  it("lanza las dos instalaciones en orden y NO exige el SDK que va a instalar", async () => {
    const l = lanzadorConPid();
    const trabajo = correrPasoDeReceta("android-emulador", 1, {
      plataforma: "darwin",
      entorno: { PATH: "/opt/homebrew/bin" },
      home: "/Users/yo",
      // Solo `brew`: ni SDK ni JDK, que es la máquina de alguien que acaba de empezar.
      existe: (ruta: string) => ruta === "/opt/homebrew/bin/brew",
      lanzar: l.lanzar,
    });
    expect(l.llamadas[0]!.binario).toBe("/opt/homebrew/bin/brew");
    expect(l.llamadas[0]!.args).toEqual(["install", "openjdk@17"]);
    l.hijos[0]!.cerrar(0);
    await Promise.resolve();
    expect(l.llamadas[1]!.args).toEqual([
      "install",
      "--cask",
      "android-commandlinetools",
      "android-platform-tools",
    ]);
    l.hijos[1]!.cerrar(0);
    expect(await trabajo.terminado).toMatchObject({ estado: "ok" });
  });

  it("no pregunta ni se pone a actualizarse: se le dice por el entorno", async () => {
    const l = lanzadorConPid();
    correrPasoDeReceta("android-emulador", 1, {
      plataforma: "darwin",
      entorno: { PATH: "/opt/homebrew/bin" },
      home: "/Users/yo",
      existe: (ruta: string) => ruta === "/opt/homebrew/bin/brew",
      lanzar: l.lanzar,
    });
    expect(l.llamadas[0]!.env.NONINTERACTIVE).toBe("1");
    expect(l.llamadas[0]!.env.HOMEBREW_NO_AUTO_UPDATE).toBe("1");
  });

  it("si la primera instalación falla, la segunda no se lanza", async () => {
    // No es higiene: seguir instalando el SDK sin JDK dejaría el paso 3 ofreciéndose y
    // fallando después, que es peor que decir aquí que esto no salió.
    const l = lanzadorConPid();
    const trabajo = correrPasoDeReceta("android-emulador", 1, {
      plataforma: "darwin",
      entorno: { PATH: "/opt/homebrew/bin" },
      home: "/Users/yo",
      existe: (ruta: string) => ruta === "/opt/homebrew/bin/brew",
      lanzar: l.lanzar,
    });
    l.hijos[0]!.error("Error: No available formula\n");
    l.hijos[0]!.cerrar(1);
    expect(await trabajo.terminado).toMatchObject({ estado: "fallo", motivo: "Error: No available formula" });
    expect(l.llamadas).toHaveLength(1);
  });

  it("sin brew en la máquina no se lanza nada y se dice qué falta", async () => {
    const l = lanzadorConPid();
    const trabajo = correrPasoDeReceta("android-emulador", 1, {
      plataforma: "darwin",
      entorno: { PATH: "/usr/bin" },
      home: "/Users/yo",
      existe: () => false,
      lanzar: l.lanzar,
    });
    expect(await trabajo.terminado).toMatchObject({ estado: "fallo" });
    expect((await trabajo.terminado).motivo).toMatch(/brew/);
    expect(l.llamadas).toEqual([]);
  });

  /**
   * **Se mata el GRUPO, no el hijo.** Medido: un padre que deja un nieto vivo (`brew` →
   * `curl`, `sdkmanager` → `java`) sobrevive a `child.kill()` — el nieto seguía descargando
   * después de cancelar. Con `detached` el hijo es líder de su grupo y `kill(-pid)` se lo
   * lleva entero.
   */
  it("cancelar se lleva el grupo entero, no solo al hijo", async () => {
    const l = lanzadorConPid(4321);
    const grupos: { pid: number; senal: string }[] = [];
    const trabajo = correrPasoDeReceta("android-emulador", 1, {
      plataforma: "darwin",
      entorno: { PATH: "/opt/homebrew/bin" },
      home: "/Users/yo",
      existe: (ruta: string) => ruta === "/opt/homebrew/bin/brew",
      lanzar: l.lanzar,
      matarGrupo: (pid, senal) => void grupos.push({ pid, senal }),
    });
    trabajo.cancelar();
    expect(grupos).toEqual([{ pid: 4321, senal: "SIGTERM" }]);
    // Y al hijo NO se le manda nada aparte: matar dos veces no arregla nada y confunde el log.
    expect(l.hijos[0]!.matado).toBeUndefined();
    l.hijos[0]!.cerrar(null);
    expect(await trabajo.terminado).toMatchObject({ estado: "cancelada" });
  });

  it("sin pid se cae a matar al hijo, que es lo que se hacía siempre", async () => {
    // Los dobles de estos tests no tienen pid, y ese camino tiene que seguir funcionando.
    const l = lanzadorConPid();
    const trabajo = correrPasoDeReceta("android-emulador", 1, {
      plataforma: "darwin",
      entorno: { PATH: "/opt/homebrew/bin" },
      home: "/Users/yo",
      existe: (ruta: string) => ruta === "/opt/homebrew/bin/brew",
      lanzar: l.lanzar,
      matarGrupo: () => {
        throw new Error("no debería llamarse sin pid");
      },
    });
    trabajo.cancelar();
    expect(l.hijos[0]!.matado).toBe("SIGTERM");
    l.hijos[0]!.cerrar(null);
    expect(await trabajo.terminado).toMatchObject({ estado: "cancelada" });
  });
});

describe("los pasos de Windows", () => {
  const LOCALAPPDATA = "C:\\Users\\yo\\AppData\\Local";

  const WINDOWS = {
    plataforma: "win32",
    entorno: { LOCALAPPDATA, Path: "" },
    home: "C:\\Users\\yo",
    existe: (ruta: string) =>
      ruta === win32.join(LOCALAPPDATA, "Android", "Sdk", "cmdline-tools", "latest", "bin", "sdkmanager.bat") ||
      ruta === win32.join(LOCALAPPDATA, "Android", "Sdk", "cmdline-tools", "latest", "bin", "avdmanager.bat") ||
      ruta === win32.join(LOCALAPPDATA, "Android", "Sdk") ||
      ruta === win32.join(LOCALAPPDATA, "Android", "jdk17"),
  };

  const lanzador = () => {
    const llamadas: { binario: string; args: string[]; env: Record<string, string | undefined> }[] = [];
    const hijos: ReturnType<typeof hijoFalso>[] = [];
    return {
      llamadas,
      hijos,
      lanzar: (binario: string, args: string[], opciones: { env: Record<string, string | undefined> }) => {
        llamadas.push({ binario, args, env: opciones.env });
        const h = hijoFalso();
        hijos.push(h);
        return h.hijo;
      },
    };
  };

  describe("los pasos 4 y 5 (proceso): `.bat`, no `.exe`", () => {
    it("el paso 4 resuelve `sdkmanager.bat` con la RUTA resuelta, el entorno puesto y la imagen x86_64", async () => {
      const l = lanzador();
      const lineas: string[] = [];
      const trabajo = correrPasoDeReceta("android-emulador", 4, { ...WINDOWS, lanzar: l.lanzar, alSalirLinea: (x) => lineas.push(x) });
      // Las licencias primero, igual que en macOS.
      expect(l.llamadas[0]!.args).toContain("--licenses");
      l.hijos[0]!.cerrar(0);
      await Promise.resolve();
      expect(l.llamadas[1]!.binario).toBe(win32.join(LOCALAPPDATA, "Android", "Sdk", "cmdline-tools", "latest", "bin", "sdkmanager.bat"));
      expect(l.llamadas[1]!.args.join(" ")).toContain("system-images;android-35;google_apis;x86_64");
      expect(l.llamadas[1]!.env["ANDROID_HOME"]).toBe(win32.join(LOCALAPPDATA, "Android", "Sdk"));
      expect(l.llamadas[1]!.env["JAVA_HOME"]).toBe(win32.join(LOCALAPPDATA, "Android", "jdk17"));
      l.hijos[1]!.cerrar(0);
      expect(await trabajo.terminado).toMatchObject({ estado: "ok" });
    });

    it("el paso 5 resuelve `avdmanager.bat` y contesta `no` al perfil de hardware", async () => {
      const l = lanzador();
      correrPasoDeReceta("android-emulador", 5, { ...WINDOWS, lanzar: l.lanzar });
      expect(l.llamadas[0]!.binario).toBe(win32.join(LOCALAPPDATA, "Android", "Sdk", "cmdline-tools", "latest", "bin", "avdmanager.bat"));
      expect(l.hijos[0]!.escrito).toContain("no\n");
    });

    it("el PATH del hijo lleva `;` y se escribe como `Path`, el nombre con el que llegó", () => {
      // Con `:` a mano, las dos carpetas se pegaban a la última del `Path` y `avdmanager` no
      // encontraba a `sdkmanager`; y un `PATH` además del `Path` dejaría al hijo con uno de
      // los dos sin decir cuál, porque en Windows el entorno no distingue mayúsculas.
      const l = lanzador();
      correrPasoDeReceta("android-emulador", 5, {
        ...WINDOWS,
        entorno: { ...WINDOWS.entorno, Path: "C:\\Windows\\system32" },
        lanzar: l.lanzar,
      });
      const env = l.llamadas[0]!.env;
      const sdk = win32.join(LOCALAPPDATA, "Android", "Sdk");
      expect(env["Path"]).toBe(`C:\\Windows\\system32;${win32.join(sdk, "emulator")};${win32.join(sdk, "platform-tools")}`);
      expect(Object.keys(env).filter((k) => k.toUpperCase() === "PATH")).toEqual(["Path"]);
    });

    it("sin sdkmanager.bat en la máquina no se lanza nada: se dice qué falta", async () => {
      const l = lanzador();
      const trabajo = correrPasoDeReceta("android-emulador", 4, { ...WINDOWS, existe: () => false, lanzar: l.lanzar });
      const r = await trabajo.terminado;
      expect(r.estado).toBe("fallo");
      expect(r.motivo).toMatch(/paso 3/i);
      expect(l.llamadas).toEqual([]);
    });
  });

  describe("los pasos 1-3 (descarga)", () => {
    /** Un `fetch` de mentira que contesta con el `.zip` dado, sin cuerpo en streaming — cae
     *  al camino de `arrayBuffer()`, que es el que aquí importa probar: la RESOLUCIÓN del
     *  destino y el cableado con `correrPasoDeReceta`. El streaming en sí ya tiene su propio
     *  test en `descargaDeHerramientas.test.ts`. */
    const fetchDe = (zip: Uint8Array, urlsPedidas: string[]) =>
      (async (url: string) => {
        urlsPedidas.push(url);
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          body: null,
          arrayBuffer: async () => zip.slice().buffer,
        } as unknown as Response;
      }) as unknown as typeof fetch;

    it("el paso 1 descarga platform-tools y lo deja bajo Sdk, TAL CUAL trae el zip", async () => {
      const zip = zipSync({ "platform-tools/adb.exe": new Uint8Array([1, 2, 3]) });
      const urlsPedidas: string[] = [];
      const escritos: { ruta: string; datos: Uint8Array }[] = [];
      const trabajo = correrPasoDeReceta("android-emulador", 1, {
        ...WINDOWS,
        fetch: fetchDe(zip, urlsPedidas),
        crearCarpeta: () => {},
        escribir: (ruta, datos) => escritos.push({ ruta, datos }),
      });
      expect(await trabajo.terminado).toMatchObject({ estado: "ok" });
      expect(urlsPedidas[0]).toContain("platform-tools-latest-windows.zip");
      expect(escritos.map((e) => e.ruta)).toContain(join(LOCALAPPDATA, "Android", "Sdk", "platform-tools", "adb.exe"));
    });

    it("el paso 2 renombra la carpeta versionada del JDK a `jdk17`", async () => {
      // El zip de Adoptium trae la versión en el nombre de su carpeta: sin renombrar, la
      // detección (`jdkDeLaMaquina`) nunca encontraría un sitio fijo que mirar.
      const zip = zipSync({ "jdk-17.0.20.1+1/bin/java.exe": new Uint8Array([1]) });
      const escritos: { ruta: string; datos: Uint8Array }[] = [];
      const trabajo = correrPasoDeReceta("android-emulador", 2, {
        ...WINDOWS,
        fetch: fetchDe(zip, []),
        crearCarpeta: () => {},
        escribir: (ruta, datos) => escritos.push({ ruta, datos }),
      });
      expect(await trabajo.terminado).toMatchObject({ estado: "ok" });
      expect(escritos.map((e) => e.ruta)).toContain(join(LOCALAPPDATA, "Android", "jdk17", "bin", "java.exe"));
      expect(escritos.map((e) => e.ruta).join(" ")).not.toMatch(/17\.0\.20/);
    });

    it("el paso 3 renombra `cmdline-tools` a `latest`, dentro de `Sdk/cmdline-tools`", async () => {
      const zip = zipSync({ "cmdline-tools/bin/sdkmanager.bat": new Uint8Array([1]) });
      const escritos: { ruta: string; datos: Uint8Array }[] = [];
      const trabajo = correrPasoDeReceta("android-emulador", 3, {
        ...WINDOWS,
        fetch: fetchDe(zip, []),
        crearCarpeta: () => {},
        escribir: (ruta, datos) => escritos.push({ ruta, datos }),
      });
      expect(await trabajo.terminado).toMatchObject({ estado: "ok" });
      expect(escritos.map((e) => e.ruta)).toContain(
        join(LOCALAPPDATA, "Android", "Sdk", "cmdline-tools", "latest", "bin", "sdkmanager.bat")
      );
    });

    it("sin %LOCALAPPDATA%, el paso de descarga falla y lo DICE — nunca se cuelga sin saber dónde escribir", async () => {
      const trabajo = correrPasoDeReceta("android-emulador", 1, {
        plataforma: "win32",
        entorno: {},
        home: "C:\\Users\\yo",
        existe: () => false,
      });
      expect(await trabajo.terminado).toMatchObject({ estado: "fallo" });
      expect((await trabajo.terminado).motivo).toMatch(/LOCALAPPDATA/);
    });

    it("un HTTP que no es 200 es fallo, con el código en el motivo", async () => {
      const fetch404 = (async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
      const trabajo = correrPasoDeReceta("android-emulador", 1, { ...WINDOWS, fetch: fetch404 });
      const r = await trabajo.terminado;
      expect(r.estado).toBe("fallo");
      expect(r.motivo).toMatch(/404/);
    });

    it("cancelar antes de que termine se reporta como cancelada", async () => {
      // Un `fetch` que nunca resuelve: el `cancelar()` es lo único que puede sacar a la
      // promesa de su espera, vía el `AbortController`.
      const fetchColgado = ((_url: string, opciones: { signal: AbortSignal }) =>
        new Promise((_resolver, rechazar) => {
          opciones.signal.addEventListener("abort", () => rechazar(Object.assign(new Error("aborted"), { name: "AbortError" })));
        })) as unknown as typeof fetch;
      const trabajo = correrPasoDeReceta("android-emulador", 1, { ...WINDOWS, fetch: fetchColgado });
      trabajo.cancelar();
      expect(await trabajo.terminado).toMatchObject({ estado: "cancelada" });
    });
  });
});
