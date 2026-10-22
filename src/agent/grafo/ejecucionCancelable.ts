/**
 * El `execute` de deepagents, reescrito. La librería (`LocalShellBackend.execute`) mata solo
 * al hijo INMEDIATO al vencer su timeout (un nieto sobrevive) y no acepta ninguna señal de
 * cancelación — ver el porqué medido en
 * `docs/superpowers/specs/2026-09-25-cancelacion-de-execute-design.md`.
 *
 * Sustituye a `LocalShellBackend.execute` ENTERO: mismo formato de salida, más `detached` (en
 * POSIX) + `matarGrupoReal` (mata el ÁRBOL, en las dos plataformas) y una `AbortSignal`
 * opcional.
 *
 * Dos exit codes que la librería no distinguía: **124** si venció el timeout (igual que
 * ella), **130** si lo canceló la señal (128+SIGINT, convención de shell para
 * "interrumpido") — el modelo puede distinguir "me quedé sin tiempo" de "me cancelaron".
 */
import { spawn, type SpawnOptions } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { bashDeGit, lanzamientoDeShell } from "../../core/shellDeAgente.js";
import { matarGrupoReal } from "../dispositivos/procesosEnMaquina.js";

export interface ResultadoDeEjecucion {
  output: string;
  exitCode: number | null;
  truncated: boolean;
}

/** El hijo, visto por este módulo — sin `stdin`, que `execute` nunca teclea. */
interface ProcesoDeShell {
  pid?: number;
  stdout: { on: (evento: "data", cb: (dato: unknown) => void) => void };
  stderr: { on: (evento: "data", cb: (dato: unknown) => void) => void };
  on: (evento: "close" | "error", cb: (...args: unknown[]) => void) => void;
  kill: (senal?: string) => boolean;
}

export type LanzarShell = (
  comando: string,
  opciones: { env: Record<string, string>; cwd: string }
) => ProcesoDeShell;

/**
 * **`detached: true` no es cosmético: es la causa raíz.** Sin él, el hijo comparte el grupo
 * de proceso de xonecode entero, y `process.kill(-pid)` (dentro de `matarGrupoReal`) mataría
 * ESE grupo — el propio xonecode incluido. `LocalShellBackend.execute` de la librería no lo
 * pone, y por eso su `child.kill()` solo alcanza al hijo inmediato.
 *
 * **`detached` es solo de POSIX.** Es lo que hace al hijo líder de su propio grupo para que
 * `process.kill(-pid)` alcance al árbol; en Windows no hay grupos de proceso POSIX, así que
 * `matarGrupoReal` usa `taskkill /T` (recorre el árbol por PID, no por grupo) y no lo
 * necesita — y ahí `detached: true` le abre al hijo su PROPIA ventana de consola visible (lo
 * dice la documentación de Node). `windowsHide: true` va siempre, en las dos plataformas: en
 * POSIX no hace nada, en Windows evita esa ventana.
 */
export const lanzarReal: LanzarShell = crearLanzador({ plataforma: process.platform, existe: existsSync, spawn });

/**
 * El lanzador, con la plataforma, el disco y `spawn` por parámetro: la composición de PRODUCCIÓN con su regla
 * (`core/shellDeAgente.ts#lanzamientoDeShell`, IXCODE-72) probada sin estar en Windows. En Windows corre la orden con el
 * bash de Git si lo hay —el modelo escribe bash, y `cmd.exe` dejaba ficheros sueltos en el proyecto—; si no, como antes.
 */
export function crearLanzador(deps: {
  plataforma: NodeJS.Platform;
  existe: (ruta: string) => boolean;
  spawn: (programa: string, argumentos: string[], opciones: SpawnOptions) => unknown;
}): LanzarShell {
  return (comando, opciones) => {
    const bash = deps.plataforma === "win32" ? bashDeGit({ entorno: opciones.env, existe: deps.existe }) : undefined;
    const l = lanzamientoDeShell(comando, { plataforma: deps.plataforma, ...(bash === undefined ? {} : { bash }) });
    return deps.spawn(l.programa, l.argumentos, {
      shell: l.shell,
      env: { ...opciones.env, ...l.entorno },
      cwd: opciones.cwd,
      detached: deps.plataforma !== "win32",
      windowsHide: true,
    }) as ProcesoDeShell;
  };
}

const TOPE_DE_SALIDA_BYTES = 100_000;

/**
 * Lo que la traza («Depurar») apunta de UNA orden, al terminar (IXCODE-72): la orden, cómo salió, cuánto tardó y los
 * ficheros que NO estaban antes en la raíz del proyecto. Lo último es lo que delata a la orden que deja ficheros sueltos
 * (en Windows, `cmd.exe` tomaba cada `>` de una orden bash por una redirección). La shell la pone quien monta.
 */
export interface TrazaDeOrden {
  comando: string;
  salida: number | null;
  ms: number;
  nuevos: string[];
}

