import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { cambiosDeSesion, marcarSesion, olvidarSesion, parcheDeSesion, refDeSesion } from "./sesionGit.js";

/** Un repo de verdad: esto prueba git, no un doble de git. */
function repo(): string {
  const raiz = mkdtempSync(join(tmpdir(), "xonecode-sesion-"));
  execFileSync("git", ["init", "-q", "."], { cwd: raiz });
  execFileSync("git", ["config", "user.email", "x@y.z"], { cwd: raiz });
  execFileSync("git", ["config", "user.name", "x"], { cwd: raiz });
  return raiz;
}

/** Escribe un fichero creando su carpeta: los casos de esta batería viven en subcarpetas. */
function escribir(raiz: string, ruta: string, texto: string): void {
  const destino = join(raiz, ruta);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, texto);
}

describe("refDeSesion", () => {
  /**
   * El id se cuela en un nombre de referencia. Uno con `..`, con espacios o empezando por
   * guion no da un error claro: da un `update-ref` que falla raro o, peor, otra ref.
   */
  it("rechaza lo que no vale como nombre de ref", () => {
    expect(refDeSesion("s1")).toBe("refs/xonecode/sesion/s1");
    expect(refDeSesion("2026-09-05_a1b2")).toBe("refs/xonecode/sesion/2026-09-05_a1b2");
    expect(refDeSesion("../../head")).toBeUndefined();
    expect(refDeSesion("con espacio")).toBeUndefined();
    expect(refDeSesion("-arranca-con-guion")).toBeUndefined();
    expect(refDeSesion("")).toBeUndefined();
  });
});

describe("los ficheros de una sesión", () => {
  it("cuenta lo tocado desde la marca, incluido lo que git todavía no seguía", async () => {
    const raiz = repo();
    writeFileSync(join(raiz, "app.xne"), "uno\ndos\n");
    execFileSync("git", ["add", "-A"], { cwd: raiz });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: raiz });

    expect(await marcarSesion(raiz, "s1")).toBe(true);

    // Lo que haría el agente: cambiar uno, crear otro, borrar un tercero.
    writeFileSync(join(raiz, "app.xne"), "uno\nDOS\ntres\n");
    mkdirSync(join(raiz, "docs"));
    writeFileSync(join(raiz, "docs", "nuevo.md"), "hola\n");

    const { via, ficheros } = await cambiosDeSesion(raiz, "s1");
    expect(via).toBe("git");
    expect(ficheros.map((f) => [f.ruta, f.clase])).toEqual([
      ["app.xne", "modificado"],
      // Un fichero recién creado NO está seguido por git, y el índice privado con `add -A`
      // es justo lo que hace que cuente igual.
      ["docs/nuevo.md", "nuevo"],
    ]);
    expect(ficheros[0]).toMatchObject({ mas: 2, menos: 1 });
    rmSync(raiz, { recursive: true, force: true });
  });

  it("sin marca no dice «no tocaste nada»: dice que no lo sabe", async () => {
    const raiz = repo();
    writeFileSync(join(raiz, "a.txt"), "x\n");
    const { via, ficheros } = await cambiosDeSesion(raiz, "sin-marcar");
    expect(via).toBe("sin-marca");
    expect(ficheros).toEqual([]);
    rmSync(raiz, { recursive: true, force: true });
  });

  it("una carpeta sin git no rompe nada: se declara sin marca", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-nogit-"));
    expect(await marcarSesion(raiz, "s1")).toBe(false);
    expect((await cambiosDeSesion(raiz, "s1")).via).toBe("sin-marca");
    rmSync(raiz, { recursive: true, force: true });
  });

  it("el parche de un fichero trae su contenido, y olvidar la sesión borra la ref", async () => {
    const raiz = repo();
    writeFileSync(join(raiz, "a.txt"), "antes\n");
    execFileSync("git", ["add", "-A"], { cwd: raiz });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: raiz });
    await marcarSesion(raiz, "s1");
    writeFileSync(join(raiz, "a.txt"), "después\n");

    const parche = await parcheDeSesion(raiz, "s1", "a.txt");
    expect(parche?.texto).toMatch(/-antes/);
    expect(parche?.texto).toMatch(/\+después/);
    expect(parche?.recortado).toBe(false);

    // La ref vive FUERA de `refs/heads` y `refs/tags`: no ensucia ni `git branch` ni
    // `git tag`, que es todo el motivo de no haber usado un tag.
    expect(execFileSync("git", ["tag"], { cwd: raiz, encoding: "utf8" }).trim()).toBe("");
    expect(execFileSync("git", ["branch", "--list"], { cwd: raiz, encoding: "utf8" })).not.toMatch(/sesion/);
    expect(
      execFileSync("git", ["for-each-ref", "--format=%(refname)", "refs/xonecode"], { cwd: raiz, encoding: "utf8" })
    ).toMatch(/refs\/xonecode\/sesion\/s1/);

    await olvidarSesion(raiz, "s1");
    expect(
      execFileSync("git", ["for-each-ref", "--format=%(refname)", "refs/xonecode"], { cwd: raiz, encoding: "utf8" }).trim()
    ).toBe("");
    rmSync(raiz, { recursive: true, force: true });
  });
});

