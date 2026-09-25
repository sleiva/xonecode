/**
 * `crearExecuteCancelable`, con TODOS los efectos doblados — mismo estilo que
 * `agent/dispositivos/procesosEnMaquina.test.ts`: el único "hijo" es un `EventEmitter`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { crearExecuteCancelable, type LanzarShell } from "./ejecucionCancelable.js";

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
});
