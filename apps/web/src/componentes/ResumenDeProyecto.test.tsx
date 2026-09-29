import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { ResumenDeProyecto, SESIONES_EN_EL_RESUMEN, type ProyectoDelResumen } from "./ResumenDeProyecto.js";
import type { FotoDelResumen, TareaDelCable } from "../tipos.js";

afterEach(cleanup);

function montar(
  proyecto: ProyectoDelResumen,
  extra: {
    conectado?: boolean;
    abriendo?: boolean;
    tareasDeLaCola?: readonly TareaDelCable[];
    alAbrirCarpeta?: (p: string) => Promise<string | undefined>;
    alPedirResumen?: (p: string) => Promise<FotoDelResumen | undefined>;
  } = {}
) {
  const alIrALaConversacion = vi.fn();
  const alDescargar = vi.fn();
  const alAbrirSesion = vi.fn();
  const alBorrarCopia = vi.fn(() => Promise.resolve(undefined as string | undefined));
  const alAbrirCarpeta = vi.fn(extra.alAbrirCarpeta ?? (() => Promise.resolve(undefined as string | undefined)));
  const alPedirResumen = vi.fn(extra.alPedirResumen ?? (() => Promise.resolve({ tareas: [] } as FotoDelResumen)));
  const vista = render(
    <ResumenDeProyecto
      proyecto={proyecto}
      {...(extra.conectado === undefined ? {} : { conectado: extra.conectado })}
      {...(extra.abriendo === undefined ? {} : { abriendo: extra.abriendo })}
      {...(extra.tareasDeLaCola === undefined ? {} : { tareasDeLaCola: extra.tareasDeLaCola })}
      alIrALaConversacion={alIrALaConversacion}
      alDescargar={alDescargar}
      alAbrirCarpeta={alAbrirCarpeta}
      alBorrarCopia={alBorrarCopia}
      alPedirResumen={alPedirResumen}
      alAbrirSesion={alAbrirSesion}
    />
  );
  return { alIrALaConversacion, alBorrarCopia, alAbrirCarpeta, alPedirResumen, alAbrirSesion, vista };
}

/** Una tarea de la cola, con lo mínimo que el resumen lee. */
const tarea = (id: string, estado: TareaDelCable["estado"], extra: Partial<TareaDelCable> = {}): TareaDelCable =>
  ({
    id,
    proyecto: "p1",
    proyectoNombre: "Tienda",
    titulo: `tarea ${id}`,
    encargo: "",
    estado,
    creada: `2026-09-0${id.slice(-1)}T10:00:00.000Z`,
    ...extra,
  }) as TareaDelCable;

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

  it("mientras mide lo dice, y sin copia no hay tira", async () => {
    montar({ id: "p1", nombre: "Tienda", local: true }, { alPedirResumen: () => new Promise(() => {}) });
    expect(screen.getByRole("status").textContent).toMatch(/midiendo/);
    cleanup();
    montar({ id: "p1", nombre: "Tienda" });
    await asentar();
    expect(screen.queryByText(/por subir/)).toBeNull();
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
        alIrALaConversacion={() => {}}
        alDescargar={() => {}}
        alAbrirCarpeta={() => Promise.resolve(undefined)}
        alBorrarCopia={() => Promise.resolve(undefined)}
        alPedirResumen={alPedirResumen}
        alAbrirSesion={() => {}}
      />
    );
    await asentar();
    expect(screen.getByRole("status").textContent).toMatch(/Nada por subir/);
    await act(async () => soltarA({ tareas: [], sync: { proyecto: "A", rama: "main", pendientes: 9 } }));
    expect(screen.getByRole("status").textContent).toMatch(/Nada por subir/);
    expect(screen.queryByText(/9 ficheros/)).toBeNull();
  });
});

describe("las últimas sesiones", () => {
  const sesiones = Array.from({ length: 7 }, (_, i) => ({
    id: `s${i}`,
    titulo: `sesión ${i}`,
    ultimoTurno: `2026-09-2${i}T10:00:00.000Z`,
  }));

  it("salen las más recientes primero, las que caben, y pulsar una la abre", async () => {
    const { alAbrirSesion } = montar({ id: "p1", nombre: "Tienda", local: true, sesiones });
    await asentar();
    const bloque = screen.getByRole("region", { name: "Últimas sesiones" });
    const botones = within(bloque).getAllByRole("button");
    expect(botones).toHaveLength(SESIONES_EN_EL_RESUMEN);
    expect(botones[0]!.textContent).toMatch(/sesión 6/);
    fireEvent.click(botones[0]!);
    expect(alAbrirSesion).toHaveBeenCalledWith("p1", "s6");
  });

  /** La regla de la barra: con el proyecto trabajando, solo la que trabaja. */
  it("con el proyecto trabajando, solo se puede abrir la que trabaja", async () => {
    montar({
      id: "p1",
      nombre: "Tienda",
      local: true,
      trabajando: true,
      sesiones: [
        { id: "s1", titulo: "la que trabaja", ultimoTurno: "2026-09-21T10:00:00.000Z", trabajando: true },
        { id: "s2", titulo: "otra", ultimoTurno: "2026-09-20T10:00:00.000Z" },
      ],
    });
    await asentar();
    const bloque = screen.getByRole("region", { name: "Últimas sesiones" });
    expect(within(bloque).getByRole("button", { name: /la que trabaja/ })).toHaveProperty("disabled", false);
    expect(within(bloque).getByRole("button", { name: /otra/ })).toHaveProperty("disabled", true);
  });
});

