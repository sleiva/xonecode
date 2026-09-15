import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import type { Acto } from "./actos.js";
import { conLineaDeTool, acumularTotales, consumoDeLosActos, sumarConsumo } from "./actos.js";

describe("core/actos", () => {
  it("no importa nada de cli/: el acto es de dominio, no de una piel", () => {
    const fuente = readFileSync(new URL("./actos.ts", import.meta.url), "utf8");
    expect(fuente).not.toMatch(/from ["']\.\.\/cli\//);
  });

  it("un acto de herramientas lleva LÍNEAS ya resumidas, nunca argumentos", () => {
    const acto: Acto = { tipo: "herramientas", lineas: ["read_file  src/app.xne"] };
    expect(acto.lineas[0]).not.toContain("{");
  });

  describe("conLineaDeTool", () => {
    it("una línea que no es cierre de racha se añade detrás", () => {
      expect(conLineaDeTool(["→ lee /a"], "✱ busca x")).toEqual(["→ lee /a", "✱ busca x"]);
    });

    it("el cierre de racha SUSTITUYE a la apertura de la misma racha, no se añade", () => {
      // Lo que el colapsador del motor (core/notify.ts) emite de verdad: apertura al
      // empezar la racha, cierre con el ×N al terminarla — dos líneas porque stdio solo
      // añade. Una piel que repinta (TUI, web) se queda solo con el cierre.
      expect(conLineaDeTool(["→ lee /a"], "→ lee ×3 — /a, /b, /c")).toEqual(["→ lee ×3 — /a, /b, /c"]);
    });

    it("un cierre que no corresponde a la última apertura se añade, no sustituye", () => {
      expect(conLineaDeTool(["✱ busca x"], "→ lee ×3 — /a, /b, /c")).toEqual([
        "✱ busca x",
        "→ lee ×3 — /a, /b, /c",
      ]);
    });
  });
});

describe("lo que costó la conversación, leído de sus actos", () => {
  const cuenta = (entrada: number, salida: number, cache = 0) => ({ entrada, salida, cache });
  const turno = (entrada: number, salida: number, ventana?: number): Acto => ({
    tipo: "fin",
    ms: 10,
    consumo: {
      modelo: cuenta(entrada, salida),
      externo: cuenta(0, 0),
      ...(ventana === undefined ? {} : { ventana }),
    },
  });

  it("suma los deltas de los `fin`, cuenta por cuenta", () => {
    const total = consumoDeLosActos([turno(100, 10), turno(50, 5)]);
    expect(total?.modelo).toEqual(cuenta(150, 15));
  });

  it("y NO las suma entre cuentas: el desglose tiene que sobrevivir al cierre", () => {
    // Es la razón de que el acto guarde las dos por separado. De un total no se vuelve a
    // las partes, así que una sesión reabierta ya no podría decir cuánto fue de un agente
    // externo — y el `title` que lo dice dejaría de ser cierto para todo lo anterior.
    const total = consumoDeLosActos([
      { tipo: "fin", ms: 1, consumo: { modelo: cuenta(100, 10), externo: cuenta(7, 3) } },
      { tipo: "fin", ms: 1, consumo: { modelo: cuenta(1, 1), externo: cuenta(2, 2) } },
    ]);
    expect(total).toEqual({ modelo: cuenta(101, 11), externo: cuenta(9, 5) });
  });

  it("la ventana es un NIVEL: vale la última que consta, no la suma de todas", () => {
    // Sumar niveles sería la cifra inventada de siempre: el historial no se acumula consigo
    // mismo. Y vale la última que CONSTA, no la del último turno, porque un turno que no la
    // midió no convierte en falso lo que midió el de antes.
    expect(consumoDeLosActos([turno(1, 1, 3000), turno(1, 1, 9000)])?.ventana).toBe(9000);
    expect(consumoDeLosActos([turno(1, 1, 3000), turno(1, 1)])?.ventana).toBe(3000);
  });

  it("sin NINGÚN `fin` con consumo contesta «no consta», no cero", () => {
    // Es la diferencia que decide si se pinta algo: una sesión anterior a esto no gastó
    // cero, no se sabe lo que gastó. Un cero aquí es un contador que miente en una sesión
    // vieja, que es justo donde nadie lo mira.
    expect(consumoDeLosActos([{ tipo: "usuario", texto: "hola" }, { tipo: "fin", ms: 5 }])).toBeUndefined();
    expect(consumoDeLosActos([])).toBeUndefined();
  });

  it("los `fin` sin consumo no estorban a los que lo traen", () => {
    // Una sesión a caballo entre las dos versiones: los turnos viejos se ignoran y los
    // nuevos suman, sin que el total se vuelva «no consta» por culpa de aquéllos.
    expect(consumoDeLosActos([{ tipo: "fin", ms: 5 }, turno(100, 10)])?.modelo).toEqual(cuenta(100, 10));
  });

  it("sumarConsumo no MUTA ninguno de los dos: van a parar al `.jsonl`", () => {
    // Un objeto compartido con el tracker vivo haría que el siguiente turno moviera por
    // debajo un acto ya escrito.
    const a = { modelo: cuenta(1, 1), externo: cuenta(0, 0) };
    const b = { modelo: cuenta(2, 2), externo: cuenta(0, 0) };
    const suma = sumarConsumo(a, b);
    expect(suma.modelo).toEqual(cuenta(3, 3));
    expect(a.modelo).toEqual(cuenta(1, 1));
    expect(b.modelo).toEqual(cuenta(2, 2));
  });
});

describe("el acumulado de una sesión, que es lo que se estampa en el índice", () => {
  const cuenta = (entrada: number, salida: number, cache = 0) => ({ entrada, salida, cache });
  const consumo = (entrada: number, salida: number, ventana?: number) => ({
    modelo: cuenta(entrada, salida),
    externo: cuenta(0, 0),
    ...(ventana === undefined ? {} : { ventana }),
  });

  it("sin acumulado previo vale el delta, y es una COPIA suya", () => {
    // Quien lo llama lo va a estampar en el índice; el delta es del acto que el lazo acaba de
    // cerrar, y un objeto compartido con el tracker vivo movería por debajo un acto ya escrito.
    const delta = consumo(100, 10);
    const total = acumularTotales(undefined, delta);
    expect(total.modelo).toEqual(cuenta(100, 10));
    expect(total).not.toBe(delta);
    expect(total.modelo).not.toBe(delta.modelo);
  });

  it("con acumulado previo SUMA: el acumulado es la sesión, no el último turno", () => {
    expect(acumularTotales(consumo(1000, 100), consumo(50, 5)).modelo).toEqual(cuenta(1050, 105));
  });

  it("la ventana NO viaja dentro del acumulado — ni la del previo ni la del delta", () => {
    // Es lo que justifica que esto tenga nombre propio. `sumarConsumo` propaga la ventana, y
    // hace bien: compone lo que ocupa el historial AHORA. Pero un acumulado estampado en el
    // índice se lee días después, y una ventana dentro sería un «ahora» congelado que alguien
    // leería como el de hoy. El dato no se pierde: sigue en cada `fin` del `.jsonl`.
    expect("ventana" in acumularTotales(undefined, consumo(1, 1, 9000))).toBe(false);
    expect("ventana" in acumularTotales(consumo(1, 1, 3000), consumo(1, 1, 9000))).toBe(false);
  });

  it("no MUTA el acumulado que recibe", () => {
    const previo = consumo(1000, 100, 4000);
    acumularTotales(previo, consumo(50, 5, 7000));
    expect(previo.modelo).toEqual(cuenta(1000, 100));
    expect(previo.ventana).toBe(4000);
  });
});
