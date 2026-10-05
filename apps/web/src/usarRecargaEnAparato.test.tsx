import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usarRecargaEnAparato } from "./usarRecargaEnAparato.js";

afterEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    // jsdom sin almacenamiento: nada que limpiar.
  }
});

describe("usarRecargaEnAparato", () => {
  it("solo está disponible con un ANDROID en la sesión; sin él, «al guardar» nunca es cierto", () => {
    window.localStorage.setItem("xonecode.recargarAlGuardar", "1");
    const enviar = vi.fn(() => Promise.resolve(undefined));
    expect(renderHook(() => usarRecargaEnAparato({ enviar, plataforma: undefined })).result.current).toMatchObject({ disponible: false, alGuardar: false });
    expect(renderHook(() => usarRecargaEnAparato({ enviar, plataforma: "ios" })).result.current).toMatchObject({ disponible: false, alGuardar: false });
    expect(renderHook(() => usarRecargaEnAparato({ enviar, plataforma: "android" })).result.current).toMatchObject({ disponible: true, alGuardar: true });
  });

  it("la casilla se recuerda en este navegador", () => {
    const enviar = vi.fn(() => Promise.resolve(undefined));
    const vista = renderHook(() => usarRecargaEnAparato({ enviar, plataforma: "android" }));
    expect(vista.result.current.alGuardar).toBe(false);
    act(() => vista.result.current.alternar());
    expect(vista.result.current.alGuardar).toBe(true);
    expect(window.localStorage.getItem("xonecode.recargarAlGuardar")).toBe("1");
  });

  it("probar y relanzar mandan su intención, y el servidor decide", () => {
    const enviar = vi.fn((_m: unknown) => Promise.resolve(undefined));
    const vista = renderHook(() => usarRecargaEnAparato({ enviar, plataforma: "android" }));
    vista.result.current.probar("a.xne");
    vista.result.current.relanzar("e.css");
    expect(enviar.mock.calls.map(([m]) => m)).toEqual([
      { clase: "recargarEnAparato", ruta: "a.xne", probar: true },
      { clase: "recargarEnAparato", ruta: "e.css", relanzar: true },
    ]);
  });
});
