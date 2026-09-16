import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { Pregunta } from "./Pregunta.js";

// Sin `globals` en `vitest.config.ts` no hay auto-cleanup, y desde que la decisión es un
// diálogo pesa el doble que antes: `Modal` va a un PORTAL sobre `document.body`, así que un
// segundo `render()` dejaría DOS diálogos y `getByRole("dialog")` reventaría con «found
// multiple elements». Mismo motivo y misma línea que `Aprobacion.test.tsx`.
afterEach(cleanup);

describe("Pregunta", () => {
  it("el enunciado del servidor se pinta tal cual", () => {
    render(<Pregunta texto="¿Subir los cambios a CloudStudio? [s/N] " alResponder={() => {}} />);
    expect(screen.getByLabelText(/subir los cambios/i)).toBeTruthy();
  });

  it("lo tecleado sale por `alResponder`: de ahí lo manda quien la monta como `respuesta`", () => {
    const alResponder = vi.fn();
    render(<Pregunta texto="¿Subir? [s/N] " alResponder={alResponder} />);
    fireEvent.change(screen.getByLabelText(/subir/i), { target: { value: "s" } });
    fireEvent.click(screen.getByRole("button", { name: /aceptar/i }));
    expect(alResponder).toHaveBeenCalledWith("s");
  });

  it("responder en blanco es una respuesta, no un fallo: es lo que contesta un readline cerrado", () => {
    const alResponder = vi.fn();
    render(<Pregunta texto="¿Subir? [s/N] " alResponder={alResponder} />);
    fireEvent.click(screen.getByRole("button", { name: /aceptar/i }));
    expect(alResponder).toHaveBeenCalledWith("");
  });

  it("Enter en el campo contesta: es un formulario, no un botón suelto", () => {
    const alResponder = vi.fn();
    const { container } = render(<Pregunta texto="¿Subir? [s/N] " alResponder={alResponder} />);
    fireEvent.change(screen.getByLabelText(/subir/i), { target: { value: "n" } });
    fireEvent.submit(container.querySelector("form")!);
    expect(alResponder).toHaveBeenCalledWith("n");
  });

  it("la forma OCULTA es un campo de contraseña sin autocompletado: es el `leerSecreto`", () => {
    render(<Pregunta texto="clave de anthropic: " oculta alResponder={() => {}} />);
    const campo = screen.getByLabelText(/clave de anthropic/i) as HTMLInputElement;
    expect(campo.type).toBe("password");
    expect(campo.autocomplete).toBe("off");
  });

  /**
   * El secreto sale por el manejador y no se PINTA en ningún sitio. La comprobación es sobre
   * el texto del documento y no sobre su `innerHTML`: medido, React refleja el valor de un
   * input controlado también en el ATRIBUTO `value`, que es donde un campo en edición
   * legítimamente lo tiene mientras se teclea —enmascarado, porque es `type="password"`—. Lo
   * que este componente promete es que no acaba en texto visible; que no acabe en el store
   * lo prueba `App.test.tsx`, que es donde está esa costura.
   */
  it("el secreto tecleado no se pinta como texto: sale por el manejador y ya está", () => {
    const alResponder = vi.fn();
    render(<Pregunta texto="clave: " oculta alResponder={alResponder} />);
    const campo = screen.getByLabelText(/clave/i) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "sk-ant-NO-DEBE-SALIR" } });
    fireEvent.click(screen.getByRole("button", { name: /aceptar/i }));
    expect(alResponder).toHaveBeenCalledWith("sk-ant-NO-DEBE-SALIR");
    expect(document.body.textContent).not.toContain("sk-ant-NO-DEBE-SALIR");
    expect(campo.type).toBe("password");
  });

  /**
   * Medido en el modal de aprobación y aplicable igual aquí: retirar la interfaz sin esperar
   * al envío deja al usuario creyendo que contestó mientras el servidor sigue esperando
   * hasta su plazo. Quien retira es quien monta, y solo si el envío llegó.
   */
  it("si el envío falla lo DICE y se puede reintentar", async () => {
    const alResponder = vi.fn(() => Promise.reject(new Error("sin red")));
    render(<Pregunta texto="¿Subir? [s/N] " alResponder={alResponder} />);
    fireEvent.click(screen.getByRole("button", { name: /aceptar/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/no llegó/i));
    fireEvent.click(screen.getByRole("button", { name: /aceptar/i }));
    expect(alResponder).toHaveBeenCalledTimes(2);
  });

  it("mientras el envío vuela no se puede contestar dos veces: sacaría DOS resolutores de la cola FIFO", () => {
    let resolver: () => void = () => {};
    const alResponder = vi.fn(() => new Promise<void>((r) => { resolver = r; }));
    render(<Pregunta texto="¿Subir? [s/N] " alResponder={alResponder} />);
    fireEvent.click(screen.getByRole("button", { name: /aceptar/i }));
    fireEvent.click(screen.getByRole("button", { name: /aceptar/i }));
    expect(alResponder).toHaveBeenCalledTimes(1);
    resolver();
  });
});

