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
    expect(s.estado().actos[1]).toEqual({ tipo: "herramientas", lineas: ["→ lee app.xne"] });
  });

  describe("las líneas de tool se agrupan en UN acto «herramientas»", () => {
    it("las consecutivas van al mismo grupo; una línea del asistente abre otro", () => {
      const s = crearStore();
      s.linea("→ lee /a");
      s.linea("✱ busca x");
      s.linea("Voy a delegar", "asistente");
      s.linea("→ lista /");
      expect(s.estado().actos).toEqual([
        { tipo: "herramientas", lineas: ["→ lee /a", "✱ busca x"] },
        { tipo: "asistente", texto: "Voy a delegar" },
        { tipo: "herramientas", lineas: ["→ lista /"] },
      ]);
    });

    it("el cierre de racha del colapsador («→ lee ×3 — …») SUSTITUYE a la apertura de la misma racha", () => {
      // El colapsador del motor (core/notify.ts) escribe «→ lee /a» al abrir y «→ lee ×3 — …»
      // al cerrar, porque stdio solo añade. La TUI repinta: dos líneas para la misma racha
      // son ruido, y la de cierre ya dice todo.
      const s = crearStore();
      s.linea("→ lee /a");
      s.linea("→ lee ×3 — /a, /b, /c");
      expect(s.estado().actos).toEqual([{ tipo: "herramientas", lineas: ["→ lee ×3 — /a, /b, /c"] }]);
    });

    it("un cierre cuya apertura no es la última línea NO borra nada: se añade", () => {
      const s = crearStore();
      s.linea("→ lee /a");
      s.linea("✗ busca: error");
      s.linea("→ lee ×2 — /a, /b");
      expect(s.estado().actos[0]).toEqual({
        tipo: "herramientas",
        lineas: ["→ lee /a", "✗ busca: error", "→ lee ×2 — /a, /b"],
      });
    });

    it("una fase abierta entre dos tools parte el grupo: el acto de fase queda en medio", () => {
      let ahora = 1000;
      const s = crearStore({ ahora: () => ahora });
      s.linea("→ lee /a");
      s.fase("verificando");
      ahora = 1300;
      s.linea("→ lee /b");
      expect(s.estado().actos).toEqual([
        { tipo: "herramientas", lineas: ["→ lee /a"] },
        { tipo: "fase", texto: "verificando", ms: 300 },
        { tipo: "herramientas", lineas: ["→ lee /b"] },
      ]);
    });

    it("una línea de sistema no entra en el grupo", () => {
      const s = crearStore();
      s.linea("→ lee /a");
      s.linea("aviso", "sistema");
      expect(s.estado().actos).toEqual([
        { tipo: "herramientas", lineas: ["→ lee /a"] },
        { tipo: "sistema", texto: "aviso" },
      ]);
    });
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

  it("fin guarda el modelo del turno si se lo dan, y no inventa la clave si no", () => {
    const s = crearStore();
    s.fin(2400);
    s.fin(1800, "ollama/glm");
    expect(s.estado().actos).toEqual([
      { tipo: "fin", ms: 2400 },
      { tipo: "fin", ms: 1800, modelo: "ollama/glm" },
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
      { tipo: "herramientas", lineas: ["→ x"] },
    ]);
    expect(s.estado().aprobacionPendiente).toBe(true);
  });

  it("la notificación es una línea de sistema más", () => {
    const s = crearStore();
    const piel = crearPielTui(s);
    piel.notificacion!("aviso de honestidad");
    expect(s.estado().actos).toEqual([{ tipo: "sistema", texto: "aviso de honestidad" }]);
  });

  it("con modeloActual, la piel etiqueta el fin con el modelo del MOMENTO del fin", () => {
    let modelo = "ollama/a";
    const s = crearStore();
    const piel = crearPielTui(s, () => modelo);
    piel.fin(100);
    modelo = "ollama/b";
    piel.fin(200);
    expect(s.estado().actos).toEqual([
      { tipo: "fin", ms: 100, modelo: "ollama/a" },
      { tipo: "fin", ms: 200, modelo: "ollama/b" },
    ]);
  });
});
