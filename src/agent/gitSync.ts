/**
 * El git local como libro de cuentas de la sincronización.
 *
 * La idea entera: CloudStudio se declara como un remoto SIN servidor git detrás, y su
 * estado vive en una ref de seguimiento. Así `git status` responde «¿está subido?» sin
 * que xonecode invente un fichero de estado — y dos fuentes de verdad para lo mismo es
 * como se rompe esto a los tres meses.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { CambioLocal } from "../core/planDeSubida.js";
import { indicePrivado, claseDeCambio } from "./git.js";
import { NOMBRE_CARPETA } from "./configEnDisco.js";

const ejecutar = promisify(execFile);

export const REMOTO = "cloudstudio";

/**
 * Cómo se llama la rama de TRABAJO (a la que se sube) de una rama origen dada.
 *
 * Vive aquí y se exporta para que no haya dos sitios que la compongan: `cli/main.ts` la
 * usaba en una plantilla suelta, y basta con que una de las dos cambie para que la ref de
 * seguimiento y la rama del servidor dejen de referirse a lo mismo, en silencio.
 */
export const ramaDeTrabajo = (ramaOrigen: string): string => `xonecode/${ramaOrigen}`;
const EXCLUSION = `${NOMBRE_CARPETA}/`;

const git = (raiz: string, args: string[], env?: NodeJS.ProcessEnv) =>
  ejecutar("git", args, { cwd: raiz, env: env ?? process.env, maxBuffer: 32 * 1024 * 1024 });

