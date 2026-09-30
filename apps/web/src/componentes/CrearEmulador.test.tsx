import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CrearEmulador } from "./CrearEmulador.js";

afterEach(cleanup);

const escribir = (v: string): void => {
  fireEvent.change(screen.getByRole("textbox", { name: "Nombre del emulador nuevo" }), { target: { value: v } });
};
const boton = (): HTMLButtonElement => screen.getByRole("button") as HTMLButtonElement;

describe("CrearEmulador", () => {
  it("con el nombre vacío el botón está apagado", () => {
    render(<CrearEmulador avds={[]} conectado alCrear={() => {}} />);
    expect(boton().disabled).toBe(true);
  });

  it("un nombre repetido apaga el botón y dice por qué", () => {
    render(<CrearEmulador avds={["pixel8"]} conectado alCrear={() => {}} />);
    escribir("pixel8");
    expect(boton().disabled).toBe(true);
    expect(screen.getByText("pixel8 ya existe")).toBeTruthy();
  });

  it("un nombre con mala forma apaga el botón", () => {
    render(<CrearEmulador avds={[]} conectado alCrear={() => {}} />);
    escribir("-malo");
    expect(boton().disabled).toBe(true);
    expect(screen.getByText(/solo letras/)).toBeTruthy();
  });

  it("un nombre válido lo envía", () => {
    const alCrear = vi.fn();
    render(<CrearEmulador avds={["pixel8"]} conectado alCrear={alCrear} />);
    escribir("pixel8-b");
    fireEvent.click(boton());
    expect(alCrear).toHaveBeenCalledWith("pixel8-b");
  });

  it("mientras crea enseña el título y el botón queda en «Creando…»", () => {
    render(
      <CrearEmulador
        avds={[]}
        conectado
        alCrear={() => {}}
        progreso={{ receta: "crear-avd", paso: 0, titulo: "Creando pixel9", estado: "corriendo", lineas: ["uno", "dos"], ms: 10 }}
      />,
    );
    expect(screen.getByText(/Creando pixel9/)).toBeTruthy();
    expect(boton().textContent).toBe("Creando…");
    expect(boton().disabled).toBe(true);
    expect(screen.getByText(/dos/)).toBeTruthy();
  });

  it("si falla, enseña el motivo", () => {
    render(
      <CrearEmulador
        avds={[]}
        conectado
        alCrear={() => {}}
        progreso={{ receta: "crear-avd", paso: 0, titulo: "Creando pixel9", estado: "fallo", lineas: [], ms: 10, motivo: "no hay imagen de sistema" }}
      />,
    );
    expect(screen.getByText(/no hay imagen de sistema/)).toBeTruthy();
  });
});
