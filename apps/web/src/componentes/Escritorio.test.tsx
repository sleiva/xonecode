import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Escritorio } from "./Escritorio.js";

const MANEJADORES = {
  alNuevaSesion: () => {},
  alAbrirSesion: () => {},
  alAbrirAjustes: () => {},
};

describe("Escritorio", () => {
  afterEach(cleanup);

  it("saluda con el nombre del servidor, y sin él saluda igual sin inventárselo", () => {
    const { rerender } = render(<Escritorio {...MANEJADORES} proyectos={[]} />);
    expect(screen.getByRole("heading", { name: "Hola" })).toBeTruthy();
    rerender(<Escritorio {...MANEJADORES} proyectos={[]} nombre="Sergio" />);
    expect(screen.getByRole("heading", { name: /hola, sergio/i })).toBeTruthy();
  });

  /**
   * Los dos vacíos NO son el mismo: sin entorno no hay a quién preguntarle por proyectos;
   * con entorno y sin proyectos, el que no tiene es él. Decir lo mismo en los dos casos
   * mandaría a Ajustes a quien ya lo tiene todo configurado.
   */
  it("distingue «no hay entorno» de «el entorno no tiene proyectos»", () => {
    const { rerender } = render(<Escritorio {...MANEJADORES} proyectos={[]} />);
    expect(screen.getByText(/ningún entorno registrado/i)).toBeTruthy();
    rerender(
      <Escritorio {...MANEJADORES} proyectos={[]} entorno={{ nombre: "Casa", url: "https://mcp.casa/mcp" }} />
    );
    expect(screen.getByText(/no ha devuelto ningún proyecto/i)).toBeTruthy();
  });

  it("cada proyecto dice si está en el equipo, y empezar viaja con SU id", () => {
    const alNuevaSesion = vi.fn();
    render(
      <Escritorio
        {...MANEJADORES}
        alNuevaSesion={alNuevaSesion}
        proyectos={[
          { id: "p1", nombre: "Tienda", local: true },
          { id: "p2", nombre: "Almacén" },
        ]}
      />
    );
    const tienda = screen.getByRole("heading", { name: "Tienda" }).closest("li")!;
    expect(tienda.textContent).toMatch(/en tu equipo/i);
    const almacen = screen.getByRole("heading", { name: "Almacén" }).closest("li")!;
    expect(almacen.textContent).toMatch(/sin descargar/i);

    fireEvent.click(within(almacen).getByRole("button", { name: /nueva sesión/i }));
    expect(alNuevaSesion).toHaveBeenCalledWith("p2");
  });

  it("las sesiones se pueden seguir desde aquí, las últimas primero", () => {
    const alAbrirSesion = vi.fn();
    render(
      <Escritorio
        {...MANEJADORES}
        alAbrirSesion={alAbrirSesion}
        proyectos={[
          {
            id: "p1",
            nombre: "Tienda",
            sesiones: [
              { id: "s1", titulo: "la primera" },
              { id: "s2", titulo: "la última" },
            ],
          },
        ]}
      />
    );
    const botones = screen.getAllByRole("button").map((b) => b.textContent);
    expect(botones.indexOf("la última")).toBeLessThan(botones.indexOf("la primera"));
    fireEvent.click(screen.getByRole("button", { name: "la última" }));
    expect(alAbrirSesion).toHaveBeenCalledWith("p1", "s2");
  });

  it("una tarjeta sin sesiones lo dice en vez de callar", () => {
    render(<Escritorio {...MANEJADORES} proyectos={[{ id: "p1", nombre: "Tienda" }]} />);
    expect(screen.getByText(/sin sesiones todavía/i)).toBeTruthy();
  });

  /**
   * El modelo se afirma solo si el servidor lo dice — la misma regla que la pastilla del
   * compositor: sin sesión abierta no hay modelo en vigor que anunciar.
   */
  it("el modelo se dice si se sabe, y si no, no se inventa", () => {
    const { rerender } = render(<Escritorio {...MANEJADORES} proyectos={[]} />);
    expect(screen.queryByText(/trabajará con/i)).toBeNull();
    rerender(<Escritorio {...MANEJADORES} proyectos={[]} modelo="ollama/qwen3" />);
    expect(screen.getByText(/ollama\/qwen3/)).toBeTruthy();
  });

  /**
   * Nada del mockup que no tenga dato detrás: el panel de dispositivos, «Build & Run» y el
   * estado del ADB son un puente con el móvil que este producto todavía no cablea.
   */
  it("no pinta dispositivos ni «Build & Run»: no hay nada detrás", () => {
    render(<Escritorio {...MANEJADORES} proyectos={[{ id: "p1", nombre: "Tienda", local: true }]} />);
    expect(screen.queryByText(/build & run/i)).toBeNull();
    expect(screen.queryByText(/adb/i)).toBeNull();
    expect(screen.queryByText(/dispositivos conectados/i)).toBeNull();
  });
});

