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
import { claseDeCambio, indicePrivado, sacarXonecodeDelIndice } from "./git.js";
import type { Cambio } from "./instantanea.js";

const ejecutar = promisify(execFile);

export interface FicheroDeSesion extends Cambio {
  /** Líneas añadidas y quitadas. `undefined` en un binario: git escribe «-» y fingir un
   *  cero sería decir que no cambió nada. */
  mas?: number;
  menos?: number;
  /**
   * Hay cambios en este fichero que NADIE ha commiteado todavía, así que no se pueden
   * atribuir a esta sesión ni a otra. Se enseñan igual —el turno en vuelo commitea al
   * TERMINAR, y sin esto la pestaña se quedaría en blanco justo mientras el agente
   * escribe— pero dichos por lo que son. Ausente = todo lo de esta fila está commiteado.
   */
  sinCommitear?: true;
}

/** Cómo se ha calculado, para que la interfaz no afirme lo que no sabe. */
export interface CambiosDeSesion {
  /**
   * - `git` = **atribuido por COMMIT**: la lista sale de los commits sellados con el id de
   *   esta sesión, así que es lo que hizo ESTA sesión y no lo que haya cambiado en la copia
   *   mientras estaba abierta.
   * - `desde-apertura` = la sesión no tiene ningún commit sellado (las de antes de que el
   *   sello existiera, o una cuyo commit falló), así que lo único que se puede medir es el
   *   árbol de ahora contra la foto de apertura. **Eso NO es atribución** y hay que decirlo
   *   con otras palabras: ahí dentro está lo que haya escrito cualquiera desde que te
   *   sentaste. Es la medida que tenía `git` hasta el 10-09-2026, con el nombre corregido —
   *   dejarle el nombre viejo habría hecho que `revisionConGit` siguiera afirmando una
   *   autoría que ya se sabe falsa, sin tocar una línea.
   * - `sin-marca` = no hay con qué mirar: sin git usable, o sesión abierta antes de que
   *   esto existiera y sin ref.
   */
  via: "git" | "desde-apertura" | "sin-marca";
  ficheros: FicheroDeSesion[];
  /**
   * Cuántos commits de OTRAS sesiones caen entre el primero y el último de esta. Solo con
   * atribución por commit, y solo si hay alguno: la LISTA sigue siendo exacta (se construye
   * commit a commit), pero el parche de un fichero que dos sesiones se turnaron puede traer
   * hunks del otro — y eso se dice en vez de fingir aislamiento. Ausente = no se pudo medir
   * o no hay ninguno.
   */
  mezclados?: number;
}

/**
 * El nombre de la ref de una sesión. El id se cuela en un nombre de referencia, así que se
 * acota a lo que git admite sin ambigüedad —letras, cifras, guion, guion bajo y punto— en
 * vez de confiar en que quien llama traiga algo limpio: un id con `..`, con un espacio o
 * empezando por guion no da un error claro, da un `update-ref` que falla raro o, peor, otra
 * ref.
 */
export function refDeSesion(id: string): string | undefined {
  if (!idAceptable(id)) return undefined;
  return `refs/xonecode/sesion/${id}`;
}

/** La misma criba para la ref y para el sello: los dos meten el id en un argumento de git. */
function idAceptable(id: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(id) && !id.startsWith("-") && !id.includes("..");
}

/**
 * La clave del sello que `commitDeTurno` escribe en el mensaje y que esta vista lee.
 *
 * Es un TRAILER y no el asunto: el asunto lleva el título de la sesión, que no identifica
 * nada —dos sesiones se llaman «Hola» en el proyecto del usuario ahora mismo— y que además
 * cambia si alguien la renombra. El id sí es estable, y un trailer es el sitio que git tiene
 * para esto: se lee con `%(trailers:key=…)` sin adivinar formato.
 *
 * Vive en este módulo, que es el que lo GREPEA, y `gitSync.ts` lo importa para escribirlo:
 * con el formato en los dos lados, un cambio en uno rompe la atribución del otro en silencio.
 */
export const CLAVE_DE_SELLO = "Xonecode-Sesion";

/** El sello de una sesión, listo para pegar al final de un mensaje de commit. */
export function selloDeSesion(id: string): string | undefined {
  return idAceptable(id) ? `${CLAVE_DE_SELLO}: ${id}` : undefined;
}

/**
 * Los commits de una sesión, del más VIEJO al más nuevo, y opcionalmente solo los que tocan
 * una ruta.
 *
 * Dos cosas que no son opcionales:
 * - **`--fixed-strings`**: `--grep` es una expresión regular por omisión, y un id lleva
 *   puntos y guiones. Aquí no hay daño posible con un uuid, pero el id llega de fuera de
 *   esta función.
 * - **Y el `--grep` NO decide: verifica el TRAILER.** Un grep de texto casa por SUBCADENA,
 *   así que el id `abc` casaría con el sello de `abc1` — o con un id citado dentro del
 *   cuerpo del mensaje. Se pide el valor del trailer con `%(trailers:key=…,valueonly)` y se
 *   compara ENTERO. Es exactamente la misatribución silenciosa que esto viene a quitar.
 */
