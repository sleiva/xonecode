import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { Pestanas } from "./Pestanas.js";

afterEach(cleanup);

const AQUI = dirname(fileURLToPath(import.meta.url));

describe("Pestanas", () => {
  it("dice cuál está elegida, y solo una", () => {
    render(<Pestanas pestana="chat" alElegirPestana={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Chat" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Trazas" }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tab", { name: "Ficheros" }).getAttribute("aria-selected")).toBe("false");
  });

  it("pulsar una lo pide hacia arriba: quien recuerda la elección es `App`, no esto", () => {
    const alElegirPestana = vi.fn();
    render(<Pestanas pestana="chat" alElegirPestana={alElegirPestana} />);
    fireEvent.click(screen.getByRole("tab", { name: "Trazas" }));
    expect(alElegirPestana).toHaveBeenCalledWith("trazas");
  });

  it("las tres son `role=\"tab\"` dentro de un `role=\"tablist\"`", () => {
    // No es adorno: es lo que hace que un lector de pantalla las anuncie como «1 de 3» y
    // que la elegida se lea como elegida. Tres `<button>` sueltos se anunciarían como tres
    // botones sin relación, que es justo lo que no son.
    render(<Pestanas pestana="ficheros" alElegirPestana={vi.fn()} />);
    expect(screen.getByRole("tablist")).not.toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("la tira no se pinta sobre el azul: ese acento se lo quedó la barra superior", () => {
    // La mudanza al panel central se llevó consigo los colores. `Cabecera.module.css` tenía
    // tres reglas para pintar las pestañas sobre el azul profundo —apagadas, y la elegida
    // en cian—, y ahí siguen estarían pintando un elemento que ya no existe: CSS muerto que
    // nadie ve fallar. Este test vigila que no vuelvan, y que el acento de la elegida viva
    // en la hoja de este componente.
    const cabecera = readFileSync(join(AQUI, "Cabecera.module.css"), "utf8");
    expect(cabecera).not.toMatch(/role="tab"/);
    const propia = readFileSync(join(AQUI, "Pestanas.module.css"), "utf8");
    expect(propia).toMatch(/\[role="tab"\]\[aria-selected="true"\]/);
  });
});
