import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import { CosteDelTurno, hayCosteQueEnsenar } from "./CosteDelTurno.js";
import type { ConsumoDeTurno } from "../tipos.js";

// Mismo motivo que en el resto de los ficheros de componentes: sin `globals` en
// `vitest.config.ts`, un segundo `render()` deja montado el primero.
afterEach(cleanup);

const cuenta = (entrada: number, salida: number, cache = 0) => ({ entrada, salida, cache });
const consumo = (modelo: ReturnType<typeof cuenta>, externo = cuenta(0, 0)): ConsumoDeTurno => ({ modelo, externo });

describe("CosteDelTurno", () => {
  it("los dos totales, abreviados como en el contador de la conversación", () => {
    // El mismo abreviador que el contador y la barra (`cifras.ts`): dos formatos para el mismo
    // dato enseñan a desconfiar de los dos.
    render(<CosteDelTurno consumo={consumo(cuenta(22_400, 1_200))} />);
    expect(screen.getByText("22,4k")).toBeTruthy();
    expect(screen.getByText("1,2k")).toBeTruthy();
  });

  it("la caché sale solo si la hay, y dice que NO se suma a la entrada", () => {
    // Es una lectura distinta de las otras dos, no un tercer sumando: pintarla igual invitaría
    // a sumarla de cabeza. Y sin caché no se pinta — un `0 caché` ocuparía sitio para decir
    // que no hay nada que decir.
    const { container } = render(<CosteDelTurno consumo={consumo(cuenta(7_000, 40, 5_000))} />);
    expect(screen.getByText("5k caché")).toBeTruthy();
    expect(screen.getByTitle(/no va sumada a la entrada/)).toBeTruthy();

    cleanup();
    render(<CosteDelTurno consumo={consumo(cuenta(7_000, 40))} />);
    expect(container.textContent).not.toContain("caché");
  });

  it("las dos cuentas se suman en pantalla y se desglosan en el `title`", () => {
    // Los tokens del grafo van contra la clave del usuario y los de un hijo contra su
    // suscripción: se suman TOKENS y nunca coste, y por eso el total se acompaña del reparto.
    render(<CosteDelTurno consumo={consumo(cuenta(100, 10), cuenta(7, 3))} />);
    expect(screen.getByText("107")).toBeTruthy();
    expect(screen.getByText("13")).toBeTruthy();
    const titulo = screen.getByTitle(/modelo: 100 entrada \/ 10 salida/).getAttribute("title") ?? "";
    expect(titulo).toContain("agentes externos: 7 entrada / 3 salida");
    expect(titulo).toContain("se suman TOKENS, no coste");
  });

  it("sin externos no se inventa su renglón", () => {
    const titulo = render(<CosteDelTurno consumo={consumo(cuenta(100, 10))} />).getByTitle(/Trabajo de este turno/);
    expect(titulo.getAttribute("title")).not.toContain("agentes externos");
  });

  it("un consumo a cero no se pinta: es la medida que nadie hizo", () => {
    expect(hayCosteQueEnsenar(consumo(cuenta(0, 0)))).toBe(false);
    const { container } = render(<CosteDelTurno consumo={consumo(cuenta(0, 0))} />);
    expect(container.textContent).toBe("");
  });

  it("las flechas van ocultas al oído, así que el significado va en el `aria-label`", () => {
    // Quien mira ve «↑ 8,8k ↓ 24»; quien lo oye recibiría «8,8k 24» sin saber cuál es cuál. El
    // `title` no basta para eso: no se anuncia de forma fiable.
    const { container } = render(<CosteDelTurno consumo={consumo(cuenta(8_786, 24, 100))} />);
    const caja = container.querySelector("[aria-label]");
    expect(caja?.getAttribute("aria-label")).toBe("8786 de entrada, 24 de salida, 100 de caché");
    // Y ningún signo se le escapa a un lector de pantalla: cada flecha y cada separador vive
    // dentro de un `aria-hidden`, porque «↑» leído en voz alta no significa nada. La caja de
    // fuera se excluye —su texto los contiene, y es justo la que LLEVA el `aria-label`—.
    const signos = [...container.querySelectorAll("span")].filter(
      (s) => /[↑↓·]/.test(s.textContent ?? "") && !s.hasAttribute("aria-label")
    );
    expect(signos.length).toBeGreaterThan(0);
    expect(signos.every((s) => s.getAttribute("aria-hidden") === "true")).toBe(true);
  });
});
