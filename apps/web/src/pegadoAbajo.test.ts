import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usarPegadoAbajo } from "./pegadoAbajo.js";

/**
 * jsdom no hace layout: `scrollHeight` y `clientHeight` valen 0 salvo que se les ponga un
 * valor. Se les pone a mano, que es lo que permite probar la REGLA —seguir al fondo solo si
 * ya estabas abajo— sin un navegador de verdad.
 */
function scrollerFalso(alto: number, visible: number, arriba: number): HTMLDivElement {
  const nodo = document.createElement("div");
  Object.defineProperty(nodo, "scrollHeight", { value: alto, configurable: true });
  Object.defineProperty(nodo, "clientHeight", { value: visible, configurable: true });
  nodo.scrollTop = arriba;
  return nodo;
}

describe("usarPegadoAbajo", () => {
  it("estando abajo, sigue lo que llega", () => {
    const { result, rerender } = renderHook(({ dep }) => usarPegadoAbajo(dep), {
      initialProps: { dep: 1 },
    });
    const nodo = scrollerFalso(1000, 400, 600); // justo al fondo
    result.current.nodo.current = nodo;
    act(() => result.current.alDesplazar());

    Object.defineProperty(nodo, "scrollHeight", { value: 1400, configurable: true });
    rerender({ dep: 2 });
    expect(nodo.scrollTop).toBe(1400);
  });

  it("si has subido a leer, NO te devuelve al fondo", () => {
    const { result, rerender } = renderHook(({ dep }) => usarPegadoAbajo(dep), {
      initialProps: { dep: 1 },
    });
    const nodo = scrollerFalso(1000, 400, 100); // muy arriba
    result.current.nodo.current = nodo;
    act(() => result.current.alDesplazar());

    Object.defineProperty(nodo, "scrollHeight", { value: 1400, configurable: true });
    rerender({ dep: 2 });
    // Sigue donde estaba: subir a mirar lo que hizo el agente hace dos tools no puede
    // costarte volver al final en cada parcial.
    expect(nodo.scrollTop).toBe(100);
  });

  it("volver al fondo vuelve a engancharlo", () => {
    const { result, rerender } = renderHook(({ dep }) => usarPegadoAbajo(dep), {
      initialProps: { dep: 1 },
    });
    const nodo = scrollerFalso(1000, 400, 100);
    result.current.nodo.current = nodo;
    act(() => result.current.alDesplazar());
    nodo.scrollTop = 600;
    act(() => result.current.alDesplazar());

    Object.defineProperty(nodo, "scrollHeight", { value: 1400, configurable: true });
    rerender({ dep: 2 });
    expect(nodo.scrollTop).toBe(1400);
  });
});
