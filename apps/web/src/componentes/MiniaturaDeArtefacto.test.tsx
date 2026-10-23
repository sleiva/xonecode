import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MiniaturaDeArtefacto, MS_ANTES_DE_REINTENTAR_MINIATURA } from "./Chat.js";

/**
 * Soporte de una tarea en Windows (23-10-2026): el fichero estaba en su sitio pero la miniatura salía ROTA, porque el `<img>`
 * falló al pedirlo nada más anunciarse y el navegador no reintenta nunca.
 */
describe("la miniatura de una captura no se queda rota en silencio", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("si falla, reintenta UNA vez con otra URL; si vuelve a fallar, lo dice", () => {
    vi.useFakeTimers();
    render(<MiniaturaDeArtefacto src="/artefacto?n=login.png&p=p1&s=s1" alt="login.png" clase="c" />);
    const img = screen.getByRole("img", { name: "login.png" }) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/artefacto?n=login.png&p=p1&s=s1");

    fireEvent.error(img);
    // Todavía no: espera antes de volver a pedirla (el fichero recién escrito puede estar bloqueado).
    expect(screen.getByRole("img", { name: "login.png" }).getAttribute("src")).toBe("/artefacto?n=login.png&p=p1&s=s1");
    act(() => void vi.advanceTimersByTime(MS_ANTES_DE_REINTENTAR_MINIATURA));
    const otra = screen.getByRole("img", { name: "login.png" });
    expect(otra.getAttribute("src")).toBe("/artefacto?n=login.png&p=p1&s=s1&reintento=1");

    fireEvent.error(otra);
    expect(screen.getByRole("img", { name: "login.png: no se pudo cargar" }).textContent).toBe("no se pudo cargar");
  });

  it("si el reintento carga, se queda la imagen", () => {
    vi.useFakeTimers();
    render(<MiniaturaDeArtefacto src="/artefacto?n=a.png" alt="a.png" clase="c" />);
    fireEvent.error(screen.getByRole("img", { name: "a.png" }));
    act(() => void vi.advanceTimersByTime(MS_ANTES_DE_REINTENTAR_MINIATURA));
    const img = screen.getByRole("img", { name: "a.png" });
    fireEvent.load(img);
    expect(img.tagName).toBe("IMG");
    expect(screen.queryByText("no se pudo cargar")).toBeNull();
  });
});
