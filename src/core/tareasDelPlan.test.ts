import { describe, expect, it } from "vitest";
import { dependenciasDe, leerTareasDelPlan } from "./tareasDelPlan.js";

const TASKS = `# Plan de ejecución — Visitas

**Spec de origen:** PLAN.md

## Tareas

### 01 — Tabla \`Visitas\`

**Estado:** hecha
**Qué entrega:** la tabla existe.
**Bloqueada por:** Ninguna en el código — pero **requiere ejecución externa** (ver \`xone-review/SKILL.md:95\`).

- [x] describe-table la enseña
- [ ] los datos se conservan

### 02 — Colección y ficha

**Estado:** pendiente
**Bloqueada por:** 01

- [ ] alta
- [ ] edición

### 08 — Validación

**Bloqueada por:** 01–07

- [ ] xone-review en verde

## Orden de ejecución

1. 01 — Tabla
`;

describe("leerTareasDelPlan", () => {
  const plan = leerTareasDelPlan(TASKS);

  it("una tarea por sección, con su estado TAL CUAL y los criterios hechos de los totales", () => {
    expect(plan.titulo).toBe("Plan de ejecución — Visitas");
    expect(plan.tareas.map((t) => [t.numero, t.titulo, t.estado, t.criterios])).toEqual([
      ["01", "Tabla `Visitas`", "hecha", { hechos: 1, total: 2 }],
      ["02", "Colección y ficha", "pendiente", { hechos: 0, total: 2 }],
      ["08", "Validación", undefined, { hechos: 0, total: 1 }],
    ]);
  });

  it("«Ninguna …» no nombra tareas aunque su prosa lleve números; la prosa se conserva", () => {
    const [t1, t2, t8] = plan.tareas;
    expect(t1!.bloqueadaPor).toEqual([]);
    expect(t1!.bloqueadaPorTexto).toContain("requiere ejecución externa");
    expect(t2!.bloqueadaPor).toEqual(["01"]);
    // El rango, expandido con el ancho del primero.
    expect(t8!.bloqueadaPor).toEqual(["01", "02", "03", "04", "05", "06", "07"]);
  });

  it("otra sección de nivel 2 cierra la tarea: «Orden de ejecución» no entra en su ficha", () => {
    expect(plan.tareas[2]!.cuerpo).not.toContain("Orden de ejecución");
    expect(plan.tareas[1]!.cuerpo).toContain("- [ ] alta");
  });

  it("un fichero sin secciones con forma de tarea no inventa ninguna", () => {
    expect(leerTareasDelPlan("# Algo\n\ntexto libre\n")).toEqual({ titulo: "Algo", tareas: [] });
  });
});

describe("dependenciasDe", () => {
  it("números y rangos; lo demás no cuenta", () => {
    expect(dependenciasDe("02, 04")).toEqual(["02", "04"]);
    expect(dependenciasDe("04, 05 (puede empezar en paralelo)")).toEqual(["04", "05"]);
    expect(dependenciasDe("02-08")).toEqual(["02", "03", "04", "05", "06", "07", "08"]);
    expect(dependenciasDe("Ninguna — puede empezar ya")).toEqual([]);
  });
});
