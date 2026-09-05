import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { Compositor } from "./Compositor.js";

// `globals` no está activado en `vitest.config.ts` (proyecto «cliente»): sin `cleanup`
// explícito el segundo `render()` de este fichero deja montado el primero, y
// `getByRole("textbox")` revienta con «found multiple elements» — no es un defecto de
// React, es que nadie desmonta entre tests sin el auto-cleanup de `@testing-library/react`.
afterEach(cleanup);

// SIN `comandos` a propósito: el test de la primera sugerencia manda el suyo explícito
// y {...manejadores} va DESPUÉS en el JSX — si `comandos` viviera aquí, lo pisaría. El
// resto de tests no lo necesita: `Compositor` lo trata como `[]` por omisión.
const manejadores = { conectado: true, alEnviar: () => {} };

describe("Compositor", () => {
  it("las sugerencias salen del registro que manda el servidor, no de una lista escrita a mano", () => {
    render(<Compositor comandos={[{ nombre: "/sync", descripcion: "sincroniza" }]} {...manejadores} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "/sy" } });
    expect(screen.getByRole("listbox").textContent).toContain("/sync");
  });

  it("sin conexión el campo se deshabilita y dice por qué", () => {
    render(<Compositor {...manejadores} conectado={false} />);
    const campo = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(campo.disabled).toBe(true);
    expect(campo.placeholder).toMatch(/sin conexión/);
  });

  it("Enter envía y limpia el campo", () => {
    const alEnviar = vi.fn();
    render(<Compositor {...manejadores} alEnviar={alEnviar} />);
    const campo = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(campo, { target: { value: "haz un listado" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(alEnviar).toHaveBeenCalledWith("haz un listado");
    expect(campo.value).toBe("");
  });

  it("Shift+Enter NO envía: jsdom no inserta el salto, pero el manejador tiene que quedarse mudo", () => {
    const alEnviar = vi.fn();
    render(<Compositor {...manejadores} alEnviar={alEnviar} />);
    const campo = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(campo, { target: { value: "primera línea" } });
    fireEvent.keyDown(campo, { key: "Enter", shiftKey: true });
    expect(alEnviar).not.toHaveBeenCalled();
  });

  it("una línea vacía o solo espacios no envía nada", () => {
    const alEnviar = vi.fn();
    render(<Compositor {...manejadores} alEnviar={alEnviar} />);
    const campo = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(campo, { target: { value: "   " } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(alEnviar).not.toHaveBeenCalled();
  });

  it("sin prefijo «/» no hay sugerencias, aunque el texto coincida con un nombre de comando", () => {
    render(<Compositor comandos={[{ nombre: "/sync", descripcion: "sincroniza" }]} {...manejadores} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "sync" } });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  /**
   * Con un turno en vuelo, mandar una segunda petición la deja en la cola del lazo sin
   * decirlo: el usuario ve su texto desaparecer del campo y no pasar nada durante minutos.
   */
  it("con turno en vuelo la entrada se apaga y dice por qué", () => {
    render(<Compositor conectado turnoEnVuelo alEnviar={() => {}} />);
    const entrada = screen.getByPlaceholderText(/está trabajando/i) as HTMLTextAreaElement;
    expect(entrada.disabled).toBe(true);
  });

  it("la flecha se convierte en parar, y parar avisa a quien sabe abortar", () => {
    const alParar = vi.fn();
    const alEnviar = vi.fn();
    const { rerender } = render(<Compositor conectado alEnviar={alEnviar} />);
    expect(screen.getByRole("button", { name: /enviar/i })).toBeTruthy();

    rerender(<Compositor conectado turnoEnVuelo alParar={alParar} alEnviar={alEnviar} />);
    // Una sola ranura: no hay dos botones, uno de ellos inerte.
    expect(screen.queryByRole("button", { name: /enviar/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /parar/i }));
    expect(alParar).toHaveBeenCalled();
  });

  it("el Enter tampoco cuela con el turno en vuelo", () => {
    const alEnviar = vi.fn();
    const { rerender } = render(<Compositor conectado alEnviar={alEnviar} />);
    const entrada = screen.getByRole("textbox");
    fireEvent.change(entrada, { target: { value: "algo" } });
    // El campo se apaga DESPUÉS de escribir, con el foco puesto: la tecla llega igual.
    rerender(<Compositor conectado turnoEnVuelo alParar={() => {}} alEnviar={alEnviar} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(alEnviar).not.toHaveBeenCalled();
  });

  /**
   * El borde vivo es la única señal de que pasa algo en los tramos en que el modelo no
   * habla —piensa, llama tools, espera al verificador— y pueden ser minutos. La caja
   * apagada y quieta se leía como «se ha colgado». El test mira el ESTADO, no la animación:
   * jsdom no hace layout ni corre `@keyframes`, así que afirmar el movimiento aquí sería
   * afirmar lo que este entorno no sabe.
   */
  it("la caja se marca como trabajando mientras hay turno, y se desmarca al acabar", () => {
    const { container, rerender } = render(<Compositor conectado turnoEnVuelo alEnviar={() => {}} />);
    expect(container.querySelector("[data-trabajando]")).toBeTruthy();
    rerender(<Compositor conectado alEnviar={() => {}} />);
    expect(container.querySelector("[data-trabajando]")).toBeNull();
  });
});
