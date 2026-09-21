import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, existsSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planesDelProyecto, publicarPlan } from "./publicarPlan.js";
import { CARPETA_DE_PLANES } from "../core/planes.js";

/** Un proyecto con un plan dentro, en un temporal. */
function conPlan(nombre: string, ficheros: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), "publicar-plan-"));
  const carpeta = join(raiz, CARPETA_DE_PLANES, nombre);
  mkdirSync(carpeta, { recursive: true });
  for (const [rel, cuerpo] of Object.entries(ficheros)) {
    mkdirSync(join(carpeta, rel, ".."), { recursive: true });
    writeFileSync(join(carpeta, rel), cuerpo, "utf8");
  }
  return raiz;
}

describe("publicar un plan", () => {
  it("copia los ficheros del plan a `doc/planes/<nombre>`, que SÍ es del proyecto", () => {
    const raiz = conPlan("login", {
      "PLAN.md": "# spec",
      "TASKS.md": "- [ ] una",
      "adr/0001-sqlite.md": "decidido",
    });

    const hecho = publicarPlan({ raiz, nombre: "login" });

    expect(hecho).toMatchObject({ ruta: "doc/planes/login" });
    expect("ficheros" in hecho && hecho.ficheros.sort()).toEqual(
      ["PLAN.md", "TASKS.md", join("adr", "0001-sqlite.md")].sort()
    );
    expect(readFileSync(join(raiz, "doc/planes/login/PLAN.md"), "utf8")).toBe("# spec");
    // Y la subcarpeta se recrea, no se aplana.
    expect(readFileSync(join(raiz, "doc/planes/login/adr/0001-sqlite.md"), "utf8")).toBe("decidido");
  });

  /**
   * Lo que se decidió: trabajar el plan es barato porque no es del proyecto, y compartirlo
   * es un acto aparte. Si publicar moviera en vez de copiar, el siguiente turno se
   * encontraría sin plan donde lo escribe.
   */
  it("el original se QUEDA donde se trabaja", () => {
    const raiz = conPlan("login", { "PLAN.md": "# spec" });

    publicarPlan({ raiz, nombre: "login" });

    expect(existsSync(join(raiz, CARPETA_DE_PLANES, "login", "PLAN.md"))).toBe(true);
  });

  it("publicar dos veces REESCRIBE, que es lo que se espera de publicar una versión nueva", () => {
    const raiz = conPlan("login", { "PLAN.md": "v1" });
    publicarPlan({ raiz, nombre: "login" });
    writeFileSync(join(raiz, CARPETA_DE_PLANES, "login", "PLAN.md"), "v2", "utf8");

    publicarPlan({ raiz, nombre: "login" });

    expect(readFileSync(join(raiz, "doc/planes/login/PLAN.md"), "utf8")).toBe("v2");
  });

  describe("lo que NO se publica", () => {
    it("un nombre que no es un slug: se DEVUELVE el motivo, no se lanza", () => {
      const raiz = conPlan("login", { "PLAN.md": "x" });

      for (const malo of ["../fuera", "con/barra", "MAYUS"]) {
        const r = publicarPlan({ raiz, nombre: malo });
        expect("error" in r, malo).toBe(true);
      }
      // Y nada se ha escrito por el camino.
      expect(existsSync(join(raiz, "doc"))).toBe(false);
    });

    it("un plan que no existe lo dice, y dice dónde mirar", () => {
      const raiz = conPlan("login", { "PLAN.md": "x" });

      const r = publicarPlan({ raiz, nombre: "otro" });

      expect("error" in r && r.error).toMatch(/no hay ningún plan/);
      expect("error" in r && r.error).toMatch(/\/plan/);
    });

    it("una carpeta vacía: publicar cero ficheros se leería como que se publicó", () => {
      const raiz = conPlan("vacio", {});

      expect(publicarPlan({ raiz, nombre: "vacio" })).toMatchObject({ error: expect.stringMatching(/vacío/) });
    });

    /**
     * La guarda que no es de forma: un enlace dentro de la carpeta del plan apuntando fuera
     * copiaría al proyecto lo que hubiera al otro lado —y de ahí a git y a CloudStudio—. El
     * `realpath` del origen no lo ve: lo que se recorre son sus hijos.
     */
    it("un ENLACE SIMBÓLICO no se sigue, ni a fichero ni a carpeta", () => {
      const raiz = conPlan("login", { "PLAN.md": "# spec" });
      const secreto = join(raiz, "secreto.txt");
      writeFileSync(secreto, "credenciales", "utf8");
      symlinkSync(secreto, join(raiz, CARPETA_DE_PLANES, "login", "atajo.txt"));
      symlinkSync(raiz, join(raiz, CARPETA_DE_PLANES, "login", "todo"));

      const hecho = publicarPlan({ raiz, nombre: "login" });

      expect("ficheros" in hecho && hecho.ficheros).toEqual(["PLAN.md"]);
      expect(existsSync(join(raiz, "doc/planes/login/atajo.txt"))).toBe(false);
      expect(existsSync(join(raiz, "doc/planes/login/todo"))).toBe(false);
    });
  });
});

describe("qué planes hay", () => {
  it("los lista por nombre, y ordenados", () => {
    const raiz = conPlan("zeta", { "PLAN.md": "x" });
    mkdirSync(join(raiz, CARPETA_DE_PLANES, "alfa"), { recursive: true });

    expect(planesDelProyecto(raiz)).toEqual(["alfa", "zeta"]);
  });

  it("sin carpeta no es un error: es que nadie ha planificado", () => {
    expect(planesDelProyecto(mkdtempSync(join(tmpdir(), "sin-planes-")))).toEqual([]);
  });
});
