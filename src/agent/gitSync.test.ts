import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, unlinkSync, symlinkSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { prepararRepo, cambiosPendientes, marcarSubido, arbolLimpio, REMOTO } from "./gitSync.js";

const git = (raiz: string, ...args: string[]) =>
  execFileSync("git", args, { cwd: raiz, encoding: "utf8" }).trim();

function proyecto(): string {
  const raiz = mkdtempSync(join(tmpdir(), "xc-git-"));
  writeFileSync(join(raiz, "app.xml"), "<app/>");
  mkdirSync(join(raiz, ".xonecode"), { recursive: true });
  writeFileSync(join(raiz, ".xonecode", "memoria.md"), "# memoria");
  return raiz;
}

describe("prepararRepo", () => {
  it("inicia el repo con el nombre de la rama origen", async () => {
    const raiz = proyecto();
    await prepararRepo(raiz, "master");
    expect(git(raiz, "rev-parse", "--abbrev-ref", "HEAD")).toBe("master");
  });

  it("excluye .xonecode en info/exclude, no en .gitignore", async () => {
    const raiz = proyecto();
    await prepararRepo(raiz, "master");
    expect(readFileSync(join(raiz, ".git", "info", "exclude"), "utf8")).toContain(".xonecode/");
    // .gitignore es un fichero del PROYECTO: acabaría subido a CloudStudio.
    expect(existsSync(join(raiz, ".gitignore"))).toBe(false);
  });

  it("deja autocrlf desactivado y el remoto configurado (repo virgen)", async () => {
    // El único caso en que escribir esas claves es inofensivo: el repo lo acabamos de
    // crear nosotros. En uno preexistente son del usuario — ver el test de más abajo.
    const raiz = proyecto();
    await prepararRepo(raiz, "master");
    expect(git(raiz, "config", "core.autocrlf")).toBe("false");
    expect(git(raiz, "config", `branch.master.remote`)).toBe(REMOTO);
    expect(git(raiz, "config", `branch.master.merge`)).toBe("refs/heads/master");
    expect(git(raiz, "config", `remote.${REMOTO}.url`)).toBe("cloudstudio://master");
    expect(git(raiz, "rev-parse", `refs/remotes/${REMOTO}/master`)).toMatch(/^[0-9a-f]{40}$/);
  });

  it("no pisa la configuración de un repo preexistente, y lo dice", async () => {
    // Reproducido: un repo con `origin` en GitHub acababa con `master` apuntando a un
    // remoto `cloudstudio://`, que no es ningún servidor git — y el `git push` del
    // usuario dejaba de funcionar. Se le cuida el índice con esmero; la config también.
    const raiz = proyecto();
    execFileSync("git", ["init", "-q", "-b", "master"], { cwd: raiz });
    git(raiz, "remote", "add", "origin", "https://github.com/usuario/suyo.git");
    git(raiz, "config", "branch.master.remote", "origin");
    git(raiz, "config", "branch.master.merge", "refs/heads/master");
    git(raiz, "config", "core.autocrlf", "input");

    const avisos: string[] = [];
    await prepararRepo(raiz, "master", (t) => avisos.push(t));

    expect(git(raiz, "config", "branch.master.remote")).toBe("origin");
    expect(git(raiz, "config", "branch.master.merge")).toBe("refs/heads/master");
    expect(git(raiz, "config", "core.autocrlf")).toBe("input");
    // Un cambio que no se hace y no se dice es indistinguible de uno que sí se hizo.
    const texto = avisos.join("");
    expect(texto).toContain("branch.master.remote=origin");
    expect(texto).toContain("core.autocrlf=input");
    // Y el libro de cuentas sigue existiendo: la ref no depende de esas claves.
    expect(git(raiz, "rev-parse", `refs/remotes/${REMOTO}/master`)).toMatch(/^[0-9a-f]{40}$/);
  });

  it("no toca el índice del usuario", async () => {
    const raiz = proyecto();
    execFileSync("git", ["init", "-q", "-b", "master"], { cwd: raiz });
    execFileSync("git", ["config", "user.email", "t@t"], { cwd: raiz });
    execFileSync("git", ["config", "user.name", "t"], { cwd: raiz });
    writeFileSync(join(raiz, "pendiente.js"), "x");
    execFileSync("git", ["add", "pendiente.js"], { cwd: raiz });

    await prepararRepo(raiz, "master");
    // Lo que el usuario tenía en staging sigue ahí, y NADA MÁS: `toContain` no distinguía
    // esto de una implementación ingenua que hiciera `add -A` sobre el índice real (ahí
    // `pendiente.js` seguiría "conteniéndose" junto a `app.xml`, colado por el baseline).
    expect(git(raiz, "diff", "--cached", "--name-only")).toBe("pendiente.js");
  });
});

