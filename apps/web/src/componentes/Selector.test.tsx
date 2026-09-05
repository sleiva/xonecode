import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { Selector } from "./Selector.js";

afterEach(cleanup);

const OPCIONES = [
  { id: "claude-x", etiqueta: "Claude X", detalle: "anthropic" },
  { id: "llama", etiqueta: "Llama 3" },
];

describe("Selector", () => {
  it("pinta el título y una opción por cada una: es lo que manda `seleccionar`", () => {
    render(<Selector titulo="Elige modelo" opciones={OPCIONES} alElegir={() => {}} />);
    expect(screen.getByRole("group", { name: /elige modelo/i })).toBeTruthy();
    // Dos opciones y el botón de cancelar, que no es una opción del catálogo.
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeTruthy();
    expect(screen.getByText("anthropic")).toBeTruthy();
  });

  it("elegir manda el ID, no la etiqueta: es lo que el servidor sabe casar", () => {
    const alElegir = vi.fn();
    render(<Selector titulo="Elige modelo" opciones={OPCIONES} alElegir={alElegir} />);
    fireEvent.click(screen.getByRole("button", { name: /claude x/i }));
    expect(alElegir).toHaveBeenCalledWith("claude-x");
  });

  it("si el envío falla lo DICE y se puede reintentar", async () => {
    const alElegir = vi.fn(() => Promise.reject(new Error("sin red")));
    render(<Selector titulo="Elige modelo" opciones={OPCIONES} alElegir={alElegir} />);
    fireEvent.click(screen.getByRole("button", { name: /claude x/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/no llegó/i));
    fireEvent.click(screen.getByRole("button", { name: /llama/i }));
    expect(alElegir).toHaveBeenCalledTimes(2);
  });

  it("dos elecciones en vuelo no: sacarían DOS resolutores de la cola FIFO del servidor", () => {
    let resolver: () => void = () => {};
    const alElegir = vi.fn(() => new Promise<void>((r) => { resolver = r; }));
    render(<Selector titulo="Elige modelo" opciones={OPCIONES} alElegir={alElegir} />);
    fireEvent.click(screen.getByRole("button", { name: /claude x/i }));
    fireEvent.click(screen.getByRole("button", { name: /llama/i }));
    expect(alElegir).toHaveBeenCalledTimes(1);
    resolver();
  });

  /**
   * Cancelar existe porque en el terminal existe: los selectores preguntan «número (Enter
   * cancela)». Sin ella, `/modelos` solo se podría cerrar eligiendo algo o esperando al
   * plazo. `undefined` es la cancelación, y el cable la lleva como la AUSENCIA del `id`.
   */
  it("«Cancelar» manda `undefined`, que es lo que el servidor traduce a cancelar", () => {
    const alElegir = vi.fn();
    render(<Selector titulo="Elige modelo" opciones={OPCIONES} alElegir={alElegir} />);
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(alElegir).toHaveBeenCalledWith(undefined);
  });

  it("Escape cancela igual que el botón: una salida que pide ratón no es una salida", () => {
    const alElegir = vi.fn();
    render(<Selector titulo="Elige modelo" opciones={OPCIONES} alElegir={alElegir} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(alElegir).toHaveBeenCalledWith(undefined);
  });

  it("cancelar NO manda una cadena vacía: eso sería un id que no existe, no echarse atrás", () => {
    const alElegir = vi.fn();
    render(<Selector titulo="Elige modelo" opciones={OPCIONES} alElegir={alElegir} />);
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(alElegir).not.toHaveBeenCalledWith("");
  });

  /**
   * El motivo viaja en el propio selector porque hay una piel que no pinta el transcript
   * mientras pregunta: durante el alta, la web enseña solo la tarjeta
   * (`App.tsx`, rama `enAlta`). Un «no se pudo conectar con openai» dicho solo por
   * `escribir` acabaría en un acto de sistema que nadie está mirando.
   */
  it("pinta el aviso del servidor como alerta, y sin aviso no pinta ninguna", () => {
    const { rerender } = render(<Selector titulo="Proveedor" opciones={OPCIONES} alElegir={() => {}} />);
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(
      <Selector
        titulo="Proveedor"
        opciones={OPCIONES}
        aviso="no se pudo conectar con openai: credencial no autorizada"
        alElegir={() => {}}
      />
    );
    expect(screen.getByRole("alert").textContent).toMatch(/no se pudo conectar con openai/);
  });

  it("una opción sin detalle no inventa uno", () => {
    render(<Selector titulo="Elige modelo" opciones={OPCIONES} alElegir={() => {}} />);
    expect(screen.getByRole("button", { name: "Llama 3" })).toBeTruthy();
  });
});
