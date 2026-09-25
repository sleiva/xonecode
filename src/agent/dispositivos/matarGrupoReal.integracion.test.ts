/**
 * LA ÚNICA excepción nombrada al invariante de `procesosEnMaquina.test.ts` ("no se lanza un
 * proceso de verdad"). Vive aparte, con el nombre que lo dice: lo que prueba —que matar el
 * GRUPO se lleva también al nieto— no se puede comprobar con un `EventEmitter` de mentira, y
 * es justo el hecho que un fallo aquí revela: un `child.kill()` normal deja vivo al nieto.
 */
import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { matarGrupoReal } from "./procesosEnMaquina.js";

/** ¿Sigue vivo ese pid? `process.kill(pid, 0)` no manda ninguna señal: solo pregunta. */
function vivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function esperar(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

describe("matarGrupoReal: mata al HIJO y al NIETO, de verdad", () => {
  it.skipIf(process.platform === "win32")(
    "un `sleep` lanzado por un `sh` intermedio muere con su padre al matar el GRUPO",
    async () => {
      // `echo $!` imprime el pid del `sleep` de fondo (el NIETO de este proceso de test):
      // así el test conoce los dos pids sin adivinar nada del sistema.
      const hijo = spawn("sh", ["-c", "sleep 30 & echo $!; wait"], {
        detached: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const pidDelHijo = hijo.pid;
      expect(pidDelHijo).toBeDefined();

      const pidDelNieto = await new Promise<number>((resolver) => {
        let salida = "";
        hijo.stdout!.on("data", (d) => {
          salida += String(d);
          const n = Number(salida.trim());
          if (Number.isInteger(n) && n > 0) resolver(n);
        });
      });

      expect(vivo(pidDelNieto)).toBe(true);

      matarGrupoReal(pidDelHijo!, "SIGKILL");
      await esperar(300);

      expect(vivo(pidDelHijo!)).toBe(false);
      expect(vivo(pidDelNieto)).toBe(false);
    },
    10_000
  );
});
