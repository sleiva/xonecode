import { describe, expect, it } from "vitest";
import { gastoDelProyecto, SESIONES_EN_EL_GASTO } from "./gastoDelProyecto.js";
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
