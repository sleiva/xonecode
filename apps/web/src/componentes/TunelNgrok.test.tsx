import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TunelNgrok } from "./TunelNgrok";
import type { Receta } from "../tipos.js";

afterEach(cleanup);

const RECETA = {
  id: "ngrok",
  plataforma: "herramienta",
  titulo: "Instalar ngrok",
  descripcion: "Un paso.",
  pasos: [{ titulo: "Instalar ngrok con brew", comandos: ["brew install ngrok"], hecho: false, ejecutable: true }],
  despues: "",
  completa: false,
} as Receta;

describe("la tarjeta de ngrok", () => {
  it("sin instalar: la receta, con ejecutar", () => {
    const alEjecutarPaso = vi.fn();
    render(<TunelNgrok ngrok={{ instalado: false, cuenta: false, receta: RECETA }} alEnviar={vi.fn()} alEjecutarPaso={alEjecutarPaso} />);
    expect(screen.getByRole("region", { name: "Instalar ngrok" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Ejecutar|Instalar/ }));
    expect(alEjecutarPaso).toHaveBeenCalledWith(1);
  });

  it("sin instalar y sin receta, lo dice y no inventa un botón", () => {
    render(<TunelNgrok ngrok={{ instalado: false, cuenta: false }} alEnviar={vi.fn()} />);
    expect(screen.getByText(/no está instalado/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("instalado sin cuenta: «Poner authtoken» manda la acción, sin campo de clave", () => {
    const alEnviar = vi.fn();
    render(<TunelNgrok ngrok={{ instalado: true, cuenta: false }} alEnviar={alEnviar} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Poner authtoken" }));
    expect(alEnviar).toHaveBeenCalledWith({ clase: "remoto", accion: "authtoken" });
  });

  it("listo: «ngrok listo», su dominio, y Guardar manda el dominio (vacío lo quita)", () => {
    const alEnviar = vi.fn();
    render(<TunelNgrok ngrok={{ instalado: true, cuenta: true, dominio: "yo.ngrok-free.app" }} alEnviar={alEnviar} />);
    expect(screen.getByText(/ngrok listo · dominio yo\.ngrok-free\.app/)).toBeTruthy();
    const campo = screen.getByLabelText("Dominio fijo de ngrok") as HTMLInputElement;
    expect(campo.value).toBe("yo.ngrok-free.app");
    // Sin cambios, Guardar no manda nada.
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(campo, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(alEnviar).toHaveBeenCalledWith({ clase: "remoto", accion: "dominio", dominio: "" });
  });

  it("listo sin dominio no inventa uno", () => {
    render(<TunelNgrok ngrok={{ instalado: true, cuenta: true }} alEnviar={vi.fn()} />);
    expect(screen.getByText("ngrok listo")).toBeTruthy();
  });

  it("enseña el motivo del servidor cuando lo hay, en cualquier estado", () => {
    const { rerender } = render(<TunelNgrok ngrok={{ instalado: true, cuenta: false, motivo: "ngrok no aceptó ese authtoken" }} alEnviar={vi.fn()} />);
    expect(screen.getByText("ngrok no aceptó ese authtoken")).toBeTruthy();
    rerender(<TunelNgrok ngrok={{ instalado: true, cuenta: true, motivo: "ese dominio no es válido" }} alEnviar={vi.fn()} />);
    expect(screen.getByText("ese dominio no es válido")).toBeTruthy();
  });

  it("sin cable no se manda nada", () => {
    render(<TunelNgrok ngrok={{ instalado: true, cuenta: false }} alEnviar={vi.fn()} conectado={false} />);
    expect((screen.getByRole("button", { name: "Poner authtoken" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