describe("Escritorio: propios y compartidos", () => {
  afterEach(cleanup);

  it("la tarjeta dice de quién es, con una palabra", () => {
    render(
      <Escritorio
        {...MANEJADORES}
        proyectos={[
          { id: "p1", nombre: "Mío", compartido: false },
          { id: "p2", nombre: "De otro", compartido: true },
        ]}
      />
    );
    expect(screen.getByText("propio")).toBeTruthy();
    expect(screen.getByText("compartido")).toBeTruthy();
  });

  /**
   * «De quién es» y «si está bajado» son dos preguntas distintas y las dos tienen su sitio:
   * fundirlas —o que una tapara a la otra— dejaría sin respuesta la que no se pintara.
   */
  it("no se come la marca de copia local: son dos datos distintos", () => {
    render(
      <Escritorio {...MANEJADORES} proyectos={[{ id: "p1", nombre: "De otro", compartido: true, local: true }]} />
    );
    expect(screen.getByText("compartido")).toBeTruthy();
    expect(screen.getByText("en tu equipo")).toBeTruthy();
  });

  /** Ausente es «no lo sé»: ni «propio» ni «compartido». Ver `Barra.comportamiento.test.tsx`. */
  it("sin el dato no se pinta ninguna de las dos", () => {
    render(<Escritorio {...MANEJADORES} proyectos={[{ id: "p1", nombre: "Sin dato" }]} />);
    expect(screen.queryByText("propio")).toBeNull();
    expect(screen.queryByText("compartido")).toBeNull();
  });
});

describe("Escritorio: sin conexión", () => {
  afterEach(cleanup);

  it("apaga lo que manda algo al servidor: empezar y seguir una sesión", () => {
    // Medido sin servidor: los 18 «Nueva sesión» seguían negros y pulsables.
    render(
      <Escritorio
        {...MANEJADORES}
        conectado={false}
        entorno={{ nombre: "E", url: "https://e" }}
        proyectos={[{ id: "p1", nombre: "Tienda", local: true, sesiones: [{ id: "s1", titulo: "Hola" }] }]}
      />
    );
    expect(screen.getByRole("button", { name: /nueva sesión/i })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Hola" })).toHaveProperty("disabled", true);
    expect(document.querySelector("[data-sin-conexion]")).not.toBeNull();
  });

  it("conectado, nada de eso está apagado", () => {
    render(<Escritorio {...MANEJADORES} conectado proyectos={[{ id: "p1", nombre: "Tienda", local: true }]} />);
    expect(screen.getByRole("button", { name: /nueva sesión/i })).toHaveProperty("disabled", false);
  });
});

describe("Escritorio: solo los proyectos elegidos, y el resto contado", () => {
  afterEach(cleanup);

  it("sin elección, los mismos que la barra: los demás NO se pintan, se cuentan", () => {
    const seis = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, nombre: `Proyecto ${i}` }));
    render(<Escritorio {...MANEJADORES} proyectos={seis} />);
    const elegidos = screen.getByRole("region", { name: /proyectos elegidos/ });
    expect(within(elegidos).getAllByRole("button", { name: /nueva sesión/i })).toHaveLength(4);
    // Los dos de más no tienen tarjeta: pintarlos deshacía la elección.
    expect(screen.queryByRole("heading", { name: "Proyecto 5" })).toBeNull();
    // Pero se dicen, con el camino para elegirlos: callarlos haría creer que no existen.
    expect(screen.getByText(/Otros 2 proyectos del entorno/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /elígelos en ajustes/i })).toBeTruthy();
  });

  it("una elección manda: se pinta lo elegido y nada más, aunque no sea lo primero", () => {
    const tres = [{ id: "a", nombre: "A" }, { id: "b", nombre: "B" }, { id: "c", nombre: "C" }];
    render(<Escritorio {...MANEJADORES} proyectos={tres} visibles={["c"]} />);
    const elegidos = screen.getByRole("region", { name: /proyectos elegidos/ });
    expect(within(elegidos).getByRole("heading", { name: "C" })).toBeTruthy();
    expect(within(elegidos).queryByRole("heading", { name: "A" })).toBeNull();
    expect(screen.getByText(/Otros 2 proyectos del entorno/)).toBeTruthy();
  });

  it("elegir NINGUNO se respeta: ni una tarjeta, y la cuenta lo dice", () => {
    // `[]` es «ninguno» y no «no lo he dicho»: la distinción se conserva en las cuatro
    // capas, y colapsarla aquí haría que elegir ninguno se leyera como no haber elegido.
    const tres = [{ id: "a", nombre: "A" }, { id: "b", nombre: "B" }, { id: "c", nombre: "C" }];
    render(<Escritorio {...MANEJADORES} proyectos={tres} visibles={[]} />);
    expect(screen.queryByRole("button", { name: /nueva sesión/i })).toBeNull();
    expect(screen.getByText(/Otros 3 proyectos del entorno/)).toBeTruthy();
  });

  it("con todo elegido no se cuenta nada: no hay resto del que hablar", () => {
    const dos = [{ id: "a", nombre: "A" }, { id: "b", nombre: "B" }];
    render(<Escritorio {...MANEJADORES} proyectos={dos} visibles={["a", "b"]} />);
    expect(screen.queryByText(/del entorno/)).toBeNull();
  });
});

