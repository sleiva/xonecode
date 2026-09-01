import { describe, it, expect } from "vitest";
import { crearStore, crearRanura } from "./store.js";
import { crearPielTui } from "./pielTui.js";

describe("el store de la TUI", () => {
  it("los tokens esperan al salto de línea y la línea confirmada es un acto asistente", () => {
    const s = crearStore();
    s.token("Hola. ¿En qué te ayudo");
    expect(s.estado().actos).toEqual([]);
    s.token(" con xonecode?\nHecho.");
    expect(s.estado().actos).toEqual([{ tipo: "asistente", texto: "Hola. ¿En qué te ayudo con xonecode?" }]);
    expect(s.estado().colchon).toBe("Hecho.");
    s.cerrarLinea();
    expect(s.estado().actos).toEqual([
      { tipo: "asistente", texto: "Hola. ¿En qué te ayudo con xonecode?" },
      { tipo: "asistente", texto: "Hecho." },
    ]);
    expect(s.estado().colchon).toBe("");
  });

  it("la fase se abre viva y el acto que la desplaza la cierra con su duración", () => {
    let ahora = 1000;
    const s = crearStore({ ahora: () => ahora });
    s.fase("planificando");
    expect(s.estado().faseActiva).toEqual({ texto: "planificando", t0: 1000 });
    ahora = 1600;
    s.linea("→ lee app.xne");
    expect(s.estado().faseActiva).toBeUndefined();
    expect(s.estado().actos[0]).toEqual({ tipo: "fase", texto: "planificando", ms: 600 });
    expect(s.estado().actos[1]).toEqual({ tipo: "tool", texto: "→ lee app.xne" });
  });

  it("usuario, error y fin son actos propios", () => {
    const s = crearStore();
    s.usuario("hola");
    s.error("Error: se cayó");
    s.fin(2400);
    expect(s.estado().actos).toEqual([
      { tipo: "usuario", texto: "hola" },
      { tipo: "error", texto: "Error: se cayó" },
      { tipo: "fin", ms: 2400 },
    ]);
  });

  it("pausa marca la aprobación pendiente y el suscriptor se entera de cada mutación", () => {
    const s = crearStore();
    const avisos: number[] = [];
    s.suscribir(() => avisos.push(avisos.length + 1));
    s.pausa();
    expect(s.estado().aprobacionPendiente).toBe(true);
    expect(avisos).toEqual([1]);
  });

  it("suscribir devuelve la baja: desuscribir a uno deja al otro (y solo al otro) recibiendo", () => {
    const s = crearStore();
    const a: number[] = [];
    const b: number[] = [];
    const bajaA = s.suscribir(() => a.push(1));
    s.suscribir(() => b.push(1));
    s.pausa();
    bajaA();
    s.rearmar();
    expect(a).toEqual([1]); // quedó en el estado previo al rearme
    expect(b).toEqual([1, 1]);
    // Y una doble baja no revienta (React puede llamar el cleanup dos veces en StrictMode).
    expect(() => bajaA()).not.toThrow();
  });

  it("la ranura también devuelve la baja", () => {
    const ranura = crearRanura({ n: 0 });
    const vistas: number[] = [];
    const baja = ranura.suscribir(() => vistas.push(ranura.ver().n));
    ranura.mutar({ n: 1 });
    baja();
    ranura.mutar({ n: 2 });
    expect(vistas).toEqual([1]);
  });

  it("rearmar baja la aprobación pendiente: quien cierra el modal sabe que ya no hay nada", () => {
    // `pausa` solo sube a true; sin rearme la TUI quedaría «en pausa» tras la primera
    // aprobación. El rearme lo hace el cierre del modal, no el store por su cuenta.
    const s = crearStore();
    const estados: boolean[] = [];
    s.suscribir(() => estados.push(s.estado().aprobacionPendiente));
    s.pausa();
    s.rearmar();
    expect(s.estado().aprobacionPendiente).toBe(false);
    expect(estados).toEqual([true, false]);
  });
});

describe("la piel TUI", () => {
  it("reproduce la secuencia del motor delegando en el store", () => {
    let ahora = 1000;
    const s = crearStore({ ahora: () => ahora });
    const piel = crearPielTui(s);

    piel.token("a");
    expect(s.estado().actos).toEqual([]);
    piel.cerrarLinea();
    ahora = 1200;
    piel.fase!("planificando");
    piel.linea("→ x");
    piel.pausa([]);

    expect(s.estado().actos).toEqual([
      { tipo: "asistente", texto: "a" },
      { tipo: "fase", texto: "planificando", ms: 0 },
      { tipo: "tool", texto: "→ x" },
    ]);
    expect(s.estado().aprobacionPendiente).toBe(true);
  });

  it("la notificación es una línea de sistema más", () => {
    const s = crearStore();
    const piel = crearPielTui(s);
    piel.notificacion!("aviso de honestidad");
    expect(s.estado().actos).toEqual([{ tipo: "sistema", texto: "aviso de honestidad" }]);
  });
});
