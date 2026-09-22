import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PastillaDeModoDeEscritura } from "./PastillaDeModoDeEscritura.js";

describe("PastillaDeModoDeEscritura", () => {
  // Un test que falla no llega a su `cleanup()`, y el siguiente encuentra DOS menús.
  afterEach(cleanup);

  /**
   * **Ausente es «no hay sesión», nunca «supervisado».**
   *
   * Es la distinción de siempre entre ausente y vacío, ahora sobre un control: pintarlo
   * diciendo «supervisado» afirmaría algo de una sesión que no existe, y encima sobre la
   * palanca que decide si se escribe sin preguntar.
   */
  it("sin modo no se pinta nada", () => {
    const { container } = render(<PastillaDeModoDeEscritura alElegir={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("enseña el modo en vigor, con la tilde que el dato no lleva", () => {
    // Lo que viaja y se compara es `autonomo` a secas; «autónomo» es cómo se escribe en
    // castellano. Meter la tilde en el dato sería un segundo vocabulario para lo mismo.
    render(<PastillaDeModoDeEscritura actual="autonomo" alElegir={() => {}} />);
    expect(screen.getByRole("button", { name: "autónomo" })).toBeTruthy();
  });

  it("elegir manda el VALOR sin tilde y cierra el menú", () => {
    const alElegir = vi.fn();
    render(<PastillaDeModoDeEscritura actual="supervisado" alElegir={alElegir} />);
    fireEvent.click(screen.getByRole("button", { name: "supervisado" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "autónomo" }));
    expect(alElegir).toHaveBeenCalledWith("autonomo");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("el menú DICE lo que el modo no concede: la subida sigue preguntando", () => {
    // El modo gobierna las escrituras LOCALES. Un interruptor no tiene dónde decir eso, y
    // por eso esto es un menú aunque sean dos valores: la frase es la mitad del control.
    render(<PastillaDeModoDeEscritura actual="supervisado" alElegir={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "supervisado" }));
    const menu = screen.getByRole("menu");
    expect(menu.textContent).toContain("CloudStudio");
    // Y que es de esta conversación, no del proyecto.
    expect(menu.textContent).toContain("sesión nueva");
  });

  it("marca cuál está puesto, para el teclado y para la vista", () => {
    render(<PastillaDeModoDeEscritura actual="autonomo" alElegir={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "autónomo" }));
    expect(screen.getByRole("menuitem", { name: "autónomo" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "supervisado" }).getAttribute("aria-current")).toBeNull();
  });

  it("sin cable el control se apaga: no hay a quién mandarle la intención", () => {
    render(<PastillaDeModoDeEscritura actual="supervisado" conectado={false} alElegir={() => {}} />);
    expect((screen.getByRole("button", { name: "supervisado" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
