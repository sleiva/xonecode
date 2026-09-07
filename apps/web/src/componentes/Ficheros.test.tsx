import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Ficheros } from "./Ficheros.js";

afterEach(cleanup);
const NADA = () => {};
const ARBOL = { rutas: ["app.xml", "src/Clientes.xne", "src/Pedidos.xne"], recortado: false };
const AQUI = dirname(fileURLToPath(import.meta.url));

describe("Ficheros", () => {
  it("pide el árbol al montar: entrar a mirar ES la petición", () => {
    const recargar = vi.fn();
    render(<Ficheros contenidos={{}} alElegir={NADA} alRecargar={recargar} />);
    expect(recargar).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/consultando el árbol/i)).toBeTruthy();
  });

  it("un árbol con error lo dice, y no enseña un proyecto vacío", () => {
    render(<Ficheros arbol={{ rutas: [], recortado: false, error: "disco roto" }} contenidos={{}} alElegir={NADA} alRecargar={NADA} />);
    expect(screen.getByText(/disco roto/)).toBeTruthy();
    expect(screen.queryByRole("tree")).toBeNull();
  });

  it("un árbol recortado lo dice", () => {
    render(<Ficheros arbol={{ ...ARBOL, recortado: true }} contenidos={{}} alElegir={NADA} alRecargar={NADA} />);
    expect(screen.getByText(/recortado/i)).toBeTruthy();
  });

  it("el filtro deja ver lo que casa y esconde lo demás", () => {
    render(<Ficheros arbol={ARBOL} contenidos={{}} alElegir={NADA} alRecargar={NADA} />);
    fireEvent.change(screen.getByPlaceholderText(/filtrar/i), { target: { value: "cli" } });
    expect(screen.getByRole("treeitem", { name: "Clientes.xne" })).toBeTruthy();
    expect(screen.queryByRole("treeitem", { name: "Pedidos.xne" })).toBeNull();
  });

  it("pulsar una hoja la elige; sin elegido se invita a elegir", () => {
    const alElegir = vi.fn();
    render(<Ficheros arbol={ARBOL} contenidos={{}} alElegir={alElegir} alRecargar={NADA} />);
    expect(screen.getByText(/elige un fichero/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("treeitem", { name: "Clientes.xne" }));
    expect(alElegir).toHaveBeenCalledWith("src/Clientes.xne");
  });

  it("elegido sin contenido todavía: «trayendo»", () => {
    render(<Ficheros arbol={ARBOL} contenidos={{}} elegido="app.xml" alElegir={NADA} alRecargar={NADA} />);
    expect(screen.getByText(/trayendo/i)).toBeTruthy();
  });

  it("un binario dice que lo es y su tamaño, sin visor", () => {
    render(
      <Ficheros arbol={ARBOL} contenidos={{ "app.xml": { ruta: "app.xml", recortado: false, binario: true, bytes: 2048 } }} elegido="app.xml" alElegir={NADA} alRecargar={NADA} />
    );
    expect(screen.getByText(/binario/i)).toBeTruthy();
    expect(screen.getByText(/2 KB/)).toBeTruthy();
    expect(screen.queryByText("Copiar")).toBeNull();
  });

  it("latin1 y recorte se dicen encima del contenido", () => {
    render(
      <Ficheros
        arbol={ARBOL}
        contenidos={{ "app.xml": { ruta: "app.xml", texto: "<app/>", recortado: true, binario: false, bytes: 500000, codificacion: "latin1" } }}
        elegido="app.xml"
        alElegir={NADA}
        alRecargar={NADA}
      />
    );
    expect(screen.getByText(/leído como latin1/i)).toBeTruthy();
    expect(screen.getByText(/recortado a/i)).toBeTruthy();
  });

  it("una ruta rechazada dice el motivo", () => {
    render(
      <Ficheros arbol={ARBOL} contenidos={{ "app.xml": { ruta: "app.xml", recortado: false, binario: false, bytes: 0, error: "está fuera del proyecto" } }} elegido="app.xml" alElegir={NADA} alRecargar={NADA} />
    );
    expect(screen.getByText(/no se puede enseñar este fichero/i)).toBeTruthy();
    expect(screen.getByText(/fuera del proyecto/)).toBeTruthy();
  });

  it("si el elegido desaparece del árbol nuevo, se cierra", () => {
    const alElegir = vi.fn();
    render(<Ficheros arbol={ARBOL} contenidos={{}} elegido="borrado.xne" alElegir={alElegir} alRecargar={NADA} />);
    expect(alElegir).toHaveBeenCalledWith(undefined);
  });

  it("con el árbol RECORTADO el elegido NO se cierra aunque no esté en la lista", () => {
    // Un fichero real más allá del tope de entradas no sale en la lista, y cerrarlo por
    // eso haría desaparecer lo que se estaba leyendo sin ningún motivo.
    const alElegir = vi.fn();
    render(<Ficheros arbol={{ ...ARBOL, recortado: true }} contenidos={{}} elegido="mas-alla.xne" alElegir={alElegir} alRecargar={NADA} />);
    expect(alElegir).not.toHaveBeenCalled();
  });

  it("en estrecho el árbol sube por encima del visor con order, sin reordenar el DOM", () => {
    // El DOM se queda con el visor primero (Tab en el layout ancho); en estrecho es
    // `order: -1` sobre `.arbol` quien lo pone visualmente arriba.
    const hoja = readFileSync(join(AQUI, "Ficheros.module.css"), "utf8");
    expect(hoja).toMatch(/@container[^{]*\{[\s\S]*?\.arbol\s*\{[^}]*order:\s*-1/);
  });
});
