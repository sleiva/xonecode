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
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CambioLocal } from "../core/planDeSubida.js";

const ejecutar = promisify(execFile);

export const REMOTO = "cloudstudio";
const EXCLUSION = ".xonecode/";

/** Índice temporal propio: mismo patrón que `agent/instantanea.ts`, y por lo mismo. */
function indicePrivado(): { ruta: string; limpiar: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "xonecode-sync-"));
  return { ruta: join(dir, "git.index"), limpiar: () => rmSync(dir, { recursive: true, force: true }) };
}

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
 * Deja el repo listo tras una descarga: repo, exclusiones, remoto y baseline.
 *
 * El commit de baseline se construye con índice privado para no tocar el staging del
 * usuario, que puede tener trabajo a medias cuando hace un `/sync`.
 */
export async function prepararRepo(raiz: string, ramaOrigen: string): Promise<string> {
  if (!(await esRepo(raiz))) {
    // La rama local se llama como la remota: dos vocabularios para lo mismo confunden.
    await git(raiz, ["init", "-q", "-b", ramaOrigen]);
  }

  // `.gitignore` es un fichero del PROYECTO y acabaría subido a CloudStudio; `info/exclude`
  // es local del repo y no viaja a ninguna parte.
  const exclude = join(raiz, ".git", "info", "exclude");
  mkdirSync(join(raiz, ".git", "info"), { recursive: true });
  const actual = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
  if (!actual.includes(EXCLUSION)) {
    appendFileSync(exclude, `${actual.endsWith("\n") || actual === "" ? "" : "\n"}${EXCLUSION}\n`);
  }

  // Sin esto, el texto que vuelve del servidor se normaliza al escribirlo y cada `/sync`
  // produce diffs fantasma.
  await git(raiz, ["config", "core.autocrlf", "false"]);
  await git(raiz, ["config", `remote.${REMOTO}.url`, `cloudstudio://${ramaOrigen}`]);
  await git(raiz, ["config", `remote.${REMOTO}.fetch`, `+refs/heads/*:refs/remotes/${REMOTO}/*`]);
  await git(raiz, ["config", `branch.${ramaOrigen}.remote`, REMOTO]);
  await git(raiz, ["config", `branch.${ramaOrigen}.merge`, `refs/heads/${ramaOrigen}`]);

  const idx = indicePrivado();
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

const CLASE: Record<string, CambioLocal["clase"]> = {
  A: "nuevo", D: "borrado", M: "modificado", R: "modificado", C: "modificado", T: "modificado",
};

/** Lo que hay en local y no está subido: el diff contra la ref de seguimiento. */
export async function cambiosPendientes(raiz: string, rama: string): Promise<CambioLocal[]> {
  // `core.quotePath` (por omisión `true`) escapa a octal cualquier byte >= 0x80: una
  // ruta como «ñu.xne» saldría como `"\303\261u.xne"`. El candado de `planDeSubida`
  // compara estas rutas, tal cual, contra las de `descargados` (que SÍ vienen en UTF-8
  // sin comillas, de `extraerZipBase64`/el manifiesto) — con la ruta citada nunca
  // coinciden, y un proyecto XOne en castellano tiene nombres así a diario.
  const { stdout } = await git(raiz, [
    "-c", "core.quotePath=false",
    "diff", "--name-status", `refs/remotes/${REMOTO}/${rama}`, "--", ".",
  ]);
  return stdout
    .split("\n")
    .filter((linea) => linea.trim() !== "")
    .flatMap((linea) => {
      const [marca, ...resto] = linea.split("\t");
      const clase = CLASE[marca!.charAt(0)];
      const ruta = resto[resto.length - 1];
      return clase === undefined || ruta === undefined ? [] : [{ clase, ruta }];
    })
    .sort((a, b) => a.ruta.localeCompare(b.ruta));
}

/** «Simular el push»: mover la ref. Solo se llama cuando la subida terminó ENTERA. */
export async function marcarSubido(raiz: string, rama: string, mensaje: string): Promise<void> {
  const { stdout } = await git(raiz, ["rev-parse", "HEAD"]);
  await git(raiz, ["update-ref", "-m", mensaje, `refs/remotes/${REMOTO}/${rama}`, stdout.trim()]);
}

/** ¿Hay cambios sin commitear? La subida exige árbol limpio: se sube un commit, no un borrador. */
export async function arbolLimpio(raiz: string): Promise<boolean> {
  const { stdout } = await git(raiz, ["status", "--porcelain", "--", "."]);
  return stdout.trim() === "";
}
