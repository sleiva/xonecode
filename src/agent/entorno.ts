import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readdirSync, statSync, realpathSync } from "node:fs";
import { join, basename, resolve } from "node:path";

const ejecutar = promisify(execFile);

export interface Entorno {
  raiz: string;
  /** `app.xml` es la fuente y no un artefacto: es lo que distingue un proyecto XOne. */
  esProyectoXone: boolean;
  colecciones: number;
  /** `X.xml` con un `X.xne` al lado: vistas aplanadas que Studio genera. */
  vistasAplanadas: string[];
  /**
   * Un repo git da el diff y el deshacer gratis; si no, hay que copiar la raíz antes de
   * tocar nada.
   *
   * **No basta con mirar si hay un `.git` al lado.** Medido: `lab/` no tiene `.git` propio
   * y sin embargo está dentro de un work tree cuya raíz está VARIOS niveles por encima —
   * el proyecto de un usuario metido en un monorepo se declararía «sin git» y se copiaría
   * sin necesidad. Se le pregunta a git, que es quien lo sabe.
   *
   * `raizRepo` se conserva porque cuando NO coincide con `raiz` el diff abarca más que el
   * proyecto, y eso hay que decirlo antes de prometer un deshacer.
   */
  git: EstadoGit;
  simulador: { ruta: string; responde: boolean };
}

/** Recorre la raíz sin bajar a `node_modules` ni a `.git`. */
function ficheros(raiz: string, prof = 0): string[] {
  if (prof > 4 || !existsSync(raiz)) return [];
  const salida: string[] = [];
  for (const entrada of readdirSync(raiz)) {
    if (entrada === "node_modules" || entrada === ".git") continue;
    const ruta = join(raiz, entrada);
    try {
      if (statSync(ruta).isDirectory()) salida.push(...ficheros(ruta, prof + 1));
      else salida.push(ruta);
    } catch {
      // Un enlace roto o un permiso no es motivo para que `doctor` no conteste.
    }
  }
  return salida;
}

/**
 * Las vistas aplanadas: todo `X.xml` que tenga un `X.xne` al lado.
 *
 * En XOne cada colección existe en dos formas, y **la que se edita es el `.xne`**. La regla
 * no puede vivir solo en el prompt del ejecutor —un permiso solo protege a quien lo
 * choca—, así que estos ficheros se le OCULTAN al agente. Ocultarlos y no borrarlos: el
 * disco es del usuario.
 *
 * `app.xml` no tiene hermano `.xne`, así que el propio predicado lo conserva.
 */
export function vistasAplanadas(rutas: string[]): string[] {
  const xne = new Set(rutas.filter((r) => r.endsWith(".xne")).map((r) => r.slice(0, -4)));
  return rutas.filter((r) => r.endsWith(".xml") && xne.has(r.slice(0, -4)));
}

/**
 * El estado de git respecto al proyecto.
 *
 * **`usable` solo exige que HAYA un repo**, y esto es una corrección: antes exigía además
 * ser la raíz y tener commits. Sobraban las dos, y se descubrió mirando cómo lo hace
 * opencode y midiéndolo después contra el disco real (ver `DISENO.md` §15):
 *
 * - La foto del ANTES se toma con un **índice de git privado** (`GIT_INDEX_FILE`), y
 *   `write-tree` **no necesita HEAD**: medido sobre un repo con CERO commits, funciona.
 * - Y funciona desde un **subdirectorio**: se acota con `git add -- .` y las rutas del
 *   diff se recortan con `prefijo`.
 *
 * `esRaiz` y `tieneCommits` se conservan porque `doctor` los cuenta —saber que el repo
 * abarca más que el proyecto sigue importando para prometer un deshacer— pero ya no
 * bloquean nada.
 */
export interface EstadoGit {
  dentro: boolean;
  raizRepo?: string;
  /** El proyecto ES la raíz del repo (no un subdirectorio de uno más grande). */
  esRaiz: boolean;
  /** Hay al menos un commit. NO hace falta para la foto; sí para ramas y worktrees. */
  tieneCommits: boolean;
  /** Ruta del proyecto relativa a la raíz del repo (`""` si es la raíz). */
  prefijo: string;
  /** ¿Se puede usar git para la foto del ANTES? Basta con que haya repo. */
  usable: boolean;
}