describe("las tareas del proyecto", () => {
  it("cuenta por estado SOLO las que el servidor dijo que son suyas", async () => {
    montar(
      { id: "p1", nombre: "Tienda", local: true },
      {
        tareasDeLaCola: [
          tarea("t1", "nuevo"),
          tarea("t2", "en-proceso", { sesion: "x2" }),
          tarea("t3", "requiere-atencion", { sesion: "x3" }),
          tarea("t4", "terminada", { sesion: "x4" }),
          // El mismo id de proyecto, de OTRO entorno: el servidor no la devuelve.
          tarea("t5", "nuevo"),
        ],
        alPedirResumen: () => Promise.resolve({ tareas: ["t1", "t2", "t3", "t4"] }),
      }
    );
    await asentar();
    const bloque = screen.getByRole("region", { name: "Tareas del proyecto" });
    const cifra = (rotulo: string) => within(bloque).getByText(rotulo).parentElement!.querySelector("dd")!.textContent;
    expect(cifra("Pendientes")).toBe("1");
    expect(cifra("En proceso")).toBe("1");
    expect(cifra("Esperando feedback")).toBe("1");
    expect(cifra("Finalizadas")).toBe("1");
    expect(within(bloque).queryByText("tarea t5")).toBeNull();
  });

  /** Una en curso: el servidor declina abrirla, así que no es botón. Sin sesión, tampoco. */
  it("solo es botón con sesión y fuera de `en-proceso`", async () => {
    const { alAbrirSesion } = montar(
      { id: "p1", nombre: "Tienda", local: true },
      {
        tareasDeLaCola: [
          tarea("t1", "nuevo"),
          tarea("t2", "en-proceso", { sesion: "x2" }),
          tarea("t3", "requiere-atencion", { sesion: "x3" }),
        ],
        alPedirResumen: () => Promise.resolve({ tareas: ["t1", "t2", "t3"] }),
      }
    );
    await asentar();
    const bloque = screen.getByRole("region", { name: "Tareas del proyecto" });
    expect(within(bloque).queryByRole("button", { name: /tarea t1/ })).toBeNull();
    expect(within(bloque).queryByRole("button", { name: /tarea t2/ })).toBeNull();
    fireEvent.click(within(bloque).getByRole("button", { name: /tarea t3/ }));
    expect(alAbrirSesion).toHaveBeenCalledWith("p1", "x3");
  });

  it("ausente y vacío no son lo mismo: sin cola, no ha llegado; con cola y sin suyas, ninguna", async () => {
    montar({ id: "p1", nombre: "Tienda", local: true });
    await asentar();
    expect(screen.getByText(/Todavía no ha llegado la cola de tareas/)).toBeTruthy();
    cleanup();
    montar({ id: "p1", nombre: "Tienda", local: true }, { tareasDeLaCola: [tarea("t9", "nuevo")] });
    await asentar();
    expect(screen.getByText(/Ninguna tarea en este proyecto/)).toBeTruthy();
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
  it("los estados son pastillas junto al NOMBRE, dentro de la misma cabecera", () => {
    montar({ id: "p1", nombre: "Tienda", local: true, compartido: true });
    const titulo = screen.getByRole("heading", { level: 1, name: "Tienda" });
    const cabecera = titulo.closest("header") as HTMLElement;
    expect(cabecera.textContent).toMatch(/en tu equipo/);
    expect(cabecera.textContent).toMatch(/compartido contigo/);
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

  it("no hay botón de cerrar: su sitio lo ocupan las acciones de la copia", () => {
    montar({ id: "p1", nombre: "Tienda", local: true });
    expect(screen.queryByRole("button", { name: "Cerrar" })).toBeNull();
    const cabecera = screen.getByRole("heading", { level: 1 }).closest("header") as HTMLElement;
    expect(cabecera.querySelectorAll("button")).toHaveLength(2);
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

  /**
   * Antes el nombre de un proyecto TRABAJANDO llevaba a su conversación en marcha, y era el
   * único camino mientras esa conversación no tuviera fila. El nombre ahora abre esto, así
   * que el camino tiene que estar AQUÍ.
   */
  it("con el proyecto trabajando, ofrece ir a la conversación en marcha", () => {
    const { alIrALaConversacion } = montar({ id: "p1", nombre: "Tienda", local: true, trabajando: true });
    fireEvent.click(screen.getByRole("button", { name: "Ir a la conversación en marcha" }));
    expect(alIrALaConversacion).toHaveBeenCalled();
    cleanup();
    montar({ id: "p1", nombre: "Tienda", local: true });
    expect(screen.queryByRole("button", { name: "Ir a la conversación en marcha" })).toBeNull();
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
