/**
 * Qué ficheros ha tocado UNA sesión, con git y sin molestar al usuario.
 *
 * **Por qué una ref y no un tag** (que es lo primero que se le ocurre a cualquiera): un tag
 * es una referencia PÚBLICA y con significado —una versión— que aparece en `git tag`, viaja
 * con `push --tags` y la ve todo el equipo. Una sesión de trabajo no es una versión de nada.
 * Aquí se usa `refs/xonecode/sesion/<id>`: fuera de `refs/heads` y de `refs/tags`, así que
 * ni sale en `git branch`/`git tag` ni se empuja por omisión — la misma familia de truco que
 * ya usa la sincronización con `refs/remotes/cloudstudio/<rama>`, donde la REF es el libro
 * de cuentas y no un fichero nuestro.
 *
 * **Y por qué una ref y no guardar el sha en un JSON**: un árbol al que no apunta ninguna
 * referencia es basura para git, y `git gc` lo borra. El día que eso pasara, la vista de la
 * sesión se quedaría sin el «antes» y no habría forma de saber por qué. La ref es lo que lo
 * mantiene vivo.
 *
 * La comparación es de ÁRBOL contra ÁRBOL, no contra el índice del usuario: se escribe un
 * árbol nuevo con `add -A` sobre un índice PRIVADO (`indicePrivado`, en `tmpdir`) igual que
 * `instantanea.ts`. Medido: `git diff <arbol> -- .` a secas compara contra el índice real, y
 * como en él no hay nada, daba «borrado» para ficheros que están ahí delante.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { claseDeCambio, indicePrivado } from "./git.js";
import type { Cambio } from "./instantanea.js";

const ejecutar = promisify(execFile);

export interface FicheroDeSesion extends Cambio {
  /** Líneas añadidas y quitadas. `undefined` en un binario: git escribe «-» y fingir un
   *  cero sería decir que no cambió nada. */
  mas?: number;
  menos?: number;
}

/** Cómo se ha calculado, para que la interfaz no afirme lo que no sabe. */
export interface CambiosDeSesion {
  /** `git` = hay «antes» y hay diff; `sin-marca` = la sesión no dejó marca (proyecto sin
   *  git usable, o abierta antes de que esto existiera). */
  via: "git" | "sin-marca";
  ficheros: FicheroDeSesion[];
}

/**
 * El nombre de la ref de una sesión. El id se cuela en un nombre de referencia, así que se
 * acota a lo que git admite sin ambigüedad —letras, cifras, guion, guion bajo y punto— en
 * vez de confiar en que quien llama traiga algo limpio: un id con `..`, con un espacio o
 * empezando por guion no da un error claro, da un `update-ref` que falla raro o, peor, otra
 * ref.
 */
export function refDeSesion(id: string): string | undefined {
  if (!/^[A-Za-z0-9._-]+$/.test(id) || id.startsWith("-") || id.includes("..")) return undefined;
  return `refs/xonecode/sesion/${id}`;
}

/**
 * Lo que NO cuenta como trabajo de la sesión, en la forma de pathspec de git.
 *
 * `.xonecode/` es nuestro: ahí dentro está el `.jsonl` de la propia sesión, que `volcar()`
 * escribe al final de CADA turno (`web/servidor/vestibulo.ts`). Sin excluirlo, la primera
 * fila de la lista sería el transcript de la sesión diciendo que la sesión lo modificó —un
 * bucle, y encima el fichero que menos interesa. Es la misma regla que ya aplica
 * `arbolLimpio` (`agent/gitSync.ts`), y por el mismo motivo: `.xonecode` es interno, no
 * trabajo del usuario. Se paga que la memoria del proyecto (`.xonecode/memoria.md`), que
 * el agente sí escribe a veces, tampoco salga aquí; es coherente con el resto del repo, que
 * trata esa carpeta entera como interna, y esa escritura pasa igual por su aprobación.
 *
 * No basta con confiar en el `.gitignore` del proyecto: en modo offline sobre un repo del
 * usuario, `prepararRepo` no ha escrito ningún `info/exclude`, y `.gitignore` no se toca
 * nunca porque es un fichero del proyecto.
 *
 * Va en los DIFF y no en el `git add` del árbol; el porqué está donde se escribe el árbol.
 */
const FUERA = ":(exclude).xonecode";

