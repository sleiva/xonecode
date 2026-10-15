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
  it("una tarea se abre para leer su encargo y sus adjuntos, plegados", () => {
    const { container } = render(
      <TareasDelProyecto
        tareas={[tarea({ encargo: "## Objetivo\nHaz la ventana", adjuntos: [{ nombre: "maqueta.png", bytes: 10 }] })]}
      />
    );
    const plegable = container.querySelector("details")!;
    expect(plegable.open).toBe(false);
    expect(plegable.querySelector("summary")!.textContent).toBe("Ver el encargo");
    // Plegado no está montado; al abrirlo, sí.
    expect(plegable.textContent).not.toContain("Haz la ventana");
    plegable.open = true;
    fireEvent(plegable, new Event("toggle"));
    expect(plegable.textContent).toContain("Adjuntos: maqueta.png");
    expect(plegable.textContent).toContain("Haz la ventana");
  });

  it("una aparcada cuya conversación tienes abierta en el chat lo dice, y si trabaja ahí, que la atiendes tú", () => {
    const aparcada = tarea({ estado: "requiere-atencion", motivo: "m", sesion: "s1" });
    const { rerender } = render(<TareasDelProyecto tareas={[aparcada]} sesionAbierta="s1" />);
    expect(screen.getByText(/Su conversación está abierta en tu chat/)).toBeTruthy();
    rerender(<TareasDelProyecto tareas={[aparcada]} sesionAbierta="s1" trabajandoEnElChat />);
    expect(screen.getByText(/La estás atendiendo tú en el chat/)).toBeTruthy();
    rerender(<TareasDelProyecto tareas={[aparcada]} sesionAbierta="otra" trabajandoEnElChat />);
    expect(screen.queryByText(/en el chat/)).toBeNull();
  });

  it("una tarea encadenada dice a quién espera mientras la anterior no termine", () => {
    const { rerender } = render(
      <TareasDelProyecto
        tareas={[
          tarea({ id: "a", titulo: "Ventana de entradas", estado: "en-proceso" }),
          tarea({ id: "b", titulo: "Ventana de salidas", tras: "a" }),
        ]}
      />
    );
    expect(screen.getByText("espera a: Ventana de entradas")).toBeTruthy();
    rerender(
      <TareasDelProyecto
        tareas={[
          tarea({ id: "a", titulo: "Ventana de entradas", estado: "terminada" }),
          tarea({ id: "b", titulo: "Ventana de salidas", tras: "a" }),
        ]}
      />
    );
    expect(screen.queryByText(/espera a:/)).toBeNull();
    // Si la anterior ya no está (descartada), no la retiene y no se dice nada.
    rerender(<TareasDelProyecto tareas={[tarea({ id: "b", titulo: "Ventana de salidas", tras: "a" })]} />);
    expect(screen.queryByText(/espera a:/)).toBeNull();
  });

  it("con chat al que ir, una en pausa no repite el campo de feedback: se escribe en el chat", () => {
    render(
      <TareasDelProyecto
        tareas={[tarea({ estado: "requiere-atencion", motivo: "¿la doy por buena?", sesion: "s1" })]}
        conectado
        alEnviarFeedback={vi.fn()}
        alContinuar={vi.fn(async () => undefined)}
        alIrAlChat={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Ir al chat para responder" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeTruthy();
    expect(screen.queryByLabelText("Tu feedback")).toBeNull();
    expect(screen.queryByText(/editando la tarea para añadir tu feedback/)).toBeNull();
  });

  it("enseña el estado y, cuando lo hay, el motivo", () => {
    render(<TareasDelProyecto tareas={[tarea({ estado: "requiere-atencion", motivo: "sin aprobar src/app.xne" })]} />);
    // «En pausa», como la columna del kanban (`Kanban.tsx`): dos etiquetas distintas para el mismo
    // estado en dos pestañas de la misma app sería la misma mentira que un color repetido a mano. Y
    // dice qué espera: tu respuesta.
    expect(screen.getByText(/en pausa · esperando tu respuesta/i)).toBeTruthy();
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
    // Las terminadas son el HISTÓRICO: viven en su pestaña.
    fireEvent.click(screen.getByRole("tab", { name: /Finalizadas/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /enviar y continuar/i }));
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

  /** El histórico: «En curso» es donde se actúa y «Finalizadas» donde se consulta lo que hizo cada una. */
  describe("las pestañas En curso y Finalizadas", () => {
    const cola = (): TareaDelCable[] => [
      tarea({ id: "viva", titulo: "La que trabaja", estado: "en-proceso" }),
      tarea({ id: "vieja", titulo: "La de ayer", estado: "terminada", sesion: "s-vieja", empezada: "2026-10-13T09:00:00.000Z", acabada: "2026-10-13T10:00:00.000Z" }),
      tarea({ id: "nueva", titulo: "La de hoy", estado: "terminada", sesion: "s-nueva", acabada: "2026-10-14T10:00:00.000Z" }),
      tarea({ id: "sin", titulo: "Sin conversación", estado: "terminada", acabada: "2026-10-12T10:00:00.000Z" }),
    ];

    it("separa las vivas de las terminadas, y cada pestaña dice cuántas tiene", () => {
      render(<TareasDelProyecto tareas={cola()} />);
      const curso = screen.getByRole("tab", { name: /En curso/ });
      expect(curso.getAttribute("aria-selected")).toBe("true");
      expect(curso.textContent).toContain("1");
      expect(screen.getByRole("tab", { name: /Finalizadas/ }).textContent).toContain("3");
      expect(screen.getByText("La que trabaja")).toBeTruthy();
      expect(screen.queryByText("La de hoy")).toBeNull();
    });

    it("las finalizadas van la más reciente arriba, sin acciones, y abren su conversación para LEER", () => {
      const leidas: string[] = [];
      render(<TareasDelProyecto tareas={cola()} alDescartar={() => {}} alReintentar={() => {}} alLeerFinalizada={(t) => leidas.push(t.id)} />);
      fireEvent.click(screen.getByRole("tab", { name: /Finalizadas/ }));
      const filas = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
      expect(filas.findIndex((t) => t.includes("La de hoy"))).toBe(0);
      expect(filas.findIndex((t) => t.includes("La de ayer"))).toBe(1);
      expect(screen.queryByRole("button", { name: /Descartar|Reintentar/ })).toBeNull();
      // «empezó … · acabó …», nunca un «tardó» que contaría también la pausa.
      expect(screen.getByText(/empezó .* · acabó /)).toBeTruthy();
      expect(screen.queryByText(/tardó/)).toBeNull();
      const botones = screen.getAllByRole("button", { name: "Conversación y artefactos" });
      expect(botones).toHaveLength(2);
      fireEvent.click(botones[0]!);
      expect(leidas).toEqual(["nueva"]);
      // La que no guardó conversación lo dice, en vez de un botón que no abre nada.
      expect(screen.getByText("Sin conversación guardada")).toBeTruthy();
    });

    it("«Qué hizo» pide la última respuesta al desplegar, y una sola vez", async () => {
      const pedida = vi.fn(async () => ({ texto: "Añadí la versión al Login." }));
      render(<TareasDelProyecto tareas={cola()} alPedirUltimaRespuesta={pedida} />);
      fireEvent.click(screen.getByRole("tab", { name: /Finalizadas/ }));
      expect(pedida).not.toHaveBeenCalled();
      const boton = screen.getAllByRole("button", { name: "Qué hizo" })[0]!;
      fireEvent.click(boton);
      expect(boton.getAttribute("aria-expanded")).toBe("true");
      expect(await screen.findByText("Añadí la versión al Login.")).toBeTruthy();
      // Plegado se desmonta, y volver a abrirlo no lo pide otra vez.
      fireEvent.click(boton);
      expect(screen.queryByText("Añadí la versión al Login.")).toBeNull();
      fireEvent.click(boton);
      expect(screen.getByText("Añadí la versión al Login.")).toBeTruthy();
      expect(pedida).toHaveBeenCalledTimes(1);
    });

    it("el encargo se despliega debajo, uno a la vez con «Qué hizo»", () => {
      render(<TareasDelProyecto tareas={[tarea({ id: "x", estado: "terminada", sesion: "s", encargo: "El encargo entero" })]} alPedirUltimaRespuesta={async () => ({})} />);
      fireEvent.click(screen.getByRole("tab", { name: /Finalizadas/ }));
      expect(screen.queryByText("El encargo entero")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Encargo" }));
      expect(screen.getByText("El encargo entero")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Qué hizo" }));
      expect(screen.queryByText("El encargo entero")).toBeNull();
    });

    it("sin ninguna terminada, «Finalizadas» lo dice con palabras", () => {
      render(<TareasDelProyecto tareas={[tarea({ estado: "nuevo" })]} />);
      fireEvent.click(screen.getByRole("tab", { name: /Finalizadas/ }));
      expect(screen.getByText(/Todavía no ha terminado ninguna tarea/)).toBeTruthy();
    });
  });

  it("una tarea que vive en el gestor lleva su clave con enlace, y el aviso si algo no se escribió allí", () => {
    render(
      <TareasDelProyecto
        tareas={[tarea({ id: "j", estado: "en-proceso", ticket: { clave: "KAN-7", conector: "jira", url: "https://x.atlassian.net/browse/KAN-7", aviso: "no se pudo pasar KAN-7 a EN CURSO: sin permiso" } })]}
      />
    );
    const enlace = screen.getByRole("link", { name: "KAN-7" });
    expect(enlace.getAttribute("href")).toBe("https://x.atlassian.net/browse/KAN-7");
    expect(screen.getByText(/no se pudo pasar KAN-7 a EN CURSO/)).toBeTruthy();
  });
});
