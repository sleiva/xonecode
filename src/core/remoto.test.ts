import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENTRADA_DEL_CONTRATO, type ContratoDelPanorama } from "./__oro__/panoramaContrato.js";
import { CARACTERES_DE_FEEDBACK, componerPanorama } from "./panorama.js";
import { ajustarATope, filtrarSalida, TOPE_DE_SALIDA_BYTES, validarEntradaDelMovil } from "./remoto.js";

describe("lo que sale hacia el móvil", () => {
  it("el chat, la aprobación y el turno pasan tal cual", () => {
    for (const m of [
      { clase: "acto", acto: { tipo: "usuario", texto: "hola" } },
      { clase: "sustitucion", acto: { tipo: "asistente", texto: "h" } },
      { clase: "reemision", actos: [] },
      { clase: "aprobacion", pendientes: [], ficheros: {}, diffs: {} },
      { clase: "turno", activo: true, detenible: true },
    ]) {
      expect(filtrarSalida(m)).toEqual(m);
    }
  });

  it("una pregunta de texto sale; una DECISIÓN (la subida con casillas) no", () => {
    expect(filtrarSalida({ clase: "pregunta", texto: "¿Seguro?" })).toEqual({ clase: "pregunta", texto: "¿Seguro?" });
    expect(filtrarSalida({ clase: "pregunta", texto: "Subir", decision: { lineas: [] } })).toBeUndefined();
  });

  it("el alta sale TRANSFORMADA en remoto.estado, sin entornos ni rutas", () => {
    const alta = {
      clase: "alta",
      pasos: [],
      entornos: [{ id: "w", nombre: "W", url: "https://x" }],
      proyectoActivo: "p1",
      sesionActiva: "s2",
      proyectos: [{ id: "p1", nombre: "AppDemo", sesiones: [{ id: "s1", titulo: "Vieja" }, { id: "s2", titulo: "Hola" }] }],
    };
    expect(filtrarSalida(alta)).toEqual({ clase: "remoto.estado", proyecto: "AppDemo", sesion: "Hola" });
    expect(filtrarSalida({ clase: "alta", proyectos: [] })).toEqual({ clase: "remoto.estado" });
  });

  it("lo demás no sale", () => {
    for (const clase of ["secreto", "fichero", "arbol", "modelos", "workspace", "remoto", "bienvenida", "inventada"]) {
      expect(filtrarSalida({ clase })).toBeUndefined();
    }
    expect(filtrarSalida("texto")).toBeUndefined();
  });
});

describe("lo que entra desde el móvil", () => {
  it("las cuatro formas permitidas, y solo sus campos", () => {
    expect(validarEntradaDelMovil({ clase: "prosa", texto: "hola", raiz: "/etc" })).toEqual({ clase: "prosa", texto: "hola" });
    expect(validarEntradaDelMovil({ clase: "prosa", texto: "para", detener: true })).toEqual({ clase: "prosa", texto: "para", detener: true });
    expect(validarEntradaDelMovil({ clase: "decision", decisiones: { a: "approve", b: "reject" } })).toEqual({ clase: "decision", decisiones: { a: "approve", b: "reject" } });
    expect(validarEntradaDelMovil({ clase: "respuesta", texto: "s" })).toEqual({ clase: "respuesta", texto: "s" });
    expect(validarEntradaDelMovil({ clase: "cancelar" })).toEqual({ clase: "cancelar" });
  });

  it("todo lo demás se rechaza", () => {
    for (const m of [
      { clase: "sesion", proyecto: "p" },
      { clase: "secreto", texto: "sk" },
      { clase: "prosa", texto: "x", adjuntos: ["a"] },
      { clase: "respuesta", texto: "s", seleccion: ["a"] },
      { clase: "decision", decisiones: { a: "s" } },
      { clase: "prosa", texto: 1 },
      null,
    ]) {
      expect(validarEntradaDelMovil(m)).toBeUndefined();
    }
  });
});

describe("el tope de tamaño de lo que sale", () => {
  const bytes = (m: unknown): number => new TextEncoder().encode(JSON.stringify(m)).length;

  it("el tope por omisión es 700_000", () => {
    expect(TOPE_DE_SALIDA_BYTES).toBe(700_000);
  });

  it("un mensaje pequeño pasa sin cambios", () => {
    const m = { clase: "turno", activo: true };
    expect(ajustarATope(m)).toBe(m);
  });

  it("una reemisión grande conserva solo los actos más recientes y cabe", () => {
    const actos = Array.from({ length: 50 }, (_, i) => ({ tipo: "usuario", texto: `acto-${i}-${"x".repeat(50)}` }));
    const m = { clase: "reemision", actos };
    const tope = 1000;
    expect(bytes(m)).toBeGreaterThan(tope);
    const r = ajustarATope(m, tope) as { clase: string; actos: unknown[] };
    expect(r.clase).toBe("reemision");
    expect(bytes(r)).toBeLessThanOrEqual(tope);
    expect(r.actos.length).toBeGreaterThan(0);
    expect(r.actos.length).toBeLessThan(actos.length);
    expect(r.actos).toEqual(actos.slice(actos.length - r.actos.length));
  });

  it("una reemisión que ni vacía cabe se descarta", () => {
    expect(ajustarATope({ clase: "reemision", actos: [{ a: 1 }] }, 5)).toBeUndefined();
  });

  it("cualquier otro mensaje que no cabe se descarta", () => {
    const m = { clase: "aprobacion", pendientes: [], ficheros: {}, diffs: { a: "x".repeat(500) } };
    expect(ajustarATope(m, 100)).toBeUndefined();
  });
});

