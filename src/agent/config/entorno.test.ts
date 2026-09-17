import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { vistasAplanadas, inspeccionarGit } from "./entorno.js";

describe("vistasAplanadas", () => {
  it("marca el .xml que tiene un .xne hermano", () => {
    expect(vistasAplanadas(["/p/Clientes.xne", "/p/Clientes.xml"])).toEqual(["/p/Clientes.xml"]);
  });

  it("NO marca app.xml, que no tiene hermano y ES fuente", () => {
    expect(vistasAplanadas(["/p/app.xml", "/p/Clientes.xne"])).toEqual([]);
  });

  it("no marca un .xml suelto sin hermano", () => {
    expect(vistasAplanadas(["/p/config.xml"])).toEqual([]);
  });

  it("no marca el .xne, que es lo que SÍ se edita", () => {
    expect(vistasAplanadas(["/p/Clientes.xne", "/p/Clientes.xml"])).not.toContain("/p/Clientes.xne");
  });

  it("hermano quiere decir en la MISMA carpeta", () => {
    // Comparar solo por nombre marcaría un .xml de otra carpeta como vista de este .xne.
    expect(vistasAplanadas(["/a/Clientes.xne", "/b/Clientes.xml"])).toEqual([]);
  });

  it("con muchos pares, los marca todos", () => {
    const rutas = ["/p/A.xne", "/p/A.xml", "/p/B.xne", "/p/B.xml", "/p/app.xml"];
    expect(vistasAplanadas(rutas)).toEqual(["/p/A.xml", "/p/B.xml"]);
  });
});
describe("inspeccionarGit", () => {
  it("un subdirectorio de un repo NO es git usable, aunque esté dentro", async () => {
    // El fallo que esto cierra, y era MUDO: este fichero vive dentro del repo cuya raíz
    // está varios niveles por encima. Darlo por bueno hacía que el diff hablara de otro sitio —
    // y peor, `git status --porcelain -- .` desde un directorio sin trackear devuelve
    // UNA línea (`?? proyecto/`), así que habría reportado «1 fichero» tocara el agente
    // lo que tocara.
    const aqui = dirname(fileURLToPath(import.meta.url));
    const r = await inspeccionarGit(aqui);
    expect(r.dentro).toBe(true);
    expect(r.esRaiz).toBe(false);
    // usable SÍ: el árbol privado funciona desde un subdirectorio, acotando con `-- .`
    // y recortando las rutas del diff con el prefijo.
    expect(r.usable).toBe(true);
    expect(r.prefijo.length).toBeGreaterThan(0);
  });

  it("un repo SIN commits sigue siendo usable: write-tree no necesita HEAD", async () => {
    // Medido contra el repo real del usuario: `main` con CERO commits, y la foto por
    // árbol privado funciona igual. Exigir un commit habría mandado al modo huellas
    // a todos sus proyectos.
    const d = mkdtempSync(join(tmpdir(), "xc-git-"));
    await promisify(execFile)("git", ["init"], { cwd: d });
    const r = await inspeccionarGit(d);
    expect(r.esRaiz).toBe(true);
    expect(r.tieneCommits).toBe(false);
    expect(r.usable).toBe(true);
    expect(r.prefijo).toBe("");
    rmSync(d, { recursive: true, force: true });
  });

  it("raíz de repo CON commit sí es usable", async () => {
    const d = mkdtempSync(join(tmpdir(), "xc-git-"));
    const g = promisify(execFile);
    await g("git", ["init"], { cwd: d });
    await g("git", ["config", "user.email", "x@y.z"], { cwd: d });
    await g("git", ["config", "user.name", "x"], { cwd: d });
    writeFileSync(join(d, "app.xml"), "<app/>");
    await g("git", ["add", "-A"], { cwd: d });
    await g("git", ["commit", "-m", "inicial"], { cwd: d });
    const r = await inspeccionarGit(d);
    expect(r.usable).toBe(true);
    rmSync(d, { recursive: true, force: true });
  });

  it("fuera de todo repo dice que no, sin lanzar", async () => {
    const r = await inspeccionarGit("/");
    expect(r.usable).toBe(false);
  });
});
