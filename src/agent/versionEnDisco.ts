/**
 * De dónde sale lo que `core/version.ts` imprime: el `package.json` y, si esto es una copia
 * de git, su commit y si hay cambios sin commitear.
 *
 * Vive en `agent/` y no en `core/` por la regla de siempre: aquí se toca el disco y se lanza
 * un proceso. Lo que decide cómo se DICE es puro y está al otro lado.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { VersionEnMarcha } from "../core/version.js";

/** La raíz del PAQUETE, igual que `RAIZ_SKILLS`: desde este módulo, no desde el cwd. */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Qué versión está corriendo. **Nunca lanza**: es una línea informativa, y un arranque que
 * reventara por no poder leer su propio commit sería absurdo.
 *
 * El `git` se llama con `cwd` en la raíz del PAQUETE —no en la del usuario—, porque lo que
 * se pregunta es con qué código corre xonecode y no qué hay en su proyecto. Con un tope
 * corto: esto va en el camino del arranque, y un git colgado no puede retrasarlo.
 */
export function versionEnMarcha(raiz: string = RAIZ): VersionEnMarcha {
  let version = "desconocida";
  try {
    const crudo = JSON.parse(readFileSync(resolve(raiz, "package.json"), "utf8")) as { version?: unknown };
    if (typeof crudo.version === "string" && crudo.version !== "") version = crudo.version;
  } catch {
    // Sin `package.json` legible no hay versión que dar, y se dice así.
  }

  const git = (args: string[]): string | undefined => {
    try {
      return execFileSync("git", args, { cwd: raiz, encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      return undefined;
    }
  };

  const commit = git(["rev-parse", "--short", "HEAD"]);
  if (commit === undefined || commit === "") return { version };
  // `--porcelain` vacío es «limpio». Que FALLE no es limpio: es que no se pudo mirar, y eso
  // se propaga como ausente para que la línea pueda decirlo en vez de afirmar de más.
  const estado = git(["status", "--porcelain"]);
  return { version, commit, ...(estado === undefined ? {} : { sucio: estado !== "" }) };
}