async function commitsDeSesion(raiz: string, id: string, ruta?: string): Promise<string[]> {
  const sello = selloDeSesion(id);
  if (sello === undefined) return [];
  // Un repo recién creado no tiene `HEAD`, y ahí `git log` FALLA en vez de no decir nada
  // (medido: es el caso de un proyecto offline al que nadie ha commiteado todavía, y hacía
  // que `parcheDeSesion` devolviera «no hay parche» con el fichero delante). Para esta
  // pregunta las dos cosas son lo mismo: no hay ningún commit sellado.
  let stdout: string;
  try {
    ({ stdout } = await ejecutar(
      "git",
      [
        "log",
        "--reverse",
        "--no-merges",
        // La coma como separador porque el de omisión es un salto de línea, que partiría
        // las filas de esta salida. Un id no puede llevar comas (`idAceptable`).
        `--format=%H%x09%(trailers:key=${CLAVE_DE_SELLO},valueonly,separator=%x2C)`,
        "--fixed-strings",
        `--grep=${sello}`,
        "HEAD",
        ...(ruta === undefined ? [] : ["--", ruta]),
      ],
      { cwd: raiz, maxBuffer: 8 * 1024 * 1024 }
    ));
  } catch {
    return [];
  }
  const commits: string[] = [];
  for (const linea of stdout.split("\n")) {
    const [sha, valores] = linea.split("\t");
    if (sha === undefined || sha === "" || valores === undefined) continue;
    if (valores.split(",").some((v) => v.trim() === id)) commits.push(sha);
  }
  return commits;
}

/**
 * La clase NETA de un fichero al que la sesión tocó en varios commits, de la primera vez a
 * la última. Pura y aparte porque es una decisión, no un detalle del bucle:
 *
 * - creado y luego borrado por la misma sesión → **nada**: no estaba antes y no está ahora,
 *   así que una fila de «borrado» afirmaría que la sesión borró algo que nunca existió.
 * - lo último es un borrado → borrado.
 * - lo primero es un alta → nuevo (aunque después lo modificara).
 * - en cualquier otro caso → modificado.
 */
