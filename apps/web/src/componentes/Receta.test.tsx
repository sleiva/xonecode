import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { Receta } from "./Receta.js";
import type { Receta as RecetaDelCable } from "../tipos.js";

afterEach(cleanup);

const RECETA: RecetaDelCable = {
  id: "android-emulador",
  titulo: "Instalar el emulador de Android",
  descripcion: "Cuatro pasos, una vez por máquina.",
  pasos: [
    { titulo: "Instalar las herramientas", comandos: ["brew install openjdk@17", "brew install --cask x"], nota: "Puede pedirte la contraseña.", hecho: true },
    { titulo: "Declarar las variables", comandos: ['export ANDROID_HOME="$(brew --prefix)/share/x"'], hecho: false },
  ],
  completa: false,
  despues: "Para arrancarlo: `emulator -avd pixel8`.",
};

describe("Receta", () => {
  it("enseña cada paso con su estado, numerado", () => {
    render(<Receta receta={RECETA} />);
    const pasos = screen.getAllByRole("listitem");
    expect(pasos).toHaveLength(2);
    // El estado va también en TEXTO y no solo en un color: un punto verde no lo lee nadie
    // con lector de pantalla, y aquí la diferencia entre hecho y pendiente es el dato.
    expect(within(pasos[0]!).getByLabelText("hecho")).toBeTruthy();
    expect(within(pasos[1]!).getByLabelText("pendiente")).toBeTruthy();
  });

  it("los comandos van juntos en un bloque, tal cual se pegan", () => {
    render(<Receta receta={RECETA} />);
    // Los dos `brew` en el MISMO bloque: son un paso, y copiarlos de uno en uno invita a
    // pegar el primero y olvidar el segundo.
    expect(screen.getByText(/brew install openjdk@17/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /copiar/i })).toHaveLength(2);
  });

  it("la nota de un paso se ve: es lo que hay que saber ANTES de pegarlo", () => {
    render(<Receta receta={RECETA} />);
    expect(screen.getByText(/contraseña/i)).toBeTruthy();
  });

  it("cuando está completa NO enseña los pasos, lo dice y ya", () => {
    // Cuatro pasos marcados es ruido en la ventana de quien ya lo tiene instalado.
    render(<Receta receta={{ ...RECETA, completa: true }} />);
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.getByText(/ya está/i)).toBeTruthy();
  });

  it("y lo que viene después se dice siempre, también completa", () => {
    // Arrancar el emulador no está cableado: el comando es lo único honesto que dar.
    const { unmount } = render(<Receta receta={RECETA} />);
    expect(screen.getByText(/emulator -avd pixel8/)).toBeTruthy();
    unmount();
    render(<Receta receta={{ ...RECETA, completa: true }} />);
    expect(screen.getByText(/emulator -avd pixel8/)).toBeTruthy();
  });
});
