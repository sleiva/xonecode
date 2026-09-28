import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
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

  it("al dejar de haber algo pendiente, el foco vuelve a la caja", () => {
    const { rerender } = render(<Compositor {...manejadores} hayPendiente />);
    expect(document.activeElement).not.toBe(screen.getByRole("textbox"));
    rerender(<Compositor {...manejadores} />);
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });

  it("pero NO se lo roba si la caja está oculta ni al montar", () => {
    // Mientras está `oculto` el `<textarea>` sale del árbol de accesibilidad (`hidden`
    // cascada a los hijos), así que `getByRole` no lo encuentra: la comprobación de ese
    // tramo se hace contra `document.body`, que es donde se queda el foco cuando no hay
    // nada enfocable. Al volver a ser visible sí se puede preguntar por rol.
    const { rerender } = render(<Compositor {...manejadores} hayPendiente oculto />);
    rerender(<Compositor {...manejadores} oculto />);
    expect(document.activeElement).toBe(document.body);
    rerender(<Compositor {...manejadores} />);
    expect(document.activeElement).not.toBe(screen.getByRole("textbox"));
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
    expect(alEnviar).toHaveBeenCalledWith("haz un listado", []);
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
   * Una aprobación, pregunta, selector o secreto en pantalla compite por la MISMA respuesta:
   * escribir aquí a la vez sería una segunda conversación sobre la misma decisión. Un turno
   * en vuelo sin nada pendiente no tiene ese problema —desde IXCODE-4 acepta una nota, ver el
   * test de abajo—, así que solo `hayPendiente` apaga la caja.
   */
  it("con algo pendiente la entrada se apaga y dice por qué", () => {
    render(<Compositor conectado hayPendiente alEnviar={() => {}} />);
    const entrada = screen.getByPlaceholderText(/responde/i) as HTMLTextAreaElement;
    expect(entrada.disabled).toBe(true);
  });

  it("con turno en vuelo pero SIN nada pendiente, la entrada sigue escribible", () => {
    render(<Compositor conectado turnoEnVuelo alEnviar={() => {}} />);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).disabled).toBe(false);
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

  it("el Enter SÍ cuela con turno en vuelo, si no hay nada pendiente — es la nota de IXCODE-4", () => {
    const alEnviar = vi.fn();
    const { rerender } = render(<Compositor conectado alEnviar={alEnviar} />);
    const entrada = screen.getByRole("textbox");
    fireEvent.change(entrada, { target: { value: "cambia de idea" } });
    rerender(<Compositor conectado turnoEnVuelo alEnviar={alEnviar} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(alEnviar).toHaveBeenCalledWith("cambia de idea", []);
  });

  it("DETENER solo se pinta con turno en vuelo, sin nada pendiente y si el turno lo admite; manda lo escrito y vacía la caja", () => {
    const alDetener = vi.fn();
    const { rerender } = render(<Compositor conectado turnoEnVuelo alEnviar={() => {}} />);
    // Sin `alDetener` el turno no lo admite (deepagents): no hay botón.
    expect(screen.queryByRole("button", { name: /detener/i })).toBeNull();

    rerender(<Compositor conectado turnoEnVuelo hayPendiente alDetener={alDetener} alEnviar={() => {}} />);
    expect(screen.queryByRole("button", { name: /detener/i })).toBeNull();

    rerender(<Compositor conectado alDetener={alDetener} alEnviar={() => {}} />);
    expect(screen.queryByRole("button", { name: /detener/i })).toBeNull();

    rerender(<Compositor conectado turnoEnVuelo alDetener={alDetener} alEnviar={() => {}} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  mejor el menú  " } });
    fireEvent.click(screen.getByRole("button", { name: /detener/i }));
    expect(alDetener).toHaveBeenCalledWith("mejor el menú");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
    // Y Parar sigue ahí: son dos gestos distintos.
    expect(screen.getByRole("button", { name: /parar/i })).toBeTruthy();
  });

  it("el Enter NO cuela con algo pendiente", () => {
    const alEnviar = vi.fn();
    const { rerender } = render(<Compositor conectado alEnviar={alEnviar} />);
    const entrada = screen.getByRole("textbox");
    fireEvent.change(entrada, { target: { value: "algo" } });
    rerender(<Compositor conectado hayPendiente alEnviar={alEnviar} />);
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
    // Están DENTRO de la caja, en la segunda línea del placeholder: el renglón que
    // ocupaban debajo de la tarjeta es transcript, que es lo único elástico de la columna.
    expect(
      (screen.getByRole("textbox") as HTMLTextAreaElement).placeholder
    ).toMatch(/Enter envía · Shift\+Enter salta de línea$/);

    const campo = screen.getByRole("textbox");
    // `Enter` envía…
    fireEvent.change(campo, { target: { value: "hola" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(alEnviar).toHaveBeenCalledWith("hola", []);
    // …`Shift+Enter` no…
    fireEvent.change(campo, { target: { value: "otra" } });
    fireEvent.keyDown(campo, { key: "Enter", shiftKey: true });
    expect(alEnviar).toHaveBeenCalledTimes(1);
  });

  it("se oculta CON la caja, y ahora no puede ser de otra forma", () => {
    // En Trazas y en Ficheros no hay a quién escribirle, así que la caja se esconde. Antes
    // la ayuda era un `<p>` suelto bajo la tarjeta y había que acordarse de meterlo dentro
    // de la envoltura; desde que vive en el placeholder, esconder la caja la esconde por
    // construcción. El test se queda porque lo que fija es la CONSECUENCIA, no el marcado.
    const { container } = render(<Compositor conectado alEnviar={() => undefined} oculto />);
    const oculta = container.querySelector("[hidden]");
    expect(oculta).not.toBeNull();
    expect(oculta!.querySelector("textarea")?.placeholder).toContain("Enter envía");
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
   * **Arriba lo que se MIRA; abajo lo que decide el turno y lo manda.**
   *
   * El reparto ha cambiado dos veces y por eso este test lleva la historia. Primero los
   * selectores subieron todos encima del campo; después el gasto subió a la esquina de
   * arriba a la izquierda y el motor —modelo y esfuerzo— bajó junto al botón de enviar, que
   * es donde se lee justo antes de pulsar. Y eso cierra de paso un límite del plegado: la
   * banda de arriba se va en reposo, así que ahí el modelo en vigor dejaba de verse.
   *
   * Se comprueba por POSICIÓN en el documento porque jsdom no hace layout.
   */
  it("el dispositivo va ANTES del campo; el modo y el modelo, DESPUÉS", () => {
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
    const dispositivo = screen.getByText(/dispositivo/i);
    expect(dispositivo.compareDocumentPosition(campo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const nodo of [
      screen.getByText("gemini/gemini-flash-latest"),
      screen.getByRole("group", { name: "modo de escritura" }),
    ]) {
      expect(nodo.compareDocumentPosition(campo) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    }
  });

  it("sin manejador no hay pastilla de dispositivo", () => {
    // La misma regla que la de modelos: sin quien sepa elegir, no se pinta.
    render(<Compositor conectado alEnviar={() => undefined} />);
    expect(screen.queryByText(/dispositivo/i)).toBeNull();
  });
});


describe("un borrador que llega de FUERA («Pedir corrección»)", () => {
  it("se escribe en la caja, se AÑADE a lo que hubiera y NO se envía", () => {
    const alEnviar = vi.fn();
    const { rerender } = render(<Compositor conectado alEnviar={alEnviar} />);
    const caja = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(caja, { target: { value: "lo que estaba escribiendo" } });
    rerender(<Compositor conectado alEnviar={alEnviar} borrador={{ texto: "Corrige E1 en a.xne:3: mal", id: 1 }} />);
    expect(caja.value).toBe("lo que estaba escribiendo\nCorrige E1 en a.xne:3: mal");
    expect(alEnviar).not.toHaveBeenCalled();
    // Y el foco dentro, que es lo que despliega la caja para leerlo.
    expect(document.activeElement).toBe(caja);
  });

  it("dos peticiones iguales seguidas cuentan dos: lo decide el `id`, no el texto", () => {
    const { rerender } = render(<Compositor {...manejadores} borrador={{ texto: "A", id: 1 }} />);
    rerender(<Compositor {...manejadores} borrador={{ texto: "A", id: 2 }} />);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("A\nA");
  });
});

/**
 * Anexar desde el chat (Task 6, IXCODE-7): el «+», soltar sobre la caja, pegar una imagen,
 * y el envío llevando los NOMBRES de lo ya subido.
 */
describe("adjuntar ficheros", () => {
  const entradaDeFicheros = (): HTMLInputElement => {
    const e = document.querySelector('input[type="file"]');
    if (e === null) throw new Error("no hay entrada de ficheros");
    return e as HTMLInputElement;
  };

  it("sin `alSubirAdjunto` no hay «+» ni se aceptan sueltos: un control sin dato detrás no se pinta", () => {
    const { container } = render(<Compositor {...manejadores} />);
    expect(screen.queryByRole("button", { name: "Anexar ficheros" })).toBeNull();
    const caja = container.querySelector('[class*="compositor"]') as HTMLElement;
    fireEvent.dragOver(caja, { dataTransfer: { files: [new File(["x"], "a.png")] } });
    expect(caja.hasAttribute("data-arrastrando")).toBe(false);
  });

  it("el «+» abre el selector; elegir 2 ficheros sube cada uno con su nombre SANEADO y pinta 2 fichas", async () => {
    const alSubirAdjunto = vi.fn(async () => ({ ok: true }));
    render(<Compositor {...manejadores} alSubirAdjunto={alSubirAdjunto} />);
    fireEvent.click(screen.getByRole("button", { name: "Anexar ficheros" }));

    // El espacio se convierte en `_`: es `nombreDeAdjuntoSeguro`, no una regla nueva de aquí.
    const f1 = new File(["a"], "Icono Nuevo.png", { type: "image/png" });
    const f2 = new File(["b"], "b.png", { type: "image/png" });
    fireEvent.change(entradaDeFicheros(), { target: { files: [f1, f2] } });

    await waitFor(() => expect(alSubirAdjunto).toHaveBeenCalledTimes(2));
    expect(alSubirAdjunto).toHaveBeenNthCalledWith(1, f1, "Icono_Nuevo.png");
    expect(alSubirAdjunto).toHaveBeenNthCalledWith(2, f2, "b.png");
    await waitFor(() => expect(screen.getAllByText("listo")).toHaveLength(2));
    expect(screen.getByText("Icono_Nuevo.png")).toBeTruthy();
    expect(screen.getByText("b.png")).toBeTruthy();
  });

  it("`drop` hace lo mismo que elegir, y `data-arrastrando` solo está encendido MIENTRAS se arrastra", async () => {
    const alSubirAdjunto = vi.fn(async () => ({ ok: true }));
    const { container } = render(<Compositor {...manejadores} alSubirAdjunto={alSubirAdjunto} />);
    const caja = container.querySelector('[class*="compositor"]') as HTMLElement;
    const f = new File(["x"], "captura.png", { type: "image/png" });

    fireEvent.dragOver(caja, { dataTransfer: { files: [f] } });
    expect(caja.hasAttribute("data-arrastrando")).toBe(true);

    fireEvent.drop(caja, { dataTransfer: { files: [f] } });
    expect(caja.hasAttribute("data-arrastrando")).toBe(false);
    await waitFor(() => expect(alSubirAdjunto).toHaveBeenCalledWith(f, "captura.png"));
  });

  it("`paste` CON ficheros sube la imagen como «pegado-<n>.<ext>» y NO deja pegar texto", async () => {
    const alSubirAdjunto = vi.fn(async () => ({ ok: true }));
    render(<Compositor {...manejadores} alSubirAdjunto={alSubirAdjunto} />);
    const campo = screen.getByRole("textbox");
    const img = new File(["x"], "imagen.png", { type: "image/png" });

    // El resultado de `fireEvent` es `false` cuando algún manejador llamó `preventDefault`:
    // es la prueba de que NO pega texto, no una lectura indirecta.
    const noCancelado = fireEvent.paste(campo, { clipboardData: { files: [img], types: ["Files"] } });
    expect(noCancelado).toBe(false);
    await waitFor(() => expect(alSubirAdjunto).toHaveBeenCalledWith(expect.any(File), "pegado-1.png"));
  });

  it("`paste` SIN ficheros no interfiere: el pegado de TEXTO sigue su camino normal", () => {
    const alSubirAdjunto = vi.fn();
    render(<Compositor {...manejadores} alSubirAdjunto={alSubirAdjunto} />);
    const campo = screen.getByRole("textbox");
    const noCancelado = fireEvent.paste(campo, { clipboardData: { files: [], types: ["text/plain"] } });
    expect(noCancelado).toBe(true);
    expect(alSubirAdjunto).not.toHaveBeenCalled();
  });

  /**
   * Ronda de arreglo 5/5: el «+» ya se apaga con `disabled` sin conexión, pero soltar y
   * pegar no pasan por un `<button>` — sin esta comprobación, arrastrar un fichero sobre la
   * caja desconectada disparaba igual la subida.
   */
  it("sin conexión, `drop` no sube nada ni enciende `data-arrastrando`", () => {
    const alSubirAdjunto = vi.fn(async () => ({ ok: true }));
    const { container } = render(<Compositor conectado={false} alEnviar={() => {}} alSubirAdjunto={alSubirAdjunto} />);
    const caja = container.querySelector('[class*="compositor"]') as HTMLElement;
    const f = new File(["x"], "captura.png", { type: "image/png" });

    fireEvent.dragOver(caja, { dataTransfer: { files: [f] } });
    expect(caja.hasAttribute("data-arrastrando")).toBe(false);

    fireEvent.drop(caja, { dataTransfer: { files: [f] } });
    expect(alSubirAdjunto).not.toHaveBeenCalled();
  });

  it("sin conexión, `paste` con ficheros no sube nada", () => {
    const alSubirAdjunto = vi.fn(async () => ({ ok: true }));
    render(<Compositor conectado={false} alEnviar={() => {}} alSubirAdjunto={alSubirAdjunto} />);
    const campo = screen.getByRole("textbox");
    const img = new File(["x"], "imagen.png", { type: "image/png" });
    fireEvent.paste(campo, { clipboardData: { files: [img], types: ["Files"] } });
    expect(alSubirAdjunto).not.toHaveBeenCalled();
  });

  it("una ficha «subiendo» o «falló» impide enviar y lo dice en el `title`; «quitar» la retira", async () => {
    let resolver: (r: { ok: boolean; motivo?: string }) => void = () => {};
    const alSubirAdjunto = vi.fn(
      () => new Promise<{ ok: boolean; motivo?: string }>((r) => { resolver = r; })
    );
    const alEnviar = vi.fn();
    render(<Compositor conectado alEnviar={alEnviar} alSubirAdjunto={alSubirAdjunto} />);
    fireEvent.change(entradaDeFicheros(), { target: { files: [new File(["x"], "a.png", { type: "image/png" })] } });

    // Subiendo: el botón de enviar se apaga y DICE por qué.
    const botonEnviar = (await screen.findByRole("button", { name: "Enviar" })) as HTMLButtonElement;
    expect(botonEnviar.disabled).toBe(true);
    expect(botonEnviar.title).toMatch(/subir/);

    // Falla: sigue apagado, con OTRO motivo.
    resolver({ ok: false, motivo: "el adjunto es demasiado grande" });
    // El texto VISIBLE de la ficha es «falló» (decisión vinculante, ronda 3/5): el motivo
    // vive en el `title`, no en el texto — una frase larga rompía el ancho de la ficha.
    const ficha = await screen.findByText("falló");
    expect(ficha.title).toBe("el adjunto es demasiado grande");
    expect(botonEnviar.disabled).toBe(true);
    expect(botonEnviar.title).toMatch(/quita/);

    // Quitar la retira, y con ella se va el bloqueo.
    fireEvent.click(screen.getByRole("button", { name: "Quitar a.png" }));
    expect(screen.queryByText("falló")).toBeNull();
    expect(botonEnviar.disabled).toBe(false);
  });

  /**
   * La carrera de la ronda de arreglo 1/5: la resolución de una subida tiene que emparejar
   * por IDENTIDAD de ficha, no por nombre. Sin eso, quitar una ficha que sigue «subiendo» y
   * volver a elegir el MISMO fichero hacía que la resolución de la subida VIEJA marcara la
   * ficha NUEVA como «listo» —aunque su propia subida real fallara después—.
   */
  it("quitar una ficha que está SUBIENDO y volver a añadir el MISMO nombre: la subida vieja no toca la nueva", async () => {
    const resolutores: ((r: { ok: boolean; nombre?: string; motivo?: string }) => void)[] = [];
    const alSubirAdjunto = vi.fn(
      () => new Promise<{ ok: boolean; nombre?: string; motivo?: string }>((r) => resolutores.push(r))
    );
    render(<Compositor {...manejadores} alSubirAdjunto={alSubirAdjunto} />);

    // Primera elección: «a.png» empieza a subir.
    fireEvent.change(entradaDeFicheros(), { target: { files: [new File(["1"], "a.png", { type: "image/png" })] } });
    await waitFor(() => expect(alSubirAdjunto).toHaveBeenCalledTimes(1));

    // Se quita MIENTRAS sigue subiendo: la ficha desaparece, pero su promesa sigue viva.
    fireEvent.click(screen.getByRole("button", { name: "Quitar a.png" }));
    expect(screen.queryByText("a.png")).toBeNull();

    // Se vuelve a elegir el MISMO nombre: es una ficha NUEVA, con otro `id`.
    fireEvent.change(entradaDeFicheros(), { target: { files: [new File(["2"], "a.png", { type: "image/png" })] } });
    await waitFor(() => expect(alSubirAdjunto).toHaveBeenCalledTimes(2));
    expect(screen.getByText("a.png")).toBeTruthy();

    // La subida VIEJA resuelve DESPUÉS, con éxito: si emparejara por nombre, marcaría la
    // ficha NUEVA como «listo» sin que su propia subida (la segunda) haya contestado nada.
    resolutores[0]!({ ok: true, nombre: "a.png" });
    // Deja correr la cola de microtareas del `.then` de React sin afirmar nada todavía.
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText("listo")).toBeNull();

    // Y cuando la segunda —la de verdad— falla, la ficha lo dice: la vieja no la salvó.
    resolutores[1]!({ ok: false, motivo: "el adjunto es demasiado grande" });
    await waitFor(() => expect(screen.getByText("falló")).toBeTruthy());
  });

  it("enviar con fichas «listo» manda los NOMBRES y las vacía; se puede mandar SOLO con adjuntos", async () => {
    const alSubirAdjunto = vi.fn(async () => ({ ok: true }));
    const alEnviar = vi.fn();
    render(<Compositor conectado alEnviar={alEnviar} alSubirAdjunto={alSubirAdjunto} />);
    fireEvent.change(entradaDeFicheros(), {
      target: {
        files: [
          new File(["a"], "a.png", { type: "image/png" }),
          new File(["b"], "b.png", { type: "image/png" }),
        ],
      },
    });
    await waitFor(() => expect(screen.getAllByText("listo")).toHaveLength(2));

    // Texto vacío + adjuntos: SÍ se manda.
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(alEnviar).toHaveBeenCalledWith("", ["a.png", "b.png"]);
    // Y las fichas se vacían: no quedan en la vista tras enviar.
    expect(screen.queryByText("a.png")).toBeNull();
    expect(screen.queryByText("b.png")).toBeNull();
  });
});
