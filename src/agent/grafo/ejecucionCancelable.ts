/**
 * El `execute` de deepagents, reescrito. La librería (`LocalShellBackend.execute`) mata solo
 * al hijo INMEDIATO al vencer su timeout (un nieto sobrevive) y no acepta ninguna señal de
 * cancelación — ver el porqué medido en
 * `docs/superpowers/specs/2026-09-25-cancelacion-de-execute-design.md`.
 *
 * Sustituye a `LocalShellBackend.execute` ENTERO: mismo formato de salida, más
 * `detached: true` + `matarGrupoReal` (mata el ÁRBOL) y una `AbortSignal` opcional.
 *
 * Dos exit codes que la librería no distinguía: **124** si venció el timeout (igual que
 * ella), **130** si lo canceló la señal (128+SIGINT, convención de shell para
 * "interrumpido") — el modelo puede distinguir "me quedé sin tiempo" de "me cancelaron".
 */
import { spawn } from "node:child_process";
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
 */
export const lanzarReal: LanzarShell = (comando, opciones) =>
  spawn(comando, { shell: true, env: opciones.env, cwd: opciones.cwd, detached: true }) as unknown as ProcesoDeShell;

const TOPE_DE_SALIDA_BYTES = 100_000;

export function crearExecuteCancelable(
  opciones: { env: Record<string, string>; cwd: string; timeoutS: number; maxOutputBytes?: number },
  deps: { lanzar?: LanzarShell; matarGrupo?: (pid: number, senal: string) => void } = {}
): (comando: string, senal?: AbortSignal) => Promise<ResultadoDeEjecucion> {
  const lanzar = deps.lanzar ?? lanzarReal;
  const matarGrupo = deps.matarGrupo ?? ((pid: number, senal: string) => matarGrupoReal(pid, senal));
  const maxOutputBytes = opciones.maxOutputBytes ?? TOPE_DE_SALIDA_BYTES;

  return (comando: string, senal?: AbortSignal): Promise<ResultadoDeEjecucion> => {
    if (!comando || typeof comando !== "string") {
      return Promise.resolve({ output: "Error: Command must be a non-empty string.", exitCode: 1, truncated: false });
    }

    return new Promise<ResultadoDeEjecucion>((resolver) => {
      const hijo = lanzar(comando, { env: opciones.env, cwd: opciones.cwd });
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
