import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
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

  it("la forma OCULTA es un campo de contraseña sin autocompletado: es el `leerSecreto`", () => {
    render(<Pregunta texto="clave de anthropic: " oculta alResponder={() => {}} />);
    const campo = screen.getByLabelText(/clave de anthropic/i) as HTMLInputElement;
    expect(campo.type).toBe("password");
    expect(campo.autocomplete).toBe("off");
  });

  /**
   * El secreto sale por el manejador y no se PINTA en ningún sitio. La comprobación es sobre
   * el texto del documento y no sobre su `innerHTML`: medido, React refleja el valor de un
   * input controlado también en el ATRIBUTO `value`, que es donde un campo en edición
   * legítimamente lo tiene mientras se teclea —enmascarado, porque es `type="password"`—. Lo
   * que este componente promete es que no acaba en texto visible; que no acabe en el store
   * lo prueba `App.test.tsx`, que es donde está esa costura.
   */
  it("el secreto tecleado no se pinta como texto: sale por el manejador y ya está", () => {
    const alResponder = vi.fn();
    render(<Pregunta texto="clave: " oculta alResponder={alResponder} />);
    const campo = screen.getByLabelText(/clave/i) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "sk-ant-NO-DEBE-SALIR" } });
    fireEvent.click(screen.getByRole("button", { name: /responder/i }));
    expect(alResponder).toHaveBeenCalledWith("sk-ant-NO-DEBE-SALIR");
    expect(document.body.textContent).not.toContain("sk-ant-NO-DEBE-SALIR");
    expect(campo.type).toBe("password");
  });

  /**
   * Medido en el modal de aprobación y aplicable igual aquí: retirar la interfaz sin esperar
   * al envío deja al usuario creyendo que contestó mientras el servidor sigue esperando
   * hasta su plazo. Quien retira es quien monta, y solo si el envío llegó.
   */
  it("si el envío falla lo DICE y se puede reintentar", async () => {
    const alResponder = vi.fn(() => Promise.reject(new Error("sin red")));
    render(<Pregunta texto="¿Subir? [s/N] " alResponder={alResponder} />);
    fireEvent.click(screen.getByRole("button", { name: /responder/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/no llegó/i));
    fireEvent.click(screen.getByRole("button", { name: /responder/i }));
    expect(alResponder).toHaveBeenCalledTimes(2);
  });

  it("mientras el envío vuela no se puede contestar dos veces: sacaría DOS resolutores de la cola FIFO", () => {
    let resolver: () => void = () => {};
    const alResponder = vi.fn(() => new Promise<void>((r) => { resolver = r; }));
    render(<Pregunta texto="¿Subir? [s/N] " alResponder={alResponder} />);
    fireEvent.click(screen.getByRole("button", { name: /responder/i }));
    fireEvent.click(screen.getByRole("button", { name: /responder/i }));
    expect(alResponder).toHaveBeenCalledTimes(1);
    resolver();
  });
});
