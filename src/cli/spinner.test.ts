import { describe, it, expect } from "vitest";
import { AnimadorDeFase, sufijoDeTiempo } from "./spinner.js";
import { crearTema } from "./tema.js";

const CON = crearTema(true);
const SIN = crearTema(false);

function acumulador() {
  const trozos: string[] = [];
  return { trozos, escribir: (t: string) => trozos.push(t) };
}

describe("sufijoDeTiempo", () => {
  it("vacío hasta que la fase cumple su primer segundo", () => {
    expect(sufijoDeTiempo(0)).toBe("");
    expect(sufijoDeTiempo(999)).toBe("");
  });

  it("los segundos enteros, sin decimales que bailen a cada tick", () => {
    expect(sufijoDeTiempo(1000)).toBe(" (1s)");
    expect(sufijoDeTiempo(12_300)).toBe(" (12s)");
  });
});

describe("AnimadorDeFase", () => {
  /** Reloj de pega: el test mueve el tiempo cuando quiere, no cuando quiere el reloj. */
  const reloj = (desde = 0) => {
    let ahora = desde;
    return () => ahora;
  };

  it("sin color, la fase es la línea estática de siempre y no arranca nada", () => {
    const { trozos, escribir } = acumulador();
    const a = new AnimadorDeFase(escribir, SIN, 120, reloj());
    a.empieza("planificando");
    // Sin TTY no hay línea que repintar: el mismo «·» que ha salido siempre.
    expect(trozos.join("")).toBe("  ·  planificando\n");
    expect(a.activo()).toBe(false);
  });

  it("con color, el primer fotograma lleva el cuadro y los ticks repintan con el tiempo", () => {
    const { trozos, escribir } = acumulador();
    let ahora = 0;
    const a = new AnimadorDeFase(escribir, CON, 120, () => ahora);
    a.empieza("planificando");
    expect(trozos.join("")).toBe(`\r  ${CON.mudo}⠋ planificando${CON.reset}`);

    ahora = 3200;
    a.pinta();
    expect(trozos[1]).toBe(`\r  ${CON.mudo}⠙ planificando (3s)${CON.reset}`);
  });

  it("termina deja la fase como línea estática, con la línea limpia y el reloj parado", () => {
    const { trozos, escribir } = acumulador();
    let ahora = 0;
    const a = new AnimadorDeFase(escribir, CON, 120, () => ahora);
    a.empieza("verificando con el simulador");
    ahora = 12_000;
    a.pinta();
    a.termina();
    // El fotograma animado era más largo que la línea estática: el borrado limpia lo
    // que sobre del tick — sin él, la línea quedaría con colas de «(12s)».
    expect(trozos[2]).toBe(`\r${CON.borrar}  ·  verificando con el simulador\n`);
    expect(a.activo()).toBe(false);

    // Con el reloj parado, un tick tardío no escribe nada.
    a.pinta();
    expect(trozos.length).toBe(3);
  });

  it("una fase nueva termina la anterior: el historial conserva las dos", () => {
    const { trozos, escribir } = acumulador();
    const a = new AnimadorDeFase(escribir, CON, 120, reloj());
    a.empieza("planificando");
    a.empieza("desarrollando");
    expect(trozos[0]).toContain("⠋ planificando");
    expect(trozos[1]).toBe(`\r${CON.borrar}  ·  planificando\n`);
    expect(trozos[2]).toBe(`\r  ${CON.mudo}⠋ desarrollando${CON.reset}`);
  });

  it("termina sin fase activa no escribe nada", () => {
    const { trozos, escribir } = acumulador();
    new AnimadorDeFase(escribir, CON, 120, reloj()).termina();
    expect(trozos).toEqual([]);
  });
});