describe("lo que NO es trabajo de la sesión", () => {
  /**
   * El fallo que esto evita: `volcar()` escribe el `.jsonl` de la propia sesión al final de
   * cada turno, dentro de `.xonecode/`. Sin excluirlo, la lista empezaba por «el transcript
   * de esta sesión, modificado por esta sesión» en cualquier repo del usuario, donde
   * `prepararRepo` no ha escrito ningún `info/exclude`.
   */
  it("`.xonecode/` no sale en la lista aunque el repo no lo excluya", async () => {
    const raiz = repo();
    try {
      expect(await marcarSesion(raiz, "s1")).toBe(true);
      escribir(raiz, ".xonecode/sesiones/s1.jsonl", '{"tipo":"usuario"}\n');
      escribir(raiz, "src/app.xne", "<app/>");

      const { via, ficheros } = await cambiosDeSesion(raiz, "s1");
      expect(via).toBe("git");
      expect(ficheros.map((f) => f.ruta)).toEqual(["src/app.xne"]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  /**
   * Un proyecto puede colgar de un repo mayor (`instantanea.ts` lo sostiene a propósito).
   * Los árboles se escriben con rutas desde la raíz DEL REPO, así que sin `--relative` las
   * rutas saldrían con el prefijo de la subcarpeta y el parche, que se pide por esa ruta
   * con `cwd` en el proyecto, no casaría con ningún fichero: diff vacío y fila colgada.
   */
  it("con `.xonecode` YA ignorado, la marca se toma igual y la carpeta sigue sin salir", async () => {
    // La arista que se comió la vista entera, medida contra el proyecto de verdad: `git add`
    // con un pathspec `:(exclude).xonecode` en un repo donde `.xonecode` YA está ignorado
    // considera que has nombrado una ruta ignorada, avisa y **sale con código 1**. El árbol
    // no se escribía, `marcarSesion` devolvía `false`, y la pestaña decía «sin-marca» para
    // siempre — un fallo mudo con un mensaje tranquilizador. Los tests de al lado no lo
    // cogían porque en sus repos de usar y tirar `.xonecode` no lo ignora nadie.
    const raiz = repo();
    try {
      escribir(raiz, ".gitignore", ".xonecode/\n");
      execFileSync("git", ["add", "-A"], { cwd: raiz });
      execFileSync("git", ["commit", "-qm", "base"], { cwd: raiz });

      expect(await marcarSesion(raiz, "s1")).toBe(true);
      escribir(raiz, ".xonecode/sesiones/s1.jsonl", "{}\n");
      escribir(raiz, "src/app.xne", "<app/>");

      const { via, ficheros } = await cambiosDeSesion(raiz, "s1");
      expect(via).toBe("git");
      expect(ficheros.map((f) => f.ruta)).toEqual(["src/app.xne"]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("con el proyecto en una subcarpeta del repo, las rutas son del PROYECTO y el parche casa", async () => {
    const base = repo();
    try {
      const raiz = join(base, "apps", "tienda");
      mkdirSync(raiz, { recursive: true });
      escribir(raiz, "src/app.xne", "<app/>");
      expect(await marcarSesion(raiz, "s1")).toBe(true);
      escribir(raiz, "src/app.xne", "<app><nuevo/></app>");

      const { ficheros } = await cambiosDeSesion(raiz, "s1");
      expect(ficheros.map((f) => f.ruta)).toEqual(["src/app.xne"]);
      const parche = await parcheDeSesion(raiz, "s1", "src/app.xne");
      expect(parche?.texto).toContain("nuevo");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
