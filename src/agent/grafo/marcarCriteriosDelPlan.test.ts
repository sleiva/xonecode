import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearMarcarCriteriosDelPlan } from "./marcarCriteriosDelPlan.js";

const TASKS = `# T

## T1 — Uno

**Estado:** implementada

- [ ] abre
- [ ] vuelve

## T2 — Dos

- [ ] otro
`;

function proyectoConPlan(): { raiz: string; fichero: string } {
  const raiz = mkdtempSync(join(tmpdir(), "marcar-plan-"));
  const dir = join(raiz, ".xonecode", "planes", "hoteles");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "TASKS.md"), TASKS);
  return { raiz, fichero: join(dir, "TASKS.md") };
}
const invocar = (raiz: string, args: { plan: string; tarea: string; criterios: number[] }) =>
  crearMarcarCriteriosDelPlan({ raiz }).invoke(args) as Promise<string>;

describe("marcar_criterios_del_plan, contra el disco", () => {
  it("marca las casillas pedidas de ESA tarea y lo dice", async () => {
    const { raiz, fichero } = proyectoConPlan();
    const r = await invocar(raiz, { plan: "hoteles", tarea: "T1", criterios: [2] });
    expect(r).toMatch(/tarea T1: marcados 2/);
    const texto = readFileSync(fichero, "utf8");
    expect(texto).toContain("- [ ] abre");
    expect(texto).toContain("- [x] vuelve");
    expect(texto).toContain("- [ ] otro");
  });

  it("acepta la ruta virtual del plan como nombre", async () => {
    const { raiz, fichero } = proyectoConPlan();
    await invocar(raiz, { plan: "/planes/hoteles/", tarea: "T2", criterios: [1] });
    expect(readFileSync(fichero, "utf8")).toContain("- [x] otro");
  });

  it("un nombre que no es un slug no sale de la carpeta de planes", async () => {
    const { raiz } = proyectoConPlan();
    writeFileSync(join(raiz, "TASKS.md"), TASKS);
    const r = await invocar(raiz, { plan: "../..", tarea: "T1", criterios: [1] });
    expect(r).toMatch(/no es el nombre de un plan/);
    expect(readFileSync(join(raiz, "TASKS.md"), "utf8")).toBe(TASKS);
  });

  it("un TASKS.md que es un ENLACE no se toca", async () => {
    const { raiz } = proyectoConPlan();
    const fuera = join(mkdtempSync(join(tmpdir(), "marcar-fuera-")), "TASKS.md");
    writeFileSync(fuera, TASKS);
    const dir = join(raiz, ".xonecode", "planes", "enlazado");
    mkdirSync(dir);
    symlinkSync(fuera, join(dir, "TASKS.md"));
    const r = await invocar(raiz, { plan: "enlazado", tarea: "T1", criterios: [1] });
    expect(r).toMatch(/no tiene un TASKS\.md/);
    expect(readFileSync(fuera, "utf8")).toBe(TASKS);
  });

  it("sin plan, o con un criterio que no existe, no escribe nada", async () => {
    const { raiz, fichero } = proyectoConPlan();
    expect(await invocar(raiz, { plan: "otro", tarea: "T1", criterios: [1] })).toMatch(/No existe el plan/);
    expect(await invocar(raiz, { plan: "hoteles", tarea: "T1", criterios: [3] })).toMatch(/no existe el 3/);
    expect(readFileSync(fichero, "utf8")).toBe(TASKS);
  });
});