describe("el panel en el móvil", () => {
  it("el panorama sale tal cual", () => {
    const m = { clase: "panorama", consolas: [], tareas: [], esperando: 0 };
    expect(filtrarSalida(m)).toEqual(m);
  });

  it("decision con consola: la reconstruye; vacía o no string se rechaza", () => {
    const d = { a: "approve" as const };
    expect(validarEntradaDelMovil({ clase: "decision", decisiones: d, consola: "c1", otro: 1 })).toEqual({ clase: "decision", decisiones: d, consola: "c1" });
    expect(validarEntradaDelMovil({ clase: "decision", decisiones: d })).toEqual({ clase: "decision", decisiones: d });
    expect(validarEntradaDelMovil({ clase: "decision", decisiones: d, consola: "" })).toBeUndefined();
    expect(validarEntradaDelMovil({ clase: "decision", decisiones: d, consola: 3 })).toBeUndefined();
  });

  it("feedback y continuar", () => {
    expect(validarEntradaDelMovil({ clase: "feedback", tarea: "t1", texto: "hazlo", x: 1 })).toEqual({ clase: "feedback", tarea: "t1", texto: "hazlo" });
    expect(validarEntradaDelMovil({ clase: "feedback", tarea: "t1", texto: "   " })).toBeUndefined();
    expect(validarEntradaDelMovil({ clase: "feedback", tarea: "", texto: "a" })).toBeUndefined();
    const largo = validarEntradaDelMovil({ clase: "feedback", tarea: "t1", texto: "a".repeat(CARACTERES_DE_FEEDBACK + 50) });
    expect(largo).toMatchObject({ clase: "feedback" });
    expect((largo as { texto: string }).texto).toHaveLength(CARACTERES_DE_FEEDBACK);
    expect(validarEntradaDelMovil({ clase: "continuar", tarea: "t1", y: 2 })).toEqual({ clase: "continuar", tarea: "t1" });
    expect(validarEntradaDelMovil({ clase: "continuar" })).toBeUndefined();
  });

  it("ajustarATope de un panorama: quita diffs, luego terminadas, y si no cabe nada", () => {
    const diff = Array.from({ length: 200 }, () => ({ tipo: "igual", texto: "x".repeat(50) }));
    const p = {
      clase: "panorama",
      consolas: [{ id: "a", aprobacion: { pendientes: [], ficheros: {}, diffs: { f: diff } } }],
      tareas: [
        { id: "t", estado: "terminada", titulo: "y".repeat(5000) },
        { id: "u", estado: "nuevo", titulo: "z" },
      ],
      esperando: 0,
    };
    const tam = (m: unknown) => JSON.stringify(m).length;
    const r1 = ajustarATope(p, tam(p) - 100) as typeof p & { consolas: { aprobacion: { diffs: object; recortada?: true } }[] };
    expect(r1.consolas[0].aprobacion.diffs).toEqual({});
    expect(r1.consolas[0].aprobacion.recortada).toBe(true);
    expect(r1.tareas).toHaveLength(2);
    const sinDiffs = ajustarATope(p, 1)!;
    expect(sinDiffs).toBeUndefined();
    const medio = tam({ ...p, consolas: [{ id: "a", aprobacion: { pendientes: [], ficheros: {}, diffs: {}, recortada: true } }] }) - 100;
    const r2 = ajustarATope(p, medio) as typeof p;
    expect(r2.tareas.map((t) => t.id)).toEqual(["u"]);
  });
});

describe("el contrato del panorama con la web móvil", () => {
  // Hay OTRA copia de este JSON en `xonecode-server/packages/remoto/test/panorama-contrato.json`, que el validador del
  // paquete debe aceptar: las dos se actualizan JUNTAS (se regenera con `componerPanorama → filtrarSalida → ajustarATope`
  // sobre `ENTRADA_DEL_CONTRATO`), o una de las dos suites se pone roja.
  const oro = JSON.parse(readFileSync(new URL("./__oro__/panorama-contrato.json", import.meta.url), "utf8")) as ContratoDelPanorama;

  it("lo que sale hoy es el oro: cuando cabe y cuando se quitan los diffs", () => {
    const salida = filtrarSalida(componerPanorama(ENTRADA_DEL_CONTRATO));
    expect(ajustarATope(salida)).toEqual(oro.cabe);
    expect(ajustarATope(salida, oro.tope)).toEqual(oro.sinDiffs);
  });
});

describe("una decisión del móvil con clave __proto__", () => {
  it("se salta, como en el paquete, y no contamina el objeto", () => {
    const m = JSON.parse('{"clase":"decision","decisiones":{"__proto__":"approve","a":"reject"}}');
    const r = validarEntradaDelMovil(m);
    expect(r).toEqual({ clase: "decision", decisiones: { a: "reject" } });
    expect(Object.getPrototypeOf((r as { decisiones: object }).decisiones)).toBe(Object.prototype);
  });
});
