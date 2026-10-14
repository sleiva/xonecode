import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LecturaDeSesion } from "./LecturaDeSesion.js";

afterEach(cleanup);

/** IXCODE-36: la conversación abierta para LEER, sin caja de chat. */
describe("LecturaDeSesion", () => {
  const base = { vivo: false, alAbrirParaEscribir: vi.fn(), alCerrar: vi.fn() };

  it("sin actos todavía lo dice; un error del servidor también", () => {
    const { unmount } = render(<LecturaDeSesion {...base} motivo="tarea" />);
    expect(screen.getByText(/Leyendo la conversación/)).toBeTruthy();
    unmount();
    render(<LecturaDeSesion {...base} motivo="tarea" error="esa conversación no está en el proyecto" />);
    expect(screen.getByRole("alert").textContent).toMatch(/no está en el proyecto/);
  });

  it("cuando ya nada lo impide, ofrece abrirla para escribir; antes, no", () => {
    const alAbrirParaEscribir = vi.fn();
    const { rerender } = render(<LecturaDeSesion {...base} actos={[]} motivo="trabajando" alAbrirParaEscribir={alAbrirParaEscribir} />);
    expect(screen.queryByRole("button", { name: "Abrir para escribir" })).toBeNull();
    rerender(<LecturaDeSesion {...base} actos={[]} motivo="libre" alAbrirParaEscribir={alAbrirParaEscribir} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir para escribir" }));
    expect(alAbrirParaEscribir).toHaveBeenCalled();
    // Y nunca hay caja de chat.
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
