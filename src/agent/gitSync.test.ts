import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepararRepo, cambiosPendientes, marcarSubido, REMOTO } from "./gitSync.js";

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

  it("deja autocrlf desactivado y el remoto configurado", async () => {
    const raiz = proyecto();
    await prepararRepo(raiz, "master");
    expect(git(raiz, "config", "core.autocrlf")).toBe("false");
    expect(git(raiz, "config", `branch.master.remote`)).toBe(REMOTO);
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
});
