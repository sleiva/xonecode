import { describe, expect, it } from "vitest";
import { dependenciasDe, estadoReconocido, leerTareasDelPlan, marcarCriterios, progresoDeTarea } from "./tareasDelPlan.js";

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

describe("por dónde va una tarea", () => {
  it("el estado se reconoce por cómo EMPIEZA, no por la prosa de detrás", () => {
    expect(estadoReconocido("implementada — sin verificar en la app")).toBe("implementada");
    expect(estadoReconocido("implementada con la **VARIANTE A**")).toBe("implementada");
    expect(estadoReconocido("pendiente — **NO hecha** (requiere emulador)")).toBe("pendiente");
    expect(estadoReconocido("En curso")).toBe("en curso");
    expect(estadoReconocido("**hecha**")).toBe("hecha");
    expect(estadoReconocido("bloqueada")).toBeUndefined();
    expect(estadoReconocido(undefined)).toBeUndefined();
  });

  it("finalizada es TODO comprobado; implementada sin comprobar no lo es", () => {
    expect(progresoDeTarea("implementada", { hechos: 4, total: 4 })).toBe("finalizada");
    expect(progresoDeTarea("hecha", { hechos: 3, total: 4 })).toBe("implementada");
    expect(progresoDeTarea("hecha", { hechos: 0, total: 0 })).toBe("finalizada");
    expect(progresoDeTarea("implementada — sin verificar", { hechos: 0, total: 4 })).toBe("implementada");
    expect(progresoDeTarea("en curso", { hechos: 1, total: 4 })).toBe("en-curso");
    expect(progresoDeTarea("bloqueada", { hechos: 0, total: 2 })).toBe("pendiente");
    expect(progresoDeTarea(undefined, { hechos: 0, total: 0 })).toBe("pendiente");
  });

  it("viaja con cada tarea leída", () => {
    const plan = leerTareasDelPlan(TASKS);
    expect(plan.tareas.map((t) => t.progreso)).toEqual(["implementada", "pendiente", "pendiente"]);
  });
});

describe("marcarCriterios", () => {
  const texto = `# T

## T1 — Uno

**Estado:** implementada

- [ ] abre
- [x] cierra
- [ ] vuelve

## T2 — Dos

- [ ] otro
`;

  it("marca SOLO las casillas pedidas de ESA tarea, y dice cuáles ya estaban", () => {
    const r = marcarCriterios(texto, "T1", [1, 2]);
    if ("error" in r) throw new Error(r.error);
    expect(r.marcados).toEqual([1]);
    expect(r.yaEstaban).toEqual([2]);
    expect(r.texto).toContain("- [x] abre");
    expect(r.texto).toContain("- [ ] vuelve");
    expect(r.texto).toContain("- [ ] otro");
    // Nada más del fichero cambia.
    expect(r.texto.replace("- [x] abre", "- [ ] abre")).toBe(texto);
  });

  it("una tarea que no existe o un número fuera de rango se rechaza ENTERO", () => {
    expect(marcarCriterios(texto, "T9", [1])).toEqual({ error: expect.stringContaining("T9") });
    const r = marcarCriterios(texto, "T1", [1, 4]);
    expect(r).toEqual({ error: expect.stringContaining("no existe el 4") });
  });

  it("también en la forma del formato («### 01 — …»)", () => {
    const r = marcarCriterios(TASKS, "02", [2]);
    if ("error" in r) throw new Error(r.error);
    expect(r.texto).toContain("- [x] edición");
    expect(r.texto).toContain("- [ ] alta");
  });
});
