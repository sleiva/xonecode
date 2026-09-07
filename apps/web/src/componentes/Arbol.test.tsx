import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Arbol } from "./Arbol.js";
import { arbolDeRutas } from "../arbolDeRutas.js";

afterEach(cleanup);

const NODOS = arbolDeRutas(["app.xml", "src/Clientes.xne", "src/Pedidos.xne", "src/ui/base.css"]);

describe("Arbol", () => {
  it("las carpetas del primer nivel nacen abiertas; las de dentro, cerradas hasta pulsarlas", () => {
    render(<Arbol nodos={NODOS} alElegir={vi.fn()} />);
    expect(screen.getByRole("treeitem", { name: "src" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("treeitem", { name: "ui" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("treeitem", { name: "base.css" })).toBeNull();
    fireEvent.click(screen.getByRole("treeitem", { name: "ui" }));
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
});
