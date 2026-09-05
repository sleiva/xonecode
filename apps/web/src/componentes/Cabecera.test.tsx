import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import { Cabecera } from "./Cabecera.js";

afterEach(cleanup);

function montar(extra: Partial<Parameters<typeof Cabecera>[0]> = {}) {
  render(<Cabecera titulo="Hola, ¿qué puedes hacer?" conectado {...extra} />);
}

describe("Cabecera", () => {
  it("sin `modo` NO hay pastilla: ausente es «no se sabe», no «offline»", () => {
    // El servidor deja el campo fuera cuando no hay proyecto abierto o su config no se
    // pudo leer (`arranque.ts#modoDeProyecto`). Pintar «offline» ahí sería afirmar lo
    // que nadie ha leído — la misma clase de mentira que un alias de color inventado.
    montar();
    expect(screen.queryByText(/modo (offline|cloud)/)).toBeNull();
  });

  it("con `modo` sí la hay, y dice el que le han dado", () => {
    montar({ modo: "cloud" });
    expect(screen.getByText("modo cloud")).toBeTruthy();
    cleanup();
    montar({ modo: "offline" });
    expect(screen.getByText("modo offline")).toBeTruthy();
  });

  it("el asiento de la derecha dice si el cable sigue vivo, que es lo único que de verdad hay ahí", () => {
    // En la referencia ese asiento lo ocupa «Session log», que aquí no existe. Este test
    // fija que el hueco lo llena algo REAL y no un botón de adorno: si alguien mete el
    // botón de ellos, esto sigue verde pero el texto de conexión desaparece y se ve.
    montar({ conectado: false });
    expect(screen.getByText("sin conexión")).toBeTruthy();
  });

  /**
   * La barra superior es la única superficie de MARCA de la pantalla (azul profundo de
   * XOne, acento cian), y es lo que la hace leerse como el mismo producto que el arranque.
   * El test mira la clase y no el color: en jsdom los CSS Modules son solo nombres, así que
   * afirmar el tono aquí sería afirmar lo que este entorno no sabe — quien vigila que no se
   * cuele un color literal es `Barra.test.tsx`, sobre las hojas.
   */
  it("la cabecera lleva la clase de marca ADEMÁS de la copiada, sin sustituirla", () => {
    montar();
    const cabecera = document.querySelector("header")!;
    expect(cabecera.className).toMatch(/barraSuperior/);
    // Y sigue llevando la de deepseek: la geometría es suya, solo se le pone color encima.
    expect(cabecera.className.split(/\s+/).length).toBeGreaterThan(1);
  });
});
