import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SelectorDeModo } from "./SelectorDeModo.js";

describe("SelectorDeModo", () => {
  // Un test que falla no llega a su `cleanup()`, y el siguiente encuentra DOS conmutadores.
  afterEach(cleanup);

  /**
   * **Ausente es «no hay sesión», nunca «supervisado».**
   *
   * Es la distinción de siempre entre ausente y vacío, ahora sobre un control: pintarlo
   * diciendo «supervisado» afirmaría algo de una sesión que no existe, y encima sobre la
   * palanca que decide si se escribe sin preguntar.
   */
  it("sin modo no se pinta nada", () => {
    const { container } = render(<SelectorDeModo alElegir={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("las DOS mitades están a la vista: el estado se lee sin abrir nada", () => {
    // Es la razón de ser del segmentado frente al menú que había: la pregunta que contesta
    // —«¿lo próximo que escriba se aplicará solo?»— no puede costar un clic.
    render(<SelectorDeModo actual="supervisado" alElegir={() => {}} />);
    expect(screen.getByRole("button", { name: /Supervisado/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Autónomo/ })).toBeTruthy();
  });

  it("dice cuál está puesto con `aria-pressed`, y lo dice en las DOS", () => {
    // `aria-pressed="false"` en la que no lo está es lo que convierte dos botones en un
    // conmutador. Omitirlo dejaría dos acciones sueltas de las que no se sabe cuál rige, y
    // el color no le llega a quien escucha la página.
    render(<SelectorDeModo actual="autonomo" alElegir={() => {}} />);
    expect(screen.getByRole("button", { name: /Autónomo/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: /Supervisado/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("elegir manda el VALOR sin tilde", () => {
    // Lo que viaja y se compara es `autonomo` a secas; «autónomo» es cómo se escribe en
    // castellano. Meter la tilde en el dato sería un segundo vocabulario para lo mismo.
    const alElegir = vi.fn();
    render(<SelectorDeModo actual="supervisado" alElegir={alElegir} />);
    fireEvent.click(screen.getByRole("button", { name: /Autónomo/ }));
    expect(alElegir).toHaveBeenCalledWith("autonomo");
  });

  it("pulsar la que YA está puesta no manda nada", () => {
    // Sería un mensaje por el cable, un `/aprobacion` encolado y una línea en el transcript
    // para dejarlo todo como estaba.
    const alElegir = vi.fn();
    render(<SelectorDeModo actual="autonomo" alElegir={alElegir} />);
    fireEvent.click(screen.getByRole("button", { name: /Autónomo/ }));
    expect(alElegir).not.toHaveBeenCalled();
  });

  it("cada mitad DICE lo que hace, y la de autónomo dice lo que NO concede", () => {
    // La maqueta lo ponía en un tooltip de hover, que no alcanzan ni el teclado ni el
    // táctil — y esto es la palanca que decide si los ficheros se escriben sin diff. El
    // `title` lo lee el hover Y el lector de pantalla.
    render(<SelectorDeModo actual="supervisado" alElegir={() => {}} />);
    expect(screen.getByRole("button", { name: /Supervisado/ }).title).toMatch(/diff/i);
    const autonomo = screen.getByRole("button", { name: /Autónomo/ }).title;
    expect(autonomo).toMatch(/se aplican solas/i);
    expect(autonomo).toMatch(/CloudStudio/);
  });

  it("sin cable las dos mitades se apagan: no hay a quién mandarle la intención", () => {
    render(<SelectorDeModo actual="supervisado" conectado={false} alElegir={() => {}} />);
    for (const nombre of [/Supervisado/, /Autónomo/]) {
      expect((screen.getByRole("button", { name: nombre }) as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
