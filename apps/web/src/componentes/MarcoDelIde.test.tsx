import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BarraDeActividad, BarraDeEstadoDelIde, MarcoDelIde } from "./MarcoDelIde.js";

describe("MarcoDelIde", () => {
  it("sin el estilo devuelve al hijo tal cual, sin marco", () => {
    const { container } = render(
      <MarcoDelIde activo={false} actividad={<nav aria-label="Actividad" />} estado={<footer />}>
        <p>consola</p>
      </MarcoDelIde>
    );
    expect(container.innerHTML).toBe("<p>consola</p>");
  });

  it("la actividad: el botón del panel solo con su manejador, y el escritorio no se pide estando en él", () => {
    const vistos: string[] = [];
    const comunes = {
      alIrAlEscritorio: () => void vistos.push("escritorio"),
      barraVisible: false,
      alAlternarBarra: () => void vistos.push("barra"),
      alAbrirAjustes: () => void vistos.push("ajustes"),
    };
    const { rerender } = render(<BarraDeActividad enEscritorio {...comunes} />);
    expect(screen.queryByRole("button", { name: "Panel" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Escritorio" }));
    expect(vistos).toEqual([]);
    rerender(<BarraDeActividad enEscritorio={false} {...comunes} panelAbierto alAlternarPanel={() => void vistos.push("panel")} />);
    fireEvent.click(screen.getByRole("button", { name: "Escritorio" }));
    fireEvent.click(screen.getByRole("button", { name: "Explorador" }));
    fireEvent.click(screen.getByRole("button", { name: "Panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Ajustes" }));
    expect(vistos).toEqual(["escritorio", "barra", "panel", "ajustes"]);
    expect(screen.getByRole("button", { name: "Panel" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("el estado pinta solo lo que consta", () => {
    render(<BarraDeEstadoDelIde conectado={false} modelo="claude-sonnet-5-5" />);
    const pie = screen.getByRole("contentinfo", { name: "Estado" });
    expect(pie.textContent).toBe("sin conexiónclaude-sonnet-5-5");
  });
});
