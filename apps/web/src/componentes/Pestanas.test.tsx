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
    expect(screen.getByRole("tab", { name: "Revisión" }).getAttribute("aria-selected")).toBe("false");
  });

  it("pulsar una lo pide hacia arriba: quien recuerda la elección es `App`, no esto", () => {
    const alElegirPestana = vi.fn();
    render(<Pestanas pestana="chat" alElegirPestana={alElegirPestana} />);
    fireEvent.click(screen.getByRole("tab", { name: "Trazas" }));
    expect(alElegirPestana).toHaveBeenCalledWith("trazas");
  });

  it("son cinco por omisión, en este orden: Chat · Tareas · Ficheros · Revisión · Trazas", () => {
    // Chat y Tareas son las dos pestañas de ACCIÓN —una habla con el agente, la otra le manda
    // algo para que trabaje solo— y van juntas al principio. Ficheros, Revisión (y Artefactos,
    // si lo hay) son de REGISTRO: enseñan lo que ya pasó, y Trazas —de otro destinatario, quien
    // depura el harness— cierra la tira. Tareas ya no necesita ningún dato para aparecer
    // (Task 15): es de acción, no de registro.
    render(<Pestanas pestana="revision" alElegirPestana={vi.fn()} />);
    expect(screen.getByRole("tablist")).not.toBeNull();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Chat",
      "Tareas",
      "Ficheros",
      "Revisión",
      "Trazas",
    ]);
    expect(screen.getByRole("tab", { name: "Revisión" }).getAttribute("aria-selected")).toBe("true");
  });

  it("«Artefactos» solo está si la sesión dejó alguno: una pestaña vacía es un control sin dato", () => {
    render(<Pestanas pestana="chat" alElegirPestana={vi.fn()} hayArtefactos />);
    // Delante de Trazas, que sigue siendo la última: es la de otro destinatario. Tareas va
    // junto al Chat —las dos de acción— y Artefactos entre Revisión y Trazas, con el resto
    // de las de registro.
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Chat",
      "Tareas",
      "Ficheros",
      "Revisión",
      "Artefactos",
      "Trazas",
    ]);
  });

  it("pulsar Artefactos reporta «artefactos»", () => {
    const alElegirPestana = vi.fn();
    render(<Pestanas pestana="chat" alElegirPestana={alElegirPestana} hayArtefactos />);
    fireEvent.click(screen.getByRole("tab", { name: "Artefactos" }));
    expect(alElegirPestana).toHaveBeenCalledWith("artefactos");
  });

  it("«Tareas» está SIEMPRE, aunque el proyecto no tenga ninguna: matiza la regla de Artefactos, no la copia", () => {
    // «La pestaña solo existe si hay dato» es correcta para Artefactos —un artefacto es el
    // REGISTRO de algo que ya pasó, y un registro vacío es el control sin dato detrás—, pero
    // Tareas es una pestaña de ACCIÓN: si desaparece cuando no hay ninguna, se lleva consigo
    // el único sitio donde aprender que se puede crear una. El criterio que queda: una
    // pestaña de registro existe si hay registro; una de acción existe siempre, y su estado
    // vacío dice cómo se empieza (`TareasDelProyecto.tsx`). Por eso este test NO pasa ningún
    // prop de tareas — si alguien reintrodujera un `hayTareas` que la condicione, esta prueba
    // es la que lo tiene que pillar.
    render(<Pestanas pestana="chat" alElegirPestana={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Tareas" })).toBeTruthy();
  });

  it("pulsar Tareas reporta «tareas»", () => {
    const alElegirPestana = vi.fn();
    render(<Pestanas pestana="chat" alElegirPestana={alElegirPestana} />);
    fireEvent.click(screen.getByRole("tab", { name: "Tareas" }));
    expect(alElegirPestana).toHaveBeenCalledWith("tareas");
  });

  it("Artefactos y Tareas conviven, cada una en su grupo: Tareas junto al Chat, Artefactos junto a Trazas", () => {
    render(<Pestanas pestana="chat" alElegirPestana={vi.fn()} hayArtefactos />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Chat",
      "Tareas",
      "Ficheros",
      "Revisión",
      "Artefactos",
      "Trazas",
    ]);
  });

  it("pulsar Revisión reporta «revision»", () => {
    const alElegirPestana = vi.fn();
    render(<Pestanas pestana="chat" alElegirPestana={alElegirPestana} />);
    fireEvent.click(screen.getByRole("tab", { name: "Revisión" }));
    expect(alElegirPestana).toHaveBeenCalledWith("revision");
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
