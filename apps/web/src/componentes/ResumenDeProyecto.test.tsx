import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { ResumenDeProyecto, type ProyectoDelResumen } from "./ResumenDeProyecto.js";
import type { FotoDelResumen } from "../tipos.js";

/*
 * Lo de la COPIA arriba de la pestaña Resumen del panel del proyecto. Las sesiones y las tareas
 * ya no son de aquí (las sesiones son de la barra, las tareas de la pestaña Tareas): sus
 * bloques se fueron con la vista aparte del resumen al fusionarla en `PanelDelProyecto`.
 */

afterEach(cleanup);

function montar(
  proyecto: ProyectoDelResumen,
  extra: {
    conectado?: boolean;
    alAbrirCarpeta?: (p: string) => Promise<string | undefined>;
    alPedirResumen?: (p: string) => Promise<FotoDelResumen | undefined>;
  } = {}
) {
  const alDescargar = vi.fn();
  const alBorrarCopia = vi.fn(() => Promise.resolve(undefined as string | undefined));
  const alAbrirCarpeta = vi.fn(extra.alAbrirCarpeta ?? (() => Promise.resolve(undefined as string | undefined)));
  const alPedirResumen = vi.fn(extra.alPedirResumen ?? (() => Promise.resolve({ tareas: [] } as FotoDelResumen)));
  const vista = render(
    <ResumenDeProyecto
      proyecto={proyecto}
      {...(extra.conectado === undefined ? {} : { conectado: extra.conectado })}
      alDescargar={alDescargar}
      alAbrirCarpeta={alAbrirCarpeta}
      alBorrarCopia={alBorrarCopia}
      alPedirResumen={alPedirResumen}
    />
  );
  return { alDescargar, alBorrarCopia, alAbrirCarpeta, alPedirResumen, vista };
}

/** Deja que la promesa de la foto se resuelva y React pinte. */
const asentar = () => act(async () => {});

describe("la foto del resumen: lo que queda por subir", () => {
  it("con N pendientes lo dice con su cifra y su rama, con la MISMA medida que la banda", async () => {
    montar(
      { id: "p1", nombre: "Tienda", local: true },
      { alPedirResumen: () => Promise.resolve({ tareas: [], sync: { proyecto: "Tienda", rama: "main", pendientes: 3 } }) }
    );
    await asentar();
    expect(screen.getByRole("status").textContent).toMatch(/3 ficheros con cambios sin subir a «main»/);
  });

  it("cero MEDIDO es «nada por subir», y no vinculado NO es cero", async () => {
    montar(
      { id: "p1", nombre: "Tienda", local: true },
      { alPedirResumen: () => Promise.resolve({ tareas: [], sync: { proyecto: "Tienda", rama: "main", pendientes: 0 } }) }
    );
    await asentar();
    expect(screen.getByRole("status").textContent).toMatch(/Nada por subir/);
    cleanup();
    montar({ id: "p1", nombre: "Tienda", local: true }, { alPedirResumen: () => Promise.resolve({ tareas: [], sync: {} }) });
    await asentar();
    expect(screen.getByRole("status").textContent).toMatch(/No está vinculado a CloudStudio/);
  });

  it("un fallo de medida, o sin respuesta, se dice: nunca un cero inventado", async () => {
    montar(
      { id: "p1", nombre: "Tienda", local: true },
      { alPedirResumen: () => Promise.resolve({ tareas: [], sync: { proyecto: "Tienda", rama: "main", error: "sin la ref" } }) }
    );
    await asentar();
    expect(screen.getByRole("status").textContent).toMatch(/No se ha podido medir: sin la ref/);
    cleanup();
    montar({ id: "p1", nombre: "Tienda", local: true }, { alPedirResumen: () => Promise.resolve(undefined) });
    await asentar();
    expect(screen.getByRole("status").textContent).toMatch(/No se ha podido medir/);
  });

  it("mientras mide lo dice, y sin copia no hay tira ni se pregunta nada", async () => {
    montar({ id: "p1", nombre: "Tienda", local: true }, { alPedirResumen: () => new Promise(() => {}) });
    expect(screen.getByRole("status").textContent).toMatch(/midiendo/);
    cleanup();
    const { alPedirResumen } = montar({ id: "p1", nombre: "Tienda" });
    await asentar();
    expect(screen.queryByText(/por subir/)).toBeNull();
    expect(alPedirResumen).not.toHaveBeenCalled();
  });

  /** El fallo de siempre con otro disfraz: la respuesta de A pintada en B. */
  it("pulsar A y luego B: la respuesta de A que llega DESPUÉS no se pinta en B", async () => {
    let soltarA: (f: FotoDelResumen) => void = () => {};
    const alPedirResumen = (id: string): Promise<FotoDelResumen | undefined> =>
      id === "a"
        ? new Promise((r) => (soltarA = r))
        : Promise.resolve({ tareas: [], sync: { proyecto: "B", rama: "main", pendientes: 0 } });
    const { vista } = montar({ id: "a", nombre: "A", local: true }, { alPedirResumen });
    vista.rerender(
      <ResumenDeProyecto
        proyecto={{ id: "b", nombre: "B", local: true }}
        alDescargar={() => {}}
        alAbrirCarpeta={() => Promise.resolve(undefined)}
        alBorrarCopia={() => Promise.resolve(undefined)}
        alPedirResumen={alPedirResumen}
      />
    );
    await asentar();
    expect(screen.getByRole("status").textContent).toMatch(/Nada por subir/);
    await act(async () => soltarA({ tareas: [], sync: { proyecto: "A", rama: "main", pendientes: 9 } }));
    expect(screen.getByRole("status").textContent).toMatch(/Nada por subir/);
    expect(screen.queryByText(/9 ficheros/)).toBeNull();
  });
});

