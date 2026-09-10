import { describe, expect, it, vi } from "vitest";
import { recetaDeEmuladorAndroid, recetaDeSimuladorIos } from "../core/dispositivos.js";
import { EventEmitter } from "node:events";
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
    // El paso 2 escribe en el `~/.zshrc` de alguien, que es lo único de esta receta que no
    // sabríamos deshacer; y la receta de iOS no tiene ninguno —un `sudo` escrito en el
    // comando fallaría siempre, y `-downloadPlatform` pide autorización en una ventana—.
    expect([...PASOS_EJECUTABLES.keys()].sort()).toEqual([
      "android-emulador:1",
      "android-emulador:3",
      "android-emulador:4",
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
    // El 2 escribe en el `~/.zshrc` de alguien: es lo único de esta receta que no sabríamos
    // deshacer, así que no está en la tabla y se sigue copiando.
    const l = lanzador();
    const trabajo = correrPasoDeReceta("android-emulador", 2, { ...ANDROID, lanzar: l.lanzar });
    expect(await trabajo.terminado).toMatchObject({ estado: "fallo" });
    expect(l.llamadas).toEqual([]);
  });

  /** El paso 3 son DOS procesos: primero las licencias, después la descarga. */
  const arrancarPaso3 = (extra: Partial<Parameters<typeof correrPasoDeReceta>[2]> = {}) => {
    const l = lanzador();
    const lineas: string[] = [];
    const trabajo = correrPasoDeReceta("android-emulador", 3, {
      ...ANDROID,
      lanzar: l.lanzar,
      alSalirLinea: (x) => lineas.push(x),
      ...extra,
    });
    return { l, lineas, trabajo, licencias: () => l.hijos[0]!, instalar: () => l.hijos[1]! };
  };

  it("acepta las licencias ANTES de instalar, y con las respuestas alimentadas", async () => {
    // Sin TTY, el prompt de licencias cuelga el proceso para siempre: se le teclea.
    const p3 = arrancarPaso3();
    expect(p3.l.llamadas[0]!.args).toContain("--licenses");
    expect(p3.licencias().escrito.filter((x) => x === "y\n").length).toBeGreaterThan(0);
    // Y se DICE en el log qué se está aceptando y por qué.
    expect(p3.lineas.join(" ")).toMatch(/licencias/i);
    p3.licencias().cerrar(0);
    await Promise.resolve();
    expect(p3.l.llamadas[1]!.args).toContain("--install");
  });

  it("lanza `sdkmanager` con la RUTA resuelta y el entorno puesto", async () => {
    const p3 = arrancarPaso3();
    p3.licencias().cerrar(0);
    await Promise.resolve();
    p3.instalar().salida("Loading package information...\nInstalling emulator\n");
    p3.instalar().cerrar(0);
    expect(await p3.trabajo.terminado).toMatchObject({ estado: "ok" });

    // La ruta la resuelve el HOST: ni el cliente manda un comando ni un binario.
    expect(p3.l.llamadas[1]!.binario).toBe("/opt/homebrew/bin/sdkmanager");
    expect(p3.l.llamadas[1]!.args.join(" ")).toContain("system-images;android-35;google_apis;arm64-v8a");
    // El hijo necesita el SDK y el JDK, y eso son rutas de la MÁQUINA: van en su entorno,
    // que no viaja a ninguna parte.
    expect(p3.l.llamadas[1]!.env["ANDROID_HOME"]).toBe("/opt/homebrew/share/android-commandlinetools");
    expect(p3.l.llamadas[1]!.env["JAVA_HOME"]).toBe("/opt/homebrew/opt/openjdk@17");
    expect(p3.lineas).toContain("Loading package information...");
    expect(p3.lineas).toContain("Installing emulator");
  });

  it("una línea partida en dos trozos no sale partida", async () => {
    // Un `data` no es una línea: puede traer media, o tres. Emitir trozos dejaría el log
    // cortado por la mitad en la ventana.
    const p3 = arrancarPaso3();
    p3.licencias().cerrar(0);
    await Promise.resolve();
    p3.instalar().salida("Downloading ");
    p3.instalar().salida("emulator 58%\nDone\n");
    p3.instalar().cerrar(0);
    await p3.trabajo.terminado;
    expect(p3.lineas).toContain("Downloading emulator 58%");
    expect(p3.lineas).toContain("Done");
  });

  it("stderr también se cuenta: `sdkmanager` avisa por ahí", async () => {
    const l = lanzador();
    const lineas: string[] = [];
    const trabajo = correrPasoDeReceta("android-emulador", 4, {
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
    correrPasoDeReceta("android-emulador", 4, { ...ANDROID, lanzar: l.lanzar });
    expect(l.llamadas[0]!.binario).toBe("/opt/homebrew/bin/avdmanager");
    expect(l.hijos[0]!.escrito).toContain("no\n");
  });

  it("un código distinto de cero es FALLO, con la última línea como motivo", async () => {
    const p3 = arrancarPaso3();
    p3.licencias().cerrar(0);
    await Promise.resolve();
    p3.instalar().error("Warning: Failed to find package\n");
    p3.instalar().cerrar(1);
    expect(await p3.trabajo.terminado).toMatchObject({ estado: "fallo", motivo: "Warning: Failed to find package" });
  });

  it("un fallo de las LICENCIAS no corta: puede que ya estuvieran aceptadas", async () => {
    const p3 = arrancarPaso3();
    p3.licencias().cerrar(1);
    await Promise.resolve();
    expect(p3.l.llamadas[1]!.args).toContain("--install");
    p3.instalar().cerrar(0);
    expect(await p3.trabajo.terminado).toMatchObject({ estado: "ok" });
  });

  it("cancelar mata al hijo y se reporta como cancelada, no como fallo", async () => {
    const p3 = arrancarPaso3();
    p3.trabajo.cancelar();
    expect(p3.licencias().matado).toBeDefined();
    p3.licencias().cerrar(null);
    expect(await p3.trabajo.terminado).toMatchObject({ estado: "cancelada" });
  });

  it("sin salida durante mucho rato se da por COLGADA y se mata", async () => {
    vi.useFakeTimers();
    const p3 = arrancarPaso3();
    const hijo = p3.licencias();
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
    expect(await p3.trabajo.terminado).toMatchObject({ estado: "colgada" });
    vi.useRealTimers();
  });

  it("el tope total existe, y es holgado: una descarga de 3 GB no es un cuelgue", () => {
    expect(TOPE_DE_TRABAJO_MS).toBeGreaterThanOrEqual(30 * 60_000);
    expect(TOPE_SIN_SALIDA_MS).toBeLessThan(TOPE_DE_TRABAJO_MS);
  });

  it("si el proceso no arranca, se dice y no se queda esperando", async () => {
    const p3 = arrancarPaso3();
    p3.licencias().reventar(Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));
    await Promise.resolve();
    p3.instalar().reventar(Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));
    expect(await p3.trabajo.terminado).toMatchObject({ estado: "fallo", motivo: "el ejecutable no existe" });
  });

  it("sin sdkmanager en la máquina no se lanza nada: se dice qué falta", async () => {
    const l = lanzador();
    const trabajo = correrPasoDeReceta("android-emulador", 3, { ...ANDROID, existe: () => false, lanzar: l.lanzar });
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
  /** Una máquina con todo puesto: es donde cada receta ofrece todo lo que puede ofrecer. */
  const conTodo = [
    recetaDeEmuladorAndroid("darwin", {
      brew: true,
      sdkmanager: true,
      emulator: true,
      androidHome: true,
      jdk: true,
      avds: ["pixel8"],
    })!,
    recetaDeSimuladorIos("darwin", { xcode: true, licencia: true, runtimes: ["iOS 26.0"] })!,
  ];

  it("todo paso marcado ejecutable está en la tabla", () => {
    for (const receta of conTodo) {
      receta.pasos.forEach((paso, i) => {
        if (!paso.ejecutable) return;
        expect(PASOS_EJECUTABLES.has(`${receta.id}:${i + 1}`), `${receta.id}:${i + 1}`).toBe(true);
      });
    }
  });

  it("y toda entrada de la tabla es un paso que se ofrece", () => {
    for (const clave of PASOS_EJECUTABLES.keys()) {
      const [id, numero] = clave.split(":");
      const receta = conTodo.find((r) => r.id === id);
      expect(receta, clave).toBeDefined();
      expect(receta!.pasos[Number(numero) - 1]?.ejecutable, clave).toBe(true);
    }
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
   * `/dev/tty` y sin terminal de control falla en 57 ms. Sin este botón, en una máquina nueva
   * la receta entera no tenía ninguno: los pasos 3 y 4 exigen `sdkmanager`, que es justo lo
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
