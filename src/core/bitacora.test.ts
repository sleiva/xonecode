import { describe, it, expect } from "vitest";
import { Bitacora } from "./bitacora.js";

describe("Bitacora", () => {
  it("empieza vacía", () => {
    expect(new Bitacora().vacia).toBe(true);
  });

  it("corrio() responde por el nodo que se anotó", () => {
    const b = new Bitacora();
    b.anota("verify", "3 errores");
    expect(b.corrio("verify")).toBe(true);
    expect(b.corrio("executor")).toBe(false);
  });

  it("corrio() funciona con una anotación SIN detalle", () => {
    const b = new Bitacora();
    b.anota("executor");
    expect(b.corrio("executor")).toBe(true);
  });

  it("NO confunde un nodo con otro que empieza igual", () => {
    // Sin los dos puntos, «verify» casaría con «verify_visual» y el aviso saldría
    // por un nodo que no ha corrido.
    const b = new Bitacora();
    b.anota("verify_visual", "ok");
    expect(b.corrio("verify")).toBe(false);
  });

  it("una bitácora nueva no sabe nada de la anterior: el alcance es del TURNO", () => {
    const primera = new Bitacora();
    primera.anota("verify");
    expect(new Bitacora().corrio("verify")).toBe(false);
  });

  it("conserva el orden y el detalle", () => {
    const b = new Bitacora();
    b.anota("intake", "chat");
    b.anota("verify", "3 errores");
    expect([...b.todo]).toEqual(["intake: chat", "verify: 3 errores"]);
  });
});