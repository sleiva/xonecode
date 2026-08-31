import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tomarInstantanea } from "./instantanea.js";

const g = promisify(execFile);

async function repo(conCommit: boolean): Promise<string> {
  const d = mkdtempSync(join(tmpdir(), "xc-inst-"));
  await g("git", ["init"], { cwd: d });
  await g("git", ["config", "user.email", "x@y.z"], { cwd: d });
  await g("git", ["config", "user.name", "x"], { cwd: d });
  writeFileSync(join(d, "app.xml"), "<app/>");
  mkdirSync(join(d, "sub"));
  writeFileSync(join(d, "sub", "b.xne"), "otro");
  if (conCommit) {
    await g("git", ["add", "-A"], { cwd: d });
    await g("git", ["commit", "-m", "inicial"], { cwd: d });
  }
  return d;
}

const GIT = { usable: true, prefijo: "" };

describe("instantánea por árbol de git", () => {
  it("funciona en un repo SIN commits: write-tree no necesita HEAD", async () => {
    // El caso real del usuario: su repo está en `main` con cero commits.
    const d = await repo(false);
    const i = await tomarInstantanea(d, GIT);
    expect(i.via).toBe("git");
    expect(await i.cambios()).toEqual([]);
    rmSync(d, { recursive: true, force: true });
  });

  it("ve modificado, nuevo y borrado, incluso en subdirectorios", async () => {
    const d = await repo(false);
    const i = await tomarInstantanea(d, GIT);
    writeFileSync(join(d, "app.xml"), "<app cambiado/>");
    writeFileSync(join(d, "sub", "c.xne"), "nuevo");
    rmSync(join(d, "sub", "b.xne"));
    const c = await i.cambios();
    expect(c).toContainEqual({ ruta: "app.xml", clase: "modificado" });
    expect(c).toContainEqual({ ruta: "sub/c.xne", clase: "nuevo" });
    expect(c).toContainEqual({ ruta: "sub/b.xne", clase: "borrado" });
    rmSync(d, { recursive: true, force: true });
  });

  it("NO colapsa un directorio sin trackear en una sola entrada", async () => {
    // El fallo que esto cierra: `git status --porcelain` devolvía `?? sub/` — UNA línea
    // — en vez de los ficheros de dentro, así que el diff no decía nada útil.
    const d = await repo(false);
    const i = await tomarInstantanea(d, GIT);
    mkdirSync(join(d, "nuevo"));
    writeFileSync(join(d, "nuevo", "x.xne"), "1");
    writeFileSync(join(d, "nuevo", "y.xne"), "2");
    const rutas = (await i.cambios()).map((c) => c.ruta);
    expect(rutas).toContain("nuevo/x.xne");
    expect(rutas).toContain("nuevo/y.xne");
    rmSync(d, { recursive: true, force: true });
  });

  it("no toca el índice REAL del usuario", async () => {
    const d = await repo(true);
    const i = await tomarInstantanea(d, GIT);
    writeFileSync(join(d, "app.xml"), "<app cambiado/>");
    await i.cambios();
    // Si hubiéramos usado el índice de verdad, el cambio estaría staged.
    const { stdout } = await g("git", ["diff", "--cached", "--name-only"], { cwd: d });
    expect(stdout.trim()).toBe("");
    rmSync(d, { recursive: true, force: true });
  });

  it("el diff trae contenido, que es lo que un modelo lee bien", async () => {
    const d = await repo(false);
    const i = await tomarInstantanea(d, GIT);
    writeFileSync(join(d, "app.xml"), "<app cambiado/>");
    const dif = await i.diff();
    expect(dif).toContain("app.xml");
    expect(dif).toContain("+<app cambiado/>");
    rmSync(d, { recursive: true, force: true });
  });

  it("sin cambios, ni lista ni diff inventan nada", async () => {
    const d = await repo(false);
    const i = await tomarInstantanea(d, GIT);
    expect(await i.cambios()).toEqual([]);
    expect(await i.diff()).toBe("");
    rmSync(d, { recursive: true, force: true });
  });
});

describe("instantánea por huellas (sin git)", () => {
  it("detecta un cambio del MISMO tamaño: compara contenido, no bytes", async () => {
    // «original» y «lanigiro» miden lo mismo: por tamaño o mtime daría «sin cambios».
    const d = mkdtempSync(join(tmpdir(), "xc-h-"));
    writeFileSync(join(d, "a.xne"), "original");
    const i = await tomarInstantanea(d, { usable: false, prefijo: "" });
    expect(i.via).toBe("huellas");
    writeFileSync(join(d, "a.xne"), "lanigiro");
    expect(await i.cambios()).toEqual([{ ruta: "a.xne", clase: "modificado" }]);
    rmSync(d, { recursive: true, force: true });
  });

  it("declara que no hay diff en vez de devolver algo falso", async () => {
    const d = mkdtempSync(join(tmpdir(), "xc-h-"));
    writeFileSync(join(d, "a.xne"), "x");
    const i = await tomarInstantanea(d, { usable: false, prefijo: "" });
    writeFileSync(join(d, "a.xne"), "y");
    expect(await i.diff()).toBe("");
    expect(i.via).toBe("huellas");
    rmSync(d, { recursive: true, force: true });
  });
});