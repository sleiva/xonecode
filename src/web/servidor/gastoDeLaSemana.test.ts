import { describe, expect, it } from "vitest";
import type { Acto } from "../../core/actos.js";
import { DIAS_DEL_GASTO, diaLocal, gastoDeLaSemana } from "./gastoDeLaSemana.js";

const fin = (entrada: number, salida = 0, cache = 0, externo = 0): Acto =>
  ({ tipo: "fin", ms: 1, consumo: { modelo: { entrada, salida, cache }, externo: { entrada: externo, salida: 0, cache: 0 } } }) as Acto;
const usuario = (cuando?: string): Acto => ({ tipo: "usuario", texto: "x", ...(cuando === undefined ? {} : { cuando }) }) as Acto;

describe("gastoDeLaSemana", () => {
  const ahora = new Date(2026, 10, 6, 12, 0, 0);
  const hace = (dias: number, hora = 10) => new Date(2026, 10, 6 - dias, hora, 0, 0).toISOString();

  it("siete días de la más antigua a hoy, con los vacíos a cero", () => {
    const g = gastoDeLaSemana([], ahora);
    expect(g.dias).toHaveLength(DIAS_DEL_GASTO);
    expect(g.dias.at(-1)!.dia).toBe(diaLocal(ahora));
    expect(g.dias[0]!.dia).toBe(diaLocal(new Date(2026, 10, 0)));
    expect(g.dias.every((d) => d.turnos === 0 && d.modelo.entrada === 0)).toBe(true);
  });

  it("cada `fin` va al día de la hora que lo precede, y las dos cuentas por separado", () => {
    const g = gastoDeLaSemana(
      [
        [usuario(hace(0)), fin(100, 10, 40, 5), usuario(hace(2)), fin(50)],
        [usuario(hace(0, 9)), fin(1)],
      ],
      ahora,
    );
    const hoy = g.dias.at(-1)!;
    expect(hoy).toMatchObject({ turnos: 2, modelo: { entrada: 101, salida: 10, cache: 40 }, externo: { entrada: 5 } });
    expect(g.dias.at(-3)!.modelo.entrada).toBe(50);
  });

  it("un turno sin hora no se reparte: se cuenta; uno fuera de la ventana, ni lo uno ni lo otro", () => {
    const g = gastoDeLaSemana([[fin(7), usuario(hace(9)), fin(8), usuario(hace(1)), { tipo: "fin", ms: 1 } as Acto]], ahora);
    expect(g.sinHora).toBe(1);
    expect(g.dias.reduce((n, d) => n + d.turnos, 0)).toBe(0);
  });
});
