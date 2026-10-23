import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LoAprendido, type PeticionDeAprendido, type RespuestaDeAprendido } from "./LoAprendido.js";
import type { ListadoDeAprendido } from "../tipos.js";

const listado: ListadoDeAprendido = {
  proyecto: [
    { id: "cómo entrar", tema: "cómo entrar", oculto: true, comoLoSe: "entré", quien: "developer-xone", cuando: "2026-10-22T16:52:00.000Z" },
    { id: "abrir el menú", tema: "abrir el menú", texto: "por EntryPoint", comoLoSe: "lo vi", cuando: "2026-10-23T07:00:00.000Z" },
  ],
  xone: [{ id: "alfa en svg", tema: "alfa en SVG", texto: "va al final", comoLoSe: "medido", cuando: "2026-10-23T06:44:00.000Z" }],
};

function montar(responder?: (p: PeticionDeAprendido) => RespuestaDeAprendido | undefined) {
  const pedidas: PeticionDeAprendido[] = [];
  const alPedir = vi.fn(async (_proyecto: string, p: PeticionDeAprendido) => {
    pedidas.push(p);
    return responder?.(p) ?? (p.accion === "ver" ? { texto: "usuario 08006, contraseña vacía" } : { listado });
  });
  render(<LoAprendido proyecto="p1" nombre="Maset" conectado alPedir={alPedir} />);
  return { pedidas };
}

const entrada = (tema: string) => screen.getByRole("heading", { name: tema }).closest("li") as HTMLElement;

describe("la pestaña «Lo aprendido»", () => {
  afterEach(cleanup);

  it("lo sensible sale OCULTO y solo se pide con «Ver»; «Ocultar» lo vuelve a tapar", async () => {
    const { pedidas } = montar();
    await screen.findByRole("heading", { name: "cómo entrar" });
    expect(screen.queryByText(/08006/)).toBeNull();
    expect(within(entrada("cómo entrar")).getByText(/oculto/)).toBeTruthy();
    fireEvent.click(within(entrada("cómo entrar")).getByRole("button", { name: "Ver" }));
    await screen.findByText("usuario 08006, contraseña vacía");
    expect(pedidas).toContainEqual({ accion: "ver", alcance: "proyecto", id: "cómo entrar" });
    fireEvent.click(within(entrada("cómo entrar")).getByRole("button", { name: "Ocultar" }));
    expect(screen.queryByText(/08006/)).toBeNull();
  });

  it("la pestaña de XOne enseña lo suyo, y su botón mueve al proyecto", async () => {
    const { pedidas } = montar();
    await screen.findByRole("heading", { name: "cómo entrar" });
    fireEvent.click(screen.getByRole("tab", { name: /De XOne/ }));
    expect(screen.getByRole("heading", { name: "alfa en SVG" })).toBeTruthy();
    fireEvent.click(within(entrada("alfa en SVG")).getByRole("button", { name: "Pasar a este proyecto" }));
    await waitFor(() => expect(pedidas).toContainEqual({ accion: "mover", de: "xone", id: "alfa en svg" }));
  });

  it("editar manda lo cambiado, y una NEGATIVA del servidor se dice en esa entrada sin cerrar el editor", async () => {
    const { pedidas } = montar((p) => (p.accion === "guardar" ? { motivo: "falta cómo lo sabes" } : undefined));
    await screen.findByRole("heading", { name: "abrir el menú" });
    fireEvent.click(within(entrada("abrir el menú")).getByRole("button", { name: "Editar" }));
    const como = screen.getByLabelText(/Cómo se comprobó/);
    fireEvent.change(como, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("falta cómo lo sabes");
    expect(pedidas).toContainEqual({ accion: "guardar", alcance: "proyecto", id: "abrir el menú", tema: "abrir el menú", texto: "por EntryPoint", comoLoSe: "" });
    expect(screen.getByRole("button", { name: "Guardar" })).toBeTruthy();
  });

  it("borrar pide confirmación y dice a quién deja de llegar", async () => {
    const { pedidas } = montar();
    await screen.findByRole("heading", { name: "abrir el menú" });
    fireEvent.click(within(entrada("abrir el menú")).getByRole("button", { name: "Borrar" }));
    expect(screen.getByRole("alert").textContent).toContain("encargos de Maset");
    expect(pedidas.some((p) => p.accion === "borrar")).toBe(false);
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "Borrar" }));
    await waitFor(() => expect(pedidas).toContainEqual({ accion: "borrar", alcance: "proyecto", id: "abrir el menú" }));
  });

  it("sin respuesta del servidor lo dice, en vez de enseñar una lista vacía", async () => {
    render(<LoAprendido proyecto="p1" nombre="Maset" conectado alPedir={async () => undefined} />);
    expect(await screen.findByText(/No se pudo pedir lo aprendido/)).toBeTruthy();
  });
});
