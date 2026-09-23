import { describe, it, expect } from "vitest";
import { desglosarConsumo } from "./consumoPintable.js";

const sin = { entrada: 0, salida: 0, cache: 0 };

describe("desglosarConsumo", () => {
  /**
   * El caso que motivó todo esto, con las cifras de una sesión real: la pastilla decía
   * «538,6k entrada» y 497,3k de esos eran historial reenviado.
   */
  it("la entrada del GRAFO lleva la caché dentro, así que se resta", () => {
    const d = desglosarConsumo({ entrada: 538573, salida: 39431, cache: 497280 }, sin);
    expect(d.nueva).toBe(41293);
    expect(d.cache).toBe(497280);
    expect(d.entradaTotal).toBe(538573); // el total no se pierde: se descompone
    expect(d.salida).toBe(39431);
  });

  /** La de un agente externo NO la lleva dentro, así que se copia tal cual. */
  it("la entrada EXTERNA no se toca", () => {
    const d = desglosarConsumo(sin, { entrada: 8756, salida: 141, cache: 1792 });
    expect(d.nueva).toBe(8756);
    expect(d.entradaTotal).toBe(10548); // 8756 + 1792, la aritmética medida de OpenCode
  });

  it("con las dos, se normalizan a lo mismo antes de sumar", () => {
    const d = desglosarConsumo({ entrada: 1000, salida: 50, cache: 900 }, { entrada: 200, salida: 10, cache: 30 });
    expect(d.nueva).toBe(300); // 100 del grafo + 200 del externo
    expect(d.cache).toBe(930);
    expect(d.salida).toBe(60);
  });

  /**
   * Una caché mayor que su entrada es imposible y aun así llega: `@langchain/google-genai`
   * la suma dos veces en streaming. Un negativo en pantalla es peor que un cero.
   */
  it("nunca da un negativo", () => {
    expect(desglosarConsumo({ entrada: 100, salida: 1, cache: 900 }, sin).nueva).toBe(0);
  });

  it("sin nada, todo a cero", () => {
    expect(desglosarConsumo(sin, sin)).toEqual({ nueva: 0, cache: 0, salida: 0, entradaTotal: 0 });
  });
});
