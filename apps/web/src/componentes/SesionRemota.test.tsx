import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SesionRemota } from "./SesionRemota";

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
});
