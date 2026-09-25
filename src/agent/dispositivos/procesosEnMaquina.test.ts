/**
 * EL EJECUTOR DE PROCESOS, solo: aquí no hay recetas ni fases, y **todos los efectos están
 * doblados**. No se lanza un proceso de verdad —es el invariante de este repo, y este es el
 * módulo que más cerca está de romperlo—, así que el único «hijo» es un `EventEmitter`.
 *
 * Lo que se fija aquí es el CONTRATO que comparten la instalación y el lanzamiento: los dos
 * topes, el `kill` del GRUPO, el troceado por líneas y en qué acabó. Las FRASES no: la causa
 * del cuelgue se devuelve como dato (`silencio` | `total`) y cada módulo escribe la suya.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  crearEjecutor,
  matarGrupoReal,
  motivoDelCodigo,
  necesitaShell,
  TOPE_DE_TRABAJO_MS,
  TOPE_SIN_SALIDA_MS,
  unaLinea,
  type ProcesoHijo,
} from "./procesosEnMaquina.js";

/** Un hijo de mentira: se le dan datos y se le hace terminar a mano. */
function hijoFalso(pid?: number) {
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
    pid,
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

/** Un `lanzar` con su registro de llamadas y sus hijos, uno NUEVO por llamada. */
function lanzador(pid?: number) {
  const llamadas: { binario: string; args: string[]; env: Record<string, string | undefined> }[] = [];
  const hijos: ReturnType<typeof hijoFalso>[] = [];
  return {
    llamadas,
    hijos,
    lanzar: (binario: string, args: string[], opciones: { env: Record<string, string | undefined> }) => {
      llamadas.push({ binario, args, env: opciones.env });
      const h = hijoFalso(pid);
      hijos.push(h);
      return h.hijo;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("crearEjecutor", () => {
  it("corre y devuelve lo que dijo: la última línea es el motivo de un código distinto de cero", async () => {
    const l = lanzador();
    const lineas: string[] = [];
    const ejecutor = crearEjecutor({ lanzar: l.lanzar, entorno: { PATH: "/usr/bin" } });

    const bien = ejecutor.correr("adb", ["-s", "emulator-5554", "forward"], {
      env: { PATH: "/opt/homebrew/bin", OTRA: "1" },
      alSalirLinea: (x) => lineas.push(x),
    });
    expect(l.llamadas[0]).toEqual({
      binario: "adb",
      args: ["-s", "emulator-5554", "forward"],
      // El entorno del hijo es el que se pasa por llamada: cada paso de una receta trae el suyo.
      env: { PATH: "/opt/homebrew/bin", OTRA: "1" },
    });
    l.hijos[0]!.salida("aplicado\n");
    l.hijos[0]!.cerrar(0);
    await expect(bien).resolves.toEqual({ estado: "ok" });
    expect(lineas).toEqual(["aplicado"]);

    const mal = ejecutor.correr("adb", ["shell"], {});
    expect(l.llamadas[1]!.env).toEqual({ PATH: "/usr/bin" });
    l.hijos[1]!.error("error: closed\n");
    l.hijos[1]!.cerrar(1);
    await expect(mal).resolves.toEqual({ estado: "fallo", motivo: "error: closed" });
  });

  it("una línea partida en dos trozos no sale partida: un `data` no es una línea", async () => {
    const l = lanzador();
    const lineas: string[] = [];
    const ejecutor = crearEjecutor({ lanzar: l.lanzar, entorno: {} });
    const fin = ejecutor.correr("sdkmanager", [], { alSalirLinea: (x) => lineas.push(x) });

    l.hijos[0]!.salida("Downloading ");
    l.hijos[0]!.salida("emulator 58%\nDone\n");
    l.hijos[0]!.cerrar(0);
    await fin;
    expect(lineas).toEqual(["Downloading emulator 58%", "Done"]);
  });

  it("lo que hay que teclear va por `stdin`, repetido, y el `stdin` se cierra", async () => {
    const l = lanzador();
    const ejecutor = crearEjecutor({ lanzar: l.lanzar, entorno: {} });
    const fin = ejecutor.correr("sdkmanager", ["--licenses"], { teclear: ["y\n"], repetir: 3 });

    expect(l.hijos[0]!.escrito).toEqual(["y\n", "y\n", "y\n", "<end>"]);
    l.hijos[0]!.cerrar(0);
    await fin;
  });

  it("sin nada que teclear también se cierra el `stdin`: un proceso sin entrada no lo deja abierto", async () => {
    const l = lanzador();
    const ejecutor = crearEjecutor({ lanzar: l.lanzar, entorno: {} });
    const fin = ejecutor.correr("adb", [], {});
    expect(l.hijos[0]!.escrito).toEqual(["<end>"]);
    l.hijos[0]!.cerrar(0);
    await fin;
  });

  it("el silencio es el síntoma: se da por colgado al tope sin salida, y no antes", async () => {
    vi.useFakeTimers();
    const l = lanzador();
    const ejecutor = crearEjecutor({ lanzar: l.lanzar, entorno: {} });
    const fin = ejecutor.correr("adb", ["shell", "am", "start"], {});

    vi.advanceTimersByTime(TOPE_SIN_SALIDA_MS - 1);
    expect(l.hijos[0]!.matado).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(l.hijos[0]!.matado).toBe("SIGKILL");

    l.hijos[0]!.cerrar(null);
    // La CAUSA, no la frase: aquí no se redacta, que cada módulo tiene la suya.
    await expect(fin).resolves.toEqual({ estado: "colgada", cuelgue: "silencio" });
  });

  it("y el tope total es OTRO hecho: un proceso que habla sin acabar no está esperando a nadie", async () => {
    vi.useFakeTimers();
    const l = lanzador();
    const ejecutor = crearEjecutor({ lanzar: l.lanzar, entorno: {} });
    const fin = ejecutor.correr("sdkmanager", ["--install", "emulator"], {});

    // Hablando todo el rato, así que el tope del silencio no llega a saltar nunca.
    const paso = TOPE_SIN_SALIDA_MS - 1000;
    for (let t = 0; t <= TOPE_DE_TRABAJO_MS; t += paso) {
      l.hijos[0]!.salida("sigo aquí\n");
      vi.advanceTimersByTime(paso);
    }
    expect(l.hijos[0]!.matado).toBe("SIGKILL");

    l.hijos[0]!.cerrar(null);
    await expect(fin).resolves.toEqual({ estado: "colgada", cuelgue: "total" });
  });

  it("mata el GRUPO entero, no solo al hijo: un nieto sobrevive a `child.kill()`", async () => {
    const l = lanzador(4321);
    const grupos: { pid: number; senal: string }[] = [];
    const ejecutor = crearEjecutor({
      lanzar: l.lanzar,
      entorno: {},
      matarGrupo: (pid, senal) => void grupos.push({ pid, senal }),
    });
    const fin = ejecutor.correr("adb", [], {});

    ejecutor.cancelar();
    expect(grupos).toEqual([{ pid: 4321, senal: "SIGTERM" }]);
    // Y al hijo no se le manda nada aparte: matar dos veces no arregla nada y confunde el log.
    expect(l.hijos[0]!.matado).toBeUndefined();

    l.hijos[0]!.cerrar(null);
    await expect(fin).resolves.toEqual({ estado: "cancelada" });
  });

  it("sin pid —o con el grupo ya ido— se cae a matar al hijo, que es lo que se hacía siempre", async () => {
    const sinPid = lanzador();
    const ejecutor = crearEjecutor({
      lanzar: sinPid.lanzar,
      entorno: {},
      matarGrupo: () => {
        throw new Error("no debería llamarse sin pid");
      },
    });
    const a = ejecutor.correr("brew", ["install", "openjdk@17"], {});
    ejecutor.cancelar();
    expect(sinPid.hijos[0]!.matado).toBe("SIGTERM");
    sinPid.hijos[0]!.cerrar(null);
    await expect(a).resolves.toEqual({ estado: "cancelada" });

    // Con pid pero con el grupo inalcanzable: se intenta con el hijo en vez de rendirse.
    const conPid = lanzador(777);
    const ejecutor2 = crearEjecutor({
      lanzar: conPid.lanzar,
      entorno: {},
      matarGrupo: () => {
        throw new Error("ESRCH");
      },
    });
    const b = ejecutor2.correr("brew", ["upgrade"], {});
    ejecutor2.cancelar();
    expect(conPid.hijos[0]!.matado).toBe("SIGTERM");
    conPid.hijos[0]!.cerrar(null);
    await expect(b).resolves.toEqual({ estado: "cancelada" });
  });

  it("cancelar es pegajoso: lo que se pida después no llega a arrancar", async () => {
    const l = lanzador();
    const ejecutor = crearEjecutor({ lanzar: l.lanzar, entorno: {} });
    ejecutor.cancelar();
    await expect(ejecutor.correr("adb", ["shell"], {})).resolves.toEqual({ estado: "cancelada" });
    // Ni un `spawn` de más: un proceso que nace muerto ensucia el log de la ventana con una
    // línea que no es, y gasta el `lanzar` de quien esté mirando.
    expect(l.llamadas).toEqual([]);
  });

  it("un hijo que no arranca se dice con UNA línea, y no se espera a nadie", async () => {
    const l = lanzador();
    const ejecutor = crearEjecutor({ lanzar: l.lanzar, entorno: {} });
    const fin = ejecutor.correr("adb", [], {});
    l.hijos[0]!.reventar(Object.assign(new Error("spawn adb ENOENT"), { code: "ENOENT" }));
    await expect(fin).resolves.toEqual({ estado: "fallo", motivo: "el ejecutable no existe" });

    // Y un `lanzar` que revienta al llamar: el mismo camino, sin proceso que cerrar.
    const revienta = crearEjecutor({
      lanzar: () => {
        throw Object.assign(new Error("EACCES: permission denied, spawn adb"), { code: "EACCES" });
      },
      entorno: {},
    });
    await expect(revienta.correr("adb", [], {})).resolves.toEqual({
      estado: "fallo",
      motivo: "EACCES: permission denied, spawn adb",
    });
  });
});

describe("las dos frases que sí se comparten", () => {
  it("una línea, nunca la salida entera ni una traza con rutas", () => {
    expect(unaLinea(Object.assign(new Error("spawn x ENOENT"), { code: "ENOENT" }))).toBe("el ejecutable no existe");
    // La primera línea y nada más: una traza lleva rutas de la máquina.
    expect(unaLinea(new Error("primera\nsegunda\ntercera"))).toBe("primera");
    expect(unaLinea("un texto suelto")).toBe("un texto suelto");
    expect(unaLinea(new Error("x".repeat(400)))).toHaveLength(160);
  });

  it("el motivo de un código: la última línea si dijo algo, y si no el código", () => {
    expect(motivoDelCodigo(1, "Warning: Failed to find package")).toBe("Warning: Failed to find package");
    // Sin una línea que enseñar, el código es todo lo que hay. Ojo: con `null` —lo mató una
    // señal— esta frase sale tal cual, «terminó con código null», y es lo que decían los dos
    // módulos antes de compartir el ejecutor. Se deja como estaba: cambiarla es otra decisión.
    expect(motivoDelCodigo(1, "")).toBe("terminó con código 1");
  });
});

describe("necesitaShell", () => {
  /**
   * Medido en la máquina del usuario: `spawn("…\\sdkmanager.bat", args)` sin `shell: true`
   * revienta con «spawn EINVAL» en vez de arrancar. Node cerró la inyección de comandos por
   * `.bat`/`.cmd` (CVE-2024-27980) exigiendo `shell: true` para lanzarlos directamente en
   * Windows — así que esto es la comprobación de LA MISMA condición que decide si `lanzarReal`
   * se lo da, sin lanzar un proceso de verdad.
   */
  it("solo en Windows, y solo para `.bat`/`.cmd`: ni para `.exe` ni para un binario sin extensión", () => {
    expect(necesitaShell("C:\\Sdk\\cmdline-tools\\latest\\bin\\sdkmanager.bat", "win32")).toBe(true);
    expect(necesitaShell("C:\\Sdk\\cmdline-tools\\latest\\bin\\avdmanager.bat", "win32")).toBe(true);
    expect(necesitaShell("algo.CMD", "win32")).toBe(true); // sin distinguir mayúsculas
    expect(necesitaShell("C:\\Sdk\\platform-tools\\adb.exe", "win32")).toBe(false);
    expect(necesitaShell("/opt/homebrew/bin/brew", "darwin")).toBe(false);
    // Y ni siquiera un `.bat` fuera de Windows: ahí Node no impone esta restricción y `shell:
    // true` solo añadiría una capa de interpretación que no hace falta.
    expect(necesitaShell("./script.bat", "linux")).toBe(false);
  });
});

describe("matarGrupoReal: la rama de Windows, por invocación (no hay Windows en CI)", () => {
  it("en win32 llama a taskkill /PID <pid> /T /F, y NUNCA a process.kill", () => {
    const llamadas: string[][] = [];
    matarGrupoReal(4321, "SIGKILL", {
      plataforma: "win32",
      taskkill: (args) => void llamadas.push(args),
    });
    expect(llamadas).toEqual([["/PID", "4321", "/T", "/F"]]);
  });
});
