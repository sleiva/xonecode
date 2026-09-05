import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { Cabecera } from "./Cabecera.js";

afterEach(cleanup);

function montar(extra: Partial<Parameters<typeof Cabecera>[0]> = {}) {
  const alElegirPestana = vi.fn();
  render(
    <Cabecera
      titulo="Hola, ¿qué puedes hacer?"
      conectado
      pestana="chat"
      alElegirPestana={alElegirPestana}
      {...extra}
    />
  );
  return { alElegirPestana };
}

describe("Cabecera", () => {
  it("la tira de pestañas vive AQUÍ, y dice cuál está elegida", () => {
    // Antes vivían en `Transcript`. Se mudaron con el CSS de deepseek: allí `.tabs` es
    // hija de `.header`, y la línea de separación la pinta `.header::after` — repartidas
    // entre dos cajas, esa línea caía entre el título y las pestañas en vez de debajo de
    // ellas.
    montar();
    expect(screen.getByRole("tab", { name: "Chat" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Trayectoria" }).getAttribute("aria-selected")).toBe("false");
  });

  it("pulsar una pestaña lo pide hacia arriba: quien recuerda la elección es `App`, no esto", () => {
    const { alElegirPestana } = montar();
    fireEvent.click(screen.getByRole("tab", { name: "Trayectoria" }));
    expect(alElegirPestana).toHaveBeenCalledWith("trayectoria");
  });

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