/**
 * ¿Sirve git para dar el diff y el deshacer de ESTE proyecto?
 *
 * Las tres condiciones salen de medir, no de suponer, contra el disco real del usuario:
 *
 * 1. **El repo tiene que ser el del PROYECTO.** Medido: los proyectos viven dentro de un
 *    repo cuya raíz está por encima, con cientos de entradas sin trackear que no tienen nada
 *    que ver. Un diff de ese repo no habla del proyecto.
 * 2. **Tiene que haber al menos un commit.** Ese repo está en `main` con CERO commits:
 *    `git rev-parse HEAD` falla, y sin commit no hay rama de la que partir, ni worktree
 *    que añadir, ni nada contra lo que diffear.
 * 3. **Y aunque acotes al subdirectorio, no vale.** Medido: `git status --porcelain -- .`
 *    desde dentro del proyecto devuelve UNA línea —`?? proyecto_example/`— porque git no
 *    desciende en directorios sin trackear. O sea que el diff habría dicho «1 fichero
 *    nuevo» tocara el agente lo que tocara: un fallo MUDO que reporta algo plausible.
 *    (`--untracked-files=all` lo expande, pero eso no arregla 1 ni 2.)
 */
export async function inspeccionarGit(raiz: string): Promise<EstadoGit> {
  let raizRepo: string | undefined;
  try {
    const { stdout } = await ejecutar("git", ["rev-parse", "--show-toplevel"], { cwd: raiz });
    raizRepo = stdout.trim() || undefined;
  } catch {
    return { dentro: false, esRaiz: false, tieneCommits: false, prefijo: "", usable: false };
  }
  if (!raizRepo) return { dentro: false, esRaiz: false, tieneCommits: false, prefijo: "", usable: false };

  // `realpath` en los DOS lados, y no `resolve`. Medido en macOS: git devuelve el
  // toplevel con los symlinks ya resueltos (`/private/var/...` para un `/var/...`), así
  // que comparar rutas sin resolver da «no es la raíz» sobre un proyecto que SÍ lo es —
  // y xonecode caería al modo huellas sin necesidad. `/tmp` y `/var` son symlinks en
  // macOS, o sea que el caso no es exótico: es cualquier proyecto bajo uno de ellos.
  const real = (r: string): string => {
    try {
      return realpathSync(r);
    } catch {
      return resolve(r);
    }
  };
  const esRaiz = real(raizRepo) === real(raiz);
  let tieneCommits = false;
  try {
    await ejecutar("git", ["rev-parse", "HEAD"], { cwd: raiz });
    tieneCommits = true;
  } catch {
    tieneCommits = false; // repo recién creado, sin nada commiteado
  }

  let prefijo = "";
  try {
    const { stdout } = await ejecutar("git", ["rev-parse", "--show-prefix"], { cwd: raiz });
    prefijo = stdout.trim();
  } catch {
    prefijo = "";
  }

  return { dentro: true, raizRepo, esRaiz, tieneCommits, prefijo, usable: true };
}

export async function inspeccionar(raiz: string = process.cwd()): Promise<Entorno> {
  const rutas = ficheros(raiz);
  let responde = false;
  let ruta = "xone-simulator";
  try {
    const { stdout } = await ejecutar("xone-simulator", ["help"]);
    responde = stdout.includes("xone-simulator");
    const cual = await ejecutar("which", ["xone-simulator"]).catch(() => ({ stdout: "" }));
    if (cual.stdout.trim()) ruta = cual.stdout.trim();
  } catch {
    responde = false;
  }

  return {
    raiz,
    esProyectoXone: existsSync(join(raiz, "app.xml")),
    colecciones: rutas.filter((r) => r.endsWith(".xne")).length,
    vistasAplanadas: vistasAplanadas(rutas).map((r) => basename(r)),
    git: await inspeccionarGit(raiz),
    simulador: { ruta, responde },
  };
}