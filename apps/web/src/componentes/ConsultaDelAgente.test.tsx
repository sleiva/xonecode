import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConsultaDelAgente } from "./ConsultaDelAgente.js";

afterEach(cleanup);

const montar = (alElegir = vi.fn()) => {
  render(<ConsultaDelAgente pregunta="¿Dónde lo guardo?" opciones={["En el proyecto", "Global"]} alElegir={alElegir} />);
  return { alElegir, responder: () => screen.getByRole("button", { name: "Responder" }) };
};

describe("ConsultaDelAgente", () => {
  it("elegir NO manda: se manda con «Responder», y sin elección no se puede", () => {
    const { alElegir, responder } = montar();
    expect((responder() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Global" }));
    expect(alElegir).not.toHaveBeenCalled();
    fireEvent.click(responder());
    expect(alElegir).toHaveBeenCalledWith("Global");
  });

  it("escribir elige la respuesta LIBRE y manda lo escrito, sin espacios de sobra", () => {
    const { alElegir, responder } = montar();
    fireEvent.click(screen.getByRole("radio", { name: "En el proyecto" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Tu respuesta" }), { target: { value: "  en los dos  " } });
    expect((screen.getByRole("radio", { name: "Otra respuesta" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(responder());
    expect(alElegir).toHaveBeenCalledWith("en los dos");
  });

  it("dos clics del mismo tick mandan UNA respuesta", () => {
    const alElegir = vi.fn(() => new Promise<void>(() => {}));
    const { responder } = montar(alElegir);
    fireEvent.click(screen.getByRole("radio", { name: "Global" }));
    const boton = responder();
    boton.click();
    boton.click();
    expect(alElegir).toHaveBeenCalledTimes(1);
  });

  it("si el envío falla lo DICE y se puede volver a responder", async () => {
    const alElegir = vi.fn().mockRejectedValueOnce(new Error("sin cable")).mockResolvedValue(undefined);
    const { responder } = montar(alElegir);
    fireEvent.click(screen.getByRole("radio", { name: "Global" }));
    fireEvent.click(responder());
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(responder());
    expect(alElegir).toHaveBeenCalledTimes(2);
  });

  it("sin `alElegir` es el REGISTRO: sin controles, con lo contestado marcado", () => {
    const { container, unmount } = render(
      <ConsultaDelAgente pregunta="¿Dónde lo guardo?" opciones={["En el proyecto", "Global"]} respondida="Global" />
    );
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector("li[data-elegida]")?.textContent).toBe("Global");
    unmount();
    // Contestada con otras palabras: se dice qué, en vez de marcar una opción que no se eligió.
    render(<ConsultaDelAgente pregunta="¿Dónde lo guardo?" opciones={["En el proyecto", "Global"]} respondida="en los dos" />);
    expect(screen.getByText("Contestaste: en los dos")).toBeTruthy();
  });
});