/** Los nombres de la raíz que no estaban antes, en orden. Pura. */
export function nuevosEnLaRaiz(antes: readonly string[], despues: readonly string[]): string[] {
  const habia = new Set(antes);
  return despues.filter((n) => !habia.has(n)).sort();
}

export function crearExecuteCancelable(
  opciones: { env: Record<string, string>; cwd: string; timeoutS: number; maxOutputBytes?: number },
  deps: {
    lanzar?: LanzarShell;
    matarGrupo?: (pid: number, senal: string) => void;
    /** Quien apunta cada orden en la traza. Ausente (sin «Depurar») = no se lista nada: no cuesta nada. */
    alTerminar?: (traza: TrazaDeOrden) => void;
    /** Los nombres de la raíz; por parámetro para probarlo sin disco. */
    listar?: (carpeta: string) => readonly string[];
  } = {}
): (comando: string, senal?: AbortSignal) => Promise<ResultadoDeEjecucion> {
  const lanzarBase = deps.lanzar ?? lanzarReal;
  const listar = deps.listar ?? ((carpeta: string): readonly string[] => readdirSync(carpeta));
  const leerRaiz = (): readonly string[] => {
    try {
      return listar(opciones.cwd);
    } catch {
      return [];
    }
  };
  const matarGrupo = deps.matarGrupo ?? ((pid: number, senal: string) => matarGrupoReal(pid, senal));
  const maxOutputBytes = opciones.maxOutputBytes ?? TOPE_DE_SALIDA_BYTES;

  return (comando: string, senal?: AbortSignal): Promise<ResultadoDeEjecucion> => {
    if (!comando || typeof comando !== "string") {
      return Promise.resolve({ output: "Error: Command must be a non-empty string.", exitCode: 1, truncated: false });
    }

    if (senal?.aborted) {
      return Promise.resolve({ output: "Error: Command cancelled.", exitCode: 130, truncated: false });
    }

    const alTerminar = deps.alTerminar;
    const antes = alTerminar === undefined ? [] : leerRaiz();
    const desde = Date.now();
    return new Promise<ResultadoDeEjecucion>((resolverBase) => {
      const resolver = (r: ResultadoDeEjecucion): void => {
        if (alTerminar !== undefined) {
          try {
            alTerminar({ comando, salida: r.exitCode, ms: Date.now() - desde, nuevos: nuevosEnLaRaiz(antes, leerRaiz()) });
          } catch {
            // La traza no puede tumbar la orden.
          }
        }
        resolverBase(r);
      };
      const hijo = lanzarBase(comando, { env: opciones.env, cwd: opciones.cwd });
      let stdout = "";
      let stderr = "";
      let causa: "timeout" | "cancelado" | undefined;

      const matar = (senalOS: string): void => {
        const pid = hijo.pid;
        if (pid !== undefined) {
          try {
            matarGrupo(pid, senalOS);
            return;
          } catch {
            // El grupo ya no está o el sistema no deja: se intenta con el hijo.
          }
        }
        hijo.kill(senalOS);
      };

      const timer = setTimeout(() => {
        causa = "timeout";
        matar("SIGKILL");
      }, opciones.timeoutS * 1000);

      const alAbortar = (): void => {
        causa = "cancelado";
        matar("SIGKILL");
      };
      senal?.addEventListener("abort", alAbortar, { once: true });

      hijo.stdout.on("data", (dato) => void (stdout += String(dato)));
      hijo.stderr.on("data", (dato) => void (stderr += String(dato)));

      hijo.on("error", ((error: Error) => {
        clearTimeout(timer);
        senal?.removeEventListener("abort", alAbortar);
        resolver({ output: `Error executing command: ${error.message}`, exitCode: 1, truncated: false });
      }) as never);

      hijo.on("close", ((codigo: number | null) => {
        clearTimeout(timer);
        senal?.removeEventListener("abort", alAbortar);
        if (causa === "cancelado") {
          resolver({ output: "Error: Command cancelled.", exitCode: 130, truncated: false });
          return;
        }
        if (causa === "timeout") {
          resolver({
            output: `Error: Command timed out after ${opciones.timeoutS.toFixed(1)} seconds.`,
            exitCode: 124,
            truncated: false,
          });
          return;
        }
        const partes: string[] = [];
        if (stdout) partes.push(stdout);
        if (stderr) partes.push(...stderr.trim().split("\n").map((l) => `[stderr] ${l}`));
        let salida = partes.length > 0 ? partes.join("\n") : "<no output>";
        let truncado = false;
        if (salida.length > maxOutputBytes) {
          salida = `${salida.slice(0, maxOutputBytes)}\n\n... Output truncated at ${maxOutputBytes} bytes.`;
          truncado = true;
        }
        const exitCode = codigo ?? 1;
        if (exitCode !== 0) salida = `${salida.trimEnd()}\n\nExit code: ${exitCode}`;
        resolver({ output: salida, exitCode, truncated: truncado });
      }) as never);
    });
  };
}
