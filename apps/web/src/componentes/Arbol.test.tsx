import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Arbol } from "./Arbol.js";
import { arbolDeRutas } from "../arbolDeRutas.js";

afterEach(cleanup);

const NODOS = arbolDeRutas(["app.xml", "src/Clientes.xne", "src/Pedidos.xne", "src/ui/base.css"]);

describe("Arbol", () => {
  it("por omisión las carpetas del primer nivel nacen abiertas; las de dentro, cerradas hasta pulsarlas", () => {
    render(<Arbol nodos={NODOS} alElegir={vi.fn()} />);
    expect(screen.getByRole("treeitem", { name: "src" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("treeitem", { name: "ui" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("treeitem", { name: "base.css" })).toBeNull();
    fireEvent.click(screen.getByRole("treeitem", { name: "ui" }));
    expect(screen.getByRole("treeitem", { name: "base.css" })).toBeTruthy();
  });

  it("con abiertas=«ninguna» nace todo plegado, y pulsar una carpeta la abre", () => {
    render(<Arbol nodos={NODOS} alElegir={vi.fn()} abiertas="ninguna" />);
    expect(screen.getByRole("treeitem", { name: "src" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("treeitem", { name: "Clientes.xne" })).toBeNull();
    // La hoja de la raíz sí se ve: no cuelga de ninguna carpeta.
    expect(screen.getByRole("treeitem", { name: "app.xml" })).toBeTruthy();
    fireEvent.click(screen.getByRole("treeitem", { name: "src" }));
    expect(screen.getByRole("treeitem", { name: "Clientes.xne" })).toBeTruthy();
    // Y lo de dentro sigue plegado: abrir una carpeta abre esa, no su subárbol.
    expect(screen.getByRole("treeitem", { name: "ui" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("con abiertas=«ninguna» el filtro sigue abriendo lo que casa", () => {
    render(<Arbol nodos={NODOS} alElegir={vi.fn()} abiertas="ninguna" filtro="base" />);
    expect(screen.getByRole("treeitem", { name: "base.css" })).toBeTruthy();
  });

  it("el filtro mira la ruta completa sin mayúsculas, y abre las carpetas con alguna hoja que casa", () => {
    render(<Arbol nodos={NODOS} alElegir={vi.fn()} filtro="CLI" />);
    expect(screen.getByRole("treeitem", { name: "Clientes.xne" })).toBeTruthy();
    expect(screen.queryByRole("treeitem", { name: "Pedidos.xne" })).toBeNull();
    expect(screen.queryByRole("treeitem", { name: "app.xml" })).toBeNull();
    // «ui» no tiene nada que case: no se pinta.
    expect(screen.queryByRole("treeitem", { name: "ui" })).toBeNull();
  });

  it("pulsar una hoja la reporta hacia arriba, y la elegida se marca con aria-current", () => {
    const alElegir = vi.fn();
    render(<Arbol nodos={NODOS} alElegir={alElegir} elegida="src/Pedidos.xne" />);
    fireEvent.click(screen.getByRole("treeitem", { name: "Clientes.xne" }));
    expect(alElegir).toHaveBeenCalledWith("src/Clientes.xne");
    expect(screen.getByRole("treeitem", { name: "Pedidos.xne" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("treeitem", { name: "Clientes.xne" }).getAttribute("aria-current")).toBeNull();
  });

  it("la insignia se pinta dentro de la fila de la hoja", () => {
    render(<Arbol nodos={NODOS} alElegir={vi.fn()} insignia={(ruta) => <span data-testid="insignia">{ruta.endsWith(".xml") ? "M" : "A"}</span>} />);
    expect(screen.getAllByTestId("insignia").length).toBe(3); // app.xml, Clientes, Pedidos (base.css está plegada)
  });

  it("el grupo de una carpeta se declara con aria-owns, y aria-level marca la profundidad", () => {
    render(<Arbol nodos={NODOS} alElegir={vi.fn()} />);
    const src = screen.getByRole("treeitem", { name: "src" });
    const clientes = screen.getByRole("treeitem", { name: "Clientes.xne" });
    const grupo = clientes.closest('ul[role="group"]');
    expect(grupo).not.toBeNull();
    expect(src.getAttribute("aria-owns")).toBe(grupo!.id);
    expect(src.getAttribute("aria-level")).toBe("1");
    expect(clientes.getAttribute("aria-level")).toBe("2");
  });
  it("cada hoja lleva el icono de su TIPO, y no cambia su nombre accesible", () => {
    render(<Arbol nodos={NODOS} alElegir={vi.fn()} />);
    const tipo = (nombre: string): string | null =>
      screen.getByRole("treeitem", { name: nombre }).querySelector("svg[data-icono]")?.getAttribute("data-icono") ?? null;
    expect(tipo("app.xml")).toBe("xml");
    expect(tipo("Clientes.xne")).toBe("xne");
    // Decorativo: el «JS» o el «Aa» de dentro de un icono no pueden colarse en el nombre de la fila.
    for (const svg of document.querySelectorAll("svg[data-icono]")) expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  it("cada carpeta lleva el icono de carpeta, abierta o cerrada según esté", () => {
    render(<Arbol nodos={NODOS} alElegir={vi.fn()} />);
    expect(screen.getByRole("treeitem", { name: "src" }).querySelector("svg[data-icono]")?.getAttribute("data-icono")).toBe("carpeta-abierta");
    expect(screen.getByRole("treeitem", { name: "ui" }).querySelector("svg[data-icono]")?.getAttribute("data-icono")).toBe("carpeta");
  });

  it("una línea guía por cada nivel de sangrado, decorativa", () => {
    render(<Arbol nodos={NODOS} alElegir={vi.fn()} />);
    expect(screen.getByRole("treeitem", { name: "app.xml" }).querySelectorAll("[data-guia]")).toHaveLength(0);
    const guias = screen.getByRole("treeitem", { name: "Clientes.xne" }).querySelectorAll("[data-guia]");
    expect(guias).toHaveLength(1);
    expect(guias[0]!.getAttribute("aria-hidden")).toBe("true");
  });

  it("los .xml de XOne Studio llevan la marca para ir en gris: no se tocan", () => {
    render(<Arbol nodos={NODOS} alElegir={vi.fn()} />);
    expect(screen.getByRole("treeitem", { name: "app.xml" }).getAttribute("data-fichero")).toBe("xml");
    expect(screen.getByRole("treeitem", { name: "Clientes.xne" }).getAttribute("data-fichero")).toBe("xne");
  });
});
