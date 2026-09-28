import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { anotarActo, crearSesion } from "./sesiones.js";
import { marcarSesion } from "../../agent/sesiones/sesionGit.js";
import { commitDeTurno } from "../../agent/sesiones/gitSync.js";
import { datosDeCierre } from "./datosDeCierre.js";

/** Cada test se limpia solo, aunque falle a medio camino. */
const raices: string[] = [];
afterEach(() => {
  for (const raiz of raices.splice(0)) rmSync(raiz, { recursive: true, force: true });
});

/** Un repo de verdad y una sesión de verdad: molde de `sesionGit.test.ts`. */
function repo(): string {
  const raiz = mkdtempSync(join(tmpdir(), "xonecode-cierre-"));
  raices.push(raiz);
  execFileSync("git", ["init", "-q", "."], { cwd: raiz });
  execFileSync("git", ["config", "user.email", "x@y.z"], { cwd: raiz });
  execFileSync("git", ["config", "user.name", "x"], { cwd: raiz });
  return raiz;
}

describe("datosDeCierre", () => {
  it("reúne ficheros, commits, el último veredicto y la última respuesta desde el disco real", async () => {
    const raiz = repo();
    writeFileSync(join(raiz, "app.xne"), "<app/>");
    execFileSync("git", ["add", "-A"], { cwd: raiz });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: raiz });

    const id = crearSesion(raiz);
    expect(await marcarSesion(raiz, id)).toBe(true);

    anotarActo(raiz, id, { tipo: "usuario", texto: "añade una colección de clientes" });
    mkdirSync(join(raiz, "colecciones"));
    writeFileSync(join(raiz, "colecciones", "Clientes.xne"), "<coleccion/>");
    const hecho = await commitDeTurno(raiz, `xonecode: ${id}`, id);
    expect(hecho.via).toBe("commit");

    anotarActo(raiz, id, { tipo: "verificacion", verde: false, errores: 2, avisos: 1 });
    anotarActo(raiz, id, { tipo: "asistente", texto: "primera respuesta" });
    anotarActo(raiz, id, { tipo: "verificacion", verde: true, errores: 0, avisos: 0 });
    anotarActo(raiz, id, { tipo: "asistente", texto: "segunda y última respuesta" });

    const datos = await datosDeCierre(raiz, id);

    expect(datos.ficheros).toEqual([{ ruta: "colecciones/Clientes.xne", clase: "nuevo" }]);
    expect(datos.commits).toHaveLength(1);
    expect(datos.commits[0]).toMatch(/^[0-9a-f]{40}$/);
    // Con un commit sellado, la atribución es «git»: la lista SÍ es de esta sesión.
    expect(datos.atribucion).toBe("git");
    // El ÚLTIMO veredicto, no el primero.
    expect(datos.veredicto).toEqual({ verde: true, errores: 0, avisos: 0 });
    // La ÚLTIMA respuesta del asistente.
    expect(datos.resumen).toBe("segunda y última respuesta");
    // Nadie compone el plan todavía.
    expect(datos.plan).toBeUndefined();
  });

  it("sin ningún acto de verificación ni de asistente, ninguno de los dos campos sale", async () => {
    const raiz = repo();
    writeFileSync(join(raiz, "app.xne"), "<app/>");
    execFileSync("git", ["add", "-A"], { cwd: raiz });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: raiz });

    const id = crearSesion(raiz);
    expect(await marcarSesion(raiz, id)).toBe(true);
    anotarActo(raiz, id, { tipo: "usuario", texto: "hola" });

    const datos = await datosDeCierre(raiz, id);
    expect(datos.veredicto).toBeUndefined();
    expect(datos.resumen).toBeUndefined();
    expect(datos.ficheros).toEqual([]);
    expect(datos.commits).toEqual([]);
    // Marcada pero sin ningún commit sellado: el respaldo, honesto sobre lo que no es.
    expect(datos.atribucion).toBe("desde-apertura");
  });

  it("sin marcar la sesión, la atribución es «sin-marca» y no hay ficheros que enseñar", async () => {
    const raiz = repo();
    writeFileSync(join(raiz, "app.xne"), "<app/>");
    execFileSync("git", ["add", "-A"], { cwd: raiz });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: raiz });

    // Sesión creada pero NUNCA marcada (`marcarSesion`): no hay ref que mirar, así que
    // `cambiosDeSesion` no tiene con qué medir nada.
    const id = crearSesion(raiz);

    const datos = await datosDeCierre(raiz, id);
    expect(datos.atribucion).toBe("sin-marca");
    expect(datos.ficheros).toEqual([]);
    expect(datos.commits).toEqual([]);
  });
});
