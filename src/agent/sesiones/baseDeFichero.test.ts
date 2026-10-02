import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { baseDeFichero } from "./baseDeFichero.js";
import { marcarSesion } from "./sesionGit.js";

const creados: string[] = [];
afterEach(() => {
  for (const d of creados.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Un repo de verdad: esto prueba git, no un doble de git. */
function repo(): string {
  const raiz = mkdtempSync(join(tmpdir(), "xonecode-base-"));
  creados.push(raiz);
  execFileSync("git", ["init", "-q", "."], { cwd: raiz });
  execFileSync("git", ["config", "user.email", "x@y.z"], { cwd: raiz });
  execFileSync("git", ["config", "user.name", "x"], { cwd: raiz });
  return raiz;
}

function commit(raiz: string, mensaje: string): void {
  execFileSync("git", ["add", "-A"], { cwd: raiz });
  execFileSync("git", ["commit", "-qm", mensaje], { cwd: raiz });
}

describe("baseDeFichero", () => {
  it("«sesion» es el fichero como estaba al abrir la sesión, y «commit» como está en HEAD", async () => {
    const raiz = repo();
    writeFileSync(join(raiz, "app.xne"), "uno\n");
    commit(raiz, "base");
    expect(await marcarSesion(raiz, "s1")).toBe(true);
    writeFileSync(join(raiz, "app.xne"), "dos\n");
    commit(raiz, "turno");
    writeFileSync(join(raiz, "app.xne"), "tres\n"); // lo que hay en disco no es ninguna de las dos

    expect(await baseDeFichero(raiz, "s1", "app.xne", "sesion")).toEqual({ ruta: "app.xne", base: "sesion", texto: "uno\n" });
    expect(await baseDeFichero(raiz, "s1", "app.xne", "commit")).toEqual({ ruta: "app.xne", base: "commit", texto: "dos\n" });
  });

  it("un fichero que no existía en la base es «vacio»: todo él es nuevo", async () => {
    const raiz = repo();
    writeFileSync(join(raiz, "app.xne"), "uno\n");
    commit(raiz, "base");
    expect(await marcarSesion(raiz, "s1")).toBe(true);
    writeFileSync(join(raiz, "nuevo.xne"), "hola\n");
    expect(await baseDeFichero(raiz, "s1", "nuevo.xne", "sesion")).toEqual({ ruta: "nuevo.xne", base: "sesion", vacio: true });
    expect(await baseDeFichero(raiz, "s1", "nuevo.xne", "commit")).toEqual({ ruta: "nuevo.xne", base: "commit", vacio: true });
  });

  it("sin repositorio no hay base, y se dice por qué", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-sin-git-"));
    creados.push(raiz);
    writeFileSync(join(raiz, "app.xne"), "uno\n");
    const r = await baseDeFichero(raiz, "s1", "app.xne", "commit");
    expect(r.texto).toBeUndefined();
    expect(r.sinBase).toMatch(/repositorio/);
  });

  it("sin la ref de la sesión, o sin sesión todavía, «sesion» no tiene base", async () => {
    const raiz = repo();
    writeFileSync(join(raiz, "app.xne"), "uno\n");
    commit(raiz, "base");
    expect((await baseDeFichero(raiz, "s9", "app.xne", "sesion")).sinBase).toMatch(/foto de su inicio/);
    expect((await baseDeFichero(raiz, undefined, "app.xne", "sesion")).sinBase).toBe("la sesión todavía no ha empezado");
  });

  it("un repo sin commits no tiene «último commit»", async () => {
    const raiz = repo();
    writeFileSync(join(raiz, "app.xne"), "uno\n");
    expect((await baseDeFichero(raiz, undefined, "app.xne", "commit")).sinBase).toMatch(/ningún commit/);
  });

  it("las guardas de ruta son las de leer: un .env commiteado no sale por aquí", async () => {
    const raiz = repo();
    writeFileSync(join(raiz, ".env"), "SECRETO=1\n");
    commit(raiz, "base");
    const r = await baseDeFichero(raiz, undefined, ".env", "commit");
    expect(r).toEqual({ ruta: ".env", base: "commit", sinBase: "esa ruta no se enseña" });
  });

  it("un proyecto que cuelga de un repo mayor pide la ruta relativa a SU carpeta", async () => {
    const raizDelRepo = repo();
    mkdirSync(join(raizDelRepo, "sub"));
    writeFileSync(join(raizDelRepo, "sub", "a.xne"), "dentro\n");
    commit(raizDelRepo, "base");
    expect(await baseDeFichero(join(raizDelRepo, "sub"), undefined, "a.xne", "commit")).toEqual({ ruta: "a.xne", base: "commit", texto: "dentro\n" });
  });
});
