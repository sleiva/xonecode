import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TareasDelProyecto } from "./TareasDelProyecto.js";
import type { TareaDelCable } from "../tipos.js";

afterEach(cleanup);

const tarea = (extra: Partial<TareaDelCable> = {}): TareaDelCable => ({
  id: "t1", proyecto: "p1", proyectoNombre: "AppDemo", titulo: "Arregla el login",
  peticion: "p", encargo: "e", adjuntos: [], estado: "nuevo",
  creada: "2026-09-08T10:00:00.000Z", ...extra,
});

describe("TareasDelProyecto", () => {
  it("enseña el estado y, cuando lo hay, el motivo", () => {
    render(<TareasDelProyecto tareas={[tarea({ estado: "requiere-atencion", motivo: "sin aprobar src/app.xne" })]} />);
    // El brief dictaba «/requiere atención/i», pero `Kanban.tsx` (§0 del diseño, ya en
    // producción) rotula la MISMA columna «Esperando feedback» y lo dice explícito: «el
    // identificador del enum no se toca... lo que dice la interfaz sí es lo que el usuario
    // pidió». Dos etiquetas para el mismo estado en dos pestañas de la misma app sería la
    // misma mentira que un color repetido a mano: se alinea con lo que ya existe.
    expect(screen.getByText(/esperando feedback/i)).toBeTruthy();
    expect(screen.getByText(/sin aprobar src\/app\.xne/)).toBeTruthy();
  });

  /**
   * F1 de la revisión final, y en esta vista por el mismo motivo que en el kanban: las
   * tres «Terminada» se pintaban igual. La pieza es la misma (`EntregaDeTarea`) para que las
   * dos vistas no puedan afirmar cosas distintas de la misma tarea.
   */
  it("las tres formas de estar «Terminada» no se ven igual", () => {
    render(
      <TareasDelProyecto
        tareas={[
          tarea({ id: "a", estado: "terminada", veredicto: { veredicto: "verde", resumen: "hace lo que se pedía" } }),
          tarea({
            id: "b",
            estado: "terminada",
            veredicto: { veredicto: "verde", resumen: "hace lo que se pedía", salvedad: "no cambió ningún fichero" },
          }),
          tarea({ id: "c", estado: "terminada", terminadaAMano: true }),
        ]}
      />
    );
    expect(screen.getAllByText(/El juez de QA la aprobó/)).toHaveLength(2);
    expect(screen.getByText(/una condición menos/i)).toBeTruthy();
    expect(screen.getByText(/La dio por buena una persona/)).toBeTruthy();
  });

  /**
   * F4 de la revisión final, y esta pestaña es donde más falta hace: aquí vive «Nueva
   * tarea», así que es donde se CREA la tarea que se va a quedar quieta. El aviso va antes
   * de crearla, no después de mirarla parada.
   */
  it("si las ejecuta otro proceso lo dice, y dice que una tarea creada aquí se queda quieta", () => {
    render(
      <TareasDelProyecto
        tareas={[tarea()]}
        corriendoAqui={false}
        ejecutaOtroProceso={true}
        alNuevaTarea={() => {}}
      />
    );
    expect(screen.getByText(/otro proceso/i)).toBeTruthy();
    expect(screen.getByText(/no se le avisa|nadie le avisa/i)).toBeTruthy();
  });

  it("y si NADIE las ejecuta no manda a esperar a un proceso que no existe", () => {
    render(
      <TareasDelProyecto
        tareas={[tarea()]}
        corriendoAqui={false}
        ejecutaOtroProceso={false}
        alNuevaTarea={() => {}}
      />
    );
    expect(screen.getByText(/no las ejecuta nadie/i)).toBeTruthy();
    expect(screen.queryByText(/vuelva a mirar|verlas moverse/i)).toBeNull();
    expect(screen.getByText(/reinicia/i)).toBeTruthy();
  });

  it("y no lo dice cuando SÍ las ejecuta este proceso, ni cuando no se sabe todavía", () => {
    const { unmount } = render(<TareasDelProyecto tareas={[tarea()]} corriendoAqui={true} />);
    expect(screen.queryByText(/otro proceso/i)).toBeNull();
    unmount();
    // Ausente = la cola no ha llegado con esa respuesta: no se afirma ni una cosa ni la
    // otra, que es la regla de siempre con lo que no se ha medido.
    render(<TareasDelProyecto tareas={[tarea()]} />);
    expect(screen.queryByText(/otro proceso/i)).toBeNull();
  });

  it("reintentar está en las aparcadas, y no en las que corren", () => {
    const alReintentar = vi.fn();
    const { unmount } = render(
      <TareasDelProyecto tareas={[tarea({ estado: "requiere-atencion", motivo: "x" })]} alReintentar={alReintentar} />
    );
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(alReintentar).toHaveBeenCalledWith("t1");
    unmount();
    render(<TareasDelProyecto tareas={[tarea({ estado: "en-proceso" })]} alReintentar={alReintentar} />);
    expect(screen.queryByRole("button", { name: /reintentar/i })).toBeNull();
  });

  it("descartar CONFIRMA antes de borrar: es irreversible", () => {
    // La misma regla que borrar una sesión: eliminar al primer clic en una fila es cómo se
    // pierde el trabajo de una tarde.
    const alDescartar = vi.fn();
    render(<TareasDelProyecto tareas={[tarea()]} alDescartar={alDescartar} />);
    fireEvent.click(screen.getByRole("button", { name: /descartar/i }));
    expect(alDescartar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /sí, descartar/i }));
    expect(alDescartar).toHaveBeenCalledWith("t1");
  });

  /**
   * Task 13: antes esta lista no tenía forma de mandar feedback — eso era solo del kanban,
   * así que una tarea aparcada solo se podía atender desde el escritorio. Ahora las cuatro
   * acciones viven en `AccionesDeTarea`, y esta vista la monta igual que el kanban.
   */
  it("también ofrece feedback en una aparcada, no solo reintentar/terminar/descartar", () => {
    const alEnviarFeedback = vi.fn();
    render(
      <TareasDelProyecto
        tareas={[tarea({ estado: "requiere-atencion", motivo: "¿lleva histórico?" })]}
        alEnviarFeedback={alEnviarFeedback}
      />
    );
    const campo = screen.getByRole("textbox", { name: /tu feedback/i });
    fireEvent.change(campo, { target: { value: "sí" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar feedback/i }));
    expect(alEnviarFeedback).toHaveBeenCalledWith("t1", "sí");
  });

  it("descartar YA NO mira el estado: también se ofrece en-proceso, a propósito", () => {
    // `web/servidor/arranque.ts#atenderAccionDeTarea`: «Descartar BORRA y no comprueba el
    // estado... ni siquiera si está en-proceso». Restringirlo aquí era una regla que esta
    // pantalla se inventaba y el servidor nunca aplicó.
    render(<TareasDelProyecto tareas={[tarea({ estado: "en-proceso" })]} alDescartar={vi.fn()} />);
    expect(screen.getByRole("button", { name: /descartar/i })).toBeTruthy();
  });

  it("sin cable, reintentar se apaga y se dice por qué", () => {
    render(
      <TareasDelProyecto
        tareas={[tarea({ estado: "requiere-atencion", motivo: "x" })]}
        alReintentar={vi.fn()}
        conectado={false}
      />
    );
    expect(screen.getByRole("button", { name: /reintentar/i })).toHaveProperty("disabled", true);
    expect(screen.getByText(/sin conexión/i)).toBeTruthy();
  });

  /**
   * Task 15: esta pestaña ya no depende de si hay tareas (`Pestanas.tsx`), así que ahora
   * tiene que valer también para el caso vacío — y para el caso en que la cola ni siquiera
   * ha llegado del servidor, que NO es lo mismo.
   */
  describe("ausente y vacío no son lo mismo", () => {
    it("sin `tareas` (ausente), dice que está consultando y NO afirma que no hay ninguna", () => {
      render(<TareasDelProyecto />);
      expect(screen.getByText(/consultando/i)).toBeTruthy();
      expect(screen.queryByText(/todavía no tiene ninguna/i)).toBeNull();
    });

    it("con `tareas={[]}` (vacío, ya medido), el estado vacío DICE cómo se crea una: no es un hueco", () => {
      render(<TareasDelProyecto tareas={[]} alNuevaTarea={vi.fn()} />);
      // Mutación obligatoria: quitar este texto tiene que tumbar el test. Un párrafo vacío,
      // o un `<div />` sin nada, no es un estado vacío que dice cómo se empieza.
      expect(screen.getByText(/todavía no tiene ninguna/i)).toBeTruthy();
      expect(screen.getByRole("button", { name: /nueva tarea/i })).toBeTruthy();
      expect(screen.queryByText(/consultando/i)).toBeNull();
    });
  });

  it("el botón «Nueva tarea» llama al manejador, con la lista vacía o llena", () => {
    const alNuevaTarea = vi.fn();
    const { unmount } = render(<TareasDelProyecto tareas={[]} alNuevaTarea={alNuevaTarea} />);
    fireEvent.click(screen.getByRole("button", { name: /nueva tarea/i }));
    expect(alNuevaTarea).toHaveBeenCalledTimes(1);
    unmount();

    render(<TareasDelProyecto tareas={[tarea()]} alNuevaTarea={alNuevaTarea} />);
    fireEvent.click(screen.getByRole("button", { name: /nueva tarea/i }));
    expect(alNuevaTarea).toHaveBeenCalledTimes(2);
  });

  it("sin manejador, «Nueva tarea» no se pinta: un control sin nada detrás no se ofrece", () => {
    render(<TareasDelProyecto tareas={[]} />);
    expect(screen.queryByRole("button", { name: /nueva tarea/i })).toBeNull();
  });

  /**
   * Vuelta del coordinador sobre esta misma tarea: un `title` en un botón deshabilitado NO
   * es «decirlo» — no hay hover en táctil, la mayoría de navegadores no lo enseña de forma
   * fiable, y un lector de pantalla puede no anunciarlo. El motivo tiene que ser texto
   * VISIBLE junto al control, el mismo patrón que ya sigue `AccionesDeTarea` para cada fila
   * («Sin conexión: no se puede mandar nada hasta reconectar.») — reusado aquí y no
   * inventado de nuevo.
   */
  it("sin cable, «Nueva tarea» se apaga y lo DICE en texto visible — no en un `title`", () => {
    render(<TareasDelProyecto tareas={[]} alNuevaTarea={vi.fn()} conectado={false} />);
    const boton = screen.getByRole("button", { name: /nueva tarea/i });
    expect(boton).toHaveProperty("disabled", true);
    // El motivo se LEE en la pantalla, no solo en un atributo que el navegador puede callar.
    expect(screen.getByText(/sin conexión/i)).toBeTruthy();
    expect(boton.getAttribute("title")).toBeNull();
  });
});

