import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { Compositor } from "./Compositor.js";

// `globals` no está activado en `vitest.config.ts` (proyecto «cliente»): sin `cleanup`
// explícito el segundo `render()` de este fichero deja montado el primero, y
// `getByRole("textbox")` revienta con «found multiple elements» — no es un defecto de
// React, es que nadie desmonta entre tests sin el auto-cleanup de `@testing-library/react`.
afterEach(cleanup);

const manejadores = { conectado: true, alEnviar: () => {} };

describe("Compositor", () => {
  it("`oculto` lo saca de la vista Y del orden del Tab, sin perder lo escrito", () => {
    // Las dos mitades importan. Fuera de la vista, porque en Trazas y en Ficheros no hay a
    // quién escribirle. Y sin perderlo, porque la alternativa —desmontarlo— tiraba el
    // borrador a medio escribir en cuanto ibas a mirar un fichero y volvías.
    //
    // `hidden` y no `visibility`: lo que hace falta es que el campo salga del árbol de
    // accesibilidad, o se llegaría a él tabulando sin verlo. Por eso el test lo busca por
    // ROL —que es lo que ve un lector de pantalla— y no por el nodo.
    const { rerender } = render(<Compositor {...manejadores} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a medio escribir" } });

    rerender(<Compositor {...manejadores} oculto />);
    expect(screen.queryByRole("textbox")).toBeNull();

    rerender(<Compositor {...manejadores} />);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("a medio escribir");
  });

  it("al terminar el turno, el foco vuelve a la caja", () => {
    // No es comodidad: la caja se apaga (`disabled`) mientras el agente trabaja, y un
    // elemento que se deshabilita pierde el foco — el navegador se lo devuelve al `<body>`.
    // Quien mandaba una petición y esperaba se encontraba con que teclear no escribía en
    // ningún sitio y había que ir a pinchar con el ratón.
    const { rerender } = render(<Compositor {...manejadores} turnoEnVuelo />);
    expect(document.activeElement).not.toBe(screen.getByRole("textbox"));

    rerender(<Compositor {...manejadores} />);
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });

  it("pero NO se lo roba si la caja está oculta ni al montar", () => {
    // Robar el foco mientras el usuario mira un diff en Ficheros es lo contrario de lo que
    // se quiere: le movería el teclado a una caja que ni siquiera se ve. Y al montar tampoco
    // —el flanco es de BAJADA de `turnoEnVuelo`, no «está apagado»—, porque si no cada
    // repintado con la consola recién abierta se llevaría el foco de donde estuviera.
    const { rerender } = render(<Compositor {...manejadores} turnoEnVuelo oculto />);
    rerender(<Compositor {...manejadores} oculto />);
    expect(document.activeElement).toBe(document.body);
  });

  it("escribir «/» NO abre ninguna lista: en el navegador no hay comandos que sugerir", () => {
    // Lo medido en la pantalla del usuario: aquí «/» era el disparador de un desplegable
    // de comandos, y una prosa que empezara por «/» —una ruta del proyecto— ejecutaba una
    // orden en vez de mandarse. La lista se fue con ellos.
    render(<Compositor {...manejadores} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "/modelo" } });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("sin conexión el campo se deshabilita y dice por qué", () => {
    render(<Compositor {...manejadores} conectado={false} />);
    const campo = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(campo.disabled).toBe(true);
    expect(campo.placeholder).toMatch(/sin conexión/);
  });

  it("Enter envía y limpia el campo", () => {
    const alEnviar = vi.fn();
    render(<Compositor {...manejadores} alEnviar={alEnviar} />);
    const campo = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(campo, { target: { value: "haz un listado" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(alEnviar).toHaveBeenCalledWith("haz un listado");
    expect(campo.value).toBe("");
  });

  it("Shift+Enter NO envía: jsdom no inserta el salto, pero el manejador tiene que quedarse mudo", () => {
    const alEnviar = vi.fn();
    render(<Compositor {...manejadores} alEnviar={alEnviar} />);
    const campo = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(campo, { target: { value: "primera línea" } });
    fireEvent.keyDown(campo, { key: "Enter", shiftKey: true });
    expect(alEnviar).not.toHaveBeenCalled();
  });

  it("una línea vacía o solo espacios no envía nada", () => {
    const alEnviar = vi.fn();
    render(<Compositor {...manejadores} alEnviar={alEnviar} />);
    const campo = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(campo, { target: { value: "   " } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(alEnviar).not.toHaveBeenCalled();
  });

  /**
   * Con un turno en vuelo, mandar una segunda petición la deja en la cola del lazo sin
   * decirlo: el usuario ve su texto desaparecer del campo y no pasar nada durante minutos.
   */
  it("con turno en vuelo la entrada se apaga y dice por qué", () => {
    render(<Compositor conectado turnoEnVuelo alEnviar={() => {}} />);
    const entrada = screen.getByPlaceholderText(/está trabajando/i) as HTMLTextAreaElement;
    expect(entrada.disabled).toBe(true);
  });

  it("la flecha se convierte en parar, y parar avisa a quien sabe abortar", () => {
    const alParar = vi.fn();
    const alEnviar = vi.fn();
    const { rerender } = render(<Compositor conectado alEnviar={alEnviar} />);
    expect(screen.getByRole("button", { name: /enviar/i })).toBeTruthy();

    rerender(<Compositor conectado turnoEnVuelo alParar={alParar} alEnviar={alEnviar} />);
    // Una sola ranura: no hay dos botones, uno de ellos inerte.
    expect(screen.queryByRole("button", { name: /enviar/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /parar/i }));
    expect(alParar).toHaveBeenCalled();
  });

  it("el Enter tampoco cuela con el turno en vuelo", () => {
    const alEnviar = vi.fn();
    const { rerender } = render(<Compositor conectado alEnviar={alEnviar} />);
    const entrada = screen.getByRole("textbox");
    fireEvent.change(entrada, { target: { value: "algo" } });
    // El campo se apaga DESPUÉS de escribir, con el foco puesto: la tecla llega igual.
    rerender(<Compositor conectado turnoEnVuelo alParar={() => {}} alEnviar={alEnviar} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(alEnviar).not.toHaveBeenCalled();
  });

  /**
   * El borde vivo es la única señal de que pasa algo en los tramos en que el modelo no
   * habla —piensa, llama tools, espera al verificador— y pueden ser minutos. La caja
   * apagada y quieta se leía como «se ha colgado». El test mira el ESTADO, no la animación:
   * jsdom no hace layout ni corre `@keyframes`, así que afirmar el movimiento aquí sería
   * afirmar lo que este entorno no sabe.
   */
  it("la caja se marca como trabajando mientras hay turno, y se desmarca al acabar", () => {
    const { container, rerender } = render(<Compositor conectado turnoEnVuelo alEnviar={() => {}} />);
    expect(container.querySelector("[data-trabajando]")).toBeTruthy();
    rerender(<Compositor conectado alEnviar={() => {}} />);
    expect(container.querySelector("[data-trabajando]")).toBeNull();
  });
});

describe("la ayuda de teclas", () => {
  it("dice las dos, y las dos son ciertas: se comprueban aquí mismo", () => {
    // No es una decoración: cada frase se corresponde con un comportamiento de este
    // componente, y el test las ata para que no se queden mintiendo. Eran TRES hasta que
    // los comandos se fueron del navegador: una ayuda que nombra una tecla muerta es peor
    // que no tenerla.
    const alEnviar = vi.fn();
    render(<Compositor conectado alEnviar={alEnviar} />);
    expect(screen.getByText(/Enter para enviar · Shift \+ Enter para salto de línea$/)).toBeTruthy();

    const campo = screen.getByRole("textbox");
    // `Enter` envía…
    fireEvent.change(campo, { target: { value: "hola" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(alEnviar).toHaveBeenCalledWith("hola");
    // …`Shift+Enter` no…
    fireEvent.change(campo, { target: { value: "otra" } });
    fireEvent.keyDown(campo, { key: "Enter", shiftKey: true });
    expect(alEnviar).toHaveBeenCalledTimes(1);
  });

  it("se oculta CON la caja, no por su cuenta", () => {
    // En Trazas y en Ficheros no hay a quién escribirle, así que la caja se esconde; una
    // ayuda de teclado suelta debajo de un diff sería una nota al pie sin nota.
    const { container } = render(<Compositor conectado alEnviar={() => undefined} oculto />);
    expect(container.querySelector("[hidden]")?.textContent).toContain("Enter para enviar");
  });

  it("el placeholder nombra lo que este harness sabe hacer", () => {
    // «Escribe una petición» no dice nada; y lo que se nombre tiene que estar cableado —
    // prometer aquí lo que no existe es el botón muerto de siempre con una persona detrás.
    render(<Compositor conectado alEnviar={() => undefined} />);
    expect(screen.getByPlaceholderText(/Pregunta sobre XOne/)).toBeTruthy();
  });
});

describe("las tres bandas de la caja", () => {
  /**
   * **El MOTOR va encima del campo y lo que decide el turno va debajo.**
   *
   * Es una decisión revisitada, y por eso este test dice la historia: el dispositivo
   * estuvo arriba siguiendo una maqueta y volvió abajo mirando la pantalla, con un
   * argumento que sigue siendo bueno —«un chip solo no era una fila, era un renglón»—.
   * Lo que cambió es el reparto: arriba van TRES controles (modelo, esfuerzo, dispositivo)
   * y abajo quedan el modo, el gasto y el botón, así que ninguna banda es un renglón
   * huérfano. Se comprueba por POSICIÓN en el documento porque jsdom no hace layout.
   */
  it("modelo y dispositivo van ANTES del campo; el modo, DESPUÉS", () => {
    render(
      <Compositor
        conectado
        alEnviar={() => undefined}
        alElegirDispositivo={() => undefined}
        alElegirModoDeEscritura={() => undefined}
        modoDeEscritura="supervisado"
        modelos={{ actual: "gemini/gemini-flash-latest", proveedores: [] }}
      />
    );
    const campo = screen.getByRole("textbox");
    for (const texto of [/dispositivo/i, "gemini/gemini-flash-latest"]) {
      const control = screen.getByText(texto);
      expect(control.compareDocumentPosition(campo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const modo = screen.getByRole("group", { name: "modo de escritura" });
    expect(modo.compareDocumentPosition(campo) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("sin manejador no hay pastilla de dispositivo", () => {
    // La misma regla que la de modelos: sin quien sepa elegir, no se pinta.
    render(<Compositor conectado alEnviar={() => undefined} />);
    expect(screen.queryByText(/dispositivo/i)).toBeNull();
  });
});

