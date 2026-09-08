import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Kanban } from "./Kanban.js";
import type { TareaDelCable } from "../tipos.js";

afterEach(cleanup);

const tarea = (extra: Partial<TareaDelCable> = {}): TareaDelCable => ({
  id: "t1",
  proyecto: "p1",
  proyectoNombre: "AppDemo",
  titulo: "Arregla el login",
  peticion: "Arregla el login",
  encargo: "Arregla el login",
  adjuntos: [],
  estado: "nuevo",
  creada: "2026-09-08T10:00:00.000Z",
  ...extra,
});

describe("Kanban", () => {
  it("cuatro columnas, una por estado", () => {
    render(<Kanban cola={{ lista: [tarea()], concurrencia: 2, corriendoAqui: true }} />);
    for (const c of ["Nuevo", "En proceso", "Esperando feedback", "Terminada"]) {
      expect(screen.getByRole("heading", { name: new RegExp(c, "i") })).toBeTruthy();
    }
  });

  it("el MOTIVO se ve en la tarjeta de «esperando feedback», sin abrir nada", () => {
    render(
      <Kanban
        cola={{
          lista: [
            tarea({
              estado: "requiere-atencion",
              motivo: "El juez marcó el trabajo en rojo: falta decidir cómo tratar los duplicados",
            }),
          ],
          concurrencia: 2,
          corriendoAqui: true,
        }}
      />
    );
    expect(screen.getByText(/falta decidir cómo tratar los duplicados/)).toBeTruthy();
  });

  it("dice cuándo este kanban NO avanza", () => {
    // Se ve igual en dos ventanas y solo avanza en una: hay que decir en cuál.
    render(<Kanban cola={{ lista: [tarea()], concurrencia: 2, corriendoAqui: false }} />);
    expect(screen.getByText(/otro proceso|no avanza/i)).toBeTruthy();
  });

  it("pulsar una tarea con sesión la abre; sin sesión, no es pulsable", () => {
    const abrir = vi.fn();
    const { unmount } = render(
      <Kanban cola={{ lista: [tarea({ sesion: "s1" })], concurrencia: 2, corriendoAqui: true }} alAbrirSesion={abrir} />
    );
    fireEvent.click(screen.getByRole("button", { name: /Arregla el login/ }));
    expect(abrir).toHaveBeenCalledWith("p1", "s1");
    unmount();
    // Una tarea que aún no ha corrido no tiene sesión: un botón que no lleva a ninguna parte
    // es el botón muerto de siempre.
    render(<Kanban cola={{ lista: [tarea()], concurrencia: 2, corriendoAqui: true }} alAbrirSesion={abrir} />);
    expect(screen.queryByRole("button", { name: /Arregla el login/ })).toBeNull();
  });

  it("sin tareas se DICE, en vez de cuatro columnas vacías", () => {
    render(<Kanban cola={{ lista: [], concurrencia: 2, corriendoAqui: true }} />);
    expect(screen.getByText(/ninguna tarea/i)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Nuevo/i })).toBeNull();
  });

  it("no hay barra de progreso: un turno no sabe cuánto le queda", () => {
    render(
      <Kanban
        cola={{ lista: [tarea({ estado: "en-proceso", empezada: "2026-09-08T10:00:00.000Z" })], concurrencia: 2, corriendoAqui: true }}
      />
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  /**
   * El bloque de cita del brief: la tarjeta de «esperando feedback» NO lleva diff ni botón
   * de aprobar — la aprobación no existe para una tarea autónoma, y una tarjeta cuyo único
   * final posible fuera un rechazo enseñaría a aprobar sin mirar.
   */
  it("«esperando feedback» no tiene botón de aprobar ni diff: no hay nada que aprobar aquí", () => {
    render(
      <Kanban
        cola={{
          lista: [tarea({ estado: "requiere-atencion", motivo: "hallazgo del juez", sesion: "s1" })],
          concurrencia: 2,
          corriendoAqui: true,
        }}
      />
    );
    expect(screen.queryByRole("button", { name: /aprobar/i })).toBeNull();
  });

  it("«esperando feedback» dice qué autorizó a escribir, sin afirmar que lo escribió: la verdad la tiene Revisión", () => {
    render(
      <Kanban
        cola={{
          lista: [
            tarea({
              estado: "requiere-atencion",
              motivo: "hallazgo del juez",
              sesion: "s1",
              autorizadas: ["src/app.xne", "src/Login.xne"],
            }),
          ],
          concurrencia: 2,
          corriendoAqui: true,
        }}
      />
    );
    expect(screen.getByText(/autorizó/i)).toBeTruthy();
    expect(screen.getByText("src/app.xne")).toBeTruthy();
    expect(screen.getByText("src/Login.xne")).toBeTruthy();
    // Nunca afirma que lo ESCRIBIÓ: eso solo lo sabe Revisión.
    expect(screen.queryByText(/escribió/i)).toBeNull();
  });

  it("«esperando feedback» sin ninguna autorizada lo dice, distinto de no constar nada", () => {
    render(
      <Kanban
        cola={{
          lista: [tarea({ estado: "requiere-atencion", motivo: "hallazgo del juez", sesion: "s1", autorizadas: [] })],
          concurrencia: 2,
          corriendoAqui: true,
        }}
      />
    );
    expect(screen.getByText(/no autorizó ninguna/i)).toBeTruthy();
  });

  it("«esperando feedback» lleva un enlace a su Revisión, que la abre", () => {
    const abrirRevision = vi.fn();
    render(
      <Kanban
        cola={{
          lista: [tarea({ estado: "requiere-atencion", motivo: "hallazgo del juez", sesion: "s1" })],
          concurrencia: 2,
          corriendoAqui: true,
        }}
        alAbrirRevision={abrirRevision}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /revisión/i }));
    expect(abrirRevision).toHaveBeenCalledWith("p1", "s1");
  });

  /**
   * Una tarea `nuevo` del proyecto que tienes abierto no arranca: «gana la persona»
   * (`core/tareas.ts#siguientesAEjecutar`, `bloqueados`). Sin decirlo se queda quieta en la
   * primera columna sin que nada lo explique — se lee como un cuelgue.
   */
  it("una «nuevo» del proyecto que tienes abierto lo dice: no arranca mientras siga abierto", () => {
    render(
      <Kanban
        cola={{ lista: [tarea({ proyecto: "p1" })], concurrencia: 2, corriendoAqui: true }}
        proyectoActivo="p1"
      />
    );
    expect(screen.getByText(/cierre el proyecto/i)).toBeTruthy();
  });

  it("no lo dice de OTRO proyecto: ese no es el que la bloquea", () => {
    render(
      <Kanban
        cola={{ lista: [tarea({ proyecto: "p1" })], concurrencia: 2, corriendoAqui: true }}
        proyectoActivo="p2"
      />
    );
    expect(screen.queryByText(/cierre el proyecto/i)).toBeNull();
  });

  it("no lo dice si este kanban no ejecuta: el aviso global ya cubre por qué nada avanza", () => {
    render(
      <Kanban
        cola={{ lista: [tarea({ proyecto: "p1" })], concurrencia: 2, corriendoAqui: false }}
        proyectoActivo="p1"
      />
    );
    expect(screen.queryByText(/cierre el proyecto/i)).toBeNull();
  });

  it("no lo dice de una que ya está en proceso o terminada: eso ya no espera nada", () => {
    render(
      <Kanban
        cola={{
          lista: [
            tarea({ id: "a", proyecto: "p1", estado: "en-proceso", empezada: "2026-09-08T10:00:00.000Z" }),
            tarea({ id: "b", proyecto: "p1", estado: "terminada" }),
          ],
          concurrencia: 2,
          corriendoAqui: true,
        }}
        proyectoActivo="p1"
      />
    );
    expect(screen.queryByText(/cierre el proyecto/i)).toBeNull();
  });

  it("«esperando feedback» dice el camino para añadir feedback, sin pintar un botón que no existe todavía", () => {
    render(
      <Kanban
        cola={{
          lista: [tarea({ estado: "requiere-atencion", motivo: "hallazgo del juez", sesion: "s1" })],
          concurrencia: 2,
          corriendoAqui: true,
        }}
      />
    );
    expect(screen.getByText(/editando la tarea/i)).toBeTruthy();
  });
});
