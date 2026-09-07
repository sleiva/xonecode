import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Artefactos } from "./Artefactos.js";
import type { ArtefactoEnLista } from "./Artefactos.js";

afterEach(cleanup);
const NADA = () => {};

const HTML: ArtefactoEnLista = { ruta: "/artefactos/diagrama.html", nombre: "diagrama.html", bytes: 9347, mime: "text/html" };
const PNG: ArtefactoEnLista = { ruta: "/artefactos/captura.png", nombre: "captura.png", bytes: 2048, mime: "image/png" };
const MD: ArtefactoEnLista = { ruta: "/artefactos/informe.md", nombre: "informe.md", bytes: 300, mime: "text/markdown" };
const RARO: ArtefactoEnLista = { ruta: "/artefactos/cosa.xyz", nombre: "cosa.xyz", bytes: 10 };

/** El único que hace falta casi siempre: la lista con uno y el contenido ya traído. */
const pintar = (props: Partial<Parameters<typeof Artefactos>[0]> = {}) =>
  render(
    <Artefactos lista={[HTML]} contenidos={{}} alElegir={NADA} alPedir={NADA} conectado {...props} />
  );

describe("Artefactos", () => {
  it("elige el ÚLTIMO solo: es el que se acaba de dibujar", () => {
    const elegir = vi.fn();
    pintar({ lista: [HTML, PNG], alElegir: elegir });
    expect(elegir).toHaveBeenCalledWith(PNG.ruta);
  });

  it("un elegido que ya no está en la lista se suelta, en vez de enseñar una foto vieja", () => {
    const elegir = vi.fn();
    pintar({ lista: [PNG], elegido: HTML.ruta, alElegir: elegir });
    expect(elegir).toHaveBeenCalledWith(undefined);
  });

  it("el HTML se pinta en un iframe SANDBOXEADO y sin same-origin", () => {
    pintar({ elegido: HTML.ruta });
    const marco = screen.getByTitle(HTML.nombre) as HTMLIFrameElement;
    expect(marco.tagName).toBe("IFRAME");
    expect(marco.getAttribute("src")).toBe("/artefacto?n=diagrama.html");
    // Las dos mitades de la regla: con `allow-scripts` los diagramas corren; con
    // `allow-same-origin` AL LADO el sandbox no serviría de nada — el documento vería la
    // cookie del token y podría hablarle a `/accion`.
    const sandbox = marco.getAttribute("sandbox");
    expect(sandbox).toBe("allow-scripts");
    expect(sandbox).not.toContain("allow-same-origin");
  });

  it("la vista del HTML no gasta cable; su FUENTE sí, y solo al pedirla", () => {
    const pedir = vi.fn();
    pintar({ elegido: HTML.ruta, alPedir: pedir });
    expect(pedir).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Fuente" }));
    expect(pedir).toHaveBeenCalledWith("diagrama.html");
  });

  it("una imagen se pide al elegirla y se pinta con su URL de datos", () => {
    const pedir = vi.fn();
    const { rerender } = render(
      <Artefactos lista={[PNG]} contenidos={{}} elegido={PNG.ruta} alElegir={NADA} alPedir={pedir} conectado />
    );
    expect(pedir).toHaveBeenCalledWith("captura.png");
    rerender(
      <Artefactos
        lista={[PNG]}
        contenidos={{ [PNG.ruta]: { ruta: PNG.ruta, bytes: 2048, recortado: false, binario: true, mime: "image/png", base64: "QUJD" } }}
        elegido={PNG.ruta}
        alElegir={NADA}
        alPedir={pedir}
        conectado
      />
    );
    const img = screen.getByAltText(PNG.nombre) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("data:image/png;base64,QUJD");
  });

  it("el markdown se renderiza, y su interruptor lleva a la fuente", () => {
    pintar({
      lista: [MD],
      elegido: MD.ruta,
      contenidos: { [MD.ruta]: { ruta: MD.ruta, bytes: 300, recortado: false, binario: false, texto: "# Hola\n\nen XOne se usa $http" } },
    });
    expect(screen.getByText("Hola")).toBeTruthy();
    // Los dólares protegidos, como en el chat: `$http` es un objeto de XOne, no LaTeX.
    expect(screen.getByText(/\$http/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fuente" }));
    expect(screen.queryByRole("heading", { name: "Hola" })).toBeNull();
  });

  it("sin cable no se pide nada: la petición se perdería sin decirlo", () => {
    const pedir = vi.fn();
    pintar({ lista: [PNG], elegido: PNG.ruta, alPedir: pedir, conectado: false });
    expect(pedir).not.toHaveBeenCalled();
  });

  it("un tipo que no sabemos enseñar se DICE, y se puede descargar igual", () => {
    pintar({ lista: [RARO], elegido: RARO.ruta });
    expect(screen.getByText(/no se sabe enseñar/i)).toBeTruthy();
    const enlace = screen.getByRole("link", { name: /descargar/i });
    expect(enlace.getAttribute("href")).toBe("/artefacto?n=cosa.xyz&descargar=1");
  });

  it("descargar está siempre, y el nombre viaja escapado", () => {
    pintar({
      lista: [{ ruta: "/artefactos/a+b.html", nombre: "a+b.html", bytes: 1, mime: "text/html" }],
      elegido: "/artefactos/a+b.html",
    });
    // Un `+` en una query se lee como espacio: sin escapar, la descarga pediría otro nombre.
    expect(screen.getByRole("link", { name: /descargar/i }).getAttribute("href")).toBe(
      "/artefacto?n=a%2Bb.html&descargar=1"
    );
  });

  it("la lista dice el peso de cada uno y marca el elegido", () => {
    pintar({ lista: [HTML, PNG], elegido: PNG.ruta });
    expect(screen.getByText("diagrama.html")).toBeTruthy();
    expect(screen.getByText("9 KB")).toBeTruthy();
    const elegido = screen.getByRole("button", { name: /captura\.png/ });
    expect(elegido.getAttribute("aria-current")).toBe("true");
  });

  it("dice que un artefacto no se ve sin conexión, porque su CDN no está", () => {
    pintar({ elegido: HTML.ruta });
    expect(screen.getByText(/sin conexión/i)).toBeTruthy();
  });

  it("un error del lector se cuenta en vez de dejar el visor en blanco", () => {
    pintar({
      lista: [MD],
      elegido: MD.ruta,
      contenidos: { [MD.ruta]: { ruta: MD.ruta, bytes: 0, recortado: false, binario: false, error: "no existe" } },
    });
    expect(screen.getByText(/no existe/)).toBeTruthy();
  });
});
