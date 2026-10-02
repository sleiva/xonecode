import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { SelectorDeTema } from "./SelectorDeTema.js";

afterEach(cleanup);

describe("SelectorDeTema", () => {
  const montar = (props: Partial<Parameters<typeof SelectorDeTema>[0]> = {}) => {
    const vistos: string[] = [];
    render(
      <SelectorDeTema modo="oscuro" elegido="dracula" enVigor rotulo="Tema oscuro" alElegir={(id) => void vistos.push(id)} {...props} />
    );
    return { vistos, grupo: screen.getByRole("group", { name: "Tema oscuro" }) };
  };

  it("un botón por tema del modo, con su nombre", () => {
    const { grupo } = montar();
    expect(within(grupo).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "XOneCode", "GitHub Dark", "One Dark", "Dracula",
    ]);
  });

  it("el elegido va marcado, y elegir otro avisa", () => {
    const { grupo, vistos } = montar();
    expect(within(grupo).getByRole("button", { name: "Dracula" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(grupo).getByRole("button", { name: "One Dark" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(within(grupo).getByRole("button", { name: "One Dark" }));
    expect(vistos).toEqual(["one-oscuro"]);
  });

  it("pulsar el que ya está no manda nada", () => {
    const { grupo, vistos } = montar();
    fireEvent.click(within(grupo).getByRole("button", { name: "Dracula" }));
    expect(vistos).toEqual([]);
  });

  it("si el modo no está en vigor DICE que elegir cambia de modo, para que el salto no coja por sorpresa", () => {
    montar({ enVigor: false });
    expect(screen.getByText("Elegirlo pone la consola en oscuro.")).toBeTruthy();
    cleanup();
    montar({ enVigor: true });
    expect(screen.queryByText(/Elegirlo pone/)).toBeNull();
  });

  it("la muestra de un tema lleva SUS colores; la de XOneCode, los suyos, sea cual sea el tema puesto", () => {
    const { grupo } = montar();
    const dracula = within(grupo).getByRole("button", { name: "Dracula" }).querySelector("[data-muestra]") as HTMLElement;
    expect(dracula.style.getPropertyValue("--muestra-fondo")).toBe("#282a36");
    expect(dracula.style.getPropertyValue("--muestra-acento")).toBe("#bd93f9");
    const xone = within(grupo).getByRole("button", { name: "XOneCode" }).querySelector("[data-muestra]") as HTMLElement;
    expect(xone.style.getPropertyValue("--muestra-fondo")).toBe("#151517");
  });

  it("la muestra de XOneCode claro es blanca", () => {
    const { grupo } = montar({ modo: "claro", elegido: "xonecode-claro" });
    const xone = within(grupo).getByRole("button", { name: "XOneCode" }).querySelector("[data-muestra]") as HTMLElement;
    expect(xone.style.getPropertyValue("--muestra-fondo")).toBe("#ffffff");
  });

  it("el rótulo del grupo se VE, para saber cuál fila es cuál", () => {
    montar();
    expect(screen.getByText("Tema oscuro")).toBeTruthy();
  });
});
