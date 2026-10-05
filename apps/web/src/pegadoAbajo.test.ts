import { describe, expect, it, vi } from "vitest";
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
  it("`alFinal` dice si se está abajo, y lo que llega estando arriba lo deja en falso", () => {
    const { result, rerender } = renderHook(({ dep }) => usarPegadoAbajo(dep), { initialProps: { dep: 1 } });
    expect(result.current.alFinal).toBe(true);
    const nodo = scrollerFalso(1000, 400, 100);
    result.current.nodo.current = nodo;
    act(() => result.current.alDesplazar());
    expect(result.current.alFinal).toBe(false);
    // Arriba leyendo, llega más: sigue sin estar al final.
    Object.defineProperty(nodo, "scrollHeight", { value: 1400, configurable: true });
    rerender({ dep: 2 });
    expect(result.current.alFinal).toBe(false);
    // Al fondo a mano (dentro del umbral): ya está al final.
    nodo.scrollTop = 980;
    act(() => result.current.alDesplazar());
    expect(result.current.alFinal).toBe(true);
  });

  it("`bajar` lleva al fondo y vuelve a enganchar: lo siguiente que llega se sigue", () => {
    const { result, rerender } = renderHook(({ dep }) => usarPegadoAbajo(dep), { initialProps: { dep: 1 } });
    const nodo = scrollerFalso(1000, 400, 100);
    result.current.nodo.current = nodo;
    act(() => result.current.alDesplazar());
    act(() => result.current.bajar());
    expect(result.current.alFinal).toBe(true);
    expect(nodo.scrollTop).toBe(1000);
    Object.defineProperty(nodo, "scrollHeight", { value: 1400, configurable: true });
    rerender({ dep: 2 });
    expect(nodo.scrollTop).toBe(1400);
  });

  it("con la bajada SUAVE, los `scroll` de camino no desenganchan", () => {
    const { result } = renderHook(() => usarPegadoAbajo(1));
    const nodo = scrollerFalso(1000, 400, 100);
    const scrollTo = vi.fn();
    Object.defineProperty(nodo, "scrollTo", { value: scrollTo, configurable: true });
    result.current.nodo.current = nodo;
    act(() => result.current.alDesplazar());
    act(() => result.current.bajar());
    expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" });
    // A medio camino: el navegador avisa de un scroll que aún no está abajo.
    nodo.scrollTop = 400;
    act(() => result.current.alDesplazar());
    expect(result.current.alFinal).toBe(true);
  });

  it("el `ResizeObserver` solo se crea si se pide (los tramos de trabajo no lo piden)", () => {
    const creados: unknown[] = [];
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor() {
        creados.push(this);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    try {
      const conNodo = (vigilarTamano: boolean) =>
        renderHook(() => {
          const r = usarPegadoAbajo(1, { vigilarTamano });
          // El nodo tiene que existir ANTES del efecto: se lo da un ref de callback de mentira.
          if (r.nodo.current === null) r.nodo.current = document.createElement("div");
          return r;
        });
      conNodo(false);
      expect(creados).toHaveLength(0);
      conNodo(true);
      expect(creados).toHaveLength(1);
    } finally {
      globalThis.ResizeObserver = original;
    }
  });
});
