import { describe, expect, it } from "vitest";
import { dependenciasDe, estadoReconocido, leerTareasDelPlan, marcarCriterios, progresoDeTarea, motivoDeTasksInaceptable } from "./tareasDelPlan.js";

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
    expect(progresoDeTarea("en curso", { hechos: 0, total: 4 })).toBe("en-curso");
  });

  it("con ALGUNA casilla marcada va a medias, aunque su estado no lo diga (o no lo tenga)", () => {
    expect(progresoDeTarea(undefined, { hechos: 2, total: 3 })).toBe("implementada");
    expect(progresoDeTarea("pendiente", { hechos: 1, total: 4 })).toBe("implementada");
    expect(progresoDeTarea("en curso", { hechos: 1, total: 4 })).toBe("implementada");
    expect(progresoDeTarea(undefined, { hechos: 0, total: 3 })).toBe("pendiente");
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

describe("otros formatos de cabecera de tarea", () => {
  const VINETAS = [
    "# TASKS.md — Plan",
    "",
    "## Prefactoring (0)",
    "- **T0** — Nada que refactorizar.",
    "",
    "## Cortes verticales",
    "- **T1 — Esqueleto alcanzable (tracer bullet).** Bloqueada por: ninguna.",
    "  **Estado:** implementada — `/Calculadora.xne` creado.",
    "  - Crear la coll.",
    "",
    "- **T2 — Estilo base oscuro.** Bloqueada por: T1.",
    "  **Estado:** pendiente",
    "  - [ ] Pantalla oscura",
    "  - [x] Cabecera",
    "",
    "## Hitos",
    "- Hito 1: la coll abre desde el drawer.",
  ].join("\n");

  it("una tarea como viñeta en negrita se reconoce, con su estado y su dependencia en línea", () => {
    const { tareas } = leerTareasDelPlan(VINETAS);
    expect(tareas.map((t) => t.numero)).toEqual(["T1", "T2"]);
    expect(tareas[0]).toMatchObject({ titulo: "Esqueleto alcanzable (tracer bullet)", progreso: "implementada", bloqueadaPor: [] });
    expect(tareas[1]).toMatchObject({ bloqueadaPor: ["T1"], criterios: { hechos: 1, total: 2 } });
  });

  it("T0 —la declaración de que no hay tarea— no cuenta", () => {
    expect(leerTareasDelPlan(VINETAS).tareas.some((t) => t.numero === "T0")).toBe(false);
  });

  it("`## Tarea 1: Título` y `#### T2. Título` también; `## 2. Orden` no", () => {
    const { tareas } = leerTareasDelPlan("## Tarea 1: Uno\n**Estado:** hecha\n\n#### T2. Dos\n\n## 3. Orden de ejecución\ntexto");
    expect(tareas.map((t) => [t.numero, t.titulo])).toEqual([["1", "Uno"], ["T2", "Dos"]]);
  });

  it("marcar criterios funciona en la forma de viñeta y no se sale a la tarea de al lado", () => {
    const r = marcarCriterios(VINETAS, "T2", [1]);
    expect("error" in r).toBe(false);
    if (!("error" in r)) expect(r.texto).toContain("- [x] Pantalla oscura");
    expect("error" in marcarCriterios(VINETAS, "T1", [1])).toBe(true);
  });
});

describe("un TASKS.md se escribe con casillas, o no se escribe", () => {
  it("con casillas en cada tarea vale", () => {
    expect(motivoDeTasksInaceptable("# P\n\n### 01 — Uno\n- [ ] a\n\n### 02 — Dos\n- [x] b\n")).toBeUndefined();
  });
  it("una tarea con los criterios como viñetas sueltas lo tumba, y dice cuál y el formato", () => {
    const m = motivoDeTasksInaceptable("### 01 — Uno\n- [ ] a\n\n### 02 — Dos\n- **Criterios**:\n  - el display dice 14\n");
    expect(m).toContain("las tareas 02 no traen");
    expect(m).toContain("`- [ ] criterio comprobable`");
  });
  it("sin ninguna tarea reconocible también, y sin ninguna casilla lo dice de todas", () => {
    expect(motivoDeTasksInaceptable("# Plan\n\nhaz la calculadora")).toContain("No reconozco ninguna tarea");
    expect(motivoDeTasksInaceptable("## T1 — A\n- a\n## T2 — B\n- b\n")).toContain("ninguna tarea trae");
  });
});
