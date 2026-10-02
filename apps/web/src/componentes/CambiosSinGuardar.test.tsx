import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CambiosSinGuardar } from "./CambiosSinGuardar.js";

afterEach(cleanup);

describe("CambiosSinGuardar", () => {
  it("es un diálogo de verdad que nombra el fichero y deja elegir", () => {
    const alDescartar = vi.fn();
    const alSeguir = vi.fn();
    render(<CambiosSinGuardar ruta="app/Clientes.xne" alDescartar={alDescartar} alSeguir={alSeguir} />);
    const dialogo = screen.getByRole("alertdialog", { name: "Cambios sin guardar" });
    expect(dialogo.textContent).toContain("app/Clientes.xne");
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(alSeguir).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(alDescartar).toHaveBeenCalledTimes(1);
  });

  it("el clic en el velo es «Seguir editando», no descartar", () => {
    const alDescartar = vi.fn();
    const alSeguir = vi.fn();
    render(<CambiosSinGuardar ruta="a.xne" alDescartar={alDescartar} alSeguir={alSeguir} />);
    const velo = screen.getByRole("alertdialog", { name: "Cambios sin guardar" }).parentElement!;
    fireEvent.click(velo);
    expect(alSeguir).toHaveBeenCalledTimes(1);
    expect(alDescartar).not.toHaveBeenCalled();
  });
});
