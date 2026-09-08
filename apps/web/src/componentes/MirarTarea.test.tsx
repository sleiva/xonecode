import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MirarTarea } from "./MirarTarea.js";
import type { Acto } from "../tipos.js";

afterEach(cleanup);

describe("MirarTarea", () => {
  const ACTOS: Acto[] = [
    { tipo: "usuario", texto: "arregla el login" },
    { tipo: "razonamiento", texto: "el .xne no declara el campo" },
    { tipo: "fase", texto: "desarrollando", ms: 12, fase: "ejecutando" },
    { tipo: "herramientas", lineas: ["→ lee app.xne", "← edita app.xne"], detalles: [{ nombre: "read_file" }, { nombre: "edit_file" }] },
    { tipo: "asistente", texto: "He añadido el campo." },
    { tipo: "artefacto", ruta: "/artefactos/d.html", nombre: "d.html", bytes: 120 },
    { tipo: "sistema", texto: "✎ 1 escritura(s) autorizadas sin aprobación: app.xne" },
  ];

  it("pinta el trabajo del agente: razonamiento, fases, tools y respuesta", () => {
    render(<MirarTarea titulo="Arregla el login" actos={ACTOS} alCerrar={() => {}} />);
    // El encargo tecleado, como acto de usuario. En minúsculas: el título de la cabecera
    // lleva mayúscula, y con `/i` los dos casarían y `getByText` se quejaría de dos.
    expect(screen.getByText("arregla el login")).toBeTruthy();
    expect(screen.getByText(/el \.xne no declara el campo/)).toBeTruthy();
    expect(screen.getByText(/desarrollando/)).toBeTruthy();
    expect(screen.getByText(/← edita app\.xne/)).toBeTruthy();
    expect(screen.getByText(/He añadido el campo\./)).toBeTruthy();
    expect(screen.getByText(/d\.html/)).toBeTruthy();
    // El aviso de honestidad de la consola de tarea —las escrituras que nadie aprobó— es
    // justo lo que no puede quedarse fuera de esta vista.
    expect(screen.getByText(/autorizadas sin aprobación/)).toBeTruthy();
  });

  /**
   * **No hay compositor, y es una decisión y no un hueco** (decisión 2 del diseño): esa
   * consola es de la tarea, y una caja de texto ahí prometería una conversación que el turno
   * no va a leer. Lo que sí existe para intervenir es aparcar con feedback, y está en la
   * tarjeta.
   */
  it("es de SOLO lectura: ni caja de texto, ni botón de enviar", () => {
    render(<MirarTarea titulo="Arregla el login" actos={ACTOS} alCerrar={() => {}} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /enviar/i })).toBeNull();
    // Y lo DICE, porque la ausencia de una caja se lee igual que un fallo de la interfaz.
    expect(screen.getByText(/solo lectura|no se puede escribir/i)).toBeTruthy();
  });

  it("se puede cerrar", () => {
    const alCerrar = vi.fn();
    render(<MirarTarea titulo="Arregla el login" actos={ACTOS} alCerrar={alCerrar} />);
    fireEvent.click(screen.getByRole("button", { name: /cerrar/i }));
    expect(alCerrar).toHaveBeenCalled();
  });

  it("sin actos todavía lo dice, en vez de parecer que se ha colgado", () => {
    render(<MirarTarea titulo="Arregla el login" actos={[]} alCerrar={() => {}} />);
    expect(screen.getByText(/todavía no ha pintado nada|esperando/i)).toBeTruthy();
  });

  /**
   * La vista en vivo y el transcript de después son LO MISMO (decisión 3), y se dice: quien
   * la mira tiene que saber que no está leyendo un registro aparte que desaparecerá.
   */
  it("dice que esto es el transcript de su sesión, no un registro aparte", () => {
    render(<MirarTarea titulo="Arregla el login" actos={ACTOS} alCerrar={() => {}} />);
    expect(screen.getByText(/su conversación|el mismo/i)).toBeTruthy();
  });

  it("un acto de `fin` no se pinta como línea de conversación: es el cierre del registro", () => {
    render(<MirarTarea titulo="t" actos={[{ tipo: "fin", ms: 4200 }]} alCerrar={() => {}} />);
    // El mismo criterio que el chat: `fin` es un dato del registro (su duración), no algo
    // que se lea en la conversación.
    expect(screen.queryByText(/4200/)).toBeNull();
  });
});

/**
 * **Vacío no significa lo mismo según si la tarea sigue corriendo aquí, y son dos frases.**
 *
 * F1 de la revisión: el panel decía «todavía no ha pintado nada» siempre que la lista llegaba
 * vacía, y eso es falso en dos caminos reales — el panel se queda abierto cuando la tarea
 * acaba (a propósito: cerrarlo tiraría lo último que se estaba leyendo), y en cuanto el SSE
 * hipa, el store tira el transcript y la repetición pide una tarea que ya no está en
 * `enVuelo`, así que el servidor no manda nada. El resultado era un panel afirmando que un
 * turno terminado no ha empezado. Es la regla de siempre de este repo: un hueco con la frase
 * equivocada es la misma mentira que una lista vacía rellenada.
 */
describe("MirarTarea: vacío no es una sola cosa", () => {
  it("corriendo y sin actos: todavía no ha pintado nada", () => {
    render(<MirarTarea titulo="t" actos={[]} corre alCerrar={() => {}} />);
    expect(screen.getByText(/todavía no ha pintado nada/i)).toBeTruthy();
  });

  it("ya NO corre aquí: se dice, y se dice dónde está lo que hizo", () => {
    render(<MirarTarea titulo="t" actos={[]} corre={false} alCerrar={() => {}} />);
    expect(screen.queryByText(/todavía no ha pintado nada/i)).toBeNull();
    expect(screen.getByText(/ya no corre aquí/i)).toBeTruthy();
    // Y a dónde ir: su conversación guardada, que es el MISMO transcript. Se busca en la
    // frase del hueco y no por texto suelto: la nota de la cabecera dice «su conversación»
    // también, y `getByText` se quejaría de dos.
    expect(screen.getByText(/pulsa su título/i)).toBeTruthy();
  });

  it("con actos, que corra o no no cambia lo que se lee: el transcript es el transcript", () => {
    const actos: Acto[] = [{ tipo: "asistente", texto: "listo" }];
    render(<MirarTarea titulo="t" actos={actos} corre={false} alCerrar={() => {}} />);
    expect(screen.getByText("listo")).toBeTruthy();
  });
});