describe("el gasto", () => {
  it("sin ninguna sesión con gasto que conste, no hay gráfico vacío", async () => {
    montar({ id: "p1", nombre: "Tienda", local: true, sesiones: [{ id: "s1", titulo: "a" }] });
    await asentar();
    expect(screen.getByText(/Todavía no consta gasto/)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("con gasto, el gráfico, y el total dice cuántas sesiones quedan fuera", async () => {
    montar({
      id: "p1",
      nombre: "Tienda",
      local: true,
      sesiones: [
        {
          id: "s1",
          titulo: "a",
          ultimoTurno: "2026-09-21T10:00:00.000Z",
          consumo: { modelo: { entrada: 1500, salida: 500, cache: 1000 }, externo: { entrada: 0, salida: 0, cache: 0 } },
        },
        { id: "s2", titulo: "b" },
      ],
    });
    await asentar();
    expect(screen.getByRole("img")).toBeTruthy();
    expect(screen.getByText(/1 sin gasto que conste, fuera del total/)).toBeTruthy();
  });
});

describe("ResumenDeProyecto", () => {
  it("los estados son pastillas junto a las acciones, en la misma fila de la copia", () => {
    montar({ id: "p1", nombre: "Tienda", local: true, compartido: true });
    const cabecera = screen.getByRole("group", { name: "Copia local" });
    expect(cabecera.textContent).toMatch(/en tu equipo/);
    expect(cabecera.textContent).toMatch(/compartido contigo/);
    // El nombre lo pone el panel: aquí no se repite.
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  /** Lo propio no lleva pastilla, como en la barra; y ausente tampoco: no es «de otro». */
  it("sin copia dice «sin descargar», y solo lo compartido lleva pastilla de dueño", () => {
    montar({ id: "p1", nombre: "Tienda" });
    expect(screen.getByText("sin descargar")).toBeTruthy();
    expect(screen.queryByText("compartido contigo")).toBeNull();
    cleanup();
    montar({ id: "p1", nombre: "Tienda", compartido: false });
    expect(screen.queryByText("compartido contigo")).toBeNull();
    expect(screen.queryByText(/propio/i)).toBeNull();
  });

  it("no hay botón de cerrar: la fila de la copia lleva solo sus dos acciones", () => {
    montar({ id: "p1", nombre: "Tienda", local: true });
    expect(screen.queryByRole("button", { name: "Cerrar" })).toBeNull();
    expect(within(screen.getByRole("group", { name: "Copia local" })).getAllByRole("button")).toHaveLength(2);
  });

  it("sin copia, «Descargar» es su única acción", () => {
    const { alDescargar } = montar({ id: "p1", nombre: "Tienda" });
    fireEvent.click(screen.getByRole("button", { name: "Descargar" }));
    expect(alDescargar).toHaveBeenCalled();
  });

  it("«Abrir carpeta» y «Borrar copia local» solo existen con copia", () => {
    montar({ id: "p1", nombre: "Tienda" });
    expect(screen.queryByRole("button", { name: "Borrar copia local" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Abrir carpeta" })).toBeNull();
    cleanup();
    montar({ id: "p1", nombre: "Tienda", local: true });
    expect(screen.getByRole("button", { name: "Borrar copia local" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Abrir carpeta" })).toBeTruthy();
  });

  it("«Abrir carpeta» pide la del proyecto por su ID, y una negativa se DICE", async () => {
    const { alAbrirCarpeta } = montar(
      { id: "p1", nombre: "Tienda", local: true },
      { alAbrirCarpeta: () => Promise.resolve("ese proyecto no está descargado en este equipo") }
    );
    fireEvent.click(screen.getByRole("button", { name: "Abrir carpeta" }));
    expect(alAbrirCarpeta).toHaveBeenCalledWith("p1");
    expect((await screen.findByRole("alert")).textContent).toMatch(/no está descargado/);
  });

  it("sin cable no se puede pedir el borrado", () => {
    montar({ id: "p1", nombre: "Tienda", local: true }, { conectado: false });
    expect(screen.getByRole("button", { name: "Borrar copia local" })).toHaveProperty("disabled", true);
  });

  it("la ventana dice lo que se pierde y lo que NO, y no borra sin el nombre escrito", () => {
    const { alBorrarCopia } = montar({ id: "p1", nombre: "Tienda", local: true });
    fireEvent.click(screen.getByRole("button", { name: "Borrar copia local" }));
    const ventana = screen.getByRole("alertdialog");
    expect(ventana.textContent).toMatch(/todas sus sesiones/);
    expect(ventana.textContent).toMatch(/artefactos/);
    expect(ventana.textContent).toMatch(/no hayas subido a CloudStudio/);
    expect(ventana.textContent).toMatch(/CloudStudio no se toca/);
    fireEvent.change(screen.getByLabelText(/para confirmar/i), { target: { value: "tienda" } });
    expect(screen.getByRole("button", { name: "Borrar" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Borrar" }));
    expect(alBorrarCopia).not.toHaveBeenCalled();
  });
});
