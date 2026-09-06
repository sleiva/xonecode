import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { useCronometro } from "./cronometro.js";

describe("useCronometro", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("inactivo no cuenta nada: `undefined`, no «0 s»", () => {
    const { result } = renderHook(() => useCronometro(false));
    expect(result.current).toBeUndefined();
  });

  it("al activarse arranca en 0 y avanza un segundo por tic", () => {
    const { result, rerender } = renderHook(({ activo }) => useCronometro(activo), { initialProps: { activo: false } });
    rerender({ activo: true });
    expect(result.current).toBe(0);
    act(() => void vi.advanceTimersByTime(3000));
    expect(result.current).toBe(3);
  });

  it("al desactivarse vuelve a `undefined` y deja de contar", () => {
    const { result, rerender } = renderHook(({ activo }) => useCronometro(activo), { initialProps: { activo: true } });
    act(() => void vi.advanceTimersByTime(2000));
    expect(result.current).toBe(2);
    rerender({ activo: false });
    expect(result.current).toBeUndefined();
    act(() => void vi.advanceTimersByTime(5000));
    expect(result.current).toBeUndefined();
  });
});