describe("prepararRepo — el proyecto no es la raíz del repo", () => {
  /** `outer/` es el repo del usuario (con historia); `outer/app/` es el proyecto XOne. */
  function enSubdirectorio(): { outer: string; app: string } {
    const outer = mkdtempSync(join(tmpdir(), "xc-outer-"));
    execFileSync("git", ["init", "-q", "-b", "master"], { cwd: outer });
    execFileSync("git", ["config", "user.email", "t@t"], { cwd: outer });
    execFileSync("git", ["config", "user.name", "t"], { cwd: outer });
    writeFileSync(join(outer, "README.md"), "# el repo del usuario");
    execFileSync("git", ["add", "-A"], { cwd: outer });
    execFileSync("git", ["commit", "-qm", "inicial"], { cwd: outer });

    const app = join(outer, "app");
    mkdirSync(join(app, ".xonecode"), { recursive: true });
    writeFileSync(join(app, "app.xml"), "<app/>");
    writeFileSync(join(app, ".xonecode", "memoria.md"), "# memoria");
    return { outer, app };
  }

  it("no fabrica un `.git` fantasma en el proyecto", async () => {
    const { outer, app } = enSubdirectorio();
    await prepararRepo(app, "master");
    // `mkdirSync(join(raiz, ".git", "info"))` creaba un directorio `.git` en `outer/app/`
    // que no es ningún repo: git nunca lo mira y la exclusión se escribía al vacío.
    expect(existsSync(join(app, ".git"))).toBe(false);
    expect(readFileSync(join(outer, ".git", "info", "exclude"), "utf8")).toContain("/app/.xonecode/");
  });

  it("la exclusión de .xonecode SÍ aplica, así que el árbol puede estar limpio", async () => {
    const { outer, app } = enSubdirectorio();
    await prepararRepo(app, "master");
    // Lo del usuario se commitea (xonecode no commitea por él); `.xonecode/` se queda
    // sin rastrear a propósito y NO debe ensuciar el árbol. Con la exclusión escrita en
    // el `.git` fantasma, `?? .xonecode/` salía siempre y `/sync subir` quedaba
    // bloqueado para siempre, sin nada que el usuario pudiera hacer.
    // Se commitea SOLO lo del proyecto: si el test hiciera `add -A` metería también
    // `.xonecode/` en el repo y el árbol saldría limpio aunque la exclusión no aplicara
    // —el test dejaría de discriminar—.
    execFileSync("git", ["add", "app/app.xml"], { cwd: outer });
    execFileSync("git", ["commit", "-qm", "el proyecto"], { cwd: outer });
    expect(await arbolLimpio(app)).toBe(true);
  });

  it("las rutas pendientes son relativas al PROYECTO, no al repo", async () => {
    const { outer, app } = enSubdirectorio();
    await prepararRepo(app, "master");
    writeFileSync(join(app, "nuevo.js"), "// nuevo");
    execFileSync("git", ["add", "app/app.xml", "app/nuevo.js"], { cwd: outer });
    execFileSync("git", ["commit", "-qm", "trabajo"], { cwd: outer });

    // Sin recortar el prefijo salía `app/nuevo.js`, y `subida.ts` hace `join(raiz, ruta)`:
    // `outer/app/app/nuevo.js`, ENOENT en cada fichero. Y `descargados` (relativo al ZIP,
    // o sea al proyecto) no casaba con ninguna, así que el candado tampoco funcionaba.
    expect(await cambiosPendientes(app, "master")).toEqual([{ clase: "nuevo", ruta: "nuevo.js" }]);
  });

  it("en un worktree de git (`.git` es un FICHERO) no revienta con ENOTDIR", async () => {
    // El caso hermano: `mkdirSync(join(raiz, ".git", "info"))` lanzaba ENOTDIR sobre un
    // fichero — y lo hacía DESPUÉS de que el ZIP ya hubiera escrito el disco, o sea con
    // el proyecto a medio poner. `--git-path` apunta al `info/` que git lee de verdad.
    const { outer } = enSubdirectorio();
    const wt = join(outer, "..", `wt-${basename(outer)}`);
    execFileSync("git", ["worktree", "add", "-q", "-b", "trabajo", wt], { cwd: outer });
    try {
      expect(statSync(join(wt, ".git")).isFile()).toBe(true);
      writeFileSync(join(wt, "app.xml"), "<app/>");
      mkdirSync(join(wt, ".xonecode"), { recursive: true });
      writeFileSync(join(wt, ".xonecode", "memoria.md"), "# memoria");

      await prepararRepo(wt, "master");
      execFileSync("git", ["add", "app.xml"], { cwd: wt });
      execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "app"], { cwd: wt });
      expect(await arbolLimpio(wt)).toBe(true);
    } finally {
      rmSync(wt, { recursive: true, force: true });
    }
  });
});

