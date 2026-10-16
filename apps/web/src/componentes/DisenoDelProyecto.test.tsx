import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DisenoDelProyecto, SelectorDePantalla } from "./DisenoDelProyecto.js";

afterEach(cleanup);

const PANTALLAS = [
  { name: "projects/9/screens/aa", title: "Listado de Entregas", miniatura: "https://lh3.googleusercontent.com/a" },
  { name: "projects/9/screens/bb", title: "image.png" },
];

describe("SelectorDePantalla", () => {
  it("pide las pantallas al montarse y elige UNA por su miniatura; volver a pulsarla la quita", () => {
    const alPedir = vi.fn();
    const alElegir = vi.fn();
    const { rerender } = render(<SelectorDePantalla alPedir={alPedir} alElegir={alElegir} />);
    expect(alPedir).toHaveBeenCalledOnce();
    expect(screen.getByText("Pidiendo las pantallas…")).toBeTruthy();
    rerender(<SelectorDePantalla diseno={{ proyecto: "p1", vinculo: { proyecto: "projects/9", nombre: "Maset" }, pantallas: PANTALLAS }} alPedir={alPedir} alElegir={alElegir} />);
    const boton = screen.getByRole("button", { name: /Listado de Entregas/ });
    expect(boton.querySelector("img")?.getAttribute("referrerpolicy")).toBe("no-referrer");
    fireEvent.click(boton);
    expect(alElegir).toHaveBeenLastCalledWith({ name: "projects/9/screens/aa", titulo: "Listado de Entregas" });
    rerender(
      <SelectorDePantalla
        diseno={{ proyecto: "p1", vinculo: { proyecto: "projects/9", nombre: "Maset" }, pantallas: PANTALLAS }}
        alPedir={alPedir}
        elegida={{ name: "projects/9/screens/aa", titulo: "Listado de Entregas" }}
        alElegir={alElegir}
      />
    );
    expect(screen.getByRole("button", { name: /Listado de Entregas/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Listado de Entregas/ }));
    expect(alElegir).toHaveBeenLastCalledWith(undefined);
  });

  it("el buscador filtra por el título, sin tildes ni mayúsculas y palabra a palabra, y dice cuántas quedan", () => {
    const diseno = {
      proyecto: "p1",
      vinculo: { proyecto: "projects/9", nombre: "Maset" },
      pantallas: [...PANTALLAS, { name: "projects/9/screens/cc", title: "Liquidación - Maset Logística" }],
    };
    render(<SelectorDePantalla diseno={diseno} alPedir={() => {}} alElegir={() => {}} />);
    expect(screen.getByText("3 pantallas")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar pantalla" }), { target: { value: "entregas LISTADO" } });
    expect(screen.getByText("1 de 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Listado de Entregas/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /image\.png/ })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar pantalla" }), { target: { value: "liquidacion" } });
    expect(screen.getByRole("button", { name: /Liquidación/ })).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar pantalla" }), { target: { value: "nada" } });
    expect(screen.getByText("Ninguna pantalla lleva esas palabras.")).toBeTruthy();
  });

  it("sin proyecto de Stitch vinculado lo DICE con el camino, no una lista vacía", () => {
    render(<SelectorDePantalla diseno={{ proyecto: "p1", vinculo: null, pantallas: [] }} alPedir={() => {}} alElegir={() => {}} />);
    expect(screen.getByText(/no tiene un proyecto de Stitch vinculado/)).toBeTruthy();
  });
});

describe("DisenoDelProyecto (panel → Conectores)", () => {
  it("vincula eligiendo uno de los proyectos de Stitch, y desvincula", () => {
    const alDiseno = vi.fn();
    const { rerender } = render(<DisenoDelProyecto stitchAnadido alDiseno={alDiseno} diseno={{ proyecto: "p1", vinculo: null }} />);
    expect(alDiseno).toHaveBeenCalledWith({ accion: "estado" });
    fireEvent.click(screen.getByRole("button", { name: "Vincular un proyecto de Stitch" }));
    expect(alDiseno).toHaveBeenLastCalledWith({ accion: "proyectos" });
    rerender(<DisenoDelProyecto stitchAnadido alDiseno={alDiseno} diseno={{ proyecto: "p1", vinculo: null, proyectos: [{ name: "projects/9", title: "Maset" }] }} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Proyecto de Stitch" }), { target: { value: "projects/9" } });
    fireEvent.click(screen.getByRole("button", { name: "Vincular" }));
    expect(alDiseno).toHaveBeenLastCalledWith({ accion: "vincular", vinculo: { proyecto: "projects/9", nombre: "Maset" } });
    rerender(<DisenoDelProyecto stitchAnadido alDiseno={alDiseno} diseno={{ proyecto: "p1", vinculo: { proyecto: "projects/9", nombre: "Maset" } }} />);
    expect(screen.getByText("«Maset»")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Desvincular" }));
    expect(alDiseno).toHaveBeenLastCalledWith({ accion: "desvincular" });
  });

  it("sin Stitch añadido no pide nada y dice dónde se añade", () => {
    const alDiseno = vi.fn();
    render(<DisenoDelProyecto stitchAnadido={false} alDiseno={alDiseno} />);
    expect(alDiseno).not.toHaveBeenCalled();
    expect(screen.getByText(/Stitch no está añadido/)).toBeTruthy();
  });
});
