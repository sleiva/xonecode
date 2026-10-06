import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PropuestaDeTareas, type AumentoDeTarea } from "./PropuestaDeTareas.js";

afterEach(cleanup);

const TAREAS = [
  { titulo: "Entradas", peticion: "Haz la ventana de entradas", adjuntos: ["/adjuntos/entradas.png"] },
  { titulo: "Salidas", peticion: "Haz la ventana de salidas" },
];

const encargo = (n: number) => screen.getAllByRole("textbox", { name: /^Encargo/ })[n] as HTMLTextAreaElement;

describe("PropuestaDeTareas", () => {
  it("pendiente: numera las tareas, enseña sus adjuntos, pide redactarlas UNA vez y avisa de lo que autoriza", () => {
    const alPedirAumento = vi.fn();
    const { rerender } = render(
      <PropuestaDeTareas motivo="dos ventanas" tareas={TAREAS} alPedirAumento={alPedirAumento} alEncolar={vi.fn()} alDescartar={vi.fn()} />
    );
    expect(screen.getByText("1. Entradas")).toBeTruthy();
    expect(screen.getByText("2. Salidas")).toBeTruthy();
    expect(screen.getByText("Adjuntos: entradas.png")).toBeTruthy();
    expect(screen.getByText(/corren EN ORDEN y escriben sin pedir aprobación/)).toBeTruthy();
    // Mientras no llega lo redactado, va la petición.
    expect(encargo(0).value).toBe("Haz la ventana de entradas");
    rerender(<PropuestaDeTareas motivo="dos ventanas" tareas={TAREAS} alPedirAumento={alPedirAumento} alEncolar={vi.fn()} alDescartar={vi.fn()} />);
    expect(alPedirAumento).toHaveBeenCalledTimes(1);
  });

  it("lo redactado sustituye a la petición, pero no pisa lo que la persona ya tecleó; un fallo se dice", () => {
    const props = { motivo: "m", tareas: TAREAS, alEncolar: vi.fn(), alDescartar: vi.fn() };
    const { rerender } = render(<PropuestaDeTareas {...props} />);
    fireEvent.change(encargo(1), { target: { value: "lo mío" } });
    const aumentos: Record<number, AumentoDeTarea> = { 0: { encargo: "## Entradas" }, 1: { encargo: "## Salidas" } };
    rerender(<PropuestaDeTareas {...props} aumentos={aumentos} />);
    expect(encargo(0).value).toBe("## Entradas");
    expect(encargo(1).value).toBe("lo mío");
    rerender(<PropuestaDeTareas {...props} aumentos={{ 0: { error: "sin modelo" } }} />);
    expect(screen.getByText(/No se pudo redactar el encargo \(sin modelo\)/)).toBeTruthy();
  });

  it("«Encolar en orden» manda los encargos editados, uno por tarea (vacío → la petición)", async () => {
    const alEncolar = vi.fn(async () => undefined);
    render(<PropuestaDeTareas motivo="m" tareas={TAREAS} aumentos={{ 0: { encargo: "## Entradas" } }} alEncolar={alEncolar} alDescartar={vi.fn()} />);
    fireEvent.change(encargo(1), { target: { value: "   " } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Encolar en orden" }));
    });
    expect(alEncolar).toHaveBeenCalledWith(["## Entradas", "Haz la ventana de salidas"]);
  });

  it("una negativa del servidor se dice y deja volver a intentarlo", async () => {
    const alEncolar = vi.fn(async () => "esa propuesta ya no está pendiente");
    render(<PropuestaDeTareas motivo="m" tareas={TAREAS} alEncolar={alEncolar} alDescartar={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Encolar en orden" }));
    });
    expect(screen.getByRole("alert").textContent).toContain("esa propuesta ya no está pendiente");
    expect((screen.getByRole("button", { name: "Encolar en orden" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("«Descartar» descarta", async () => {
    const alDescartar = vi.fn(async () => undefined);
    render(<PropuestaDeTareas motivo="m" tareas={TAREAS} alEncolar={vi.fn()} alDescartar={alDescartar} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    });
    expect(alDescartar).toHaveBeenCalledTimes(1);
  });

  it("resuelta: sin controles, diciendo si se encoló o se descartó, y sin pedir redactar nada", () => {
    const alPedirAumento = vi.fn();
    const { rerender } = render(
      <PropuestaDeTareas motivo="m" tareas={TAREAS} resuelta={{ encoladas: ["a", "b"] }} alPedirAumento={alPedirAumento} />
    );
    expect(screen.getByText(/encoladas en orden/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    rerender(<PropuestaDeTareas motivo="m" tareas={TAREAS} resuelta={{}} alPedirAumento={alPedirAumento} />);
    expect(screen.getByText(/descartada/)).toBeTruthy();
    expect(alPedirAumento).not.toHaveBeenCalled();
  });
});
