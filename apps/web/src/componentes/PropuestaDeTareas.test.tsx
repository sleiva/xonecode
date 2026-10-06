import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PropuestaDeTareas } from "./PropuestaDeTareas.js";

afterEach(cleanup);

const TAREAS = [
  { titulo: "Entradas", peticion: "Haz la ventana de entradas", adjuntos: ["/adjuntos/entradas.png"] },
  { titulo: "Salidas", peticion: "Haz la ventana de salidas" },
];

const encargo = (n: number) => screen.getAllByRole("textbox", { name: /^Encargo/ })[n] as HTMLTextAreaElement;
const pulsar = async (nombre: string) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: nombre }));
  });
};

describe("PropuestaDeTareas", () => {
  it("pendiente: numera las tareas, enseña sus adjuntos, el encargo es la petición y avisa de lo que autoriza", () => {
    render(<PropuestaDeTareas motivo="dos ventanas" tareas={TAREAS} alEncolar={vi.fn()} alDescartar={vi.fn()} alHacerEnChat={vi.fn()} />);
    expect(screen.getByText("1. Entradas")).toBeTruthy();
    expect(screen.getByText("2. Salidas")).toBeTruthy();
    expect(screen.getByText("Adjuntos: entradas.png")).toBeTruthy();
    expect(screen.getByText(/corren EN ORDEN y escriben sin pedir aprobación/)).toBeTruthy();
    expect(encargo(0).value).toBe("Haz la ventana de entradas");
  });

  it("«Encolar en orden» manda los encargos editados, uno por tarea (vacío → la petición)", async () => {
    const alEncolar = vi.fn(async () => undefined);
    render(<PropuestaDeTareas motivo="m" tareas={TAREAS} alEncolar={alEncolar} alDescartar={vi.fn()} />);
    fireEvent.change(encargo(0), { target: { value: "lo mío" } });
    fireEvent.change(encargo(1), { target: { value: "   " } });
    await pulsar("Encolar en orden");
    expect(alEncolar).toHaveBeenCalledWith(["lo mío", "Haz la ventana de salidas"]);
  });

  it("una negativa del servidor se dice y deja volver a intentarlo", async () => {
    const alEncolar = vi.fn(async () => "esa propuesta ya no está pendiente");
    render(<PropuestaDeTareas motivo="m" tareas={TAREAS} alEncolar={alEncolar} alDescartar={vi.fn()} />);
    await pulsar("Encolar en orden");
    expect(screen.getByRole("alert").textContent).toContain("esa propuesta ya no está pendiente");
    expect((screen.getByRole("button", { name: "Encolar en orden" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("«Descartar» y «Hacerlo aquí en el chat» llaman a lo suyo; sin `alHacerEnChat` no se ofrece", async () => {
    const alDescartar = vi.fn(async () => undefined);
    const alHacerEnChat = vi.fn(async () => undefined);
    const { rerender } = render(
      <PropuestaDeTareas motivo="m" tareas={TAREAS} alEncolar={vi.fn()} alDescartar={alDescartar} alHacerEnChat={alHacerEnChat} />
    );
    await pulsar("Hacerlo aquí en el chat");
    expect(alHacerEnChat).toHaveBeenCalledTimes(1);
    await pulsar("Descartar");
    expect(alDescartar).toHaveBeenCalledTimes(1);
    rerender(<PropuestaDeTareas motivo="m" tareas={TAREAS} alEncolar={vi.fn()} alDescartar={alDescartar} />);
    expect(screen.queryByRole("button", { name: "Hacerlo aquí en el chat" })).toBeNull();
  });

  it("resuelta: sin controles, dice cómo acabó, y cada encargo va PLEGADO", () => {
    const { rerender, container } = render(<PropuestaDeTareas motivo="m" tareas={TAREAS} resuelta={{ encoladas: ["a", "b"] }} alEncolar={vi.fn()} />);
    expect(screen.getByText(/encoladas en orden/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(container.querySelectorAll("details:not([open])")).toHaveLength(2);
    expect(container.textContent).not.toContain("Haz la ventana de entradas");
    const primero = container.querySelector("details")!;
    primero.open = true;
    fireEvent(primero, new Event("toggle"));
    expect(container.textContent).toContain("Haz la ventana de entradas");
    rerender(<PropuestaDeTareas motivo="m" tareas={TAREAS} resuelta={{ enChat: true }} />);
    expect(screen.getByText(/se hace en esta conversación/)).toBeTruthy();
    rerender(<PropuestaDeTareas motivo="m" tareas={TAREAS} resuelta={{}} />);
    expect(screen.getByText(/descartada/)).toBeTruthy();
  });
});
