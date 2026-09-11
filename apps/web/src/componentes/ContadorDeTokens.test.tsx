import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ContadorDeTokens, abreviar } from "./ContadorDeTokens.js";

const cuenta = (entrada: number, salida: number, cache = 0) => ({ entrada, salida, cache });
const sinVentana = { usado: 0 };

// Sin esto los renders se acumulan entre casos y `getByTitle` encuentra varios: el fallo es
// del test, no del componente.
afterEach(cleanup);

describe("el contador de tokens de la sesión", () => {
  it("sin dato NO se pinta: ausente es «no consta», no cero", () => {
    // Un `0 ↑ 0 ↓` que nadie ha medido es un control sin dato detrás, que es lo que esta
    // interfaz no se permite en ningún otro sitio.
    const { container } = render(<ContadorDeTokens />);
    expect(container.textContent).toBe("");
  });

  it("y con la sesión recién abierta tampoco: cero no dice nada que la ausencia no diga", () => {
    const { container } = render(
      <ContadorDeTokens consumo={{ modelo: cuenta(0, 0), externo: cuenta(0, 0) , ventana: sinVentana }} />
    );
    expect(container.textContent).toBe("");
  });

  it("suma las DOS cuentas: el grafo y los agentes externos", () => {
    // Sumar TOKENS es defendible —un token es un token— y es lo que se pidió. Lo que no se
    // suma nunca es el COSTE: son proveedores distintos y sería la cifra que miente.
    render(<ContadorDeTokens consumo={{ modelo: cuenta(1000, 200), externo: cuenta(500, 100) , ventana: sinVentana }} />);
    expect(screen.getByText("1,5k")).toBeTruthy();
    expect(screen.getByText("300")).toBeTruthy();
  });

  it("la CACHÉ no se suma a la entrada", () => {
    // `vendor/tokenTracking.ts` ya las separa: son tokens que se leyeron pero no se pagaron
    // igual, y meterlos dentro inflaría el número que se enseña.
    render(<ContadorDeTokens consumo={{ modelo: cuenta(100, 10, 9000), externo: cuenta(0, 0) , ventana: sinVentana }} />);
    expect(screen.getByText("100")).toBeTruthy();
  });

  it("el desglose va en el `title`, que es donde cabe sin competir con nada", () => {
    render(<ContadorDeTokens consumo={{ modelo: cuenta(100, 10, 7), externo: cuenta(50, 5) , ventana: sinVentana }} />);
    const t = screen.getByTitle(/Tokens de esta sesión/);
    expect(t.getAttribute("title")).toContain("agentes externos: 50 entrada / 5 salida");
    expect(t.getAttribute("title")).toContain("caché leída: 7");
    // Y se DICE que no se suman costes, porque son dos proveedores distintos.
    expect(t.getAttribute("title")).toMatch(/TOKENS, no coste/);
  });

  it("sin consumo externo, el desglose no lo menciona", () => {
    // Nombrar una cuenta vacía haría pensar que hay un agente externo trabajando.
    render(<ContadorDeTokens consumo={{ modelo: cuenta(100, 10), externo: cuenta(0, 0) , ventana: sinVentana }} />);
    expect(screen.getByTitle(/Tokens de esta sesión/).getAttribute("title")).not.toContain("externos");
  });

  it("las dos mitades van separadas por un punto, no pegadas", () => {
    // Sin él, «2,1k entrada ↓ 152» se lee como una sola cifra con dos partes.
    const { container } = render(
      <ContadorDeTokens consumo={{ modelo: cuenta(2100, 152), externo: cuenta(0, 0) , ventana: sinVentana }} />
    );
    expect(container.textContent).toBe("↑2,1kentrada·↓152salida");
  });
});

describe("la ventana del modelo, que es OTRA pregunta", () => {
  const base = { modelo: cuenta(100, 10), externo: cuenta(0, 0) };

  it("con tope, se pinta «ctx usado/tope»", () => {
    // Los acumulados dicen lo que la sesión ha costado; esto, cuánto margen queda antes de
    // que el historial desborde — la cifra que avisa de que toca resumir.
    render(<ContadorDeTokens consumo={{ ...base, ventana: { usado: 2100, tope: 1_000_000 } }} />);
    expect(screen.getByText("2,1k/1,0M")).toBeTruthy();
  });

  it("SIN tope se pinta lo ocupado y NINGÚN denominador", () => {
    // Con Ollama no hay tope a propósito: cada modelo local trae el suyo. Un denominador
    // inventado sería la misma mentira que un porcentaje sobre un número que nadie midió.
    render(<ContadorDeTokens consumo={{ ...base, ventana: { usado: 2100 } }} />);
    expect(screen.getByText("2,1k")).toBeTruthy();
    expect(screen.queryByText(/\//)).toBeNull();
  });

  it("y el porcentaje solo existe con tope, en el `title`", () => {
    render(<ContadorDeTokens consumo={{ ...base, ventana: { usado: 500_000, tope: 1_000_000 } }} />);
    expect(screen.getByTitle(/Tokens de esta sesión/).getAttribute("title")).toContain("(50%)");
    cleanup();
    render(<ContadorDeTokens consumo={{ ...base, ventana: { usado: 500_000 } }} />);
    const t = screen.getByTitle(/Tokens de esta sesión/).getAttribute("title")!;
    expect(t).toContain("no consta el tope");
    expect(t).not.toContain("%");
  });

  it("sin nada ocupado no se pinta: la sesión recién abierta no tiene ventana que enseñar", () => {
    render(<ContadorDeTokens consumo={{ ...base, ventana: { usado: 0, tope: 1_000_000 } }} />);
    expect(screen.queryByText("ctx")).toBeNull();
  });
});

describe("abreviar", () => {
  it("por debajo de mil, el número entero: ahí cada token se ve", () => {
    expect(abreviar(0)).toBe("0");
    expect(abreviar(999)).toBe("999");
  });

  it("de mil en adelante, una cifra decimal: 1,2k y 1,9k se distinguen y 1.234 de 1.235 no", () => {
    expect(abreviar(1000)).toBe("1,0k");
    expect(abreviar(12_345)).toBe("12,3k");
    expect(abreviar(2_500_000)).toBe("2,5M");
  });

  it("lo que no es un número no rompe la fila", () => {
    // Viene de un `JSON.parse` de la red: un NaN dejaría el contador ilegible.
    expect(abreviar(Number.NaN)).toBe("0");
    expect(abreviar(-5)).toBe("0");
  });
});