/**
 * Las TRES clases que esta vista sabe contar: creado, modificado y borrado.
 *
 * No es decoración del listado, es una guarda: `claseDeCambio` (`agent/git.ts`) devuelve
 * «modificado» para cualquier letra que no sea `A` ni `D`, así que un cambio de TIPO (`T`,
 * un fichero que pasa a enlace simbólico) o una entrada sin fusionar (`U`) se colarían
 * etiquetados como una modificación normal — una etiqueta falsa, no una lista incompleta.
 * Pidiéndole a git solo `AMD`, lo que llega es exactamente lo que la vista sabe nombrar.
 * Los renombrados ya no aparecen por `--no-renames`, que los parte en borrado + alta.
 */
const FILTRO = "--diff-filter=AMD";

/** El árbol de AHORA, escrito sobre un índice privado. Incluye lo no seguido por git, que
 *  es justo lo que un fichero recién creado por el agente es. */
async function arbolDeAhora(raiz: string): Promise<string> {
  const idx = indicePrivado("sesion");
  try {
    // El pathspec de exclusión NO va aquí, y no es un olvido: `git add` con
    // `:(exclude).xonecode` en un repo donde `.xonecode` YA está ignorado (el caso normal:
    // `prepararRepo` escribe `info/exclude`) considera que has nombrado una ruta ignorada,
    // avisa y **sale con código 1**. Medido contra el proyecto de verdad: `marcarSesion`
    // devolvía `false` y la pestaña entera decía «sin-marca» para siempre. Excluir en el
    // DIFF hace el mismo trabajo y no tiene esa arista: si `.xonecode` está ignorado no
    // entra en el árbol, y si no lo está, entra en los DOS árboles y el diff lo descarta.
    await ejecutar("git", ["add", "-A", "--", "."], {
      cwd: raiz,
      env: { ...process.env, GIT_INDEX_FILE: idx.ruta },
    });
    const { stdout } = await ejecutar("git", ["write-tree"], {
      cwd: raiz,
      env: { ...process.env, GIT_INDEX_FILE: idx.ruta },
    });
    return stdout.trim();
  } finally {
    idx.limpiar();
  }
}

/**
 * Marca el ANTES de una sesión. Se llama al abrirla, no al primer turno: lo que interesa es
 * lo que ha cambiado desde que te sentaste.
 *
 * No lanza. Un proyecto sin git usable —o con un hook que revienta— no puede impedir abrir
 * una sesión; lo que pasa es que después no habrá «antes» que enseñar, y eso se dice con
 * `via: "sin-marca"` en vez de con una lista vacía que parecería «no tocaste nada».
 */
export async function marcarSesion(raiz: string, id: string): Promise<boolean> {
  const foto = await fotoDeApertura(raiz);
  return foto(id);
}

/**
 * La foto se toma AHORA y se nombra DESPUÉS.
 *
 * Hace falta porque el id de sesión no existe hasta que se vuelca el primer acto —y para
 * entonces el agente ya ha escrito—, mientras que el «antes» tiene que ser el momento en que
 * se abrió el proyecto. Así que se escribe el árbol al abrir y se apunta la ref cuando hay a
 * qué nombre apuntarla.
 *
 * No lanza: un proyecto sin git usable no puede impedir abrir una sesión. Lo que pasa es que
 * después no habrá «antes» que enseñar, y eso se dice con `via: "sin-marca"` en vez de con
 * una lista vacía que parecería «no tocaste nada».
 */
export async function fotoDeApertura(raiz: string): Promise<(id: string) => Promise<boolean>> {
  let arbol: string | undefined;
  try {
    arbol = await arbolDeAhora(raiz);
  } catch {
    arbol = undefined;
  }
  return async (id: string): Promise<boolean> => {
    const ref = refDeSesion(id);
    if (ref === undefined || arbol === undefined) return false;
    try {
      await ejecutar("git", ["update-ref", ref, arbol], { cwd: raiz });
      return true;
    } catch {
      return false;
    }
  };
}

