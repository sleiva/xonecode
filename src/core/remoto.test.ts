import { describe, expect, it } from "vitest";
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
