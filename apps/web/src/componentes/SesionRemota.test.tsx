import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SesionRemota } from "./SesionRemota";

afterEach(cleanup);

describe("la sesión remota en la consola", () => {
  it("sin estado no pinta nada", () => {
    const { container } = render(<SesionRemota remoto={undefined} enviar={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });

  it("apagada: el botón solo abre el diálogo y «Encender» la enciende", () => {
    const enviar = vi.fn(async () => {});
    render(<SesionRemota remoto={{ estado: "apagada" }} enviar={enviar} />);
    fireEvent.click(screen.getByRole("button", { name: "Sesión remota" }));
    expect(enviar).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Encender" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "remoto", accion: "encender" });
  });

  describe("la vía", () => {
    const LISTO = { instalado: true, cuenta: true };

    it("el conmutador pone aria-pressed en las dos mitades y por omisión rige ngrok", () => {
      render(<SesionRemota remoto={{ estado: "apagada" }} enviar={vi.fn()} abierto />);
      expect(screen.getByRole("button", { name: "Servidor de XOne" }).getAttribute("aria-pressed")).toBe("false");
      expect(screen.getByRole("button", { name: "Túnel local (ngrok)" }).getAttribute("aria-pressed")).toBe("true");
    });

    it("pulsar la otra manda la vía; pulsar la puesta no manda nada", () => {
      const enviar = vi.fn(async () => {});
      render(<SesionRemota remoto={{ estado: "apagada", via: "servidor", ngrok: LISTO }} enviar={enviar} abierto />);
      fireEvent.click(screen.getByRole("button", { name: "Servidor de XOne" }));
      expect(enviar).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Túnel local (ngrok)" }));
      expect(enviar).toHaveBeenCalledWith({ clase: "remoto", accion: "via", via: "ngrok" });
    });

    it("también se elige en error, y no se pinta con la sesión en marcha", () => {
      const { rerender } = render(<SesionRemota remoto={{ estado: "error", motivo: "x" }} enviar={vi.fn()} abierto />);
      expect(screen.getByRole("button", { name: "Túnel local (ngrok)" })).toBeTruthy();
      rerender(<SesionRemota remoto={{ estado: "activa", url: "https://r/r/S#K", moviles: 0 }} enviar={vi.fn()} abierto />);
      expect(screen.queryByRole("button", { name: "Túnel local (ngrok)" })).toBeNull();
    });

    it.each([
      ["sin instalar", { instalado: false, cuenta: false }, "ngrok no está instalado"],
      ["sin cuenta", { instalado: true, cuenta: false }, "le falta el authtoken"],
    ])("con ngrok %s no enciende: explica y lleva a Ajustes", (_n, ngrok, texto) => {
      const enviar = vi.fn(async () => {});
      const alAbrirAjustes = vi.fn();
      render(<SesionRemota remoto={{ estado: "apagada", via: "ngrok", ngrok }} enviar={enviar} alAbrirAjustes={alAbrirAjustes} abierto />);
      expect(screen.queryByRole("button", { name: "Encender" })).toBeNull();
      expect(screen.getByText(new RegExp(texto))).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Abrir Ajustes" }));
      expect(alAbrirAjustes).toHaveBeenCalledOnce();
      expect(enviar).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("con ngrok listo enciende", () => {
      const enviar = vi.fn(async () => {});
      render(<SesionRemota remoto={{ estado: "apagada", via: "ngrok", ngrok: LISTO }} enviar={enviar} abierto />);
      fireEvent.click(screen.getByRole("button", { name: "Encender" }));
      expect(enviar).toHaveBeenCalledWith({ clase: "remoto", accion: "encender" });
    });

    it("activa por ngrok dice la vía y avisa del aviso de ngrok; por el servidor no", () => {
      const { rerender } = render(
        <SesionRemota remoto={{ estado: "activa", url: "https://x/#K", moviles: 1, via: "ngrok", ngrok: LISTO }} enviar={vi.fn()} abierto />,
      );
      expect(screen.getByText(/Sale por un túnel de ngrok/)).toBeTruthy();
      expect(screen.getByText(/Visit Site/)).toBeTruthy();
      rerender(<SesionRemota remoto={{ estado: "activa", url: "https://x/#K", moviles: 1 }} enviar={vi.fn()} abierto />);
      expect(screen.getByText(/Sale por el servidor de XOne/)).toBeTruthy();
      expect(screen.queryByText(/Visit Site/)).toBeNull();
    });
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