describe("Escritorio: el kanban de tareas", () => {
  afterEach(cleanup);

  it("sin `tareas` no se afirma que no hay ninguna: se dice que no ha llegado", () => {
    render(<Escritorio {...MANEJADORES} proyectos={[]} />);
    expect(screen.getByText(/todavía no ha llegado la cola de tareas/i)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /^Nuevo/ })).toBeNull();
  });

  it("con `tareas`, el kanban se pinta con sus cuatro columnas", () => {
    render(
      <Escritorio
        {...MANEJADORES}
        proyectos={[]}
        tareas={{
          concurrencia: 2,
          corriendoAqui: true,
          lista: [
            {
              id: "t1",
              proyecto: "p1",
              proyectoNombre: "AppDemo",
              titulo: "Arregla el login",
              peticion: "Arregla el login",
              encargo: "Arregla el login",
              adjuntos: [],
              estado: "nuevo",
              creada: "2026-09-08T10:00:00.000Z",
            },
          ],
        }}
      />
    );
    expect(screen.getByRole("heading", { name: /^Nuevo/ })).toBeTruthy();
    expect(screen.getByText("Arregla el login")).toBeTruthy();
  });

  it("pulsar una tarea con sesión llama a `alAbrirSesionDeTarea`", () => {
    const alAbrirSesionDeTarea = vi.fn();
    render(
      <Escritorio
        {...MANEJADORES}
        proyectos={[]}
        alAbrirSesionDeTarea={alAbrirSesionDeTarea}
        tareas={{
          concurrencia: 2,
          corriendoAqui: true,
          lista: [
            {
              id: "t1",
              proyecto: "p1",
              proyectoNombre: "AppDemo",
              titulo: "Arregla el login",
              peticion: "Arregla el login",
              encargo: "Arregla el login",
              adjuntos: [],
              estado: "nuevo",
              sesion: "s1",
              creada: "2026-09-08T10:00:00.000Z",
            },
          ],
        }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Arregla el login/ }));
    expect(alAbrirSesionDeTarea).toHaveBeenCalledWith("p1", "s1");
  });

  it("reenvía `alEnviarFeedback` al kanban tal cual: es el mismo campo, no una copia", () => {
    const alEnviarFeedback = vi.fn();
    render(
      <Escritorio
        {...MANEJADORES}
        proyectos={[]}
        alEnviarFeedback={alEnviarFeedback}
        tareas={{
          concurrencia: 2,
          corriendoAqui: true,
          lista: [
            {
              id: "t1",
              proyecto: "p1",
              proyectoNombre: "AppDemo",
              titulo: "Arregla el login",
              peticion: "Arregla el login",
              encargo: "Arregla el login",
              adjuntos: [],
              estado: "requiere-atencion",
              motivo: "el juez marcó el trabajo en rojo",
              sesion: "s1",
              creada: "2026-09-08T10:00:00.000Z",
            },
          ],
        }}
      />
    );
    fireEvent.change(screen.getByRole("textbox", { name: /tu feedback/i }), { target: { value: "sí, con histórico" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar feedback/i }));
    expect(alEnviarFeedback).toHaveBeenCalledWith("t1", "sí, con histórico");
  });

  /**
   * «Nueva tarea» vive en la tarjeta del proyecto, junto a «Nueva sesión», porque son la
   * misma clase de decisión sobre el mismo objeto: qué hacer con ESTE proyecto. El kanban de
   * abajo dice «se crean desde un proyecto» y esto es lo que lo hace verdad — sin este botón
   * la única puerta sería la pestaña de tareas del proyecto, que solo existe si ya hay
   * alguna: no habría forma de crear la primera.
   */
  it("cada proyecto ofrece «Nueva tarea», y dice de cuál", () => {
    const alNuevaTarea = vi.fn();
    render(
      <Escritorio
        proyectos={[{ id: "p1", nombre: "AppDemo", local: true }]}
        alAbrirSesion={() => {}}
        alNuevaSesion={() => {}}
        alNuevaTarea={alNuevaTarea}
        alAbrirAjustes={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /nueva tarea/i }));
    expect(alNuevaTarea).toHaveBeenCalledWith("p1");
  });

  it("sin manejador no se pinta: un control sin nada detrás no se ofrece", () => {
    render(
      <Escritorio
        proyectos={[{ id: "p1", nombre: "AppDemo", local: true }]}
        alAbrirSesion={() => {}}
        alNuevaSesion={() => {}}
        alAbrirAjustes={() => {}}
      />
    );
    expect(screen.queryByRole("button", { name: /nueva tarea/i })).toBeNull();
  });

  it("y sin cable se apaga, como «Nueva sesión»: crear una tarea manda algo al servidor", () => {
    render(
      <Escritorio
        proyectos={[{ id: "p1", nombre: "AppDemo", local: true }]}
        alAbrirSesion={() => {}}
        alNuevaSesion={() => {}}
        alNuevaTarea={() => {}}
        alAbrirAjustes={() => {}}
        conectado={false}
      />
    );
    expect((screen.getByRole("button", { name: /nueva tarea/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
