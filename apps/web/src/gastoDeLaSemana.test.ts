import { describe, expect, it } from "vitest";
import { juntarGastoDeLaSemana } from "./gastoDeLaSemana.js";

const dia = (d: string, entrada: number, salida = 0, cache = 0, externo = 0) => ({
  dia: d,
  modelo: { entrada, salida, cache },
  externo: { entrada: externo, salida: 0, cache: 0 },
  turnos: 1,
});

describe("juntarGastoDeLaSemana", () => {
  it("sin días de ningún proyecto, no consta", () => {
    expect(juntarGastoDeLaSemana({})).toBeUndefined();
    expect(juntarGastoDeLaSemana({ a: {} })).toBeUndefined();
  });

  it("suma por día los proyectos; la caché del grafo no cuenta como nueva; las cuentas van separadas", () => {
    const g = juntarGastoDeLaSemana({
      a: { dias: [dia("2026-11-05", 100, 10, 40), dia("2026-11-06", 50)], sinHora: 1 },
      b: { dias: [dia("2026-11-05", 0, 0, 0, 30), dia("2026-11-06", 20, 5)], sinHora: 0 },
    })!;
    expect(g.dias).toEqual([
      { dia: "2026-11-05", modelo: 70, externo: 30 },
      { dia: "2026-11-06", modelo: 75, externo: 0 },
    ]);
    expect(g.total).toEqual({ modelo: 145, externo: 30 });
    expect(g.hoy).toEqual({ modelo: 75, externo: 0 });
    expect(g.porProyecto.map((p) => p.proyecto)).toEqual(["a", "b"]);
    expect(g.sinHora).toBe(1);
  });
});
