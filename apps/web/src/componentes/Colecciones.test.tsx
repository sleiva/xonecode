import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Colecciones } from "./Colecciones.js";
import type { FotoDeColecciones } from "../tipos.js";

afterEach(cleanup);

const FOTO: FotoDeColecciones = {
  total: 3,
  entrada: ["Menu"],
  login: [],
  rotas: [{ desde: "Menu:onload", por: "script", hacia: "Login", fichero: "/Menu.xne" }],
  colecciones: [
    {
      nombre: "Clientes",
      fichero: "/Clientes.xne",
      campos: [{ nombre: "ID", tipo: "N" }, { nombre: "ALTA" }],
      eventos: [],
      nodos: [],
      conexiones: [],
      apuntaA: [],
      leApuntan: [
        { desde: "Pedidos.CLIENTE", por: "mapcol", hacia: "Clientes", fichero: "/Pedidos.xne" },
        { desde: "Menu.BTN", por: "script", hacia: "Clientes", fichero: "/Menu.xne" },
        { desde: "/lib/nav.js", por: "mencion", hacia: "Clientes", fichero: "/lib/nav.js" },
      ],
    },
    {
      nombre: "Menu",
      fichero: "/Menu.xne",
      campos: [],
      eventos: ["onload"],
      nodos: [],
      conexiones: [],
      apuntaA: [{ desde: "Menu.BTN", por: "script", hacia: "Clientes", fichero: "/Menu.xne" }],
      leApuntan: [],
    },
    { nombre: "Pedidos", fichero: "/Pedidos.xne", campos: [], eventos: [], nodos: [], conexiones: [], apuntaA: [], leApuntan: [] },
  ],
};

describe("Colecciones", () => {
  it("pide la foto cuando no la tiene, y no mientras no hay cable", () => {
    const alPedir = vi.fn();
    const { rerender } = render(<Colecciones conectado={false} alPedir={alPedir} />);
    expect(alPedir).not.toHaveBeenCalled();
    rerender(<Colecciones conectado alPedir={alPedir} />);
    expect(alPedir).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Leyendo el modelo del proyecto…")).toBeTruthy();
  });

  it("el resumen dice por dónde arranca y lo que está roto", () => {
    render(<Colecciones foto={FOTO} conectado alPedir={() => {}} />);
    expect(screen.getByRole("heading", { name: "3 colecciones" })).toBeTruthy();
    expect(screen.getByText(/entrada ·/).textContent).toContain("Menu");
    expect(screen.getByText(/→ Login/)).toBeTruthy();
  });

  it("las tres confianzas van en grupos SEPARADOS, y la mención se rotula como señal floja", () => {
    render(<Colecciones foto={FOTO} conectado alPedir={() => {}} />);
    fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "Clientes" }));
    expect(screen.getByText("Por atributo · 1")).toBeTruthy();
    expect(screen.getByText("Por script · 1")).toBeTruthy();
    expect(screen.getByText("Menciones · 1")).toBeTruthy();
    expect(screen.getByText(/Señal floja/)).toBeTruthy();
    // Un campo sin tipo no se inventa uno.
    expect(screen.getByText("ALTA").parentElement!.textContent).toBe("ALTA");
  });

  it("un nombre navega a su colección; uno que no existe es texto, sin enlace muerto", () => {
    render(<Colecciones foto={FOTO} conectado alPedir={() => {}} />);
    fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "Clientes" }));
    // El de la línea «Pedidos.CLIENTE» del detalle, no el de la lista.
    const delDetalle = screen.getAllByRole("button", { name: "Pedidos" }).find((b) => b.closest("nav") === null)!;
    fireEvent.click(delDetalle);
    expect(screen.getByRole("heading", { name: "Pedidos" })).toBeTruthy();
    fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "Resumen del proyecto" }));
    // «Login» está roto: no existe, así que no se ofrece como botón.
    expect(screen.queryByRole("button", { name: "Login" })).toBeNull();
  });

  it("sin nada que le apunte, lo dice CON su límite, no como «no se usa»", () => {
    render(<Colecciones foto={FOTO} conectado alPedir={() => {}} />);
    fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: /Pedidos/ }));
    expect(screen.getByText(/No concluyas que no se usa/)).toBeTruthy();
  });

  it("«Abrir» manda la ruta RELATIVA, que es la que habla Ficheros", () => {
    const alAbrirFichero = vi.fn();
    render(<Colecciones foto={FOTO} conectado alPedir={() => {}} alAbrirFichero={alAbrirFichero} />);
    fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "Clientes" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    expect(alAbrirFichero).toHaveBeenCalledWith("Clientes.xne");
  });

  it("un error de lectura se dice, y una foto recortada cuenta lo que falta", () => {
    const { rerender } = render(<Colecciones error="no se pudo leer el modelo del proyecto" alPedir={() => {}} />);
    expect(screen.getByText(/No se ha podido leer el modelo del proyecto/)).toBeTruthy();
    rerender(<Colecciones foto={{ ...FOTO, total: 10 }} alPedir={() => {}} />);
    expect(screen.getByText("Y 7 más que no caben en esta vista.")).toBeTruthy();
  });
});