/**
 * **La decisión: el plan delante, y dos botones en vez de un editor.**
 *
 * Lo que se comprueba aquí no es el adorno de la tarjeta: es que lo que se ENSEÑA es lo que
 * se está autorizando —las líneas del plan, enteras— y que las dos respuestas que salen son
 * las que `interpretAnswer` ya sabe leer en el servidor (`"s"` autoriza, lo demás rechaza),
 * sin un vocabulario nuevo que solo existiría en el navegador.
 *
 * **Y se comprueba que es un DIÁLOGO**, que es lo que no era. Las consultas se hacen sobre el
 * `dialog` y no sobre el `container` de `render`, y eso no es una comodidad del test: la
 * tarjeta sale por un PORTAL sobre `document.body`, precisamente para no ser un renglón más
 * de la columna del chat, que es donde vivía y de donde salía pegada al compositor.
 */
describe("Pregunta: la forma de una decisión", () => {
  const DECISION = {
    lineas: [
      { texto: "SUBIDA A CLOUDSTUDIO — 3 operaciones" },
      { texto: "  + app/Clientes.xne", cambio: "nuevo" as const },
      { texto: "  ~ app/Otro.xne", cambio: "modificado" as const },
      { texto: "  - app/Viejo.xne", cambio: "borrado" as const },
    ],
  };

  /** El diálogo, que es donde vive todo lo que se decide. */
  const tarjeta = (): HTMLElement => screen.getByRole("dialog");

  it("es un DIÁLOGO sobre la aplicación, no una tarjeta al final de la columna", () => {
    const { container } = render(
      <Pregunta texto="¿Subir a CloudStudio?" decision={DECISION} alResponder={() => {}} />
    );
    const dialogo = tarjeta();
    expect(dialogo.getAttribute("aria-modal")).toBe("true");
    // El nombre accesible es el enunciado: sin él, un `dialog` sin cabecera se anunciaría
    // sin decir de qué es.
    expect(screen.getByRole("dialog", { name: "¿Subir a CloudStudio?" })).toBe(dialogo);
    // Fuera del contenedor que monta el test y dentro del `body`: eso ES el portal, y es la
    // propiedad que se buscaba. Dentro del contenedor volvería a ser un hijo de la columna,
    // con el compositor debajo y sin nada que centrar.
    expect(container.contains(dialogo)).toBe(false);
    expect(document.body.contains(dialogo)).toBe(true);
  });

  it("el plan se enseña ENTERO y tal cual: es lo que se está autorizando", () => {
    render(<Pregunta texto="¿Subir a CloudStudio?" decision={DECISION} alResponder={() => {}} />);
    // El enunciado va como TÍTULO y arriba; el plan debajo. Lo que no se puede probar aquí
    // es el centrado —eso es CSS y en jsdom no hay layout—, así que el orden se comprueba y
    // la alineación se mira en el navegador.
    const titulo = tarjeta().querySelector("p")!;
    const plan = tarjeta().querySelector("pre")!;
    expect(titulo.textContent).toBe("¿Subir a CloudStudio?");
    expect(titulo.compareDocumentPosition(plan) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Los botones van DESPUÉS del plan, nunca antes ni encima.
    const aceptar = screen.getByRole("button", { name: /aceptar/i });
    expect(plan.compareDocumentPosition(aceptar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Y el `<pre>` sigue siendo el plan entero, carácter a carácter: partirlo en un elemento
    // por línea no cambia lo que se lee.
    expect(plan.textContent).toBe(DECISION.lineas.map((l) => l.texto).join("\n"));
  });

  /**
   * Lo que decide el COLOR de cada línea es `cambio`, un dato que viaja con ella. La
   * cabecera no lleva `cambio` porque no habla de ningún fichero, y esa ausencia es lo que
   * la deja en el color neutro.
   */
  it("cada línea dice qué le pasa, y la cabecera no dice nada", () => {
    render(<Pregunta texto="¿Subir a CloudStudio?" decision={DECISION} alResponder={() => {}} />);
    const lineas = [...tarjeta().querySelectorAll("pre > span")];
    expect(lineas.map((l) => l.getAttribute("data-cambio"))).toEqual([null, "nuevo", "modificado", "borrado"]);
    expect(lineas[1]!.textContent).toBe("  + app/Clientes.xne");
  });

  /**
   * **El color no se lee del texto.** Aquí el signo coincide con la clase —lo pone el mismo
   * código que compone la línea—, así que una tarjeta que coloreara por el `+`/`-` daría
   * exactamente el mismo resultado y no habría forma de cazarla. Se caza con una línea SIN
   * signo y con su clase puesta: leer la sintaxis la dejaría gris. El día que la sangría
   * cambie de ancho, o que una ruta empiece por `-`, esto es lo que ya estaba bien.
   */
  it("el color sale de `cambio`, no del signo que lleve el texto", () => {
    render(
      <Pregunta
        texto="¿Subir a CloudStudio?"
        decision={{ lineas: [{ texto: "app/SinSigno.xne", cambio: "borrado" }] }}
        alResponder={() => {}}
      />
    );
    expect(tarjeta().querySelector("pre > span")?.getAttribute("data-cambio")).toBe("borrado");
  });

  it("no hay campo donde teclear: la respuesta son los dos botones", () => {
    render(<Pregunta texto="¿Subir a CloudStudio?" decision={DECISION} alResponder={() => {}} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(tarjeta().querySelector("input")).toBeNull();
    expect(screen.getByRole("button", { name: /aceptar/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeTruthy();
  });

  /**
   * Y sin `<form>` a propósito: sin campo no hay envío por defecto, así que el Enter no
   * autoriza una subida. Es la misma regla que en el terminal, donde el Enter a secas
   * tampoco aprueba esta pregunta (`cli/consola.ts#politicaInteractiva`), y aquí es más
   * fácil de romper sin querer: bastaba envolver los botones en el formulario de al lado.
   */
  it("no es un formulario: el Enter no autoriza una subida", () => {
    render(<Pregunta texto="¿Subir a CloudStudio?" decision={DECISION} alResponder={() => {}} />);
    expect(tarjeta().querySelector("form")).toBeNull();
  });

  it("Aceptar contesta «s», que es lo que autoriza en el servidor", () => {
    const alResponder = vi.fn();
    render(<Pregunta texto="¿Subir a CloudStudio?" decision={DECISION} alResponder={alResponder} />);
    fireEvent.click(screen.getByRole("button", { name: /aceptar/i }));
    expect(alResponder).toHaveBeenCalledWith("s");
  });

  it("Cancelar contesta «n»: rechaza, y no publica nada", () => {
    const alResponder = vi.fn();
    render(<Pregunta texto="¿Subir a CloudStudio?" decision={DECISION} alResponder={alResponder} />);
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(alResponder).toHaveBeenCalledWith("n");
  });

  /**
   * Las dos salidas SIN botón, que son las que un diálogo trae consigo: Escape y el clic en el
   * velo. Las dos RECHAZAN y no cierran en silencio, por el mismo motivo que en la aprobación
   * —al otro lado hay un turno esperando, y el servidor lo convertiría en un rechazo de todos
   * modos, diez minutos después (`consolaWeb.ts#MS_DE_ESPERA_POR_OMISION`)—, y la dirección es
   * la segura: lo que no se contesta no escribe nada.
   */
  it("Escape rechaza: la salida sin decidir es la que no sube nada", () => {
    const alResponder = vi.fn();
    render(<Pregunta texto="¿Subir a CloudStudio?" decision={DECISION} alResponder={alResponder} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(alResponder).toHaveBeenCalledWith("n");
  });

  /**
   * El `mask` del paquete SÍ llama a `onClose`, pero es un `<div aria-hidden="true">` sin
   * clase y, como sus CSS Modules son stubs vacíos, no se pinta: nadie puede pulsarlo. El velo
   * que el usuario ve es el nuestro, y sin su propio manejador pinchar fuera de la tarjeta no
   * haría nada mientras el comentario prometía lo contrario.
   */
  it("pinchar en el velo VISIBLE rechaza; pinchar dentro de la tarjeta no", () => {
    const alResponder = vi.fn();
    render(<Pregunta texto="¿Subir a CloudStudio?" decision={DECISION} alResponder={alResponder} />);
    // El velo es el único hijo del `dialog`; la tarjeta cuelga de él.
    const velo = tarjeta().firstElementChild as HTMLElement;
    fireEvent.click(velo.firstElementChild as HTMLElement);
    expect(alResponder).not.toHaveBeenCalled();
    fireEvent.click(velo);
    expect(alResponder).toHaveBeenCalledWith("n");
  });

  /**
   * Y la salida que NO contesta: desmontar. Aquí no sale ninguna respuesta, a diferencia del
   * modal de la aprobación, donde desmontarse sin contestar ES un rechazo. Se fija porque es lo
   * primero que alguien replicaría de allí «por simetría», y aquí estaría inventando una
   * decisión que nadie tomó: lo que quede sin contestar lo salda el plazo del servidor, con
   * cadena vacía, que aguas abajo ya es un rechazo.
   */
  it("desmontar la tarjeta NO contesta nada: sin respuesta, decide el plazo del servidor", () => {
    const alResponder = vi.fn();
    const { unmount } = render(
      <Pregunta texto="¿Subir a CloudStudio?" decision={DECISION} alResponder={alResponder} />
    );
    unmount();
    expect(alResponder).not.toHaveBeenCalled();
  });

  it("un plan sin líneas sigue siendo una decisión: no vuelve el campo de texto", () => {
    // `decision` es la FORMA, no el contenido. Si la tarjeta decidiera por el número de
    // líneas, un plan vacío devolvería el editor, que es exactamente lo que no se puede
    // adivinar desde aquí.
    render(<Pregunta texto="¿Subir a CloudStudio?" decision={{ lineas: [] }} alResponder={() => {}} />);
    expect(tarjeta().querySelector("input")).toBeNull();
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeTruthy();
  });

  it("si el envío falla lo DICE y se puede reintentar, con el otro botón", async () => {
    const alResponder = vi.fn(() => Promise.reject(new Error("sin red")));
    render(<Pregunta texto="¿Subir a CloudStudio?" decision={DECISION} alResponder={alResponder} />);
    fireEvent.click(screen.getByRole("button", { name: /aceptar/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/no llegó/i));
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(alResponder).toHaveBeenLastCalledWith("n");
  });
});