/**
 * **«Ver lo que hace», en la lista del proyecto** (Task 17): la MISMA pieza que monta
 * `Kanban.tsx` — `MirarTarea` decide las tres condiciones (en-proceso, `corriendoAqui`,
 * cable vivo), así que estos tests son en gran parte un ESPEJO de los de `Kanban.test.tsx`:
 * si esta vista tuviera una segunda implementación en vez de importar la misma pieza,
 * cualquier divergencia se notaría aquí.
 */
describe("TareasDelProyecto: ver lo que hace una tarea en proceso", () => {
  const enProceso = tarea({ estado: "en-proceso", empezada: "2026-09-08T10:01:00.000Z" });

  it("se ofrece en una «en proceso» de este proceso, como un botón DE VERDAD, y avisa al pulsar", () => {
    const alMirar = vi.fn();
    render(
      <TareasDelProyecto
        tareas={[enProceso]}
        corriendoAqui
        alMirar={alMirar}
        alDejarDeMirar={() => {}}
      />
    );
    const boton = screen.getByRole("button", { name: /ver lo que hace/i });
    expect(boton.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(boton);
    expect(alMirar).toHaveBeenCalledWith("t1");
  });

  it("no se ofrece si el turno lo ejecuta otro proceso, ni sin cable", () => {
    const { rerender } = render(
      <TareasDelProyecto
        tareas={[enProceso]}
        corriendoAqui={false}
        alMirar={() => {}}
        alDejarDeMirar={() => {}}
      />
    );
    expect(screen.queryByRole("button", { name: /ver lo que hace/i })).toBeNull();
    rerender(
      <TareasDelProyecto
        tareas={[enProceso]}
        corriendoAqui
        conectado={false}
        alMirar={() => {}}
        alDejarDeMirar={() => {}}
      />
    );
    expect(screen.queryByRole("button", { name: /ver lo que hace/i })).toBeNull();
  });

  it("expandida, el transcript se lee DENTRO de la fila, con `aria-expanded`, y plegar desengancha", () => {
    const alDejarDeMirar = vi.fn();
    render(
      <TareasDelProyecto
        tareas={[enProceso]}
        corriendoAqui
        alMirar={() => {}}
        alDejarDeMirar={alDejarDeMirar}
        mirando="t1"
        mirada={{ tarea: "t1", actos: [{ tipo: "asistente", texto: "voy con el campo" }] }}
      />
    );
    const linea = screen.getByText("voy con el campo");
    expect(linea.closest("li")).not.toBeNull();
    const boton = screen.getByRole("button", { name: /dejar de ver|ocultar/i });
    expect(boton.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(boton);
    expect(alDejarDeMirar).toHaveBeenCalledWith("t1");
  });

  it("expandida, se leen también el motivo, lo autorizado y el veredicto de ESA tarea", () => {
    render(
      <TareasDelProyecto
        tareas={[
          tarea({
            estado: "en-proceso",
            motivo: "el juez de QA dijo «rojo»: falta el manejador de error",
            autorizadas: ["app.xne"],
            veredicto: { veredicto: "rojo", resumen: "falta el manejador de error" },
          }),
        ]}
        corriendoAqui
        alMirar={() => {}}
        alDejarDeMirar={() => {}}
        mirando="t1"
      />
    );
    expect(screen.getByText(/falta el manejador de error/)).toBeTruthy();
    expect(screen.getByText("app.xne")).toBeTruthy();
  });
});
