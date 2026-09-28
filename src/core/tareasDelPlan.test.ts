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

describe("la forma «## T1 — Título» (fuera del formato, vista en un plan real)", () => {
  const plan = leerTareasDelPlan(`# TASKS — Buscador

## T1 — El drawer abre una pantalla

**Estado:** implementada — sin verificar en la app
**Bloqueada por:** nada

- [ ] se abre

## T2 — Los hoteles se listan

**Bloqueada por:** T1 · resuelta la **PENDIENTE 1** del PLAN

## T4 — Detalle

**Bloqueada por:** T2 (resuelta la **PENDIENTE 3**: misma pantalla)

## T6 — Fuera de alcance

**Bloqueada por:** PENDIENTE 5 del PLAN

## T7 — Verificación final

**Bloqueada por:** T3, T4, T5

## Notas de ejecución (agente)

texto
`);

  it("reconoce las tareas y conserva el número TAL CUAL", () => {
    expect(plan.tareas.map((t) => [t.numero, t.titulo])).toEqual([
      ["T1", "El drawer abre una pantalla"],
      ["T2", "Los hoteles se listan"],
      ["T4", "Detalle"],
      ["T6", "Fuera de alcance"],
      ["T7", "Verificación final"],
    ]);
    expect(plan.tareas[0]!.estado).toBe("implementada — sin verificar en la app");
  });

  it("«nada» no nombra tareas, y un número sin prefijo (PENDIENTE 3, PENDIENTE 5) no es una dependencia", () => {
    expect(plan.tareas.map((t) => t.bloqueadaPor)).toEqual([[], ["T1"], ["T2"], [], ["T3", "T4", "T5"]]);
  });

  it("una sección de nivel 2 sin número sigue cerrando la tarea", () => {
    expect(plan.tareas[4]!.cuerpo).not.toContain("Notas de ejecución");
  });
});

describe("dependenciasDe", () => {
  it("números y rangos; lo demás no cuenta", () => {
    expect(dependenciasDe("02, 04")).toEqual(["02", "04"]);
    expect(dependenciasDe("04, 05 (puede empezar en paralelo)")).toEqual(["04", "05"]);
    expect(dependenciasDe("02-08")).toEqual(["02", "03", "04", "05", "06", "07", "08"]);
    expect(dependenciasDe("Ninguna — puede empezar ya")).toEqual([]);
    expect(dependenciasDe("T1–T3")).toEqual(["T1", "T2", "T3"]);
  });
});
