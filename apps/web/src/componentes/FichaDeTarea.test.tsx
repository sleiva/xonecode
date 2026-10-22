import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { acotarAnchoDeFicha, ANCHO_FICHA_MINIMO, ANCHO_FICHA_POR_OMISION, ConFicha, FichaDeTarea } from "./FichaDeTarea.js";
import type { TareaDelCable } from "../tipos.js";

afterEach(cleanup);

const tarea = (extra: Partial<TareaDelCable> = {}): TareaDelCable => ({
  id: "t1", proyecto: "p1", proyectoNombre: "Maset", titulo: "Rediseño del listado de albaranes",
  peticion: "Rediseña el listado de albaranes", encargo: "## Qué hay que conseguir\nEl listado como la maqueta", adjuntos: [],
  estado: "en-proceso", creada: "2026-10-22T10:00:00.000Z", ...extra,
});

/** IXCODE-68: la ficha de la tarea junto a su conversación, opción A de su lienzo. */
describe("FichaDeTarea", () => {
  it("en marcha: título, ticket, cuánto lleva y lo que gasta, lo que se pidió y el encargo ABIERTO", () => {
    render(
      <FichaDeTarea
        tarea={tarea({
          empezada: new Date(Date.now() - 65_000).toISOString(),
          ticket: { clave: "MAS-12", conector: "jira" },
          gastoEnCurso: { modelo: { entrada: 1000, salida: 100, cache: 500 }, externo: { entrada: 0, salida: 0, cache: 0 } },
        })}
      />
    );
    const ficha = screen.getByRole("complementary", { name: "Ficha de la tarea" });
    expect(ficha.textContent).toContain("Rediseño del listado de albaranes");
    expect(ficha.textContent).toContain("MAS-12");
    expect(ficha.textContent).toMatch(/Empezó /);
    expect(screen.getByText("lleva")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Lo que se pidió" }).textContent).toContain("Rediseña el listado de albaranes");
    // Markdown: el `##` es un encabezado, no texto con almohadillas.
    expect(screen.getByRole("heading", { name: "Qué hay que conseguir" })).toBeTruthy();
  });

  it("el encargo se pliega y, plegado, se DESMONTA", () => {
    render(<FichaDeTarea tarea={tarea()} />);
    const boton = screen.getByRole("button", { name: /Encargo ampliado/ });
    expect(boton.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(boton);
    expect(screen.queryByRole("heading", { name: "Qué hay que conseguir" })).toBeNull();
  });

  it("lo que no consta no se pinta: sin ticket, sin empezar, sin diseño ni adjuntos, y la petición igual al encargo una vez", () => {
    render(<FichaDeTarea tarea={tarea({ peticion: "Lo mismo", encargo: "Lo mismo" })} />);
    const ficha = screen.getByRole("complementary", { name: "Ficha de la tarea" });
    expect(ficha.textContent).not.toMatch(/Empezó|lleva/);
    expect(screen.queryByRole("region", { name: "Lo que se pidió" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Diseño" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Adjuntos" })).toBeNull();
    expect(screen.getAllByText("Lo mismo")).toHaveLength(1);
  });

  it("con diseño y adjuntos, los nombra; acabada, dice lo que tardó trabajando", () => {
    render(
      <FichaDeTarea
        tarea={tarea({
          estado: "terminada",
          trabajo: 125_000,
          pantallasDeStitch: [{ name: "projects/1/screens/a", titulo: "Listado de Albaranes", proyecto: "Maset" }],
          adjuntos: [{ nombre: "captura-actual.png", bytes: 10 }],
        })}
      />
    );
    expect(screen.getByRole("region", { name: "Diseño" }).textContent).toContain("«Listado de Albaranes»");
    expect(screen.getByRole("region", { name: "Adjuntos" }).textContent).toContain("captura-actual.png");
    expect(screen.getByText("tardó")).toBeTruthy();
    expect(screen.getByText("2 min 05 s")).toBeTruthy();
  });

  it("acabada y con gasto, dice también lo que gastó; sin nada que conste, ninguna cifra", () => {
    const { unmount } = render(
      <FichaDeTarea
        tarea={tarea({ estado: "terminada", trabajo: 40_000, gasto: { modelo: { entrada: 279_900, salida: 0, cache: 0 }, externo: { entrada: 0, salida: 0, cache: 0 } } })}
      />
    );
    // Las mismas cifras grandes que en curso: tardó, tokens y caché.
    expect(screen.getByText("tardó")).toBeTruthy();
    expect(screen.getByText("40 s")).toBeTruthy();
    expect(screen.getByLabelText(/^Tardó 40 s · .*tokens/)).toBeTruthy();
    unmount();
    render(<FichaDeTarea tarea={tarea({ estado: "terminada" })} />);
    expect(screen.getByRole("complementary", { name: "Ficha de la tarea" }).textContent).not.toMatch(/Tardó|Gastó/);
  });
});

/** Petición suya: «que pueda crecer de ancho». */
describe("el ancho de la ficha", () => {
  it("se acota: nunca bajo su mínimo, ni tan ancha que la conversación se quede sin sitio", () => {
    expect(acotarAnchoDeFicha(100)).toBe(ANCHO_FICHA_MINIMO);
    expect(acotarAnchoDeFicha(900)).toBe(900);
    expect(acotarAnchoDeFicha(900, 1200)).toBe(1200 - 420);
    expect(acotarAnchoDeFicha(Number.NaN)).toBe(ANCHO_FICHA_POR_OMISION);
  });

  it("el tirador la ensancha con la flecha izquierda, la estrecha con la derecha, y lo recuerda", () => {
    window.localStorage.removeItem("xonecode.anchoFichaDeTarea");
    render(
      <ConFicha ficha={<FichaDeTarea tarea={tarea()} />}>
        <p>la conversación</p>
      </ConFicha>
    );
    const tirador = screen.getByRole("separator", { name: "Ancho de la ficha" });
    expect(tirador.getAttribute("aria-valuenow")).toBe(String(ANCHO_FICHA_POR_OMISION));
    fireEvent.keyDown(tirador, { key: "ArrowLeft", shiftKey: true });
    expect(tirador.getAttribute("aria-valuenow")).toBe(String(ANCHO_FICHA_POR_OMISION + 64));
    expect(window.localStorage.getItem("xonecode.anchoFichaDeTarea")).toBe(String(ANCHO_FICHA_POR_OMISION + 64));
    fireEvent.keyDown(tirador, { key: "ArrowRight" });
    expect(tirador.getAttribute("aria-valuenow")).toBe(String(ANCHO_FICHA_POR_OMISION + 48));
    fireEvent.doubleClick(tirador);
    expect(tirador.getAttribute("aria-valuenow")).toBe(String(ANCHO_FICHA_POR_OMISION));
  });
});
