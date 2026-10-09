import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SesionRemota } from "./SesionRemota";

afterEach(cleanup);

describe("la sesión remota en la consola", () => {
  it("sin estado no pinta nada", () => {
    const { container } = render(<SesionRemota remoto={undefined} enviar={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("apagada: el botón la enciende y abre el diálogo", () => {
    const enviar = vi.fn(async () => {});
    render(<SesionRemota remoto={{ estado: "apagada" }} enviar={enviar} />);
    fireEvent.click(screen.getByRole("button", { name: "Sesión remota" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "remoto", accion: "encender" });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("activa: QR como imagen, URL, aparatos, revocar y apagar", async () => {
    const enviar = vi.fn(async () => {});
    render(<SesionRemota remoto={{ estado: "activa", url: "https://r/r/S#K", moviles: 2 }} enviar={enviar} abierto />);
    await waitFor(() => expect((screen.getByAltText("Código QR de la sesión remota") as HTMLImageElement).src).toMatch(/^data:image\/svg\+xml/));
    expect(screen.getByText("https://r/r/S#K")).toBeTruthy();
    expect(screen.getByText("2 aparatos conectados")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Revocar enlace" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "remoto", accion: "revocar" });
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "remoto", accion: "apagar" });
  });

  it("error: enseña el motivo", () => {
    render(<SesionRemota remoto={{ estado: "error", motivo: "la sesión remota no está disponible en esta instalación" }} enviar={vi.fn()} abierto />);
    expect(screen.getByText("la sesión remota no está disponible en esta instalación")).toBeTruthy();
  });

  it("Escape cierra el diálogo sin mandar nada, y el foco vuelve al botón", () => {
    const enviar = vi.fn(async () => {});
    render(<SesionRemota remoto={{ estado: "activa", url: "https://r/r/S#K", moviles: 1 }} enviar={enviar} />);
    const boton = screen.getByRole("button", { name: "Sesión remota" });
    boton.focus();
    fireEvent.click(boton);
    expect(screen.getByRole("dialog", { name: "Sesión remota" })).toBeTruthy();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(boton);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("el clic en el velo cierra sin mandar nada", () => {
    const enviar = vi.fn(async () => {});
    const { baseElement } = render(<SesionRemota remoto={{ estado: "activa", url: "https://r/r/S#K", moviles: 1 }} enviar={enviar} abierto />);
    const ventana = screen.getByRole("dialog");
    fireEvent.click(ventana.firstElementChild as HTMLElement);
    expect(baseElement.querySelector("[role=dialog]")).toBeNull();
    expect(enviar).not.toHaveBeenCalled();
  });

  it("cerrado, la URL no está en el DOM", () => {
    render(<SesionRemota remoto={{ estado: "activa", url: "https://r/r/S#K", moviles: 1 }} enviar={vi.fn()} />);
    expect(screen.queryByText("https://r/r/S#K")).toBeNull();
  });

  it("al pasar a apagada el diálogo se va; al perder el estado y volver no reaparece", () => {
    const activa = { estado: "activa", url: "https://r/r/S#K", moviles: 1 } as const;
    const { rerender } = render(<SesionRemota remoto={activa} enviar={vi.fn()} abierto />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    rerender(<SesionRemota remoto={{ estado: "apagada" }} enviar={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<SesionRemota remoto={activa} enviar={vi.fn()} abierto />);
    rerender(<SesionRemota remoto={undefined} enviar={vi.fn()} />);
    rerender(<SesionRemota remoto={activa} enviar={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    ["abriendo", { estado: "abriendo" } as const],
    ["reconectando sin url", { estado: "reconectando", moviles: 0 } as const],
  ])("%s: se puede apagar, sin enlace que enseñar", (_n, remoto) => {
    const enviar = vi.fn(async () => {});
    render(<SesionRemota remoto={remoto} enviar={enviar} abierto />);
    expect(screen.queryByRole("button", { name: "Revocar enlace" })).toBeNull();
    expect(screen.queryByAltText("Código QR de la sesión remota")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Apagar" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "remoto", accion: "apagar" });
  });

  it("reconectando sin url dice que el puente no contesta", () => {
    render(<SesionRemota remoto={{ estado: "reconectando", moviles: 0 }} enviar={vi.fn()} abierto />);
    expect(screen.getByText("No se puede llegar al puente; se sigue intentando…")).toBeTruthy();
  });

  it("revocar (activa → abriendo → activa) no cierra el diálogo", () => {
    const { rerender } = render(<SesionRemota remoto={{ estado: "activa", url: "https://r/r/S#K", moviles: 1 }} enviar={vi.fn()} abierto />);
    rerender(<SesionRemota remoto={{ estado: "abriendo" }} enviar={vi.fn()} />);
    rerender(<SesionRemota remoto={{ estado: "activa", url: "https://r/r/T#L", moviles: 0 }} enviar={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("https://r/r/T#L")).toBeTruthy();
  });
});
