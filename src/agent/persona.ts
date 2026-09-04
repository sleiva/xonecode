/**
 * El nombre de quien programa, SOLO para el saludo del primer arranque
 * (`apps/web/src/componentes/Bienvenida.tsx`). No es un dato de CloudStudio ni de la
 * sesión: se resuelve en local, ANTES de que exista ninguna cuenta ni ningún login, y
 * nunca viaja más allá de ese saludo — no entra en un acto, no se persiste en
 * `.xonecode/sesiones/` ni en `config.json`, y `web/servidor/arranque.ts` lo manda
 * suelto en el mensaje de alta, no dentro de nada que la sesión guarde.
 *
 * Orden de preferencia: `git config user.name` (el efectivo — repo si lo hay, si no
 * global —, igual que `agent/gitSync.ts#valorDeConfig` resuelve la config de sincronía)
 * y, si no hay, el usuario del sistema (`os.userInfo()`). Sin ninguno de los dos,
 * `undefined` — nunca un nombre inventado como «usuario»: un saludo sin nombre es
 * neutro, uno con un nombre que no es el tuyo parece un error.
 */
import { execFileSync } from "node:child_process";
import { userInfo } from "node:os";

export function nombreDePersona(cwd: string): string | undefined {
  try {
    const salida = execFileSync("git", ["config", "--get", "user.name"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (salida !== "") return salida;
  } catch {
    // Sin git en el PATH, sin ninguna config, o `user.name` sin poner: se cae al
    // siguiente candidato en vez de propagar el fallo — esto es un saludo, no un dato
    // del que dependa nada más.
  }
  try {
    const nombre = userInfo().username.trim();
    return nombre === "" ? undefined : nombre;
  } catch {
    return undefined;
  }
}
