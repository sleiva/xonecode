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

  /**
   * F1 de la revisión final: las tres «Terminada» eran byte a byte la misma tarjeta. Lo que
   * las separa lo pinta `EntregaDeTarea`; aquí se comprueba que el kanban la MONTA — el
   * fallo de esta rama fue exactamente ese, una regla que existía y no estaba cableada.
   */
  it("las tres formas de estar «Terminada» no se ven igual", () => {
    render(
      <Kanban
        cola={{
          lista: [
            tarea({ id: "a", estado: "terminada", veredicto: { veredicto: "verde", resumen: "hace lo que se pedía" } }),
            tarea({
              id: "b",
              estado: "terminada",
              veredicto: {
                veredicto: "verde",
                resumen: "hace lo que se pedía",
                salvedad: "el turno no cambió ningún fichero",
              },
            }),
            tarea({ id: "c", estado: "terminada", terminadaAMano: true }),
          ],
          concurrencia: 2,
          corriendoAqui: true,
        }}
      />
    );
    expect(screen.getAllByText(/El juez de QA la aprobó/)).toHaveLength(2);
    expect(screen.getByText(/una condición menos/i)).toBeTruthy();
    expect(screen.getByText(/La dio por buena una persona/)).toBeTruthy();
  });

  /**
   * La tarjeta de «Esperando feedback» también monta la pieza: ahí los hallazgos del juez
   * son lo ACCIONABLE —lo que hay que contestar en el feedback— y el motivo solo da el qué.
   */
  it("la tarjeta aparcada enseña los hallazgos del juez, sin repetir el resumen del motivo", () => {
    render(
      <Kanban
        cola={{
          lista: [
            tarea({
              estado: "requiere-atencion",
              motivo: "el juez de QA dijo «rojo»: falta el campo de la fecha",
              veredicto: {
                veredicto: "rojo",
                resumen: "falta el campo de la fecha",
                hallazgos: ["Clientes.xne:14 no declara el campo"],
              },
            }),
          ],
          concurrencia: 2,
          corriendoAqui: true,
        }}
      />
    );
    expect(screen.getByText(/Clientes\.xne:14 no declara el campo/)).toBeTruthy();
    expect(screen.getAllByText(/falta el campo de la fecha/)).toHaveLength(1);
  });

  it("dice cuándo este kanban NO avanza", () => {
    // Se ve igual en dos ventanas y solo avanza en una: hay que decir en cuál.
    render(<Kanban cola={{ lista: [tarea()], concurrencia: 2, corriendoAqui: false }} />);
    expect(screen.getByText(/otro proceso|no avanza/i)).toBeTruthy();
  });

  /**
   * F4 de la revisión final: una tarea creada desde el proceso que NO tiene el cerrojo no
   * dispara nada en el que sí lo tiene —`revisar()` sale en `!miCerrojo` y no hay
   * temporizador—, así que se queda `nuevo` hasta que ESE proceso mire la cola por su
   * cuenta. Ningún texto lo cubría: «ábrelo desde el proceso que las corre para verlas
   * moverse» promete que allí se mueven, y una tarea recién creada no se mueve todavía.
   */
  it("y dice qué le pasa a una tarea creada desde aquí: se queda quieta hasta que el otro proceso mire", () => {
    render(
      <Kanban cola={{ lista: [tarea()], concurrencia: 2, corriendoAqui: false, ejecutaOtroProceso: true }} />
    );
    expect(screen.getByText(/no se le avisa|nadie le avisa/i)).toBeTruthy();
    expect(screen.getByText(/vuelva a mirar|mire la cola/i)).toBeTruthy();
  });

  /**
   * «No soy yo» y «no hay nadie» significan lo contrario: el primero manda a ESPERAR, el
   * segundo dice que no va a pasar nada. Mandar a esperar a un proceso que no existe es peor
   * que un aviso mudo.
   */
  it("si NADIE las ejecuta no manda a esperar a nadie: lo dice y dice qué hacer", () => {
    render(
      <Kanban cola={{ lista: [tarea()], concurrencia: 2, corriendoAqui: false, ejecutaOtroProceso: false }} />
    );
    expect(screen.getByText(/no las ejecuta nadie/i)).toBeTruthy();
    // Lo que NO puede decir es que otro proceso las mueva: no hay ninguno. Y sí dice qué
    // hacer, que es lo que distingue este caso del otro.
    expect(screen.queryByText(/vuelva a mirar|verlas moverse/i)).toBeNull();
    expect(screen.getByText(/reinicia/i)).toBeTruthy();
  });

  it("y si no se sabe, no se afirma ninguna de las dos", () => {
    render(<Kanban cola={{ lista: [tarea()], concurrencia: 2, corriendoAqui: false }} />);
    expect(screen.getByText(/no se sabe|no se ha podido/i)).toBeTruthy();
    expect(screen.queryByText(/vuelva a mirar/i)).toBeNull();
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

  it("sin `alEnviarFeedback` no se ofrece el campo: un control sin dato detrás es la misma mentira que una lista vacía rellenada", () => {
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
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  /**
   * Task 12: «se edita la tarea y se agrega el feedback del usuario» (§0 del diseño). Sin
   * modal —es una frase, no una decisión con diff— y el vacío se rechaza también aquí, no
   * solo en el servidor: mandarlo igual sería esperar a que un acto de sistema lo dijera en
   * una ventana que no pinta el transcript.
   */
  it("«esperando feedback» con `alEnviarFeedback` pinta el campo, y manda el id y el texto recortado", () => {
    const alEnviarFeedback = vi.fn();
    render(
      <Kanban
        cola={{
          lista: [tarea({ id: "t9", estado: "requiere-atencion", motivo: "hallazgo del juez", sesion: "s1" })],
          concurrencia: 2,
          corriendoAqui: true,
        }}
        alEnviarFeedback={alEnviarFeedback}
      />
    );
    // Ya no hace falta la pista de texto: hay un campo de verdad.
    expect(screen.queryByText(/editando la tarea/i)).toBeNull();
    const campo = screen.getByRole("textbox", { name: /tu feedback/i });
    const boton = screen.getByRole("button", { name: /enviar feedback/i });
    expect(boton).toHaveProperty("disabled", true);

    fireEvent.change(campo, { target: { value: "  sí, con histórico  " } });
    expect(boton).toHaveProperty("disabled", false);
    fireEvent.click(boton);

    expect(alEnviarFeedback).toHaveBeenCalledWith("t9", "sí, con histórico");
    // Y el campo se limpia tras mandarlo: no queda un borrador a medio escribir de algo
    // que ya se envió.
    expect((campo as HTMLTextAreaElement).value).toBe("");
  });

  it("un feedback en blanco no se manda: el botón se queda deshabilitado", () => {
    const alEnviarFeedback = vi.fn();
    render(
      <Kanban
        cola={{
          lista: [tarea({ estado: "requiere-atencion", motivo: "hallazgo del juez", sesion: "s1" })],
          concurrencia: 2,
          corriendoAqui: true,
        }}
        alEnviarFeedback={alEnviarFeedback}
      />
    );
    const boton = screen.getByRole("button", { name: /enviar feedback/i });
    expect(boton).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByRole("textbox", { name: /tu feedback/i }), { target: { value: "   " } });
    expect(boton).toHaveProperty("disabled", true);
    fireEvent.click(boton);
    expect(alEnviarFeedback).not.toHaveBeenCalled();
  });

  /**
   * Task 13: antes de esta pieza el kanban solo ofrecía feedback — reintentar, terminar y
   * descartar eran solo de `TareasDelProyecto.tsx`, así que una tarea bloqueada solo se
   * desbloqueaba desde la lista del proyecto. Ahora las cuatro viven en `AccionesDeTarea`,
   * y las dos vistas la montan igual.
   */
  it("«esperando feedback» también ofrece reintentar, dar por bueno y descartar, no solo feedback", () => {
    const alReintentar = vi.fn();
    const alTerminar = vi.fn();
    render(
      <Kanban
        cola={{
          lista: [tarea({ id: "t9", estado: "requiere-atencion", motivo: "hallazgo del juez" })],
          concurrencia: 2,
          corriendoAqui: true,
        }}
        alReintentar={alReintentar}
        alTerminar={alTerminar}
        alDescartar={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /^reintentar$/i }));
    expect(alReintentar).toHaveBeenCalledWith("t9");
    fireEvent.click(screen.getByRole("button", { name: /dar por bueno/i }));
    expect(alTerminar).toHaveBeenCalledWith("t9");
    expect(screen.getByRole("button", { name: /^descartar$/i })).toBeTruthy();
  });

  /**
   * Una `nuevo`/`en-proceso`/`terminada` (`TarjetaSimple`) también puede descartarse: antes
   * el kanban no ofrecía descartar en NINGÚN estado, y `TareasDelProyecto.tsx` sí lo hacía
   * para casi todos — otra mitad de la misma divergencia.
   */
  it("una tarjeta simple (nuevo/en proceso/terminada) también ofrece descartar", () => {
    const alDescartar = vi.fn();
    render(
      <Kanban
        cola={{ lista: [tarea({ id: "t3", estado: "nuevo" })], concurrencia: 2, corriendoAqui: true }}
        alDescartar={alDescartar}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /^descartar$/i }));
    fireEvent.click(screen.getByRole("button", { name: /sí, descartar/i }));
    expect(alDescartar).toHaveBeenCalledWith("t3");
  });

  it("sin cable, las acciones de la tarjeta se apagan y se dice por qué", () => {
    render(
      <Kanban
        cola={{
          lista: [tarea({ id: "t9", estado: "requiere-atencion", motivo: "hallazgo del juez" })],
          concurrencia: 2,
          corriendoAqui: true,
        }}
        alReintentar={vi.fn()}
        conectado={false}
      />
    );
    expect(screen.getByRole("button", { name: /^reintentar$/i })).toHaveProperty("disabled", true);
    expect(screen.getByText(/sin conexión/i)).toBeTruthy();
  });
});
