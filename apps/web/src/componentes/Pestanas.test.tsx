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
    expect(screen.getByRole("tab", { name: "Tareas" }).getAttribute("aria-selected")).toBe("false");
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

  it("son seis por omisión, en este orden: Tareas · Ejecutar · Ficheros · Revisión · Colecciones · Trazas", () => {
    // Tareas y Ejecutar son las dos pestañas de ACCIÓN —una le manda al agente algo para que
    // trabaje solo, la otra lanza la app en un aparato— y van juntas al principio. Ficheros,
    // Revisión (y Artefactos, si lo hay) son de REGISTRO: enseñan lo que ya pasó, y Trazas
    // —de otro destinatario, quien depura el harness— cierra la tira. Ninguna de las de
    // acción necesita dato para aparecer: su estado vacío dice cómo se empieza.
    //
    // CloudStudio ya NO está aquí: su banda vive dentro de Revisión (`Pestanas.tsx` dice por
    // qué). Si alguien le devolviera su pestaña, esta lista es la que lo tiene que pillar.
    render(<Pestanas pestana="revision" alElegirPestana={vi.fn()} alCerrar={vi.fn()} />);
    expect(screen.getByRole("tablist")).not.toBeNull();
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Tareas",
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
    // Delante de Trazas, que sigue siendo la última: es la de otro destinatario. Las de
    // acción van juntas al principio y Artefactos entre Revisión y Trazas, con el resto de
    // las de registro.
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Tareas",
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

  it("«Tareas» está SIEMPRE, aunque el proyecto no tenga ninguna: matiza la regla de Artefactos, no la copia", () => {
    // «La pestaña solo existe si hay dato» es correcta para Artefactos —un artefacto es el
    // REGISTRO de algo que ya pasó, y un registro vacío es el control sin dato detrás—, pero
    // Tareas es una pestaña de ACCIÓN: si desaparece cuando no hay ninguna, se lleva consigo
    // el único sitio donde aprender que se puede crear una. El criterio que queda: una
    // pestaña de registro existe si hay registro; una de acción existe siempre, y su estado
    // vacío dice cómo se empieza (`TareasDelProyecto.tsx`). Por eso este test NO pasa ningún
    // prop de tareas — si alguien reintrodujera un `hayTareas` que la condicione, esta prueba
    // es la que lo tiene que pillar.
    render(<Pestanas pestana="ficheros" alElegirPestana={vi.fn()} alCerrar={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Tareas" })).toBeTruthy();
  });

  it("pulsar Tareas reporta «tareas»", () => {
    const alElegirPestana = vi.fn();
    render(<Pestanas pestana="ficheros" alElegirPestana={alElegirPestana} alCerrar={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "Tareas" }));
    expect(alElegirPestana).toHaveBeenCalledWith("tareas");
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
