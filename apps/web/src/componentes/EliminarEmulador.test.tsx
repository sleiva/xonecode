import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EliminarEmulador, MS_SIN_RESPUESTA_AL_ELIMINAR } from "./EliminarEmulador.js";
import type { EstadoDelCliente } from "../store.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type Progreso = NonNullable<EstadoDelCliente["instalacion"]>;
const progreso = (estado: Progreso["estado"], extra: Partial<Progreso> = {}): Progreso => ({
  receta: "borrar-avd",
  paso: 0,
  titulo: "Eliminando el dispositivo virtual otro",
  estado,
  lineas: [],
  ms: 1,
  ...extra,
});
const campo = (): HTMLInputElement => screen.getByRole("textbox") as HTMLInputElement;
const eliminar = (): HTMLButtonElement => screen.getByRole("button", { name: /^Elimin(ar|ando)/ }) as HTMLButtonElement;
const escribir = (v: string): void => void fireEvent.change(campo(), { target: { value: v } });

describe("EliminarEmulador", () => {
  it("dice qué se pierde y qué no se toca", () => {
    render(<EliminarEmulador avd="otro" alConfirmar={() => {}} alCerrar={() => {}} />);
    expect(screen.getByText(/el emulador y todo lo instalado en él/)).toBeTruthy();
    expect(screen.getByText(/apps,\s+datos y su estado guardado/)).toBeTruthy();
    expect(screen.getByText(/No se toca la imagen del sistema ni los demás emuladores/)).toBeTruthy();
  });

  it("el botón rojo no se activa hasta escribir el nombre EXACTO", () => {
    const alConfirmar = vi.fn();
    render(<EliminarEmulador avd="otro" alConfirmar={alConfirmar} alCerrar={() => {}} />);
    expect(eliminar().disabled).toBe(true);
    escribir("otr");
    expect(eliminar().disabled).toBe(true);
    escribir("Otro");
    expect(eliminar().disabled).toBe(true);
    fireEvent.click(eliminar());
    expect(alConfirmar).not.toHaveBeenCalled();
    escribir("otro");
    expect(eliminar().disabled).toBe(false);
    fireEvent.click(eliminar());
    expect(alConfirmar).toHaveBeenCalledTimes(1);
  });

  it("es el botón destructivo de la familia (clase .destructiva), no uno inventado", () => {
    render(<EliminarEmulador avd="otro" alConfirmar={() => {}} alCerrar={() => {}} />);
    expect(eliminar().className).toMatch(/destructiva/);
  });

  it("mientras corre enseña el log y no deja cancelar ni repetir; con ok se cierra", () => {
    const alCerrar = vi.fn();
    const { rerender } = render(<EliminarEmulador avd="otro" alConfirmar={() => {}} alCerrar={alCerrar} />);
    escribir("otro");
    fireEvent.click(eliminar());
    expect(eliminar().textContent).toBe("Eliminando…");
    expect(eliminar().disabled).toBe(true);
    rerender(
      <EliminarEmulador avd="otro" alConfirmar={() => {}} alCerrar={alCerrar} progreso={progreso("corriendo", { lineas: ["borrando"] })} />,
    );
    expect(screen.getByText("borrando")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(alCerrar).not.toHaveBeenCalled();
    rerender(<EliminarEmulador avd="otro" alConfirmar={() => {}} alCerrar={alCerrar} progreso={progreso("ok")} />);
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it("con un fallo se QUEDA con el motivo y se puede reintentar", () => {
    const alConfirmar = vi.fn();
    const alCerrar = vi.fn();
    const { rerender } = render(<EliminarEmulador avd="otro" alConfirmar={alConfirmar} alCerrar={alCerrar} />);
    escribir("otro");
    fireEvent.click(eliminar());
    rerender(
      <EliminarEmulador avd="otro" alConfirmar={alConfirmar} alCerrar={alCerrar} progreso={progreso("fallo", { motivo: "no se pudo" })} />,
    );
    expect(screen.getByRole("alert").textContent).toContain("No se ha eliminado: no se pudo");
    expect(alCerrar).not.toHaveBeenCalled();
    expect(eliminar().disabled).toBe(false);
    fireEvent.click(eliminar());
    expect(alConfirmar).toHaveBeenCalledTimes(2);
  });

  it("un progreso que ya estaba puesto al abrir (la eliminación anterior) no la cierra ni la da por acabada", () => {
    const alCerrar = vi.fn();
    const viejo = progreso("ok");
    const { rerender } = render(<EliminarEmulador avd="otro" alConfirmar={() => {}} alCerrar={alCerrar} progreso={viejo} />);
    expect(alCerrar).not.toHaveBeenCalled();
    escribir("otro");
    fireEvent.click(eliminar());
    // Sigue el viejo: todavía no ha llegado el nuevo.
    rerender(<EliminarEmulador avd="otro" alConfirmar={() => {}} alCerrar={alCerrar} progreso={viejo} />);
    expect(alCerrar).not.toHaveBeenCalled();
    expect(eliminar().textContent).toBe("Eliminando…");
    rerender(<EliminarEmulador avd="otro" alConfirmar={() => {}} alCerrar={alCerrar} progreso={progreso("ok")} />);
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it("Cancelar cierra sin enviar nada", () => {
    const alConfirmar = vi.fn();
    const alCerrar = vi.fn();
    render(<EliminarEmulador avd="otro" alConfirmar={alConfirmar} alCerrar={alCerrar} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(alCerrar).toHaveBeenCalled();
    expect(alConfirmar).not.toHaveBeenCalled();
  });

  it("sin progreso propio se puede cancelar; pasado el plazo dice que el servidor no empezó y deja reintentar", () => {
    vi.useFakeTimers();
    const alCerrar = vi.fn();
    const alConfirmar = vi.fn();
    render(<EliminarEmulador avd="otro" alConfirmar={alConfirmar} alCerrar={alCerrar} />);
    escribir("otro");
    fireEvent.click(eliminar());
    expect(eliminar().textContent).toBe("Eliminando…");
    expect((screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(false);
    act(() => void vi.advanceTimersByTime(MS_SIN_RESPUESTA_AL_ELIMINAR));
    expect(screen.getByRole("alert").textContent).toContain("El servidor no empezó a eliminarlo");
    expect(eliminar().textContent).toBe("Eliminar");
    expect(eliminar().disabled).toBe(false);
    fireEvent.click(eliminar());
    expect(alConfirmar).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/El servidor no empezó/)).toBeNull();
  });

  it("con progreso propio a tiempo el plazo no dispara", () => {
    vi.useFakeTimers();
    const { rerender } = render(<EliminarEmulador avd="otro" alConfirmar={() => {}} alCerrar={() => {}} />);
    escribir("otro");
    fireEvent.click(eliminar());
    rerender(<EliminarEmulador avd="otro" alConfirmar={() => {}} alCerrar={() => {}} progreso={progreso("corriendo")} />);
    act(() => void vi.advanceTimersByTime(MS_SIN_RESPUESTA_AL_ELIMINAR * 2));
    expect(screen.queryByText(/El servidor no empezó/)).toBeNull();
    expect(eliminar().textContent).toBe("Eliminando…");
  });
});
