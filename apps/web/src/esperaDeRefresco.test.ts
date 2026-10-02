import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOPE_DE_REFRESCO_MS, useEsperaDeRefresco } from "./esperaDeRefresco.js";

describe("useEsperaDeRefresco", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("espera desde que se pulsa hasta que la señal es OTRA", () => {
    const { result, rerender } = renderHook(({ senal }) => useEsperaDeRefresco(senal, true), {
      initialProps: { senal: { n: 1 } as object },
    });
    expect(result.current.esperando).toBe(false);
    act(() => result.current.empezar());
    expect(result.current.esperando).toBe(true);
    rerender({ senal: { n: 2 } });
    expect(result.current.esperando).toBe(false);
  });

  it("la MISMA señal no la da por llegada", () => {
    const senal = { n: 1 };
    const { result, rerender } = renderHook(({ s }) => useEsperaDeRefresco(s, true), { initialProps: { s: senal } });
    act(() => result.current.empezar());
    rerender({ s: senal });
    expect(result.current.esperando).toBe(true);
  });

  it("se deja de esperar si se cae el cable", () => {
    const { result, rerender } = renderHook(({ c }) => useEsperaDeRefresco("x", c), {
      initialProps: { c: true as boolean },
    });
    act(() => result.current.empezar());
    rerender({ c: false });
    expect(result.current.esperando).toBe(false);
  });

  it("y al vencer el tope, aunque no llegue nada", () => {
    const { result } = renderHook(() => useEsperaDeRefresco("x", true));
    act(() => result.current.empezar());
    act(() => vi.advanceTimersByTime(TOPE_DE_REFRESCO_MS - 1));
    expect(result.current.esperando).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.esperando).toBe(false);
  });
});
