import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planesDelProyecto, TOPE_DE_FICHERO_DE_PLAN } from "./planesEnDisco.js";

function proyecto(): string {
  return mkdtempSync(join(tmpdir(), "xonecode-planes-"));
}
function plan(raiz: string, nombre: string, ficheros: Record<string, string>): void {
  const dir = join(raiz, ".xonecode", "planes", nombre);
  mkdirSync(dir, { recursive: true });
  for (const [f, t] of Object.entries(ficheros)) writeFileSync(join(dir, f), t);
}

describe("planesDelProyecto", () => {
  it("sin carpeta de planes, ninguno", () => {
    expect(planesDelProyecto(proyecto())).toEqual([]);
  });

  it("lee sus ficheros, las tareas del TASKS.md y el PLAN.md; un plan a medias también sale", () => {
    const raiz = proyecto();
    plan(raiz, "visitas", { "PLAN.md": "# Visitas\n", "TASKS.md": "### 01 — Tabla\n**Bloqueada por:** Ninguna\n- [ ] a\n" });
    plan(raiz, "solo-plan", { "PLAN.md": "# Solo\n" });
    const planes = planesDelProyecto(raiz);
    const visitas = planes.find((p) => p.nombre === "visitas")!;
    expect(visitas.ficheros.sort()).toEqual(["PLAN.md", "TASKS.md"]);
    expect(visitas.tareas!.tareas.map((t) => t.numero)).toEqual(["01"]);
    expect(visitas.plan).toEqual({ texto: "# Visitas\n", recortado: false });
    const solo = planes.find((p) => p.nombre === "solo-plan")!;
    expect(solo.tareas).toBeUndefined();
  });

  it("no lista un nombre que no es slug, ni sigue un enlace", () => {
    const raiz = proyecto();
    plan(raiz, "Con Espacios", { "PLAN.md": "x" });
    const fuera = mkdtempSync(join(tmpdir(), "xonecode-fuera-"));
    writeFileSync(join(fuera, "PLAN.md"), "secreto");
    symlinkSync(fuera, join(raiz, ".xonecode", "planes", "enlazado"));
    plan(raiz, "bueno", {});
    symlinkSync(join(fuera, "PLAN.md"), join(raiz, ".xonecode", "planes", "bueno", "PLAN.md"));
    const planes = planesDelProyecto(raiz);
    expect(planes.map((p) => p.nombre)).toEqual(["bueno"]);
    expect(planes[0]!.ficheros).toEqual([]);
    expect(JSON.stringify(planes)).not.toContain("secreto");
  });

  it("un PLAN.md enorme se recorta y lo dice", () => {
    const raiz = proyecto();
    plan(raiz, "grande", { "PLAN.md": "x".repeat(TOPE_DE_FICHERO_DE_PLAN + 10) });
    expect(planesDelProyecto(raiz)[0]!.plan!.recortado).toBe(true);
  });
});
