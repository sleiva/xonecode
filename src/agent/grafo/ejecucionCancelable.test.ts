/**
 * `crearExecuteCancelable`, con TODOS los efectos doblados — mismo estilo que
 * `agent/dispositivos/procesosEnMaquina.test.ts`: el único "hijo" es un `EventEmitter`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { crearExecuteCancelable, crearLanzador, type LanzarShell } from "./ejecucionCancelable.js";

function hijoFalso(pid?: number) {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const sucesos = new EventEmitter();
  let matado: string | undefined;
  const hijo = {
    pid,
    stdout,
    stderr,
    on: (evento: string, cb: (...a: unknown[]) => void) => {
      sucesos.on(evento, cb);
    },
    kill: (senal?: string) => {
      matado = senal ?? "SIGTERM";
      return true;
    },
  };
  return {
    hijo,
    get matado() {
      return matado;
    },
    salida: (t: string) => stdout.emit("data", Buffer.from(t)),
    error: (t: string) => stderr.emit("data", Buffer.from(t)),
    cerrar: (c: number | null) => sucesos.emit("close", c),
  };
}

function lanzador(pid?: number) {
  const hijos: ReturnType<typeof hijoFalso>[] = [];
  const lanzar: LanzarShell = (comando, opciones) => {
    void comando;
    void opciones;
    const h = hijoFalso(pid);
    hijos.push(h);
    return h.hijo;
  };
  return { hijos, lanzar };
}

afterEach(() => vi.useRealTimers());

describe("crearExecuteCancelable", () => {
  it("al abortar la señal, mata el GRUPO con SIGKILL — nunca `hijo.kill()` a secas", async () => {
    const l = lanzador(4321);
    const grupos: { pid: number; senal: string }[] = [];
    const ejecutar = crearExecuteCancelable(
      { env: {}, cwd: "/tmp", timeoutS: 600 },
      { lanzar: l.lanzar, matarGrupo: (pid, senal) => void grupos.push({ pid, senal }) }
    );
    const control = new AbortController();
    const fin = ejecutar("sleep 100", control.signal);
    control.abort();
    expect(grupos).toEqual([{ pid: 4321, senal: "SIGKILL" }]);
    expect(l.hijos[0]!.matado).toBeUndefined();
    l.hijos[0]!.cerrar(null);
    await expect(fin).resolves.toEqual({ output: "Error: Command cancelled.", exitCode: 130, truncated: false });
  });

  it("al vencer el timeout, mata el GRUPO con SIGKILL — no SIGTERM al hijo solo", async () => {
    vi.useFakeTimers();
    const l = lanzador(555);
    const grupos: { pid: number; senal: string }[] = [];
    const ejecutar = crearExecuteCancelable(
      { env: {}, cwd: "/tmp", timeoutS: 1 },
      { lanzar: l.lanzar, matarGrupo: (pid, senal) => void grupos.push({ pid, senal }) }
    );
    const fin = ejecutar("sleep 100");
    vi.advanceTimersByTime(1000);
    expect(grupos).toEqual([{ pid: 555, senal: "SIGKILL" }]);
    vi.useRealTimers();
    l.hijos[0]!.cerrar(null);
    await expect(fin).resolves.toEqual({
      output: "Error: Command timed out after 1.0 seconds.",
      exitCode: 124,
      truncated: false,
    });
  });

  it("sin pid —o con el grupo ya ido— se cae a matar al hijo", async () => {
    const l = lanzador();
    const ejecutar = crearExecuteCancelable(
      { env: {}, cwd: "/tmp", timeoutS: 600 },
      {
        lanzar: l.lanzar,
        matarGrupo: () => {
          throw new Error("no debería llamarse sin pid");
        },
      }
    );
    const control = new AbortController();
    const fin = ejecutar("sleep 100", control.signal);
    control.abort();
    expect(l.hijos[0]!.matado).toBe("SIGKILL");
    l.hijos[0]!.cerrar(null);
    await expect(fin).resolves.toEqual({ output: "Error: Command cancelled.", exitCode: 130, truncated: false });
  });

  it("sin abortar y sin vencer el timeout, el formato de salida es el mismo que daba deepagents", async () => {
    const l = lanzador();
    const ejecutar = crearExecuteCancelable({ env: {}, cwd: "/tmp", timeoutS: 600 }, { lanzar: l.lanzar });
    const fin = ejecutar("echo hola");
    l.hijos[0]!.salida("hola\n");
    l.hijos[0]!.error("un aviso\n");
    l.hijos[0]!.cerrar(0);
    await expect(fin).resolves.toEqual({ output: "hola\n\n[stderr] un aviso", exitCode: 0, truncated: false });
  });

  it("un código distinto de cero añade «Exit code: N» al final", async () => {
    const l = lanzador();
    const ejecutar = crearExecuteCancelable({ env: {}, cwd: "/tmp", timeoutS: 600 }, { lanzar: l.lanzar });
    const fin = ejecutar("false");
    l.hijos[0]!.cerrar(1);
    await expect(fin).resolves.toEqual({ output: "<no output>\n\nExit code: 1", exitCode: 1, truncated: false });
  });

  it("un comando vacío no llega a lanzar nada", async () => {
    const l = lanzador();
    const ejecutar = crearExecuteCancelable({ env: {}, cwd: "/tmp", timeoutS: 600 }, { lanzar: l.lanzar });
    await expect(ejecutar("")).resolves.toEqual({
      output: "Error: Command must be a non-empty string.",
      exitCode: 1,
      truncated: false,
    });
    expect(l.hijos).toEqual([]);
  });

  it("una señal ALREADY abortada no llega a lanzar nada", async () => {
    const l = lanzador();
    const ejecutar = crearExecuteCancelable({ env: {}, cwd: "/tmp", timeoutS: 600 }, { lanzar: l.lanzar });
    const control = new AbortController();
    control.abort();
    await expect(ejecutar("sleep 100", control.signal)).resolves.toEqual({
      output: "Error: Command cancelled.",
      exitCode: 130,
      truncated: false,
    });
    expect(l.hijos).toEqual([]);
  });

  it("con pid pero matarGrupo lanza, se cae a matar al hijo", async () => {
    const l = lanzador(9999);
    const ejecutar = crearExecuteCancelable(
      { env: {}, cwd: "/tmp", timeoutS: 600 },
      {
        lanzar: l.lanzar,
        matarGrupo: () => {
          throw new Error("ESRCH");
        },
      }
    );
    const control = new AbortController();
    const fin = ejecutar("sleep 100", control.signal);
    control.abort();
    expect(l.hijos[0]!.matado).toBe("SIGKILL");
    l.hijos[0]!.cerrar(null);
    await expect(fin).resolves.toEqual({ output: "Error: Command cancelled.", exitCode: 130, truncated: false });
  });
});

/** IXCODE-72: la composición REAL del lanzador, con `spawn` y el disco falsos y la regla de verdad. */
describe("crearLanzador", () => {
  const llamadas: { programa: string; argumentos: string[]; opciones: Record<string, unknown> }[] = [];
  const spawn = (programa: string, argumentos: string[], opciones: object): unknown => {
    llamadas.push({ programa, argumentos, opciones: opciones as Record<string, unknown> });
    return {};
  };
  afterEach(() => void llamadas.splice(0));

  it("en Windows con Git, la orden va a `bash -c` ENTERA, sin `cmd`, con el entorno y sin conversión de rutas", () => {
    const bash = "C:\\Program Files\\Git\\bin\\bash.exe";
    const hay = new Set(["C:\\Program Files\\Git\\cmd\\git.exe", bash]);
    const lanzar = crearLanzador({ plataforma: "win32", existe: (r) => hay.has(r), spawn });
    lanzar("node -e 'x => x > 6612'", { env: { Path: "C:\\Program Files\\Git\\cmd", XONECODE_X: "1" }, cwd: "C:\\p" });
    expect(llamadas[0]).toMatchObject({
      programa: bash,
      argumentos: ["-c", "node -e 'x => x > 6612'"],
      opciones: { shell: false, cwd: "C:\\p", detached: false, windowsHide: true, env: { XONECODE_X: "1", MSYS_NO_PATHCONV: "1" } },
    });
  });

  it("en Windows sin Git, `cmd.exe` como antes; en macOS, la `sh` de siempre con su grupo propio", () => {
    crearLanzador({ plataforma: "win32", existe: () => false, spawn })("dir", { env: {}, cwd: "C:\\p" });
    crearLanzador({ plataforma: "darwin", existe: () => true, spawn })("ls", { env: {}, cwd: "/p" });
    expect(llamadas.map((l) => [l.programa, l.argumentos, l.opciones["shell"], l.opciones["detached"]])).toEqual([
      ["dir", [], true, false],
      ["ls", [], true, true],
    ]);
  });
});

describe("crearExecuteCancelable: la traza de cada orden", () => {
  it("sin quien la escuche no lista nada; con él, dice lo que apareció en la raíz", async () => {
    const hijo = () => {
      const h = Object.assign(new EventEmitter(), { pid: 1, stdout: new EventEmitter(), stderr: new EventEmitter(), kill: () => true });
      setTimeout(() => h.emit("close", 0), 0);
      return h as never;
    };
    let listados = 0;
    const sinTraza = crearExecuteCancelable({ env: {}, cwd: "/p", timeoutS: 5 }, { lanzar: hijo, listar: () => (listados++, []) });
    await sinTraza("ls");
    expect(listados).toBe(0);

    let raiz = ["app.xml"];
    const trazas: unknown[] = [];
    const conTraza = crearExecuteCancelable(
      { env: {}, cwd: "/p", timeoutS: 5 },
      {
        lanzar: (c, o) => {
          raiz = [...raiz, "6612"];
          return hijo();
        },
        listar: () => raiz,
        alTerminar: (d) => trazas.push(d),
      }
    );
    await conTraza("x > 6612");
    expect(trazas).toEqual([expect.objectContaining({ comando: "x > 6612", salida: 0, nuevos: ["6612"] })]);
  });
});
