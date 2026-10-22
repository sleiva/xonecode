import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planDeLaTarea } from "./planesDelProyecto.js";

/** Qué plan es el de una tarea (petición suya, 21-10-2026): el que cita su encargo, o el que escribió mientras trabajaba. */
describe("planDeLaTarea", () => {
  const raices: string[] = [];
  afterEach(() => raices.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true })));
  const proyecto = (planes: Record<string, number>): string => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-planes-"));
    raices.push(raiz);
    for (const [nombre, ms] of Object.entries(planes)) {
      const dir = join(raiz, ".xonecode", "planes", nombre);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "TASKS.md"), `# ${nombre}\n`);
      utimesSync(join(dir, "TASKS.md"), ms / 1000, ms / 1000);
    }
    return raiz;
  };

  it("el que CITA su encargo, aunque sea viejo", () => {
    const raiz = proyecto({ viejo: 1_000_000, nuevo: 9_000_000 });
    expect(planDeLaTarea(raiz, "sigue /planes/viejo/ tarea T2", 5_000_000)?.carpeta).toBe("/planes/viejo/");
  });

  it("sin cita, el TASKS.md tocado desde que empezó la pasada, el más reciente; nada si ninguno", () => {
    const raiz = proyecto({ antes: 1_000_000, durante: 6_000_000, despues: 7_000_000 });
    expect(planDeLaTarea(raiz, "rediseña la lista", 5_000_000)?.carpeta).toBe("/planes/despues/");
    expect(planDeLaTarea(raiz, "rediseña la lista", 8_000_000)).toBeUndefined();
    expect(planDeLaTarea(raiz, "rediseña la lista", undefined)).toBeUndefined();
  });

  it("con dos planes citados no se adivina", () => {
    const raiz = proyecto({ a: 6_000_000, b: 6_000_000 });
    expect(planDeLaTarea(raiz, "/planes/a/ y /planes/b/", 5_000_000)).toBeUndefined();
  });
});
