import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NuevaSesion } from "./NuevaSesion.js";

const PROYECTO = { id: "p1", nombre: "AppDemo" };

describe("NuevaSesion", () => {
  afterEach(cleanup);

  it("la acción se llama igual en los dos casos: «Empezar»", () => {
    // Lo que la descarga implica lo dice el párrafo, con más detalle del que cabe en un
    // botón. Que la acción cambiara de nombre según el estado del proyecto hacía parecer
    // que eran dos acciones distintas, y es la misma.
    const { rerender } = render(
      <NuevaSesion proyecto={PROYECTO} local ramas={[]} alEmpezar={() => {}} alCerrar={() => {}} />
    );
    expect(screen.getByRole("button", { name: /^empezar$/i })).toBeTruthy();
    rerender(
      <NuevaSesion proyecto={PROYECTO} local={false} ramas={["master"]} alEmpezar={() => {}} alCerrar={() => {}} />
    );
    expect(screen.getByRole("button", { name: /^empezar$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /descargar y empezar/i })).toBeNull();
  });

  /**
   * El fallo mudo que esto arregla: consultar las ramas necesita una sesión MCP viva contra
   * CloudStudio y puede reventar. El motivo viajaba en el mensaje de alta y aterrizaba en un
   * acto de sistema —la OTRA pantalla—, así que la ventana se quedaba en «consultando las
   * ramas…» para siempre. Un «cargando» eterno es un fallo mudo con animación.
   */
  it("si las ramas no se pueden consultar lo DICE, en vez de quedarse cargando", () => {
    render(
      <NuevaSesion
        proyecto={PROYECTO}
        local={false}
        ramas={[]}
        aviso="fetch failed"
        alEmpezar={() => {}}
        alCerrar={() => {}}
      />
    );
    expect(screen.queryByText(/consultando las ramas/i)).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/no se pudieron consultar las ramas/i);
    expect(screen.getByRole("alert").textContent).toMatch(/fetch failed/);
    // Y sin desplegable: no hay nada que elegir, enseñar uno vacío sería fingir que sí.
    expect(screen.queryByRole("combobox")).toBeNull();
    // El botón sigue inerte: no se puede empezar lo que hay que bajar sin saber de dónde.
    expect((screen.getByRole("button", { name: /^empezar$/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("mientras se consultan, lo dice y no deja empezar", () => {
    render(
      <NuevaSesion proyecto={PROYECTO} local={false} ramas={[]} alEmpezar={() => {}} alCerrar={() => {}} />
    );
    expect(screen.getByText(/consultando las ramas/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /^empezar$/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("con copia local no pregunta nada y empieza sin rama", () => {
    const alEmpezar = vi.fn();
    render(
      <NuevaSesion proyecto={PROYECTO} local ramas={[]} alEmpezar={alEmpezar} alCerrar={() => {}} />
    );
    expect(screen.queryByLabelText(/rama de origen/i)).toBeNull();
    expect(screen.queryByText(/se descarga entero/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^empezar$/i }));
    expect(alEmpezar).toHaveBeenCalledWith(undefined);
  });

  it("cancelar no empieza nada: pulsar «+» por error no puede costar una descarga", () => {
    const alEmpezar = vi.fn();
    const alCerrar = vi.fn();
    render(
      <NuevaSesion proyecto={PROYECTO} local={false} ramas={["master"]} alEmpezar={alEmpezar} alCerrar={alCerrar} />
    );
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(alCerrar).toHaveBeenCalled();
    expect(alEmpezar).not.toHaveBeenCalled();
  });
});
