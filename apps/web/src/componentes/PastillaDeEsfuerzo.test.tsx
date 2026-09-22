import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PastillaDeEsfuerzo } from "./PastillaDeEsfuerzo.js";

describe("PastillaDeEsfuerzo", () => {
  // Un test que falla no llega a su `cleanup()`, y el siguiente encuentra DOS menús.
  afterEach(cleanup);

  /**
   * **La regla que más trabaja: sin niveles no hay control.**
   *
   * La mitad de los modelos de este harness no admiten esfuerzo —Haiku 4.5, Gemini 2.5, un
   * Ollama que no piensa, cualquier proveedor sin fila—, así que un desplegable apagado
   * ahí sería lo normal y no la excepción. Un control permanentemente inerte enseña a
   * ignorar la fila entera.
   */
  it("sin niveles no se pinta nada", () => {
    const { container } = render(<PastillaDeEsfuerzo alElegir={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("con la lista VACÍA tampoco: es lo mismo que no tener ninguno", () => {
    const { container } = render(<PastillaDeEsfuerzo niveles={[]} alElegir={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("sin nivel fijado el disparador no inventa uno", () => {
    render(<PastillaDeEsfuerzo niveles={["low", "medium", "high"]} alElegir={() => {}} />);
    // «esfuerzo» y no «high»: omitir el parámetro no es lo mismo que pedir `high`, aunque
    // en Anthropic coincidan — en Ollama no coincide y en DeepSeek tampoco.
    expect(screen.getByRole("button", { name: "esfuerzo" })).toBeTruthy();
  });

  it("con nivel fijado lo enseña tal cual lo nombra la API", () => {
    render(<PastillaDeEsfuerzo niveles={["low", "medium", "high", "xhigh", "max"]} actual="xhigh" alElegir={() => {}} />);
    expect(screen.getByRole("button", { name: "pensar: xhigh" })).toBeTruthy();
  });

  /**
   * Los niveles vienen DADOS y no se inventan: éste es el caso de DeepSeek, que colapsa
   * `medium` sobre `high`, así que ofrecerlo daría dos opciones que hacen lo mismo.
   */
  it("ofrece exactamente los niveles que le dan, ni uno más", () => {
    render(<PastillaDeEsfuerzo niveles={["low", "high", "max"]} alElegir={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "esfuerzo" }));
    const opciones = screen.getAllByRole("menuitem").map((b) => b.textContent);
    expect(opciones).toEqual(["Sin fijar", "low", "high", "max"]);
    expect(opciones).not.toContain("medium");
  });

  it("elegir un nivel lo manda y cierra el menú", () => {
    const alElegir = vi.fn();
    render(<PastillaDeEsfuerzo niveles={["low", "medium", "high"]} alElegir={alElegir} />);
    fireEvent.click(screen.getByRole("button", { name: "esfuerzo" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "medium" }));
    expect(alElegir).toHaveBeenCalledWith("medium");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  /** «Sin fijar» tiene que poder deshacer la elección, o el control es de una sola dirección. */
  it("«Sin fijar» manda undefined, que es dejar de mandar el parámetro", () => {
    const alElegir = vi.fn();
    render(<PastillaDeEsfuerzo niveles={["low", "medium", "high"]} actual="high" alElegir={alElegir} />);
    fireEvent.click(screen.getByRole("button", { name: "pensar: high" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sin fijar" }));
    expect(alElegir).toHaveBeenCalledWith(undefined);
  });

  it("el nivel en vigor va marcado, y con «Sin fijar» la marca es de «Sin fijar»", () => {
    render(<PastillaDeEsfuerzo niveles={["low", "medium", "high"]} actual="low" alElegir={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "pensar: low" }));
    expect(screen.getByRole("menuitem", { name: "low" }).getAttribute("aria-current")).toBe("true");

    // Montaje NUEVO y no `rerender`: `cleanup()` desmonta la raíz, y reusarla después
    // revienta con «Cannot update an unmounted root».
    cleanup();
    render(<PastillaDeEsfuerzo niveles={["low", "medium", "high"]} alElegir={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "esfuerzo" }));
    expect(screen.getByRole("menuitem", { name: "Sin fijar" }).getAttribute("aria-current")).toBe("true");
  });

  /**
   * La nota es lo que hace honesto el caso de Ollama: su servidor valida los cuatro
   * niveles, pero medido en `glm-5.3-flash:cloud` el `high` se comporta como apagado.
   * Sin poder decirlo, la pastilla afirmaría una escala que ahí no existe.
   */
  it("la nota del modelo se pinta en lugar de la de siempre", () => {
    render(
      <PastillaDeEsfuerzo
        niveles={["low", "medium", "high", "max"]}
        nota="En Ollama el efecto lo decide cada modelo."
        alElegir={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "esfuerzo" }));
    expect(screen.getByText(/el efecto lo decide cada modelo/i)).toBeTruthy();
  });

  it("sin cable el disparador está apagado", () => {
    render(<PastillaDeEsfuerzo niveles={["low", "medium", "high"]} conectado={false} alElegir={() => {}} />);
    expect((screen.getByRole("button", { name: "esfuerzo" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
