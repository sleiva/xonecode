import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { tiempoQueLleva, TareasDelProyecto } from "./TareasDelProyecto.js";
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
    // Cada fila dice CÓMO acabó con su punto (y su nombre accesible): dos limpias y una a mano.
    expect(screen.getAllByLabelText("Limpia")).toHaveLength(2);
    expect(screen.getByLabelText("Cerrada a mano")).toBeTruthy();
    expect(screen.getByText(/La dio por buena una persona/)).toBeTruthy();
    // Y la salvedad se lee al desplegar la suya.
    const filas = screen.getAllByRole("button", { expanded: false }).filter((b) => b.textContent?.includes("hace lo que se pedía"));
    fireEvent.click(filas[1]!);
    expect(screen.getByText(/una condición menos/i)).toBeTruthy();
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

    /** La fila de una finalizada es UN botón que la despliega; su nombre empieza por cómo acabó y su título. */
    const filaDe = (titulo: string): HTMLElement =>
      screen.getAllByRole("button").find((b) => b.getAttribute("aria-expanded") !== null && b.textContent?.includes(titulo))!;

    it("las finalizadas van la más reciente arriba, en UNA línea, y desplegadas abren su conversación para LEER", () => {
      const leidas: string[] = [];
      render(<TareasDelProyecto tareas={cola()} alReintentar={() => {}} alLeerFinalizada={(t) => leidas.push(t.id)} />);
      fireEvent.click(screen.getByRole("tab", { name: /Finalizadas/ }));
      const filas = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
      expect(filas.findIndex((t) => t.includes("La de hoy"))).toBe(0);
      expect(filas.findIndex((t) => t.includes("La de ayer"))).toBe(1);
      expect(screen.queryByRole("button", { name: /Descartar|Reintentar/ })).toBeNull();
      // «empieza → acaba», nunca un «tardó» que contaría también la pausa.
      expect(filaDe("La de ayer").textContent).toMatch(/→/);
      expect(screen.queryByText(/tardó/)).toBeNull();
      // Plegada no hay botones de acción: se despliega la fila.
      expect(screen.queryByRole("button", { name: "Conversación y artefactos" })).toBeNull();
      fireEvent.click(filaDe("La de hoy"));
      fireEvent.click(screen.getByRole("button", { name: "Conversación y artefactos" }));
      expect(leidas).toEqual(["nueva"]);
      // La que no guardó conversación lo dice, en vez de un botón que no abre nada.
      fireEvent.click(filaDe("Sin conversación"));
      expect(screen.getByText("Sin conversación guardada")).toBeTruthy();
    });

    it("«Qué hizo» se pide al desplegar la fila, y una sola vez", async () => {
      const pedida = vi.fn(async () => ({ texto: "Añadí la versión al Login." }));
      render(<TareasDelProyecto tareas={cola()} alPedirUltimaRespuesta={pedida} />);
      fireEvent.click(screen.getByRole("tab", { name: /Finalizadas/ }));
      expect(pedida).not.toHaveBeenCalled();
      const fila = filaDe("La de hoy");
      fireEvent.click(fila);
      expect(fila.getAttribute("aria-expanded")).toBe("true");
      expect(await screen.findByText("Añadí la versión al Login.")).toBeTruthy();
      // Plegada se desmonta, y volver a abrirla no lo pide otra vez.
      fireEvent.click(fila);
      expect(screen.queryByText("Añadí la versión al Login.")).toBeNull();
      fireEvent.click(fila);
      expect(screen.getByText("Añadí la versión al Login.")).toBeTruthy();
      expect(pedida).toHaveBeenCalledTimes(1);
    });

    it("lo CRÍTICO de su cierre va arriba al desplegar, y su punto lo dice plegada", () => {
      render(
        <TareasDelProyecto
          tareas={[tarea({ id: "x", titulo: "Menú", estado: "terminada", cierre: { criticos: ["pantalla: falta «Turno de Día»"], observaciones: ["el juez de QA dijo «rojo»"] } })]}
        />
      );
      fireEvent.click(screen.getByRole("tab", { name: /Finalizadas/ }));
      expect(screen.getByLabelText("Con críticos")).toBeTruthy();
      expect(filaDe("Menú").textContent).toContain("1 crítico");
      fireEvent.click(filaDe("Menú"));
      expect(screen.getByText("## CRITICAL")).toBeTruthy();
      // Las acciones van ARRIBA: la barra antes que lo crítico.
      const barra = screen.getByRole("toolbar", { name: "Acciones de la tarea" });
      expect(barra.compareDocumentPosition(screen.getByRole("region", { name: "Crítico" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // Dos veces: la frase de la fila plegada (entera: antes se cortaba en «pantalla:») y la lista de ## CRITICAL.
      expect(screen.getAllByText("pantalla: falta «Turno de Día»")).toHaveLength(2);
      expect(screen.getByText("el juez de QA dijo «rojo»")).toBeTruthy();
    });

    /** Petición suya (21-10-2026): una tarea en marcha dice cuánto lleva y cuánto gasta; sin gasto que conste, solo el tiempo. */
    it("en marcha dice cuánto LLEVA y lo que va gastando", () => {
      const empezada = new Date(Date.now() - 125_000).toISOString();
      const gastoEnCurso = { modelo: { entrada: 1_500_000, salida: 60_000, cache: 1_300_000 }, externo: { entrada: 0, salida: 0, cache: 0 } };
      render(<TareasDelProyecto tareas={[tarea({ id: "x", titulo: "Menú", estado: "en-proceso", empezada, gastoEnCurso }), tarea({ id: "y", titulo: "Login", estado: "en-proceso", empezada })]} />);
      // En cifras grandes (su lienzo): lleva, tokens y caché; sin gasto que conste, solo el tiempo.
      expect(screen.getByLabelText(/^Lleva 2 min 0[5-9] s · 260k tokens · 1,3M de caché$/).textContent).toMatch(/^lleva2 min 0[5-9] stokens260kde caché1,3M$/);
      expect(screen.getByLabelText(/^Lleva 2 min 0[5-9] s$/)).toBeTruthy();
    });

    /** Petición suya (21-10-2026): la cola se reordena; la que trabaja va aparte y no se mueve. */
    it("en tres grupos, y la cola se reordena con las flechas mandando TODA la cola en el orden nuevo", async () => {
      const alOrdenar = vi.fn(() => Promise.resolve(undefined as string | undefined));
      render(
        <TareasDelProyecto
          tareas={[
            tarea({ id: "r", titulo: "Trabajando", estado: "en-proceso" }),
            tarea({ id: "a", titulo: "Primera" }),
            tarea({ id: "b", titulo: "Segunda" }),
            tarea({ id: "c", titulo: "Tercera" }),
          ]}
          alOrdenar={alOrdenar}
        />
      );
      const cola = screen.getByRole("list", { name: "En cola" });
      expect(within(cola).queryByText("Trabajando")).toBeNull();
      expect(within(screen.getByRole("list", { name: "Trabajando ahora" })).getByText("Trabajando")).toBeTruthy();
      expect(screen.getByText("En cola · 3")).toBeTruthy();
      // La primera no sube y la última no baja.
      const subir = within(cola).getAllByRole("button", { name: "Subir en la cola" });
      expect((subir[0] as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(subir[2]!);
      await act(async () => {});
      expect(alOrdenar).toHaveBeenCalledWith(["a", "c", "b"]);
    });

    it("arrastrar y soltar sobre otra la pone en su sitio; y una negativa del servidor se dice", async () => {
      const alOrdenar = vi.fn(() => Promise.resolve("la cola ha cambiado" as string | undefined));
      render(<TareasDelProyecto tareas={[tarea({ id: "a", titulo: "Primera" }), tarea({ id: "b", titulo: "Segunda" })]} alOrdenar={alOrdenar} />);
      const [primera, segunda] = within(screen.getByRole("list", { name: "En cola" })).getAllByRole("listitem");
      const datos = { effectAllowed: "", setData: () => {} };
      fireEvent.dragStart(segunda!, { dataTransfer: datos });
      fireEvent.dragOver(primera!, { dataTransfer: datos });
      fireEvent.drop(primera!, { dataTransfer: datos });
      await act(async () => {});
      expect(alOrdenar).toHaveBeenCalledWith(["b", "a"]);
      expect(screen.getByRole("alert").textContent).toBe("No se ha cambiado el orden: la cola ha cambiado");
    });

    it("con una sola en cola, o sin quien ordene, no hay asa ni flechas", () => {
      render(<TareasDelProyecto tareas={[tarea({ id: "a" }), tarea({ id: "b" })]} />);
      expect(screen.queryByRole("button", { name: "Subir en la cola" })).toBeNull();
    });

    /** Petición suya (21-10-2026): el resumen final de la tarea dice cuánto gastó. Sin gasto que conste, no se pinta nada. */
    it("al desplegarla dice cuánto GASTÓ, y sin gasto que conste no dice nada", () => {
      const gasto = { modelo: { entrada: 1_500_000, salida: 60_000, cache: 1_300_000 }, externo: { entrada: 0, salida: 0, cache: 0 } };
      render(<TareasDelProyecto tareas={[tarea({ id: "x", titulo: "Menú", estado: "terminada", gasto }), tarea({ id: "y", titulo: "Login", estado: "terminada" })]} />);
      fireEvent.click(screen.getByRole("tab", { name: /Finalizadas/ }));
      fireEvent.click(filaDe("Menú"));
      expect(screen.getByText("Gastó: 260k tokens · 1,3M de caché")).toBeTruthy();
      // Y en la línea PLEGADA, solo los tokens (petición suya: a la vista sin desplegar).
      expect(filaDe("Menú").textContent).toContain("260k tokens");
      expect(filaDe("Login").textContent).not.toContain("tokens");
      fireEvent.click(filaDe("Menú"));
      fireEvent.click(filaDe("Login"));
      expect(screen.queryByText(/^Gastó:/)).toBeNull();
    });

    /** Reencolar lo pendiente: solo si el SERVIDOR dice que se puede (`reencolable`), con su texto editable. */
    it("«Reencolar lo pendiente» manda el texto editado; si el servidor se niega lo dice y no se cierra", async () => {
      const reencolar = vi.fn(async (_id: string, _texto: string): Promise<string | undefined> => "esa tarea ya no está en el histórico");
      render(
        <TareasDelProyecto
          tareas={[
            tarea({ id: "x", titulo: "Menú", estado: "terminada", sesion: "s", reencolable: { texto: "## CRITICAL\n- falta la fila" } }),
            tarea({ id: "j", titulo: "Con ticket", estado: "terminada", sesion: "s2", acabada: "2026-10-01T10:00:00.000Z" }),
          ]}
          alReencolar={reencolar}
        />
      );
      fireEvent.click(screen.getByRole("tab", { name: /Finalizadas/ }));
      // Sin `reencolable` (p. ej. con ticket: se relanza desde el gestor) no se ofrece.
      fireEvent.click(filaDe("Con ticket"));
      expect(screen.queryByRole("button", { name: "Reencolar lo pendiente" })).toBeNull();
      fireEvent.click(filaDe("Menú"));
      fireEvent.click(screen.getByRole("button", { name: "Reencolar lo pendiente" }));
      // Un DIÁLOGO, con el título de la tarea (petición suya: en la fila no cabía).
      expect(screen.getByRole("dialog", { name: "Reencolar lo pendiente" }).textContent).toContain("«Menú»");
      const campo = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(campo.value).toBe("## CRITICAL\n- falta la fila");
      fireEvent.change(campo, { target: { value: "acaba la fila de totales" } });
      fireEvent.click(screen.getByRole("button", { name: "Encolar" }));
      expect(await screen.findByText(/No se encoló: esa tarea ya no está/)).toBeTruthy();
      expect(reencolar).toHaveBeenCalledWith("x", "acaba la fila de totales");
      // Y cuando sí, lo dice y dónde está.
      reencolar.mockResolvedValueOnce(undefined);
      fireEvent.click(screen.getByRole("button", { name: "Encolar" }));
      expect(await screen.findByText(/Encolada: la tienes en «En curso»/)).toBeTruthy();
    });

    it("al reencolar se puede PEGAR una captura: sube a su borrador, sin pisar las de la original, y viaja con el encolar", async () => {
      const subidos: [string, string][] = [];
      const descartados: string[] = [];
      const reencolar = vi.fn(async (_id: string, _texto: string, _borrador?: string): Promise<string | undefined> => undefined);
      const { unmount } = render(
        <TareasDelProyecto
          tareas={[tarea({ id: "x", titulo: "Menú", estado: "terminada", sesion: "s", adjuntos: [{ nombre: "pegado-1.png", bytes: 3 }], reencolable: { texto: "acaba" } })]}
          alReencolar={reencolar}
          adjuntosDelBorrador={{
            subir: async (b, nombre) => (subidos.push([b, nombre]), { ok: true }),
            descartar: (b) => void descartados.push(b),
          }}
        />
      );
      fireEvent.click(screen.getByRole("tab", { name: /Finalizadas/ }));
      fireEvent.click(filaDe("Menú"));
      fireEvent.click(screen.getByRole("button", { name: "Reencolar lo pendiente" }));
      expect(screen.getByRole("button", { name: "Adjuntar imagen…" })).toBeTruthy();
      const captura = new File([new Uint8Array([1])], "image.png", { type: "image/png" });
      fireEvent.paste(screen.getByRole("textbox"), { clipboardData: { files: [captura], types: ["Files"] } });
      // «pegado-1.png» ya es de la original: la nueva se llama de otra forma.
      await waitFor(() => expect(subidos.map(([, n]) => n)).toEqual(["pegado-2.png"]));
      fireEvent.click(screen.getByRole("button", { name: "Encolar" }));
      await waitFor(() => expect(reencolar).toHaveBeenCalledWith("x", "acaba", subidos[0]![0]));
      // Ya es una tarea: plegar no borra su carpeta.
      unmount();
      expect(descartados).toEqual([]);
    });

    it("cerrar el formulario con una captura subida y sin encolar BORRA su borrador", async () => {
      const subidos: string[] = [];
      const descartados: string[] = [];
      render(
        <TareasDelProyecto
          tareas={[tarea({ id: "x", titulo: "Menú", estado: "terminada", sesion: "s", reencolable: { texto: "acaba" } })]}
          alReencolar={async () => undefined}
          adjuntosDelBorrador={{ subir: async (b) => (subidos.push(b), { ok: true }), descartar: (b) => void descartados.push(b) }}
        />
      );
      fireEvent.click(screen.getByRole("tab", { name: /Finalizadas/ }));
      fireEvent.click(filaDe("Menú"));
      fireEvent.click(screen.getByRole("button", { name: "Reencolar lo pendiente" }));
      fireEvent.paste(screen.getByRole("textbox"), { clipboardData: { files: [new File([new Uint8Array([1])], "a.png", { type: "image/png" })], types: ["Files"] } });
      await waitFor(() => expect(subidos).toHaveLength(1));
      await waitFor(() => expect(screen.getByText("listo")).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      expect(descartados).toEqual(subidos);
    });

    /** Idea suya: las reencoladas como HIJAS de su tarea, tipo árbol (`arbolDeTareas.ts`). */
    it("una continuación sale justo debajo de su tarea, marcada como hija", () => {
      render(
        <TareasDelProyecto
          tareas={[
            tarea({ id: "menu", titulo: "Menú", estado: "terminada", acabada: "2026-10-19T09:00:00.000Z" }),
            tarea({ id: "otra", titulo: "Otra", estado: "terminada", acabada: "2026-10-19T10:00:00.000Z" }),
            tarea({ id: "menu-2", titulo: "Menú (continuación)", estado: "terminada", continuaDe: "menu", acabada: "2026-10-19T11:00:00.000Z" }),
          ]}
        />
      );
      fireEvent.click(screen.getByRole("tab", { name: /Finalizadas/ }));
      const filas = screen.getAllByRole("listitem");
      expect(filas.map((li) => li.textContent?.includes("(continuación)") ? "hija" : li.textContent?.includes("Menú") ? "menu" : "otra")).toEqual(["menu", "hija", "otra"]);
      expect(filas[1]!.getAttribute("data-profundidad")).toBe("1");
      expect(screen.getAllByLabelText("Continuación de la tarea de arriba")).toHaveLength(1);
    });

    /** Revertir (petición suya): solo la ÚLTIMA que cambió el proyecto, y lo decide el servidor al desplegarla. */
    it("«Revertir sus cambios» sale si el servidor dice que se puede, confirma con la lista de ficheros y lo hace", async () => {
      const hechas: string[] = [];
      render(
        <TareasDelProyecto
          tareas={[tarea({ id: "x", titulo: "Menú", estado: "terminada", sesion: "s" })]}
          revertir={{ preguntar: async () => ({ ficheros: ["MenuPrincipal.xne", "icons/x.svg"] }), hacer: async (id) => (hechas.push(id), "ya no es la última") }}
        />
      );
      fireEvent.click(screen.getByRole("tab", { name: /Finalizadas/ }));
      fireEvent.click(filaDe("Menú"));
      fireEvent.click(await screen.findByRole("button", { name: "Revertir sus cambios" }));
      const confirmacion = screen.getByRole("alertdialog", { name: "Revertir sus cambios" });
      expect(confirmacion.textContent).toContain("2 ficheros");
      expect(confirmacion.textContent).toContain("MenuPrincipal.xne");
      expect(confirmacion.textContent).toMatch(/CloudStudio/);
      expect(confirmacion.textContent).toMatch(/Su conversación se queda guardada/);
      fireEvent.click(screen.getByRole("button", { name: "Revertir" }));
      // Si el servidor se niega al confirmar (alguien escribió entre medias), se dice y no se cierra.
      expect(await screen.findByText(/No se revirtió: ya no es la última/)).toBeTruthy();
      expect(hechas).toEqual(["x"]);
    });

    it("una continuación con respaldo dice que su conversación también vuelve atrás", async () => {
      render(
        <TareasDelProyecto
          tareas={[tarea({ id: "x", titulo: "Menú (continuación)", estado: "terminada", sesion: "s" })]}
          revertir={{ preguntar: async () => ({ ficheros: ["a.css"], conversacion: true as const }), hacer: async () => undefined }}
        />
      );
      fireEvent.click(screen.getByRole("tab", { name: /Finalizadas/ }));
      fireEvent.click(filaDe("Menú (continuación)"));
      fireEvent.click(await screen.findByRole("button", { name: "Revertir sus cambios" }));
      expect(screen.getByRole("alertdialog", { name: "Revertir sus cambios" }).textContent).toMatch(/vuelve también a como estaba/);
    });

    it("si no se puede revertir (no es la última), no hay botón", async () => {
      const preguntar = vi.fn(async () => ({ motivo: "no es lo último que cambió el proyecto" }));
      render(<TareasDelProyecto tareas={[tarea({ id: "x", titulo: "Menú", estado: "terminada", sesion: "s" })]} revertir={{ preguntar, hacer: async () => undefined }} />);
      fireEvent.click(screen.getByRole("tab", { name: /Finalizadas/ }));
      fireEvent.click(filaDe("Menú"));
      await waitFor(() => expect(preguntar).toHaveBeenCalledWith("x"));
      expect(screen.queryByRole("button", { name: "Revertir sus cambios" })).toBeNull();
    });

    it("el encargo se despliega dentro, a petición", () => {
      render(<TareasDelProyecto tareas={[tarea({ id: "x", estado: "terminada", sesion: "s", encargo: "El encargo entero" })]} alPedirUltimaRespuesta={async () => ({})} />);
      fireEvent.click(screen.getByRole("tab", { name: /Finalizadas/ }));
      fireEvent.click(screen.getAllByRole("button").find((b) => b.getAttribute("aria-expanded") === "false")!);
      expect(screen.queryByText("El encargo entero")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Encargo" }));
      expect(screen.getByText("El encargo entero")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Encargo" }));
      expect(screen.queryByText("El encargo entero")).toBeNull();
    });

    it("la petición ORIGINAL va primero y el encargo ampliado después, cada uno con su rótulo", () => {
      render(
        <TareasDelProyecto
          tareas={[tarea({ id: "x", estado: "terminada", sesion: "s", peticion: "Rediseña el menú", encargo: "## Qué hay que conseguir\nTodo" })]}
          alPedirUltimaRespuesta={async () => ({})}
        />
      );
      fireEvent.click(screen.getByRole("tab", { name: /Finalizadas/ }));
      fireEvent.click(screen.getAllByRole("button").find((b) => b.getAttribute("aria-expanded") === "false")!);
      fireEvent.click(screen.getByRole("button", { name: "Encargo" }));
      const pedido = screen.getByRole("region", { name: "Lo que se pidió" });
      const ampliado = screen.getByRole("region", { name: "Encargo ampliado" });
      expect(pedido.textContent).toContain("Rediseña el menú");
      expect(ampliado.textContent).toContain("Qué hay que conseguir");
      // Renderizado como markdown: el `##` es un encabezado, no texto con almohadillas.
      expect(ampliado.textContent).not.toContain("##");
      expect(ampliado.querySelector("h2")?.textContent).toBe("Qué hay que conseguir");
      expect(pedido.compareDocumentPosition(ampliado) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("si la petición y el encargo son el mismo texto, va una sola vez y sin rótulos", () => {
      render(
        <TareasDelProyecto
          tareas={[tarea({ id: "x", estado: "terminada", sesion: "s", peticion: "Igual", encargo: "Igual" })]}
          alPedirUltimaRespuesta={async () => ({})}
        />
      );
      fireEvent.click(screen.getByRole("tab", { name: /Finalizadas/ }));
      fireEvent.click(screen.getAllByRole("button").find((b) => b.getAttribute("aria-expanded") === "false")!);
      fireEvent.click(screen.getByRole("button", { name: "Encargo" }));
      expect(screen.getAllByText("Igual")).toHaveLength(1);
      expect(screen.queryByText("Lo que se pidió")).toBeNull();
    });

    it("se ELIMINA del histórico, pidiendo confirmación antes", () => {
      const borradas: string[] = [];
      render(<TareasDelProyecto tareas={cola()} alDescartar={(id) => borradas.push(id)} />);
      fireEvent.click(screen.getByRole("tab", { name: /Finalizadas/ }));
      fireEvent.click(filaDe("La de ayer"));
      fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
      expect(borradas).toEqual([]);
      expect(screen.getByText(/Eliminarla del histórico/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
      expect(screen.queryByText(/Eliminarla del histórico/)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
      fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
      expect(borradas).toEqual(["vieja"]);
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

  it("«Mirar ahora» solo con el disparo encendido, y dice lo que vio", async () => {
    const { rerender } = render(<TareasDelProyecto tareas={[]} />);
    expect(screen.queryByRole("button", { name: "Mirar ahora" })).toBeNull();
    rerender(<TareasDelProyecto tareas={[]} alMirarGestor={async () => "lanzadas: MAS-3"} />);
    fireEvent.click(screen.getByRole("button", { name: "Mirar ahora" }));
    expect((await screen.findByRole("status")).textContent).toBe("lanzadas: MAS-3");
  });
});

describe("tiempoQueLleva", () => {
  it("segundos el primer minuto, minutos y segundos la primera hora, horas y minutos después", () => {
    expect(tiempoQueLleva(42_000)).toBe("42 s");
    expect(tiempoQueLleva(125_000)).toBe("2 min 05 s");
    expect(tiempoQueLleva(91 * 60_000 + 30_000)).toBe("1 h 31 min");
    expect(tiempoQueLleva(-5_000)).toBe("0 s");
  });
});
