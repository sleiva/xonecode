import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { modeloDelCambio } from "./modeloDelCambio.js";
import { marcarSesion } from "./sesionGit.js";
import { commitDeTurno } from "./gitSync.js";

/** Un repo de verdad y un proyecto XOne de verdad: esto prueba git y el linter, no dobles. */
function repo(): string {
  const raiz = mkdtempSync(join(tmpdir(), "xonecode-modelo-"));
  execFileSync("git", ["init", "-q", "."], { cwd: raiz });
  execFileSync("git", ["config", "user.email", "x@y.z"], { cwd: raiz });
  execFileSync("git", ["config", "user.name", "x"], { cwd: raiz });
  return raiz;
}

const APP = `<?xml version="1.0" encoding="utf-8"?>\n<app name="Demo">\n  <include file="Clientes.xne"/>\n</app>\n`;
const clientes = (props: string): string =>
  `<?xml version="1.0" encoding="utf-8"?>\n<coll name="Clientes">\n${props}</coll>\n`;

function proyecto(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "app.xml"), APP);
  writeFileSync(join(dir, "Clientes.xne"), clientes(`  <prop name="ID" type="N"/>\n  <prop name="NOMBRE" type="T"/>\n`));
}

describe("modeloDelCambio", () => {
  it("con un commit sellado: el «antes» es el padre, y sale lo que cambió en el modelo", async () => {
    const raiz = repo();
    proyecto(raiz);
    execFileSync("git", ["add", "-A"], { cwd: raiz });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: raiz });
    writeFileSync(join(raiz, "Clientes.xne"), clientes(`  <prop name="ID" type="N"/>\n  <prop name="NOMBRE" type="N"/>\n  <prop name="ALTA" type="D"/>\n`));
    expect(await commitDeTurno(raiz, "xonecode: s1", "s1")).toMatchObject({ via: "commit" });

    expect(await modeloDelCambio(raiz, "s1", "Clientes.xne")).toEqual([
      {
        nombre: "Clientes",
        estado: "modificada",
        campos: [
          { cambio: "tipo", nombre: "NOMBRE", antes: "T", ahora: "N" },
          { cambio: "nuevo", nombre: "ALTA", ahora: "D" },
        ],
        referencias: [],
        eventos: [],
        nodos: [],
        conexiones: [],
      },
    ]);
  }, 30_000);

  it("con el proyecto en una SUBCARPETA del repo y sin sello: la foto de apertura, por su prefijo", async () => {
    const repoRaiz = repo();
    const raiz = join(repoRaiz, "apps", "demo");
    proyecto(raiz);
    execFileSync("git", ["add", "-A"], { cwd: repoRaiz });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: repoRaiz });
    expect(await marcarSesion(raiz, "s2")).toBe(true);
    writeFileSync(join(raiz, "Clientes.xne"), clientes(`  <prop name="ID" type="N"/>\n`));

    const cambios = await modeloDelCambio(raiz, "s2", "Clientes.xne");
    expect(cambios?.[0]?.campos).toEqual([{ cambio: "borrado", nombre: "NOMBRE", antes: "T" }]);
  }, 30_000);

  it("un fichero que no es `.xne` no tiene modelo: vacío, sin sacar nada de git", async () => {
    expect(await modeloDelCambio("/no/existe", "s1", "estilos.css")).toEqual([]);
  });

  it("sin «antes» que usar —una sesión sin marca— no afirma nada", async () => {
    const raiz = repo();
    proyecto(raiz);
    expect(await modeloDelCambio(raiz, "nunca-marcada", "Clientes.xne")).toBeUndefined();
  }, 30_000);
});
