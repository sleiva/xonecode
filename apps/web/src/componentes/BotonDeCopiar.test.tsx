import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BotonDeCopiar } from "./BotonDeCopiar.js";

describe("BotonDeCopiar", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("copia el texto y lo ACUSA, en vez de callar", async () => {
    const escribir = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText: escribir } });
    render(<BotonDeCopiar texto="lo copiado" />);

    fireEvent.click(screen.getByRole("button", { name: /copiar/i }));
    expect(escribir).toHaveBeenCalledWith("lo copiado");
    // Un botón que copia y no dice nada deja al usuario pulsando otra vez por si acaso.
    await waitFor(() => expect(screen.getByRole("button", { name: /copiado/i })).toBeTruthy());
  });

  /**
   * `navigator.clipboard` no existe fuera de un contexto seguro y puede estar denegado por
   * permisos. Quedarse callado sería prometer una copia que no ocurrió.
   */
  it("si el portapapeles falla, lo dice", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: async () => {
          throw new Error("denegado");
        },
      },
    });
    render(<BotonDeCopiar texto="da igual" />);
    fireEvent.click(screen.getByRole("button", { name: /copiar/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /no se pudo copiar/i })).toBeTruthy());
  });

  it("el acuse no se queda para siempre: vuelve a su sitio", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { clipboard: { writeText: async () => {} } });
    render(<BotonDeCopiar texto="x" />);
    fireEvent.click(screen.getByRole("button", { name: /copiar/i }));
    // El `writeText` es asíncrono: se deja resolver antes de correr el reloj.
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.getByRole("button", { name: /copiado/i })).toBeTruthy();
    await vi.advanceTimersByTimeAsync(2100);
    expect(screen.getByRole("button", { name: /^copiar$/i })).toBeTruthy();
    vi.useRealTimers();
  });
});
