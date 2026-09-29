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
    // El combo sigue en su sitio, BLOQUEADO: no hay nada que elegir, y que desapareciera
    // movía la ventana entera. El error sale debajo de él.
    expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(true);
    // El botón sigue inerte: no se puede empezar lo que hay que bajar sin saber de dónde.
    expect((screen.getByRole("button", { name: /^empezar$/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("mientras se consultan, la carga va DENTRO del combo, y el combo y «Empezar» esperan", () => {
    render(
      <NuevaSesion proyecto={PROYECTO} local={false} ramas={[]} alEmpezar={() => {}} alCerrar={() => {}} />
    );
    const combo = screen.getByRole("combobox") as HTMLSelectElement;
    expect(combo.disabled).toBe(true);
    expect(combo.getAttribute("aria-busy")).toBe("true");
    // Su texto es la espera, y no hay otra línea de carga debajo.
    expect(combo.textContent).toMatch(/cargando las ramas/i);
    expect(screen.queryByRole("status")).toBeNull();
    expect((screen.getByRole("button", { name: /^empezar$/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  /**
   * Tras «Empezar» la ventana NO se va: dice que descarga, con la carga debajo del combo, y
   * no deja pedir otra descarga encima.
   */
  it("descargando: «Descargando proyecto…», combo y «Empezar» bloqueados", () => {
    render(
      <NuevaSesion
        proyecto={PROYECTO}
        local={false}
        ramas={["master"]}
        descargando
        alEmpezar={() => {}}
        alCerrar={() => {}}
      />
    );
    expect(screen.getByRole("status").textContent).toMatch(/Descargando proyecto…/);
    expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /^empezar$/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("si la descarga falla, el motivo sale debajo del combo y se puede reintentar", () => {
    render(
      <NuevaSesion
        proyecto={PROYECTO}
        local={false}
        ramas={["master"]}
        aviso="no se pudo bajar el zip"
        alEmpezar={() => {}}
        alCerrar={() => {}}
      />
    );
    expect(screen.getByRole("alert").textContent).toMatch(/No se pudo descargar el proyecto: no se pudo bajar el zip/);
    expect((screen.getByRole("button", { name: /^empezar$/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  /** Modal de verdad: ni el velo ni `Escape` la cierran; solo «Cancelar». */
  it("solo «Cancelar» la cierra", () => {
    const alCerrar = vi.fn();
    render(<NuevaSesion proyecto={PROYECTO} local={false} ramas={["master"]} alEmpezar={() => {}} alCerrar={alCerrar} />);
    const velo = screen.getByRole("heading", { name: /nueva sesión/i }).parentElement!.parentElement!;
    fireEvent.click(velo);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(alCerrar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(alCerrar).toHaveBeenCalledTimes(1);
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
