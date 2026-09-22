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

  /**
   * **La guarda mira lo último PEDIDO, no lo último confirmado.**
   *
   * REPRODUCIDO en el navegador antes de arreglarlo: pulsar «Autónomo» y acto seguido
   * «Supervisado» dejaba la sesión en AUTÓNOMO, y nada lo decía. La causa es que `actual`
   * llega del servidor por el `alta`, así que entre el clic y la vuelta la pastilla sigue
   * diciendo lo de antes — y pulsar lo de antes se leía como «pulsar la que ya está puesta».
   * Con un turno en vuelo la vuelta tarda lo que tarde el turno.
   *
   * Es una intención PERDIDA en silencio, que es peor que la línea de más que la guarda
   * evita. Lo que cambia es solo la decisión de MANDAR: lo que se PINTA sigue siendo el
   * estado confirmado, porque pintar lo pedido afirmaría que el modo ya rige cuando el
   * `/aprobacion` ni siquiera se ha ejecutado — y ese modo decide si los ficheros se
   * escriben sin enseñar el diff.
   */
  describe("la guarda, contra lo último PEDIDO", () => {
    it("cambiar de opinión antes de que el servidor confirme SÍ manda", () => {
      const alElegir = vi.fn();
      render(<SelectorDeModo actual="supervisado" alElegir={alElegir} />);
      fireEvent.click(screen.getByRole("button", { name: /Autónomo/ }));
      // `actual` NO cambia: el servidor todavía no ha contestado.
      fireEvent.click(screen.getByRole("button", { name: /Supervisado/ }));
      expect(alElegir.mock.calls).toEqual([["autonomo"], ["supervisado"]]);
    });

    it("y DOS pulsaciones del mismo tick también, que es lo que el test de arriba no cazaba", () => {
      // REPRODUCIDO en el navegador con la primera versión del arreglo, que usaba `useState`:
      // dos `.click()` seguidos comparten el closure del render anterior, así que el segundo
      // manejador leía el pedido viejo y volvía a descartar la pulsación. En test salía verde
      // porque `fireEvent` fuerza el repintado entre los dos clics y un navegador no.
      //
      // Por eso el pedido es una `ref` y `vigente` se calcula DENTRO del manejador: ninguna
      // de las dos cosas sola basta.
      const alElegir = vi.fn();
      render(<SelectorDeModo actual="supervisado" alElegir={alElegir} />);
      const autonomo = screen.getByRole("button", { name: /Autónomo/ });
      const supervisado = screen.getByRole("button", { name: /Supervisado/ });
      // Sin pasar por `fireEvent` entre uno y otro: los dos manejadores, en el mismo tick.
      autonomo.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      supervisado.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(alElegir.mock.calls).toEqual([["autonomo"], ["supervisado"]]);
    });

    it("y repetir lo ya pedido no manda: la guarda sigue haciendo su trabajo", () => {
      const alElegir = vi.fn();
      render(<SelectorDeModo actual="supervisado" alElegir={alElegir} />);
      fireEvent.click(screen.getByRole("button", { name: /Autónomo/ }));
      fireEvent.click(screen.getByRole("button", { name: /Autónomo/ }));
      expect(alElegir.mock.calls).toEqual([["autonomo"]]);
    });

    it("lo que se PINTA sigue siendo lo confirmado, no lo pedido", () => {
      // Pintar lo pedido afirmaría que el modo ya rige. No rige: `/aprobacion` está en la
      // cola y con un turno en vuelo no se ejecuta hasta que termine.
      render(<SelectorDeModo actual="supervisado" alElegir={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: /Autónomo/ }));
      expect(screen.getByRole("button", { name: /Supervisado/ }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("button", { name: /Autónomo/ }).getAttribute("aria-pressed")).toBe("false");
    });

    it("cuando el servidor confirma, el pedido CADUCA y la guarda vuelve a lo confirmado", () => {
      // El pedido vale mientras `actual` no se mueva. En cuanto el servidor dice algo —lo
      // pedido o cualquier otra cosa— manda lo confirmado: un pedido pegado para siempre
      // dejaría el control muerto para ese valor si la petición se perdiera.
      const alElegir = vi.fn();
      const { rerender } = render(<SelectorDeModo actual="supervisado" alElegir={alElegir} />);
      fireEvent.click(screen.getByRole("button", { name: /Autónomo/ }));
      rerender(<SelectorDeModo actual="autonomo" alElegir={alElegir} />);
      // Confirmado «autonomo»: pulsarlo otra vez no manda…
      fireEvent.click(screen.getByRole("button", { name: /Autónomo/ }));
      expect(alElegir.mock.calls).toEqual([["autonomo"]]);
      // …y el otro sí.
      fireEvent.click(screen.getByRole("button", { name: /Supervisado/ }));
      expect(alElegir.mock.calls).toEqual([["autonomo"], ["supervisado"]]);
    });
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