/** Lo que la sesión ha cambiado desde su marca. Sin marca, `via: "sin-marca"` y lista vacía. */
export async function cambiosDeSesion(raiz: string, id: string): Promise<CambiosDeSesion> {
  const ref = refDeSesion(id);
  if (ref === undefined) return { via: "sin-marca", ficheros: [] };
  try {
    await ejecutar("git", ["rev-parse", "--verify", "--quiet", ref], { cwd: raiz });
  } catch {
    return { via: "sin-marca", ficheros: [] };
  }
  try {
    const ahora = await arbolDeAhora(raiz);
    const [estados, numeros] = await Promise.all([
      // `--relative` porque los dos árboles se escriben con rutas desde la RAÍZ DEL REPO, y
      // el proyecto no tiene por qué serlo (`instantanea.ts` sostiene ese caso a propósito).
      // Sin él, en un proyecto que cuelga de un repo mayor las rutas saldrían con el prefijo
      // de la subcarpeta y `parcheDeSesion` no casaría con ninguna.
      ejecutar("git", ["diff", "--relative", "--name-status", "--no-renames", FILTRO, ref, ahora, "--", ".", FUERA], { cwd: raiz }),
      ejecutar("git", ["diff", "--relative", "--numstat", "--no-renames", FILTRO, ref, ahora, "--", ".", FUERA], { cwd: raiz }),
    ]);
    // `--no-renames` por el mismo motivo que en el plan de subida: un renombrado sale como
    // UNA línea que solo nombra el destino, y aquí eso escondería que el original ya no
    // está. Borrado + alta por separado es más largo y es la verdad.
    const cuentas = new Map<string, { mas?: number; menos?: number }>();
    for (const linea of numeros.stdout.split("\n")) {
      const [mas, menos, ruta] = linea.split("\t");
      if (ruta === undefined) continue;
      // Un binario viene como «-»: no se convierte a 0, que diría «no cambió nada».
      cuentas.set(ruta.trim(), {
        ...(mas === "-" ? {} : { mas: Number(mas) }),
        ...(menos === "-" ? {} : { menos: Number(menos) }),
      });
    }
    const ficheros: FicheroDeSesion[] = [];
    for (const linea of estados.stdout.split("\n")) {
      if (!linea.trim()) continue;
      const [estado, ruta] = linea.split("\t");
      if (ruta === undefined) continue;
      const limpia = ruta.trim();
      ficheros.push({ ruta: limpia, clase: claseDeCambio(estado!), ...(cuentas.get(limpia) ?? {}) });
    }
    return { via: "git", ficheros: ficheros.sort((a, b) => a.ruta.localeCompare(b.ruta)) };
  } catch {
    return { via: "sin-marca", ficheros: [] };
  }
}

/** Cuánto parche se sirve de un fichero. Un `.min.js` regenerado son megas y la vista no los
 *  puede pintar: se recorta y quien llama lo dice. */
const TOPE_DE_PARCHE = 400_000;

/**
 * El parche de UN fichero de la sesión, en texto de git.
 *
 * La ruta se pasa después de `--`, que es lo que impide que una ruta que empiece por guion
 * se lea como una opción. Y se acota el tamaño: la vista no puede pintar un fichero
 * generado de tres megas, y truncar diciéndolo es mejor que colgar el navegador.
 */
export async function parcheDeSesion(
  raiz: string,
  id: string,
  ruta: string
): Promise<{ texto: string; recortado: boolean } | undefined> {
  const ref = refDeSesion(id);
  if (ref === undefined) return undefined;
  try {
    const ahora = await arbolDeAhora(raiz);
    const { stdout } = await ejecutar(
      "git",
      // `FUERA` también aquí: nadie debe poder pedir el parche de un fichero interno
      // nombrándolo a mano, ni siquiera si se cuela en la lista por una ref antigua.
      ["diff", "--relative", "--no-renames", ref, ahora, "--", ruta, FUERA],
      { cwd: raiz, maxBuffer: 32 * 1024 * 1024 }
    );
    if (stdout.length <= TOPE_DE_PARCHE) return { texto: stdout, recortado: false };
    return { texto: stdout.slice(0, TOPE_DE_PARCHE), recortado: true };
  } catch {
    return undefined;
  }
}

/** Olvida la marca de una sesión. Para cuando se borre una sesión: una ref que apunta a un
 *  árbol de un proyecto que ya no interesa mantiene vivo ese árbol para siempre. */
export async function olvidarSesion(raiz: string, id: string): Promise<void> {
  const ref = refDeSesion(id);
  if (ref === undefined) return;
  try {
    await ejecutar("git", ["update-ref", "-d", ref], { cwd: raiz });
  } catch {
    // Borrar lo que no está no es un error.
  }
}
