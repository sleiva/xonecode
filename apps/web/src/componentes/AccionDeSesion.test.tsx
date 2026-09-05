import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AccionDeSesion } from "./AccionDeSesion.js";

const BORRAR = { proyecto: "p1", sesion: "s1", titulo: "arregla el login", accion: "borrar" as const };
const RENOMBRAR = { ...BORRAR, accion: "renombrar" as const };

describe("AccionDeSesion", () => {
  afterEach(cleanup);

  /**
   * Borrar no tiene papelera: se va el `.jsonl`, la entrada del índice y la marca de git.
   * La ventana tiene que decir QUÉ se lleva por delante, no solo preguntar «¿seguro?».
   */
  it("al borrar nombra la sesión y avisa de que no hay vuelta atrás", () => {
    render(
      <AccionDeSesion pendiente={BORRAR} esLaAbierta={false} alConfirmar={() => {}} alCerrar={() => {}} />
    );
    expect(screen.getByText(/arregla el login/)).toBeTruthy();
    expect(screen.getByText(/no hay papelera/i)).toBeTruthy();
  });

  /**
   * Borrar la sesión que estás mirando cierra la consola y te devuelve al escritorio. No es
   * evidente, así que se dice ANTES de pulsar y no después, cuando la pantalla ya cambió.
   */
  it("si es la abierta, avisa de que la consola se cerrará; si no, no lo dice", () => {
    const { rerender } = render(
      <AccionDeSesion pendiente={BORRAR} esLaAbierta alConfirmar={() => {}} alCerrar={() => {}} />
    );
    expect(screen.getByText(/volverás al escritorio/i)).toBeTruthy();
    rerender(
      <AccionDeSesion pendiente={BORRAR} esLaAbierta={false} alConfirmar={() => {}} alCerrar={() => {}} />
    );
    expect(screen.queryByText(/volverás al escritorio/i)).toBeNull();
  });

  it("confirmar borrado no manda título: no hay ninguno que mandar", () => {
    const confirmar = vi.fn();
    render(
      <AccionDeSesion pendiente={BORRAR} esLaAbierta={false} alConfirmar={confirmar} alCerrar={() => {}} />
    );
    fireEvent.click(screen.getByRole("button", { name: /^eliminar$/i }));
    expect(confirmar).toHaveBeenCalledWith(undefined);
  });

  it("renombrar llega con el nombre actual puesto: casi siempre se retoca", () => {
    render(
      <AccionDeSesion pendiente={RENOMBRAR} esLaAbierta={false} alConfirmar={() => {}} alCerrar={() => {}} />
    );
    expect((screen.getByLabelText(/nombre/i) as HTMLInputElement).value).toBe("arregla el login");
  });

  /**
   * Un nombre en blanco lo rechaza el servidor —devolvería la sesión al título automático y
   * el siguiente turno la rebautizaría, borrando en silencio lo que puso una persona—, así
   * que aquí ni se ofrece mandarlo: un botón que manda algo que se va a rechazar es un
   * botón que miente.
   */
  it("con el nombre en blanco no se puede guardar", () => {
    const confirmar = vi.fn();
    render(
      <AccionDeSesion pendiente={RENOMBRAR} esLaAbierta={false} alConfirmar={confirmar} alCerrar={() => {}} />
    );
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: "   " } });
    const guardar = screen.getByRole("button", { name: /^guardar$/i }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);
    fireEvent.click(guardar);
    expect(confirmar).not.toHaveBeenCalled();
  });

  it("Enter en el campo guarda, que es lo que hace un diálogo de un solo campo", () => {
    const confirmar = vi.fn();
    render(
      <AccionDeSesion pendiente={RENOMBRAR} esLaAbierta={false} alConfirmar={confirmar} alCerrar={() => {}} />
    );
    const campo = screen.getByLabelText(/nombre/i);
    fireEvent.change(campo, { target: { value: "Login de la demo" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(confirmar).toHaveBeenCalledWith("Login de la demo");
  });

  it("cancelar no confirma nada", () => {
    const confirmar = vi.fn();
    const cerrar = vi.fn();
    render(
      <AccionDeSesion pendiente={BORRAR} esLaAbierta alConfirmar={confirmar} alCerrar={cerrar} />
    );
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(cerrar).toHaveBeenCalled();
    expect(confirmar).not.toHaveBeenCalled();
  });
});
