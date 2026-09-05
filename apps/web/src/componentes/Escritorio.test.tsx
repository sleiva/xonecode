import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Escritorio } from "./Escritorio.js";

const MANEJADORES = {
  alNuevaSesion: () => {},
  alAbrirSesion: () => {},
  alAbrirAjustes: () => {},
};

describe("Escritorio", () => {
  afterEach(cleanup);

  it("saluda con el nombre del servidor, y sin él saluda igual sin inventárselo", () => {
    const { rerender } = render(<Escritorio {...MANEJADORES} proyectos={[]} />);
    expect(screen.getByRole("heading", { name: "Hola" })).toBeTruthy();
    rerender(<Escritorio {...MANEJADORES} proyectos={[]} nombre="Sergio" />);
    expect(screen.getByRole("heading", { name: /hola, sergio/i })).toBeTruthy();
  });

  /**
   * Los dos vacíos NO son el mismo: sin entorno no hay a quién preguntarle por proyectos;
   * con entorno y sin proyectos, el que no tiene es él. Decir lo mismo en los dos casos
   * mandaría a Ajustes a quien ya lo tiene todo configurado.
   */
  it("distingue «no hay entorno» de «el entorno no tiene proyectos»", () => {
    const { rerender } = render(<Escritorio {...MANEJADORES} proyectos={[]} />);
    expect(screen.getByText(/ningún entorno registrado/i)).toBeTruthy();
    rerender(
      <Escritorio {...MANEJADORES} proyectos={[]} entorno={{ nombre: "Casa", url: "https://mcp.casa/mcp" }} />
    );
    expect(screen.getByText(/no ha devuelto ningún proyecto/i)).toBeTruthy();
  });

  it("cada proyecto dice si está en el equipo, y empezar viaja con SU id", () => {
    const alNuevaSesion = vi.fn();
    render(
      <Escritorio
        {...MANEJADORES}
        alNuevaSesion={alNuevaSesion}
        proyectos={[
          { id: "p1", nombre: "Tienda", local: true },
          { id: "p2", nombre: "Almacén" },
        ]}
      />
    );
    const tienda = screen.getByRole("heading", { name: "Tienda" }).closest("li")!;
    expect(tienda.textContent).toMatch(/en tu equipo/i);
    const almacen = screen.getByRole("heading", { name: "Almacén" }).closest("li")!;
    expect(almacen.textContent).toMatch(/sin descargar/i);

    fireEvent.click(within(almacen).getByRole("button", { name: /nueva sesión/i }));
    expect(alNuevaSesion).toHaveBeenCalledWith("p2");
  });

  it("las sesiones se pueden seguir desde aquí, las últimas primero", () => {
    const alAbrirSesion = vi.fn();
    render(
      <Escritorio
        {...MANEJADORES}
        alAbrirSesion={alAbrirSesion}
        proyectos={[
          {
            id: "p1",
            nombre: "Tienda",
            sesiones: [
              { id: "s1", titulo: "la primera" },
              { id: "s2", titulo: "la última" },
            ],
          },
        ]}
      />
    );
    const botones = screen.getAllByRole("button").map((b) => b.textContent);
    expect(botones.indexOf("la última")).toBeLessThan(botones.indexOf("la primera"));
    fireEvent.click(screen.getByRole("button", { name: "la última" }));
    expect(alAbrirSesion).toHaveBeenCalledWith("p1", "s2");
  });

  it("una tarjeta sin sesiones lo dice en vez de callar", () => {
    render(<Escritorio {...MANEJADORES} proyectos={[{ id: "p1", nombre: "Tienda" }]} />);
    expect(screen.getByText(/sin sesiones todavía/i)).toBeTruthy();
  });

  /**
   * El modelo se afirma solo si el servidor lo dice — la misma regla que la pastilla del
   * compositor: sin sesión abierta no hay modelo en vigor que anunciar.
   */
  it("el modelo se dice si se sabe, y si no, no se inventa", () => {
    const { rerender } = render(<Escritorio {...MANEJADORES} proyectos={[]} />);
    expect(screen.queryByText(/trabajará con/i)).toBeNull();
    rerender(<Escritorio {...MANEJADORES} proyectos={[]} modelo="ollama/qwen3" />);
    expect(screen.getByText(/ollama\/qwen3/)).toBeTruthy();
  });

  /**
   * Nada del mockup que no tenga dato detrás: el panel de dispositivos, «Build & Run» y el
   * estado del ADB son un puente con el móvil que este producto todavía no cablea.
   */
  it("no pinta dispositivos ni «Build & Run»: no hay nada detrás", () => {
    render(<Escritorio {...MANEJADORES} proyectos={[{ id: "p1", nombre: "Tienda", local: true }]} />);
    expect(screen.queryByText(/build & run/i)).toBeNull();
    expect(screen.queryByText(/adb/i)).toBeNull();
    expect(screen.queryByText(/dispositivos conectados/i)).toBeNull();
  });
});
