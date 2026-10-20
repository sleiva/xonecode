import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { DisenoDelProyecto, SelectorDePantalla, TOPE_DE_PANTALLAS } from "./DisenoDelProyecto.js";

afterEach(cleanup);

const PANTALLAS = [
  { name: "projects/9/screens/aa", title: "Listado de Entregas", miniatura: "https://lh3.googleusercontent.com/a" },
  { name: "projects/9/screens/bb", title: "image.png" },
];

describe("SelectorDePantalla", () => {
  it("pide las pantallas al montarse, se eligen por su miniatura y volver a pulsar una la QUITA de la lista", () => {
    const alPedir = vi.fn();
    const alCambiar = vi.fn();
    const { rerender } = render(<SelectorDePantalla alPedir={alPedir} elegidas={[]} alCambiar={alCambiar} />);
    expect(alPedir).toHaveBeenCalledOnce();
    expect(screen.getByText("Pidiendo las pantallas…")).toBeTruthy();
    rerender(<SelectorDePantalla diseno={{ proyecto: "p1", vinculo: { proyecto: "projects/9", nombre: "Maset" }, pantallas: PANTALLAS }} alPedir={alPedir} elegidas={[]} alCambiar={alCambiar} />);
    const boton = screen.getByRole("button", { name: /Listado de Entregas/ });
    expect(boton.querySelector("img")?.getAttribute("referrerpolicy")).toBe("no-referrer");
    fireEvent.click(boton);
    expect(alCambiar).toHaveBeenLastCalledWith([{ name: "projects/9/screens/aa", titulo: "Listado de Entregas" }]);
    const una = [{ name: "projects/9/screens/aa", titulo: "Listado de Entregas" }];
    rerender(
      <SelectorDePantalla
        diseno={{ proyecto: "p1", vinculo: { proyecto: "projects/9", nombre: "Maset" }, pantallas: PANTALLAS }}
        alPedir={alPedir}
        elegidas={una}
        alCambiar={alCambiar}
      />
    );
    expect(screen.getByRole("button", { name: /Listado de Entregas/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Listado de Entregas/ }));
    expect(alCambiar).toHaveBeenLastCalledWith([]);
  });

  /** IXCODE-63: varias, en el orden en que se eligen, y como mucho `TOPE_DE_PANTALLAS`. */
  it("pulsar otra la AÑADE detrás; al llegar al tope las demás se apagan diciendo por qué", () => {
    const alCambiar = vi.fn();
    const muchas = Array.from({ length: TOPE_DE_PANTALLAS + 1 }, (_, i) => ({ name: `projects/9/screens/s${i}`, title: `Pantalla ${i}` }));
    const diseno = { proyecto: "p1", vinculo: { proyecto: "projects/9", nombre: "Maset" }, pantallas: muchas };
    const una = [{ name: "projects/9/screens/s0", titulo: "Pantalla 0" }];
    const { rerender } = render(<SelectorDePantalla diseno={diseno} alPedir={() => {}} elegidas={una} alCambiar={alCambiar} />);
    fireEvent.click(screen.getByRole("button", { name: /Pantalla 1$/ }));
    expect(alCambiar).toHaveBeenLastCalledWith([...una, { name: "projects/9/screens/s1", titulo: "Pantalla 1" }]);
    const llenas = muchas.slice(0, TOPE_DE_PANTALLAS).map((p) => ({ name: p.name, titulo: p.title }));
    rerender(<SelectorDePantalla diseno={diseno} alPedir={() => {}} elegidas={llenas} alCambiar={alCambiar} />);
    expect(screen.getByText(new RegExp(`Elegidas \\(${TOPE_DE_PANTALLAS} de ${TOPE_DE_PANTALLAS}\\)`))).toBeTruthy();
    const fuera = screen.getByRole("button", { name: new RegExp(`Pantalla ${TOPE_DE_PANTALLAS}$`) });
    expect(fuera).toHaveProperty("disabled", true);
    expect(fuera.getAttribute("title")).toBe(`como mucho ${TOPE_DE_PANTALLAS} pantallas por tarea`);
    // Las elegidas siguen pudiéndose quitar.
    expect(screen.getByRole("button", { name: /Pantalla 0$/ })).toHaveProperty("disabled", false);
  });

  it("las elegidas se listan NUMERADAS y una por línea, en su orden (petición suya)", () => {
    const diseno = { proyecto: "p1", vinculo: { proyecto: "projects/9", nombre: "Maset" }, pantallas: PANTALLAS };
    const dos = [
      { name: "projects/9/screens/bb", titulo: "Entrega - Forma de Pago" },
      { name: "projects/9/screens/aa", titulo: "Liquidación" },
    ];
    render(<SelectorDePantalla diseno={diseno} alPedir={() => {}} elegidas={dos} alCambiar={() => {}} />);
    const lista = screen.getByRole("list");
    expect(lista.tagName).toBe("OL");
    expect(within(lista).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["«Entrega - Forma de Pago»", "«Liquidación»"]);
  });

  it("el buscador filtra por el título, sin tildes ni mayúsculas y palabra a palabra, y dice cuántas quedan", () => {
    const diseno = {
      proyecto: "p1",
      vinculo: { proyecto: "projects/9", nombre: "Maset" },
      pantallas: [...PANTALLAS, { name: "projects/9/screens/cc", title: "Liquidación - Maset Logística" }],
    };
    render(<SelectorDePantalla diseno={diseno} alPedir={() => {}} elegidas={[]} alCambiar={() => {}} />);
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
    render(<SelectorDePantalla diseno={{ proyecto: "p1", vinculo: null, pantallas: [] }} alPedir={() => {}} elegidas={[]} alCambiar={() => {}} />);
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
