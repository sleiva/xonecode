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
});
