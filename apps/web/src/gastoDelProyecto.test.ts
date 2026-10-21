import { describe, expect, it } from "vitest";
import { gastoDelProyecto, SESIONES_EN_EL_GASTO, textoDelGastoDeTarea } from "./gastoDelProyecto.js";
import type { ConsumoDeTurno } from "./tipos.js";

const consumo = (
  modelo: { entrada: number; salida: number; cache: number },
  externo = { entrada: 0, salida: 0, cache: 0 }
): ConsumoDeTurno => ({ modelo, externo });

describe("gastoDelProyecto", () => {
  /**
   * El grafo trae la caché DENTRO de su entrada y un agente externo no. Cada cuenta se desglosa
   * con SU convención, y las dos se quedan separadas.
   */
  it("las dos cuentas no se suman, y cada una lleva su convención de caché", () => {
    const g = gastoDelProyecto([
      {
        id: "s1",
        titulo: "a",
        ultimoTurno: "2026-09-21T10:00:00.000Z",
        consumo: consumo({ entrada: 1000, salida: 200, cache: 800 }, { entrada: 300, salida: 50, cache: 100 }),
      },
    ]);
    // Modelo: nueva = 1000 - 800 = 200, + salida 200 → 400; la caché (800) aparte.
    expect(g.total.modelo).toEqual({ tokens: 400, cache: 800 });
    // Externo: su entrada ya NO incluye la caché → 300 + 50 = 350; caché 100 aparte.
    expect(g.total.externo).toEqual({ tokens: 350, cache: 100 });
    expect(g.hayExterno).toBe(true);
  });

  it("solo entran en el gráfico las más recientes que caben, de más antigua a más nueva", () => {
    const sesiones = Array.from({ length: SESIONES_EN_EL_GASTO + 3 }, (_, i) => ({
      id: `s${i}`,
      titulo: `s${i}`,
      ultimoTurno: `2026-09-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`,
      consumo: consumo({ entrada: 10, salida: 1, cache: 0 }),
    }));
    const g = gastoDelProyecto(sesiones);
    expect(g.barras).toHaveLength(SESIONES_EN_EL_GASTO);
    // La primera barra es la más ANTIGUA de las que entran; la última, la más reciente.
    expect(g.barras[0]!.id).toBe("s3");
    expect(g.barras.at(-1)!.id).toBe(`s${SESIONES_EN_EL_GASTO + 2}`);
    // El total no se queda en las del gráfico: son TODAS las que constan.
    expect(g.conGasto).toBe(SESIONES_EN_EL_GASTO + 3);
  });

  /** Ausente es «no consta»: ni barra ni cero, y el total dice que no está dentro. */
  it("una sesión sin gasto que conste no aporta barra y se cuenta como fuera del total", () => {
    const g = gastoDelProyecto([
      { id: "s1", titulo: "a", ultimoTurno: "2026-09-21T10:00:00.000Z", consumo: consumo({ entrada: 5, salida: 5, cache: 0 }) },
      { id: "s2", titulo: "b", ultimoTurno: "2026-09-22T10:00:00.000Z" },
    ]);
    expect(g.barras.map((b) => b.id)).toEqual(["s1"]);
    expect(g.conGasto).toBe(1);
    expect(g.sinGasto).toBe(1);
  });

  it("sin agente externo en ninguna sesión, esa serie no existe", () => {
    const g = gastoDelProyecto([
      { id: "s1", titulo: "a", ultimoTurno: "2026-09-21T10:00:00.000Z", consumo: consumo({ entrada: 5, salida: 5, cache: 0 }) },
    ]);
    expect(g.hayExterno).toBe(false);
  });
});

/**
 * Lo que lleva gastado un turno EN CURSO (petición suya, 21-10-2026: «el conteo no me acumula lo que se consume en las
 * tareas»): una tarea es un turno largo y no constaba hasta el `fin`. Se suma al de la sesión y se dice cuántas están en
 * curso: el total crece mientras la tarea trabaja.
 */
describe("gastoDelProyecto con un turno en curso", () => {
  it("suma lo del turno en curso al acumulado, también en una sesión que aún no tiene acumulado", () => {
    const g = gastoDelProyecto([
      { id: "hola", titulo: "Hola", ultimoTurno: "2026-10-21T09:00:00.000Z", consumo: consumo({ entrada: 1000, salida: 100, cache: 800 }) },
      {
        id: "tarea",
        titulo: "",
        ultimoTurno: "2026-10-21T10:00:00.000Z",
        consumoEnCurso: consumo({ entrada: 500, salida: 50, cache: 400 }),
      },
      {
        id: "otra",
        titulo: "",
        ultimoTurno: "2026-10-21T10:05:00.000Z",
        consumo: consumo({ entrada: 100, salida: 10, cache: 0 }),
        consumoEnCurso: consumo({ entrada: 100, salida: 10, cache: 0 }),
      },
    ]);
    // hola 200+100 · tarea 100+50 · otra (100+10)+(100+10)
    expect(g.total.modelo).toEqual({ tokens: 300 + 150 + 220, cache: 800 + 400 });
    expect(g.conGasto).toBe(3);
    expect(g.enCurso).toBe(2);
    expect(g.barras.find((b) => b.id === "tarea")?.enCurso).toBe(true);
  });

  it("sin turnos en curso, `enCurso` es 0 y ninguna barra lo lleva", () => {
    const g = gastoDelProyecto([{ id: "a", titulo: "a", consumo: consumo({ entrada: 10, salida: 1, cache: 0 }) }]);
    expect(g.enCurso).toBe(0);
    expect(g.barras[0]?.enCurso).toBeUndefined();
  });
});

/** El gasto de UNA tarea en una línea (Finalizadas): las dos cuentas por separado, como en el gráfico. */
describe("textoDelGastoDeTarea", () => {
  it("modelo con su caché; el agente externo solo si gastó", () => {
    expect(textoDelGastoDeTarea(consumo({ entrada: 1_500_000, salida: 60_000, cache: 1_300_000 }))).toBe("260k tokens · 1,3M de caché");
    expect(
      textoDelGastoDeTarea(consumo({ entrada: 1000, salida: 100, cache: 800 }, { entrada: 5000, salida: 500, cache: 0 }))
    ).toBe("300 tokens · 800 de caché · agente externo 5,5k tokens");
  });
});