describe("cambiosPendientes y marcarSubido", () => {
  it("ve lo que falta por subir, y deja de verlo al marcarlo", async () => {
    const raiz = proyecto();
    await prepararRepo(raiz, "master");
    writeFileSync(join(raiz, "app.xml"), "<app cambiada/>");
    writeFileSync(join(raiz, "nuevo.js"), "// nuevo");
    git(raiz, "add", "-A");
    git(raiz, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "trabajo");

    expect(await cambiosPendientes(raiz, "master")).toEqual([
      { clase: "modificado", ruta: "app.xml" },
      { clase: "nuevo", ruta: "nuevo.js" },
    ]);

    await marcarSubido(raiz, "master", "sync: 2 ficheros");
    expect(await cambiosPendientes(raiz, "master")).toEqual([]);
    expect(git(raiz, "reflog", "show", `${REMOTO}/master`)).toContain("sync: 2 ficheros");
  });

  it("no lista nada de .xonecode aunque exista", async () => {
    const raiz = proyecto();
    await prepararRepo(raiz, "master");
    writeFileSync(join(raiz, ".xonecode", "memoria.md"), "# cambiada");
    expect(await cambiosPendientes(raiz, "master")).toEqual([]);
  });

  it("devuelve las rutas no-ASCII sin citar (core.quotePath=false)", async () => {
    // Medido: por omisión git cita a octal cualquier byte >= 0x80 («ñu.xne» sale como
    // `"\303\261u.xne"`). `descargados` (de `extraerZipBase64`/el manifiesto) guarda la
    // ruta en UTF-8 sin comillas: si esta función no desactiva el citado, el candado de
    // `planDeSubida` nunca reconoce el fichero y el borrado queda bloqueado para siempre.
    const raiz = proyecto();
    await prepararRepo(raiz, "master");
    writeFileSync(join(raiz, "ñu.xne"), "x");
    git(raiz, "add", "-A");
    git(raiz, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "ñu");

    expect(await cambiosPendientes(raiz, "master")).toEqual([{ clase: "nuevo", ruta: "ñu.xne" }]);
  });

  it("un renombrado sale como borrado + alta, no como un solo `modificado`", async () => {
    // Medido: por omisión git DETECTA el rename y lo colapsa en una línea `R100 A B`
    // (`resto[resto.length - 1]` solo se queda con el destino). Si esta función no
    // pasara `--no-renames`, subir «A.xne» → «B.xne» dejaría a «A» vivo en Studio para
    // siempre —una colección huérfana, duplicada, sin ningún aviso—, porque nunca se
    // emitiría su borrado.
    const raiz = proyecto();
    writeFileSync(join(raiz, "A.xne"), "contenido bastante largo para que git detecte el rename por similitud");
    await prepararRepo(raiz, "master");
    git(raiz, "mv", "A.xne", "B.xne");
    git(raiz, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "renombro");

    expect(await cambiosPendientes(raiz, "master")).toEqual([
      { clase: "borrado", ruta: "A.xne" },
      { clase: "nuevo", ruta: "B.xne" },
    ]);
  });

  it("un cambio de TIPO (fichero -> symlink) cuenta como modificado, no se pierde", async () => {
    // Sale como `T` en `--name-status` (comprobado a mano): no es alta ni baja, así que
    // se sube como si fuera contenido cambiado — ver la regla en `agent/git.ts`.
    const raiz = proyecto();
    await prepararRepo(raiz, "master");
    unlinkSync(join(raiz, "app.xml"));
    symlinkSync("otro-sitio", join(raiz, "app.xml"));

    expect(await cambiosPendientes(raiz, "master")).toEqual([{ clase: "modificado", ruta: "app.xml" }]);
  });
});