async function esRepo(raiz: string): Promise<boolean> {
  try {
    const { stdout } = await git(raiz, ["rev-parse", "--is-inside-work-tree"]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

/**
 * Dónde vive de VERDAD el `info/exclude` de este repo.
 *
 * `join(raiz, ".git", "info", "exclude")` da por hecho dos cosas falsas: que el proyecto
 * es la raíz del repo (con `outer/` repo y `outer/app/` proyecto, crea un `.git` fantasma
 * en `outer/app/` y la exclusión se escribe donde git no la lee jamás) y que `.git` es un
 * directorio (en un worktree de git es un FICHERO, y el `mkdirSync` revienta con ENOTDIR
 * DESPUÉS de que el ZIP ya escribió el disco). `--git-path` resuelve las dos: en un
 * worktree apunta al `info/` del directorio común, que es donde git lo lee.
 *
 * La salida puede venir relativa al cwd (que es `raiz`) o absoluta; `resolve` cubre ambas.
 */
async function rutaDeExclusion(raiz: string): Promise<string> {
  const { stdout } = await git(raiz, ["rev-parse", "--git-path", "info/exclude"]);
  return resolve(raiz, stdout.trim());
}

/**
 * El prefijo del proyecto dentro del repo (`app/`), o `""` si el proyecto ES la raíz.
 *
 * Mismo patrón que `agent/instantanea.ts#porArbol`, que ya resolvía exactamente esto: git
 * habla en rutas relativas a la raíz del REPO y el resto de xonecode (el manifiesto, los
 * `descargados` del ZIP, el `join(raiz, ruta)` de la subida) habla en rutas relativas al
 * PROYECTO. Sin recortar, `subida.ts` compone `outer/app/app/app.xml` y falla en cada
 * fichero, y el candado de borrado no reconoce ni una ruta.
 *
 * No se detecta el caso comparando `--show-toplevel` con `raiz`: en macOS un temporal es
 * `/var/folders/…` y git devuelve el realpath `/private/var/…`, así que la comparación de
 * cadenas mentiría. El prefijo vacío ES la respuesta a «¿soy la raíz?».
 */
async function prefijoDelProyecto(raiz: string): Promise<string> {
  const { stdout } = await git(raiz, ["rev-parse", "--show-prefix"]);
  return stdout.trim();
}

/** Quita el prefijo del repo: las rutas se leen desde el proyecto, como en todo lo demás. */
const recortar = (prefijo: string, ruta: string): string =>
  prefijo !== "" && ruta.startsWith(prefijo) ? ruta.slice(prefijo.length) : ruta;

/**
 * El valor EFECTIVO de una clave de configuración, o `undefined` si no la tiene nadie.
 *
 * `git config --get` sale con código 1 cuando la clave no existe, y `execFile` convierte
 * eso en una excepción: sin este envoltorio, «no está puesta» sería un error.
 *
 * Se mira el valor efectivo (repo + global + sistema), no solo el `--local`: al usuario
 * le importa lo que git hace de verdad en esa carpeta, no en qué fichero está escrito.
 */
async function valorDeConfig(raiz: string, clave: string): Promise<string | undefined> {
  try {
    const { stdout } = await git(raiz, ["config", "--get", clave]);
    const valor = stdout.trim();
    return valor === "" ? undefined : valor;
  } catch {
    return undefined;
  }
}

/**
 * Deja el repo listo tras una descarga: repo, exclusiones, remoto y baseline.
 *
 * El commit de baseline se construye con índice privado para no tocar el staging del
 * usuario, que puede tener trabajo a medias cuando hace un `/sync`.
 *
 * **En un repo PREEXISTENTE la configuración es suya, no nuestra.** Se cuida su índice
 * con esmero (`indicePrivado`, la guarda antes del `reset --mixed`) y pisarle la config
 * sin la misma guarda sería incoherente: un repo con `origin` en GitHub acababa con su
 * rama apuntando a un remoto `cloudstudio://` que no es ningún servidor git, y su
 * `git push` dejaba de funcionar. Las claves que ya tienen valor se respetan y se DICE
 * cuáles se omitieron: un aviso que no se da es un cambio invisible en el repo de otro.
 */
export async function prepararRepo(
  raiz: string,
  ramaOrigen: string,
  informar: (texto: string) => void = () => {}
): Promise<string> {
  const yaEraRepo = await esRepo(raiz);
  if (!yaEraRepo) {
    // La rama local se llama como la remota: dos vocabularios para lo mismo confunden.
    await git(raiz, ["init", "-q", "-b", ramaOrigen]);
  }

  // `.gitignore` es un fichero del PROYECTO y acabaría subido a CloudStudio; `info/exclude`
  // es local del repo y no viaja a ninguna parte.
  const exclude = await rutaDeExclusion(raiz);
  const prefijo = await prefijoDelProyecto(raiz);
  mkdirSync(dirname(exclude), { recursive: true });
  const actual = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
  // La exclusión se ancla al PROYECTO: en un repo mayor, `.xonecode/` a secas excluiría
  // también un `.xonecode/` de cualquier otro subdirectorio del usuario. `/` inicial =
  // relativo a la raíz del repo, que es donde git lee este fichero.
  const patron = `/${prefijo}${EXCLUSION}`;
  if (!actual.includes(patron)) {
    appendFileSync(exclude, `${actual.endsWith("\n") || actual === "" ? "" : "\n"}${patron}\n`);
  }

  // `remote.cloudstudio.*` es nuestro propio espacio de nombres: ahí sí se escribe
  // siempre, porque la ref de seguimiento (`refs/remotes/cloudstudio/…`) es el libro de
  // cuentas de xonecode y nadie más lo usa.
  await git(raiz, ["config", `remote.${REMOTO}.url`, `cloudstudio://${ramaOrigen}`]);
  await git(raiz, ["config", `remote.${REMOTO}.fetch`, `+refs/heads/*:refs/remotes/${REMOTO}/*`]);
  // DETRÁS DE ESTE REMOTO NO HAY UN SERVIDOR GIT. La url `cloudstudio://…` existe para que
  // la pareja `branch.<rama>.remote` + la ref le den a `git status` el «ahead/behind»
  // —que es el corazón del diseño: el libro de cuentas es git y no un fichero nuestro—,
  // pero nadie puede hablar ese protocolo. Sin esto, medido, el `git fetch --all` o el
  // `git remote update` del usuario mueren con «remote helper 'cloudstudio' aborted
  // session» (código 128) por culpa de un remoto que le pusimos nosotros. `skipFetchAll`
  // hace que los recorridos de TODOS los remotos se salten este, y deja intacto todo lo
  // demás. Nuestro «fetch» de verdad es `/sync bajar`, no un transporte de git.
  await git(raiz, ["config", `remote.${REMOTO}.skipFetchAll`, "true"]);

  // Estas tres son del USUARIO: `core.autocrlf` gobierna todo su repo y
  // `branch.<rama>.remote`/`.merge` son a dónde empuja su `git push`. En un repo
  // preexistente solo se escriben si no valen ya nada.
  const omitidas: string[] = [];
  const fijarSinPisar = async (clave: string, valor: string): Promise<void> => {
    if (yaEraRepo) {
      const actual = await valorDeConfig(raiz, clave);
      // Se compara el VALOR, no solo la presencia. Con `actual !== undefined` bastaba con
      // que la clave existiera: a partir del SEGUNDO `/sync bajar` sobre el repo que
      // xonecode acaba de crear, `yaEraRepo` ya es cierto y nuestras propias claves con
      // nuestros propios valores se declaraban «conservadas» — un aviso que salta cuando
      // no ha pasado nada, que es justo lo que enseña a ignorar los avisos.
      if (actual !== undefined && actual !== valor) {
        omitidas.push(`${clave}=${actual}`);
        return;
      }
    }
    await git(raiz, ["config", clave, valor]);
  };

  // Sin `core.autocrlf=false`, el texto que vuelve del servidor se normaliza al
  // escribirlo y cada `/sync` produce diffs fantasma — pero si el usuario ya eligió otra
  // cosa, mandan él y su aviso, no nuestra comodidad.
  await fijarSinPisar("core.autocrlf", "false");
  await fijarSinPisar(`branch.${ramaOrigen}.remote`, REMOTO);
  await fijarSinPisar(`branch.${ramaOrigen}.merge`, `refs/heads/${ramaOrigen}`);
  if (omitidas.length > 0) {
    informar(
      `se conserva tu configuración de git y no se toca: ${omitidas.join(", ")}. ` +
        `El seguimiento de CloudStudio vive igualmente en refs/remotes/${REMOTO}/${ramaOrigen}\n`
    );
  }

  const idx = indicePrivado("sync");
  try {
    const env = { ...process.env, GIT_INDEX_FILE: idx.ruta };
    await git(raiz, ["add", "-A", "--", "."], env);
    const { stdout: arbol } = await git(raiz, ["write-tree"], env);
    const { stdout: commit } = await git(raiz, [
      "-c", "user.email=xonecode@local", "-c", "user.name=xonecode",
      "commit-tree", arbol.trim(), "-m", `estado de CloudStudio (${ramaOrigen})`,
    ], env);
    const sha = commit.trim();
    await git(raiz, ["update-ref", "-m", "sync: descarga inicial", `refs/remotes/${REMOTO}/${ramaOrigen}`, sha]);

    // Si la rama local aún no tiene commits, el baseline ES su primer commit: así el
    // usuario parte de un árbol limpio en vez de con todo el proyecto sin commitear.
    try {
      await git(raiz, ["rev-parse", "--verify", "HEAD"]);
    } catch {
      // OJO: `git reset --mixed` sin pathspec sustituye el índice REAL entero por el árbol
      // del commit — no se puede acotar a rutas. Si el usuario ya tenía algo en staging
      // (posible: un repo sin commits que él mismo inició antes del primer `/sync`), ese
      // reset se lo comería. `git diff --cached` funciona con HEAD sin nacer (compara
      // contra el árbol vacío), así que sirve para saber si el índice real está intacto
      // ANTES de tocar nada. Solo con el índice vacío es seguro dejarlo apuntando al
      // baseline; si no, se prioriza no tocar el índice del usuario sobre la comodidad
      // de empezar con un árbol limpio.
      const { stdout: enStaging } = await git(raiz, ["diff", "--cached", "--name-only"]);
      if (enStaging.trim() === "") {
        await git(raiz, ["update-ref", "-m", "sync: descarga inicial", `refs/heads/${ramaOrigen}`, sha]);
        await git(raiz, ["reset", "-q", "--mixed"]);
      }
    }
    return sha;
  } finally {
    idx.limpiar();
  }
}

/** ¿Existe esa ref? `rev-parse --verify` sale con error si no, y `execFile` lo lanza. */
async function existeRef(raiz: string, ref: string): Promise<boolean> {
  try {
    await git(raiz, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lo que hay en local y no está subido: el diff contra la ref de seguimiento.
 *
 * **Contra CUÁL** es la parte fina. Se sube a la rama de TRABAJO, así que en cuanto esa
 * rama existe, «lo que falta por subir» es el diff contra SU ref — no contra la de la
 * rama origen, que se quedó en el momento de la descarga y nadie vuelve a mover. Antes de
 * la primera subida esa ref no existe todavía y la referencia buena es la origen, que es
 * justo de donde parte la rama de trabajo.
 */
export async function cambiosPendientes(
  raiz: string,
  ramaOrigen: string,
  ramaTrabajo: string = ramaDeTrabajo(ramaOrigen)
): Promise<CambioLocal[]> {
  const refTrabajo = `refs/remotes/${REMOTO}/${ramaTrabajo}`;
  const rama = (await existeRef(raiz, refTrabajo)) ? ramaTrabajo : ramaOrigen;
  // Las rutas del diff vienen relativas a la RAÍZ DEL REPO. Si el proyecto es un
  // subdirectorio, hay que recortar el prefijo o `subida.ts` compone `raiz/app/app.xml`
  // (ENOENT) y ninguna ruta casa con `descargados`, que son relativas al proyecto.
  const prefijo = await prefijoDelProyecto(raiz);
  // `core.quotePath` (por omisión `true`) escapa a octal cualquier byte >= 0x80: una
  // ruta como «ñu.xne» saldría como `"\303\261u.xne"`. El candado de `planDeSubida`
  // compara estas rutas, tal cual, contra las de `descargados` (que SÍ vienen en UTF-8
  // sin comillas, de `extraerZipBase64`/el manifiesto) — con la ruta citada nunca
  // coinciden, y un proyecto XOne en castellano tiene nombres así a diario.
  const { stdout } = await git(raiz, [
    "-c", "core.quotePath=false",
    // Sin `--no-renames`, un `A.xne` → `B.xne` sale como una sola línea `R100 A.xne
    // B.xne` y este parser solo se queda con el destino (`resto[resto.length - 1]`):
    // `B` sube y `A` se queda vivo en Studio para siempre, como colección huérfana, sin
    // ningún aviso. Forzando borrado + alta por separado, el borrado de `A` SÍ pasa por
    // el candado (estaba en `descargados`, así que se emite) y `B` sube como alta.
    "diff", "--no-renames", "--name-status", `refs/remotes/${REMOTO}/${rama}`, "--", ".",
  ]);
  return stdout
    .split("\n")
    .filter((linea) => linea.trim() !== "")
    .flatMap((linea) => {
      const [marca, ...resto] = linea.split("\t");
      const ruta = resto[resto.length - 1];
      // `claseDeCambio` nunca devuelve `undefined` (ver `agent/git.ts`): una marca que no
      // reconocemos también se cuenta, nunca se pierde en silencio del plan de subida.
      return ruta === undefined ? [] : [{ clase: claseDeCambio(marca!), ruta: recortar(prefijo, ruta) }];
    })
    .sort((a, b) => a.ruta.localeCompare(b.ruta));
}

/**
 * «Simular el push»: mover la ref. Solo se llama cuando la subida terminó ENTERA.
 *
 * `rama` es la rama a la que se ESCRIBIÓ de verdad —la de trabajo—, no la origen. Con la
 * origen, después de subir `git status` decía que ibas al día con `master` mientras en
 * Studio `master` no tenía nada de eso; y un `bajar` posterior reintroducía todo el
 * trabajo como si se hubiera revertido. El libro de cuentas tiene que llamar a las cosas
 * por el nombre que tienen en el servidor.
 */
export async function marcarSubido(raiz: string, rama: string, mensaje: string): Promise<void> {
  const { stdout } = await git(raiz, ["rev-parse", "HEAD"]);
  await git(raiz, ["update-ref", "-m", mensaje, `refs/remotes/${REMOTO}/${rama}`, stdout.trim()]);
}

/**
 * ¿Hay cambios sin commitear?
 *
 * Lo exigen las DOS direcciones, por motivos distintos: subir sube el estado de un commit
 * (no un borrador), y bajar SOBRESCRIBE el disco con lo que venga del servidor — sin
 * commit debajo, el trabajo local no se recupera de ninguna forma.
 *
 * `.xonecode/` no cuenta nunca. En el alta, la config del proyecto se escribe ANTES de la
 * primera descarga y `prepararRepo` (que es quien pone la exclusión en `info/exclude`)
 * corre DESPUÉS: sin este `:(exclude)`, la propia alta se bloquearía a sí misma en
 * cualquier repo preexistente. Y la carpeta del harness no sube ni baja jamás.
 *
 * **Sin repo** no hay `git status` que valer: se responde por el contenido. Una carpeta
 * vacía (salvo `.xonecode/` y la basura del sistema operativo) es el alta normal y se deja
 * pasar; una con ficheros dentro y sin git es justo el caso sin red de seguridad —nada que
 * recuperar tras sobrescribir—, así que se declara sucia.
 */
export async function arbolLimpio(raiz: string): Promise<boolean> {
  return (await sinCommitear(raiz)).length === 0;
}

/**
 * Ficheros que pone el SISTEMA OPERATIVO, no el usuario.
 *
 * Sin repo, `sinCommitear` responde por el contenido de la carpeta, y en macOS —la
 * plataforma de este repo— una carpeta vacía que se ha abierto una vez en el Finder tiene
 * un `.DS_Store` dentro. Contarlo bloqueaba el alta entera («hay trabajo local sin
 * commitear (.DS_Store)») sin salida posible desde xonecode, porque `/sync bajar` lleva la
 * misma guarda: se arreglaba un riesgo real y se rompía el camino feliz.
 *
 * Es una LISTA CERRADA y no «ignora los ocultos» a propósito: un `.env` o un `.gitignore`
 * son trabajo del usuario, y sobrescribirlos sin red de seguridad es exactamente lo que la
 * guarda existe para impedir. Estos tres no son contenido de ningún proyecto y aparecen
 * solo por abrir la carpeta.
 */
const esBasuraDelSO = (entrada: string): boolean =>
  entrada === ".DS_Store" || entrada === "Thumbs.db" || entrada === "desktop.ini";

/**
 * QUÉ está sin commitear, para poder decirlo. Es la misma pregunta que `arbolLimpio`
 * —de hecho aquélla se responde con ésta, para que no haya dos criterios de «limpio»—,
 * y no la misma que `cambiosPendientes`: aquélla es «qué falta por SUBIR» (diff contra la
 * ref de seguimiento) y ésta es «qué falta por COMMITEAR».
 */
export async function sinCommitear(raiz: string): Promise<string[]> {
  if (!(await esRepo(raiz))) {
    return readdirSync(raiz)
      .filter((entrada) => entrada !== NOMBRE_CARPETA && entrada !== ".git" && !esBasuraDelSO(entrada))
      .sort();
  }
  const prefijo = await prefijoDelProyecto(raiz);
  const { stdout } = await git(raiz, [
    // Mismo motivo que en `cambiosPendientes`: un nombre en castellano saldría citado en
    // octal y el mensaje al usuario sería ilegible.
    "-c", "core.quotePath=false",
    "status", "--porcelain", "--", ".", `:(exclude)${NOMBRE_CARPETA}`,
  ]);
  return stdout
    .split("\n")
    .filter((linea) => linea.trim() !== "")
    // `XY ruta`: dos caracteres de estado y un espacio.
    .map((linea) => recortar(prefijo, linea.slice(3).trim()))
    .sort();
}
