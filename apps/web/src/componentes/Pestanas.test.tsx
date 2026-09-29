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
    render(<Pestanas pestana="ficheros" alElegirPestana={vi.fn()} alCerrar={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Ficheros" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Trazas" }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tab", { name: "Ejecutar" }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tab", { name: "Revisión" }).getAttribute("aria-selected")).toBe("false");
  });

  it("pulsar una lo pide hacia arriba: quien recuerda la elección es `App`, no esto", () => {
    const alElegirPestana = vi.fn();
    render(<Pestanas pestana="ficheros" alElegirPestana={alElegirPestana} alCerrar={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Trazas" }));
    expect(alElegirPestana).toHaveBeenCalledWith("trazas");
  });

  it("«Chat» NO es una pestaña: la conversación es la columna que se queda, no una vista más", () => {
    // Mientras lo fue, las otras seis se leían como sus alternativas —mirar un fichero era
    // dejar de ver lo que el agente escribía—. Desde que el panel puede vivir al lado del
    // chat, lo que estas pestañas eligen es «qué abro al lado», y volver al chat a secas es
    // CERRAR el panel. Si alguien la devolviera a la tira, este test es el que lo pilla.
    render(<Pestanas pestana="ficheros" alElegirPestana={vi.fn()} alCerrar={vi.fn()} />);
    expect(screen.queryByRole("tab", { name: "Chat" })).toBeNull();
  });

  it("son cinco por omisión, en este orden: Ejecutar · Ficheros · Revisión · Colecciones · Trazas", () => {
    // Ejecutar es la única pestaña de ACCIÓN que queda aquí —lanza la app en un aparato— y
    // abre la tira. Ficheros, Revisión (y Artefactos, si lo hay) son de REGISTRO: enseñan lo
    // que ya pasó, y Trazas —de otro destinatario, quien depura el harness— cierra la tira.
    // Ejecutar no necesita dato para aparecer: su estado vacío dice cómo se empieza.
    //
    // Tareas ya NO está aquí: las tareas en background del proyecto se mudaron al panel DEL
    // PROYECTO, pestaña Tareas (`Pestanas.tsx` dice por qué). Si alguien la devolviera aquí,
    // esta lista es la que lo tiene que pillar.
    //
    // CloudStudio tampoco: su banda vive dentro de Revisión (`Pestanas.tsx` dice por qué). Si
    // alguien le devolviera su pestaña, esta lista es la que lo tiene que pillar.
    render(<Pestanas pestana="revision" alElegirPestana={vi.fn()} alCerrar={vi.fn()} />);
    expect(screen.getByRole("tablist")).not.toBeNull();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Ejecutar",
      "Ficheros",
      "Revisión",
      // El modelo XOne: de REGISTRO, y siempre presente porque todo proyecto XOne lo tiene.
      "Colecciones",
      "Trazas",
    ]);
    expect(screen.getByRole("tab", { name: "Revisión" }).getAttribute("aria-selected")).toBe("true");
  });

  it("lleva la salida del panel, y no está dentro del `tablist`", () => {
    // Un `tablist` solo admite `tab`s: colar ahí un botón que no lleva a ninguna vista rompe
    // el recorrido que se le anuncia a quien navega con el teclado.
    const alCerrar = vi.fn();
    render(<Pestanas pestana="ficheros" alElegirPestana={vi.fn()} alCerrar={alCerrar} />);
    const cerrar = screen.getByRole("button", { name: "Cerrar el panel" });
    expect(screen.getByRole("tablist").contains(cerrar)).toBe(false);
    fireEvent.click(cerrar);
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it("«Artefactos» solo está si la sesión dejó alguno: una pestaña vacía es un control sin dato", () => {
    render(<Pestanas pestana="ficheros" alElegirPestana={vi.fn()} alCerrar={vi.fn()} hayArtefactos />);
    // Delante de Trazas, que sigue siendo la última: es la de otro destinatario. Ejecutar abre
    // la tira, y Artefactos va entre Colecciones y Trazas, con el resto de las de registro.
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Ejecutar",
      "Ficheros",
      "Revisión",
      "Colecciones",
      "Artefactos",
      "Trazas",
    ]);
  });

  it("«Planes» solo está si el proyecto tiene alguno, detrás de Colecciones", () => {
    render(<Pestanas pestana="ficheros" alElegirPestana={vi.fn()} alCerrar={vi.fn()} hayPlanes />);
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs.indexOf("Planes")).toBe(tabs.indexOf("Colecciones") + 1);
    cleanup();
    render(<Pestanas pestana="ficheros" alElegirPestana={vi.fn()} alCerrar={vi.fn()} />);
    expect(screen.queryByRole("tab", { name: "Planes" })).toBeNull();
  });

  it("pulsar Artefactos reporta «artefactos»", () => {
    const alElegirPestana = vi.fn();
    render(<Pestanas pestana="ficheros" alElegirPestana={alElegirPestana} alCerrar={vi.fn()} hayArtefactos />);
    fireEvent.click(screen.getByRole("tab", { name: "Artefactos" }));
    expect(alElegirPestana).toHaveBeenCalledWith("artefactos");
  });

  it("no hay ninguna pestaña «Tareas»: las tareas en background del proyecto viven en su panel", () => {
    // Se fue de aquí a `PanelDelProyecto.tsx` (pestaña Tareas, delante de las pendientes del
    // gestor): son del PROYECTO y no de la sesión. Si alguien la devolviera aquí, este test
    // es el que lo tiene que pillar.
    render(<Pestanas pestana="ficheros" alElegirPestana={vi.fn()} alCerrar={vi.fn()} />);
    expect(screen.queryByRole("tab", { name: "Tareas" })).toBeNull();
  });

  it("no hay ninguna pestaña «CloudStudio»: su banda vive dentro de Revisión", () => {
    // La pregunta que la lista contesta —«¿dónde miro lo que ha cambiado?»— tenía dos
    // respuestas a un clic de distancia: la foto de la sesión y la rama de CloudStudio. Ahora
    // es una sola pestaña con las dos referencias dentro, así que aquí no puede quedar una
    // pestaña suelta que vuelva a partirlas.
    render(<Pestanas pestana="ficheros" alElegirPestana={vi.fn()} alCerrar={vi.fn()} />);
    expect(screen.queryByRole("tab", { name: /cloudstudio/i })).toBeNull();
  });

  it("pulsar Revisión reporta «revision»", () => {
    const alElegirPestana = vi.fn();
    render(<Pestanas pestana="ficheros" alElegirPestana={alElegirPestana} alCerrar={vi.fn()} />);
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

  it("la tira se DESPLAZA cuando no cabe, en vez de aplastar las pestañas", () => {
    // El panel se arrastra hasta 360 px y ahí seis pestañas con el hueco de la hoja copiada
    // no entran. jsdom no hace layout, así que esto se comprueba sobre la hoja: sin
    // `overflow-x` flex encogería las pestañas hasta partirles la etiqueta, y sin el
    // `flex: none` de cada una el desbordamiento no llegaría a existir.
    const propia = readFileSync(join(AQUI, "Pestanas.module.css"), "utf8");
    expect(propia).toMatch(/overflow-x:\s*auto/);
    expect(propia).toMatch(/\.pestana\s*\{[^}]*flex:\s*none/);
  });
});