export function claseNeta(primera: Cambio["clase"], ultima: Cambio["clase"]): Cambio["clase"] | undefined {
  if (primera === "nuevo" && ultima === "borrado") return undefined;
  if (ultima === "borrado") return "borrado";
  if (primera === "nuevo") return "nuevo";
  return "modificado";
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
    // El pathspec no vale (ver arriba), pero `rm --cached --ignore-unmatch` sí: sin esto,
    // en un proyecto offline el `checkpoint.sqlite` entra en el árbol y sus 30 MB se quedan
    // en `.git/objects`, vivos para siempre porque `refs/xonecode/sesion/*` los alcanza.
    await sacarXonecodeDelIndice(ejecutar, raiz, idx.ruta);
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

/** El árbol vacío de git: el «antes» cuando el primer commit de la sesión es la raíz del
 *  repo y no tiene padre. Se COMPRUEBA antes de usarlo (en un repo sha256 no es este), y si
 *  no está se cae a la medida de apertura en vez de inventar un extremo. */
const ARBOL_VACIO = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/** Las opciones que comparten todos los diffs de esta vista. El porqué de cada una está en
 *  `FILTRO`, en `FUERA` y en el comentario de `--relative` de más abajo. */
const COMUNES = ["--relative", "--no-renames", FILTRO];

/** El diff de UN commit contra su padre. `diff-tree --root` es lo que hace que el primer
 *  commit de un repo (que no tiene padre) salga como altas en vez de reventar. */
const deCommit = (sha: string): string[] => ["diff-tree", "-r", "--no-commit-id", "--root", ...COMUNES, sha];

/** El diff entre dos extremos cualesquiera: árboles, commits o `HEAD`. */
const entre = (a: string, b: string): string[] => ["diff", ...COMUNES, a, b];

/**
 * Las dos salidas de git de un diff, fusionadas en filas. Son dos llamadas porque
 * `--name-status` y `--numstat` no se pueden pedir juntas, y la clase la da la primera y
 * las cuentas la segunda.
 */
async function filasDeDiff(raiz: string, args: readonly string[]): Promise<FicheroDeSesion[]> {
  const cola = ["--", ".", FUERA];
  const [estados, numeros] = await Promise.all([
    ejecutar("git", [...args, "--name-status", ...cola], { cwd: raiz, maxBuffer: 32 * 1024 * 1024 }),
    ejecutar("git", [...args, "--numstat", ...cola], { cwd: raiz, maxBuffer: 32 * 1024 * 1024 }),
  ]);
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
  return ficheros;
}

/**
 * Lo que ha cambiado ESTA sesión.
 *
 * **Se atribuye por COMMIT**, que es lo único que dice de quién es cada cambio: cada turno
 * commitea (`gitSync.ts#commitDeTurno`) con el id de la sesión sellado en el mensaje. La
 * medida vieja —el árbol de ahora contra la foto de apertura— no atribuía nada, y desde que
 * hay tareas de fondo escribiendo en la misma copia dejó de ser un proxy razonable: MEDIDO
 * en el proyecto del usuario el 10-09-2026, una conversación enseñaba +1266 líneas que
 * había escrito una tarea de fondo veinte minutos después, con la pestaña rotulada
 * «Sesión». Se conserva como respaldo declarado (`via: "desde-apertura"`) para las sesiones
 * sin sello, que son todas las de antes de esto.
 *
 * Y lo que la atribución por commit NO puede prometer, porque `commitDeTurno` hace `add -A`:
 * un commit barre todo lo que estuviera sucio en ese instante, incluido lo que tocara otra
 * sesión sin commitear. Es la misma honestidad que separa `Tarea.autorizadas` de
 * «aplicados»; el aislamiento de verdad es un árbol por sesión, que no está hecho.
 */
export async function cambiosDeSesion(raiz: string, id: string): Promise<CambiosDeSesion> {
  try {
    const commits = await commitsDeSesion(raiz, id);
    if (commits.length > 0) return await porCommits(raiz, commits);
  } catch {
    // Cae al respaldo, que se declara como lo que es.
  }
  return desdeLaApertura(raiz, id);
}

/**
 * La atribución por commit, con los extremos elegidos así:
 *
 * - **El «antes» es el PADRE del primer commit de la sesión**, no la foto de apertura, y
 *   eso es mejor y no un atajo: lo que otra sesión commiteara entre que te sentaste y tu
 *   primer turno queda fuera por construcción.
 * - **El «ahora» es el árbol de ahora** y no el último commit de la sesión, porque el turno
 *   en vuelo no ha commiteado todavía: con el último commit, la pestaña se quedaría vacía
 *   justo mientras el agente escribe, que es cuando más se mira.
 * - **La LISTA sale de los commits, uno a uno** —así una ruta que la sesión no tocó no
 *   entra aunque haya cambiado— y las CUENTAS y el PARCHE salen de los dos extremos, que es
 *   lo que hace que la cifra de una fila y su diff cuenten lo mismo.
 */
async function porCommits(raiz: string, commits: string[]): Promise<CambiosDeSesion> {
  const primero = commits[0]!;
  const base = await padreDe(raiz, primero);
  if (base === undefined) return desdeLaApertura(raiz, "");
  const ahora = await arbolDeAhora(raiz);

  // Qué rutas tocó la sesión, y con qué clase la primera y la última vez.
  const tocadas = new Map<string, { primera: Cambio["clase"]; ultima: Cambio["clase"] }>();
  for (const sha of commits) {
    for (const f of await filasDeDiff(raiz, deCommit(sha))) {
      const antes = tocadas.get(f.ruta);
      tocadas.set(f.ruta, { primera: antes?.primera ?? f.clase, ultima: f.clase });
    }
  }

  const netas = await filasDeDiff(raiz, entre(base, ahora));
  const pendientes = new Set((await filasDeDiff(raiz, entre("HEAD", ahora))).map((f) => f.ruta));

  const ficheros: FicheroDeSesion[] = [];
  for (const fila of netas) {
    const suya = tocadas.get(fila.ruta);
    // Una ruta que la sesión no tocó y que nadie ha commiteado se enseña igual, dicha como
    // lo que es: puede ser el turno en vuelo. Una que no tocó y que SÍ está commiteada es
    // de otra sesión, y esa es justamente la que sobraba.
    if (suya === undefined && !pendientes.has(fila.ruta)) continue;
    const clase = suya === undefined ? fila.clase : claseNeta(suya.primera, suya.ultima);
    if (clase === undefined) continue;
    ficheros.push({ ...fila, clase, ...(pendientes.has(fila.ruta) ? { sinCommitear: true as const } : {}) });
  }

  const mezclados = await commitsAjenos(raiz, base, commits);
  return {
    via: "git",
    ficheros: ficheros.sort((a, b) => a.ruta.localeCompare(b.ruta)),
    ...(mezclados === undefined || mezclados === 0 ? {} : { mezclados }),
  };
}

/** El padre de un commit, o el árbol vacío si es la raíz del repo. `undefined` = no se pudo
 *  resolver ninguno de los dos, y entonces no hay «antes» que usar. */
async function padreDe(raiz: string, sha: string): Promise<string | undefined> {
  try {
    const { stdout } = await ejecutar("git", ["rev-parse", "--verify", "--quiet", `${sha}^`], { cwd: raiz });
    return stdout.trim();
  } catch {
    try {
      await ejecutar("git", ["rev-parse", "--verify", "--quiet", `${ARBOL_VACIO}^{tree}`], { cwd: raiz });
      return ARBOL_VACIO;
    } catch {
      return undefined;
    }
  }
}

/** Cuántos commits que NO son de esta sesión hay desde su «antes» hasta ahora. `undefined`
 *  si no se pudo preguntar: entonces no se afirma ni que haya ni que no haya. */
async function commitsAjenos(raiz: string, base: string, commits: string[]): Promise<number | undefined> {
  try {
    const { stdout } = await ejecutar("git", ["rev-list", `${base}..HEAD`], { cwd: raiz, maxBuffer: 8 * 1024 * 1024 });
    const mios = new Set(commits);
    return stdout
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "" && !mios.has(l)).length;
  } catch {
    return undefined;
  }
}

