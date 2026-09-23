import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ContadorDeTokens } from "./ContadorDeTokens.js";

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

  /**
   * **La caché del GRAFO va DENTRO de su entrada, y eso se enseñaba mal.**
   *
   * `vendor/tokenTracking.ts` lo dice en su propio código —«la caché no puede superar la
   * entrada: es una PARTE de ella»— y aquí se rotulaba el total como «entrada», con un
   * `title` que además afirmaba que la caché no iba sumada. En un turno real eran 538,6k de
   * entrada con 497,3k de caché dentro: lo que se leía era casi todo historial reenviado.
   */
  it("la caché del grafo se RESTA de lo nuevo y sale con su propia cifra", () => {
    render(<ContadorDeTokens consumo={{ modelo: cuenta(9100, 10, 9000), externo: cuenta(0, 0), ventana: sinVentana }} />);
    expect(screen.getByText("100")).toBeTruthy(); // nueva: 9100 − 9000
    expect(screen.getByText("9k")).toBeTruthy(); // caché, a la vista y no en el title
  });

  /** La de un agente externo NO va dentro, así que no se le resta nada. */
  it("la entrada externa no se toca: su convención es la contraria", () => {
    render(<ContadorDeTokens consumo={{ modelo: cuenta(0, 0), externo: cuenta(8756, 141, 1792), ventana: sinVentana }} />);
    expect(screen.getByText("8,8k")).toBeTruthy();
  });

  it("el desglose va en el `title`, que es donde cabe sin competir con nada", () => {
    render(<ContadorDeTokens consumo={{ modelo: cuenta(100, 10, 7), externo: cuenta(50, 5) , ventana: sinVentana }} />);
    const t = screen.getByTitle(/Tokens de esta conversación/);
    expect(t.getAttribute("title")).toContain("agentes externos: 50 entrada (caché aparte) / 5 salida");
    // El TOTAL no se pierde al descomponerlo: sigue estando, con sus dos mitades.
    expect(t.getAttribute("title")).toMatch(/entrada total: 150 — 143 nueva \+ 7 de caché/);
    // Y se dice qué convención usa cada cuenta, que es lo que hacía falsa la frase de antes.
    expect(t.getAttribute("title")).toContain("caché INCLUIDA");
    // Y se DICE que no se suman costes, porque son dos proveedores distintos.
    expect(t.getAttribute("title")).toMatch(/TOKENS, no coste/);
    // Y que esto NO es lo de este turno: cuenta lo anterior, porque sobrevive al cierre.
    expect(t.getAttribute("title")).toMatch(/sobreviven a cerrar y reabrir/);
  });

  it("sin consumo externo, el desglose no lo menciona", () => {
    // Nombrar una cuenta vacía haría pensar que hay un agente externo trabajando.
    render(<ContadorDeTokens consumo={{ modelo: cuenta(100, 10), externo: cuenta(0, 0) , ventana: sinVentana }} />);
    expect(screen.getByTitle(/Tokens de esta conversación/).getAttribute("title")).not.toContain("externos");
  });

  it("las dos mitades van separadas por un punto, no pegadas", () => {
    // Sin él, «2,1k entrada ↓ 152» se lee como una sola cifra con dos partes.
    const { container } = render(
      <ContadorDeTokens consumo={{ modelo: cuenta(2100, 152), externo: cuenta(0, 0) , ventana: sinVentana }} />
    );
    expect(container.textContent).toBe("↑2,1knueva·⟳0caché·↓152salida");
  });
});

describe("la ventana NO se pinta aquí, y eso es la mitad del arreglo", () => {
  const base = { modelo: cuenta(100, 10), externo: cuenta(0, 0) };

  /**
   * Aquí vivían `ctx usado/tope` y su porcentaje, y no se fueron por el formato: eran dos
   * PREGUNTAS distintas en la misma frase —lo que la conversación ha costado (un acumulado,
   * que solo crece) y cuánto ocupa el historial AHORA (un nivel, que sube y baja)—, y con
   * dos escalas en una fila se leían como una sola cifra contradictoria. Lo pinta la barra
   * de estado, que es donde se consulta el margen antes de resumir.
   */
  it("con el dato delante, el compositor NO enseña `ctx` ni denominador", () => {
    const { container } = render(
      <ContadorDeTokens consumo={{ ...base, ventana: { usado: 2100, tope: 1_000_000 } }} />
    );
    expect(container.textContent).toBe("↑100nueva·⟳0caché·↓10salida");
  });

  it("y sin tope tampoco: el campo sigue viajando, pero lo pinta otro", () => {
    const { container } = render(<ContadorDeTokens consumo={{ ...base, ventana: { usado: 2100 } }} />);
    expect(container.textContent).toBe("↑100nueva·⟳0caché·↓10salida");
  });
});
