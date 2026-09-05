import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PastillaDeModelo } from "./PastillaDeModelo.js";

const PROVEEDORES = [
  { id: "ollama", credencial: "nativa" as const },
  { id: "anthropic", credencial: "puesta" as const },
  { id: "openai", credencial: "falta" as const },
];

describe("PastillaDeModelo", () => {
  // Un test que falla no llega a su `cleanup()`, y el siguiente encuentra DOS menús: el
  // fallo real queda enterrado bajo un «found multiple elements» que no es el problema.
  afterEach(cleanup);

  it("sin modelo en vigor NO inventa uno: dice que hay que elegirlo", () => {
    render(
      <PastillaDeModelo proveedores={PROVEEDORES} alPedirCatalogo={() => {}} alElegir={() => {}} />
    );
    expect(screen.getByRole("button", { name: /elige modelo/i })).toBeTruthy();
  });

  it("con modelo en vigor lo pinta tal cual lo dice el servidor", () => {
    render(
      <PastillaDeModelo
        actual="anthropic/claude-x"
        proveedores={PROVEEDORES}
        alPedirCatalogo={() => {}}
        alElegir={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: "anthropic/claude-x" })).toBeTruthy();
  });

  /**
   * El catálogo es una llamada de red por proveedor: se pide al desplegarlo y no al
   * pintar el menú, que si no serían cinco peticiones para un menú que quizá nadie abra.
   */
  it("desplegar un proveedor pide SU catálogo, una vez, y mientras tanto lo dice", () => {
    const alPedirCatalogo = vi.fn();
    render(
      <PastillaDeModelo proveedores={PROVEEDORES} alPedirCatalogo={alPedirCatalogo} alElegir={() => {}} />
    );
    fireEvent.click(screen.getByRole("button", { name: /elige modelo/i }));
    expect(alPedirCatalogo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /anthropic/i }));
    expect(alPedirCatalogo).toHaveBeenCalledWith("anthropic");
    expect(screen.getByText(/consultando/i)).toBeTruthy();
    // Cerrar y volver a abrir no lo vuelve a pedir: el servidor ya lo tiene cacheado.
    fireEvent.click(screen.getByRole("button", { name: /anthropic/i }));
    fireEvent.click(screen.getByRole("button", { name: /anthropic/i }));
    expect(alPedirCatalogo).toHaveBeenCalledTimes(1);
  });

  /**
   * Un menú que solo se cierra volviendo a pulsar su disparador tapa lo de debajo —vive en
   * la fila del compositor, justo encima de lo que se escribe— y no es lo que hace ningún
   * menú.
   */
  it("pinchar fuera lo cierra, y Escape también", () => {
    render(
      <PastillaDeModelo proveedores={PROVEEDORES} alPedirCatalogo={() => {}} alElegir={() => {}} />
    );
    fireEvent.click(screen.getByRole("button", { name: /elige modelo/i }));
    expect(screen.getByRole("menu")).toBeTruthy();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /elige modelo/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("pinchar DENTRO no lo cierra: elegir proveedor es usarlo, no salirse", () => {
    render(
      <PastillaDeModelo proveedores={PROVEEDORES} alPedirCatalogo={() => {}} alElegir={() => {}} />
    );
    fireEvent.click(screen.getByRole("button", { name: /elige modelo/i }));
    const anthropic = screen.getByRole("button", { name: /anthropic/i });
    fireEvent.mouseDown(anthropic);
    fireEvent.click(anthropic);
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("elegir un modelo manda el id completo: quien lo monta lo traduce a `/modelo`", () => {
    const alElegir = vi.fn();
    render(
      <PastillaDeModelo
        actual="ollama/qwen3"
        proveedores={[
          { id: "ollama", credencial: "nativa", modelos: [{ id: "qwen3", nombre: "Qwen 3" }, { id: "glm", nombre: "GLM" }] },
        ]}
        alPedirCatalogo={() => {}}
        alElegir={alElegir}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "ollama/qwen3" }));
    fireEvent.click(screen.getByRole("button", { name: /^ollama$/i }));
    fireEvent.click(screen.getByRole("button", { name: "GLM" }));
    expect(alElegir).toHaveBeenCalledWith("ollama/glm");
  });

  it("un proveedor que falla lo dice donde el usuario mira, y los demás siguen elegibles", () => {
    const alElegir = vi.fn();
    render(
      <PastillaDeModelo
        proveedores={[
          { id: "openai", credencial: "falta", error: "credencial no autorizada para openai" },
          { id: "ollama", credencial: "nativa", modelos: [{ id: "qwen3" }] },
        ]}
        alPedirCatalogo={() => {}}
        alElegir={alElegir}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /elige modelo/i }));
    fireEvent.click(screen.getByRole("button", { name: /openai/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/no autorizada/);
    // Y el otro sigue funcionando: un desvío, no un callejón.
    fireEvent.click(screen.getByRole("button", { name: /^ollama$/i }));
    fireEvent.click(screen.getByRole("button", { name: "qwen3" }));
    expect(alElegir).toHaveBeenCalledWith("ollama/qwen3");
  });

  /**
   * El punto es literal: verde solo si la credencial está confirmada, rojo solo si se sabe
   * que falta, y NADA para quien no necesita ninguna. Pintarle un punto a Ollama sería
   * concederle un permiso o inventarle un problema.
   */
  it("el punto de credencial solo aparece cuando hay algo que afirmar", () => {
    render(
      <PastillaDeModelo proveedores={PROVEEDORES} alPedirCatalogo={() => {}} alElegir={() => {}} />
    );
    fireEvent.click(screen.getByRole("button", { name: /elige modelo/i }));
    expect(screen.getByRole("button", { name: /anthropic/i }).querySelector("[data-credencial='puesta']")).toBeTruthy();
    expect(screen.getByRole("button", { name: /openai/i }).querySelector("[data-credencial='falta']")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^ollama$/i }).querySelector("[data-credencial]")).toBeNull();
  });
});
