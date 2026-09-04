import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { Pregunta } from "./Pregunta.js";

afterEach(cleanup);

describe("Pregunta", () => {
  it("el enunciado del servidor se pinta tal cual", () => {
    render(<Pregunta texto="¿Subir los cambios a CloudStudio? [s/N] " alResponder={() => {}} />);
    expect(screen.getByLabelText(/subir los cambios/i)).toBeTruthy();
  });

  it("lo tecleado sale por `alResponder`: de ahí lo manda quien la monta como `respuesta`", () => {
    const alResponder = vi.fn();
    render(<Pregunta texto="¿Subir? [s/N] " alResponder={alResponder} />);
    fireEvent.change(screen.getByLabelText(/subir/i), { target: { value: "s" } });
    fireEvent.click(screen.getByRole("button", { name: /responder/i }));
    expect(alResponder).toHaveBeenCalledWith("s");
  });

  it("responder en blanco es una respuesta, no un fallo: es lo que contesta un readline cerrado", () => {
    const alResponder = vi.fn();
    render(<Pregunta texto="¿Subir? [s/N] " alResponder={alResponder} />);
    fireEvent.click(screen.getByRole("button", { name: /responder/i }));
    expect(alResponder).toHaveBeenCalledWith("");
  });

  it("Enter en el campo contesta: es un formulario, no un botón suelto", () => {
    const alResponder = vi.fn();
    const { container } = render(<Pregunta texto="¿Subir? [s/N] " alResponder={alResponder} />);
    fireEvent.change(screen.getByLabelText(/subir/i), { target: { value: "n" } });
    fireEvent.submit(container.querySelector("form")!);
    expect(alResponder).toHaveBeenCalledWith("n");
  });
});