/**
 * El respaldo: el árbol de ahora contra la foto de apertura. Es la medida de siempre y lo
 * único posible en una sesión sin sello — pero NO atribuye, así que viaja con su propio
 * `via` para que nadie la pinte como «lo que hizo esta sesión».
 */
async function desdeLaApertura(raiz: string, id: string): Promise<CambiosDeSesion> {
  const ref = refDeSesion(id);
  if (ref === undefined) return { via: "sin-marca", ficheros: [] };
  try {
    await ejecutar("git", ["rev-parse", "--verify", "--quiet", ref], { cwd: raiz });
  } catch {
    return { via: "sin-marca", ficheros: [] };
  }
  try {
    const ahora = await arbolDeAhora(raiz);
    // `--relative` porque los dos árboles se escriben con rutas desde la RAÍZ DEL REPO, y el
    // proyecto no tiene por qué serlo (`instantanea.ts` sostiene ese caso a propósito). Sin
    // él, en un proyecto que cuelga de un repo mayor las rutas saldrían con el prefijo de la
    // subcarpeta y `parcheDeSesion` no casaría con ninguna.
    const ficheros = await filasDeDiff(raiz, entre(ref, ahora));
    return { via: "desde-apertura", ficheros: ficheros.sort((a, b) => a.ruta.localeCompare(b.ruta)) };
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
  try {
    const extremos = await extremosDelParche(raiz, id, ruta);
    if (extremos === undefined) return undefined;
    const { stdout } = await ejecutar(
      "git",
      // `FUERA` también aquí: nadie debe poder pedir el parche de un fichero interno
      // nombrándolo a mano, ni siquiera si se cuela en la lista por una ref antigua.
      ["diff", "--relative", "--no-renames", extremos.antes, extremos.despues, "--", ruta, FUERA],
      { cwd: raiz, maxBuffer: 32 * 1024 * 1024 }
    );
    if (stdout.length <= TOPE_DE_PARCHE) return { texto: stdout, recortado: false };
    return { texto: stdout.slice(0, TOPE_DE_PARCHE), recortado: true };
  } catch {
    return undefined;
  }
}

/**
 * Entre qué dos extremos se pide el parche de un fichero, y son los MISMOS que dan sus
 * cuentas en la lista — si no, una fila diría «+40» y su diff enseñaría otra cosa.
 *
 * Con atribución por commit el «antes» es el padre del primer commit de la sesión que TOCÓ
 * ESTE fichero, no el primero de la sesión: así el parche empieza donde empieza el cambio y
 * no arrastra lo que otro commit de la misma sesión hiciera en otros ficheros. Sin sello, la
 * foto de apertura, que es lo único que hay.
 */
async function extremosDelParche(
  raiz: string,
  id: string,
  ruta: string
): Promise<{ antes: string; despues: string } | undefined> {
  const ahora = await arbolDeAhora(raiz);
  const suyos = await commitsDeSesion(raiz, id, ruta);
  if (suyos.length > 0) {
    const base = await padreDe(raiz, suyos[0]!);
    if (base !== undefined) return { antes: base, despues: ahora };
  }
  // Sin commits de la sesión para este fichero: o es una sesión sin sello, o el fichero solo
  // tiene cambios sin commitear. Lo primero se mide contra la foto; lo segundo, contra HEAD.
  const commits = await commitsDeSesion(raiz, id);
  if (commits.length > 0) return { antes: "HEAD", despues: ahora };
  const ref = refDeSesion(id);
  if (ref === undefined) return undefined;
  return { antes: ref, despues: ahora };
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
