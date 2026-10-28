import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DisenoDeTareasContexto } from "../disenoContexto.js";
import { AccionesDeTarea } from "./AccionesDeTarea.js";
import { Kanban } from "./Kanban.js";
import { TareasDelProyecto } from "./TareasDelProyecto.js";
import { TRANSICIONES, puedeEditarEncargo, type TareaDelCable } from "../tipos.js";
import { puedeEditarEncargo as puedeEditarEncargoEnCore } from "../../../../src/core/tareas.js";

afterEach(cleanup);

const TAREA = (extra: Partial<TareaDelCable> = {}): TareaDelCable => ({
  id: "t1",
  proyecto: "p1",
  proyectoNombre: "AppDemo",
  titulo: "Arregla el login",
  peticion: "Arregla el login",
  encargo: "Arregla el login",
  adjuntos: [],
  estado: "requiere-atencion",
  motivo: "¿lleva histórico?",
  creada: "2026-09-08T10:00:00.000Z",
  ...extra,
});

const manejadores = {
  alReintentar: vi.fn(),
  alDescartar: vi.fn(),
  alTerminar: vi.fn(),
  alEnviarFeedback: vi.fn(),
};

/** Los nombres accesibles de los botones DENTRO del grupo de acciones — no de la tarjeta
 *  o la fila enteras, que llevan botones propios (abrir la sesión, ir a Revisión) que las
 *  dos vistas no tienen por qué compartir. */
function accionesVisibles(contenedor: HTMLElement): string[] {
  const grupo = within(contenedor).getByRole("group", { name: /acciones de la tarea/i });
  return within(grupo)
    .getAllByRole("button")
    .map((b) => b.textContent ?? "")
    .sort();
}

describe("AccionesDeTarea", () => {
  it("«esperando feedback»: ofrece las cuatro acciones cuando las cuatro se pueden", () => {
    const { container } = render(<AccionesDeTarea tarea={TAREA()} conectado {...manejadores} />);
    const nombres = accionesVisibles(container);
    expect(nombres).toContain("Reintentar");
    expect(nombres).toContain("Dar por bueno");
    expect(nombres).toContain("Descartar");
    expect(screen.getByRole("textbox", { name: /tu feedback/i })).toBeTruthy();
  });

  /**
   * El test que impide que las dos vistas vuelvan a divergir: el defecto original era la
   * lista con reintentar/terminar y el kanban con feedback, cada uno sin lo del otro. Se
   * comparan los DOS conjuntos en vez de una lista escrita a mano, que se queda vieja sin
   * avisar si un día se añade una quinta acción.
   */
  it("las dos vistas ofrecen las MISMAS acciones para el mismo estado", () => {
    const tarea = TAREA({ estado: "requiere-atencion" });
    const { container: enKanban } = render(
      <Kanban cola={{ lista: [tarea], concurrencia: 2, corriendoAqui: true }} conectado {...manejadores} />
    );
    const { container: enLista } = render(<TareasDelProyecto tareas={[tarea]} conectado {...manejadores} />);
    expect(accionesVisibles(enKanban)).toEqual(accionesVisibles(enLista));
    expect(accionesVisibles(enKanban)).toContain("Enviar y continuar");
  });

  it("las dos vistas también coinciden en una tarea recién creada: solo descartar", () => {
    const tarea = TAREA({ estado: "nuevo", motivo: undefined });
    const { container: enKanban } = render(
      <Kanban cola={{ lista: [tarea], concurrencia: 2, corriendoAqui: true }} conectado {...manejadores} />
    );
    const { container: enLista } = render(<TareasDelProyecto tareas={[tarea]} conectado {...manejadores} />);
    expect(accionesVisibles(enKanban)).toEqual(accionesVisibles(enLista));
    expect(accionesVisibles(enKanban)).toEqual(["Descartar"]);
  });

  /**
   * Reintentar y terminar son las dos salidas de una tarea APARCADA
   * (`core/tareas.ts#TRANSICIONES["requiere-atencion"]`): el corredor es dueño de las
   * transiciones que salen de `nuevo` y `en-proceso`, la persona solo decide desde la
   * espera. Se comprueba contra la TABLA para las cuatro combinaciones, no contra lo que
   * las pantallas hacen hoy — si `TRANSICIONES` cambiara, esto tiene que seguir valiendo.
   */
  it.each(["nuevo", "en-proceso", "requiere-atencion", "terminada"] as const)(
    "en «%s», lo ofrecido no sale de lo que TRANSICIONES permite (descartar aparte)",
    (estado) => {
      const { container } = render(<AccionesDeTarea tarea={TAREA({ estado, motivo: "x" })} conectado {...manejadores} />);
      const nombres = accionesVisibles(container).filter((n) => n !== "Descartar");
      const destinos = TRANSICIONES[estado];
      if (!destinos.includes("nuevo")) {
        expect(nombres).not.toContain("Reintentar");
        expect(screen.queryByRole("textbox", { name: /tu feedback/i })).toBeNull();
      }
      if (!destinos.includes("terminada")) {
        expect(nombres).not.toContain("Dar por bueno");
      }
    }
  );

  it("«terminada» no ofrece ni reintentar ni terminar: no hay ninguna salida manual desde ahí", () => {
    const { container } = render(<AccionesDeTarea tarea={TAREA({ estado: "terminada", motivo: undefined })} conectado {...manejadores} />);
    expect(accionesVisibles(container)).toEqual(["Descartar"]);
  });

  it("descartar no mira el estado, a propósito: sigue ofrecido incluso «en-proceso»", () => {
    const { container } = render(
      <AccionesDeTarea tarea={TAREA({ estado: "en-proceso", motivo: undefined })} conectado {...manejadores} />
    );
    expect(accionesVisibles(container)).toEqual(["Descartar"]);
  });

  it("un handler ausente no ofrece su acción, aunque el estado la permita", () => {
    const { container } = render(<AccionesDeTarea tarea={TAREA()} conectado alDescartar={vi.fn()} />);
    expect(accionesVisibles(container)).toEqual(["Descartar"]);
  });

  it("sin ninguna acción aplicable, no pinta nada (ni el grupo vacío)", () => {
    const { container } = render(<AccionesDeTarea tarea={TAREA({ estado: "terminada", motivo: undefined })} conectado />);
    expect(container.querySelector('[role="group"]')).toBeNull();
  });

  /**
   * La regla de `Barra`/`Escritorio`: se apaga lo que manda algo al servidor. Un botón vivo
   * sin cable se pulsa, no pasa nada, y no hay forma de saber si falló el botón o el
   * servidor — por eso se DICE, no solo se deshabilita.
   */
  it("sin cable, los controles se apagan y se DICE por qué", () => {
    render(<AccionesDeTarea tarea={TAREA()} conectado={false} {...manejadores} />);
    expect(screen.getByRole("button", { name: /reintentar/i })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /dar por bueno/i })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /descartar/i })).toHaveProperty("disabled", true);
    expect(screen.getByRole("textbox", { name: /tu feedback/i })).toHaveProperty("disabled", true);
    expect(screen.getByText(/sin conexión/i)).toBeTruthy();
  });

  it("ausente `conectado` se asume conectado: nada deshabilitado, ningún aviso", () => {
    render(<AccionesDeTarea tarea={TAREA()} {...manejadores} />);
    expect(screen.getByRole("button", { name: /reintentar/i })).toHaveProperty("disabled", false);
    expect(screen.queryByText(/sin conexión/i)).toBeNull();
  });

  it("reintentar manda el id", () => {
    render(<AccionesDeTarea tarea={TAREA({ id: "t7" })} conectado {...manejadores} />);
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(manejadores.alReintentar).toHaveBeenCalledWith("t7");
  });

  it("dar por bueno manda el id", () => {
    render(<AccionesDeTarea tarea={TAREA({ id: "t7" })} conectado {...manejadores} />);
    fireEvent.click(screen.getByRole("button", { name: /dar por bueno/i }));
    expect(manejadores.alTerminar).toHaveBeenCalledWith("t7");
  });

  it("descartar CONFIRMA antes de mandar: es irreversible", () => {
    const alDescartar = vi.fn();
    render(<AccionesDeTarea tarea={TAREA({ id: "t7", estado: "nuevo", motivo: undefined })} conectado alDescartar={alDescartar} />);
    fireEvent.click(screen.getByRole("button", { name: /^descartar$/i }));
    expect(alDescartar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /sí, descartar/i }));
    expect(alDescartar).toHaveBeenCalledWith("t7");
  });

  it("cancelar la confirmación no manda nada, y se puede volver a abrir", () => {
    const alDescartar = vi.fn();
    render(<AccionesDeTarea tarea={TAREA({ id: "t7", estado: "nuevo", motivo: undefined })} conectado alDescartar={alDescartar} />);
    fireEvent.click(screen.getByRole("button", { name: /^descartar$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^cancelar$/i }));
    expect(alDescartar).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /sí, descartar/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^descartar$/i }));
    expect(screen.getByRole("button", { name: /sí, descartar/i })).toBeTruthy();
  });

  /**
   * La confirmación de descartar es una VENTANA (`Modal`), no la fila de dos botones de
   * antes de Task 13, reutilizando la coraza de `NuevaSesion.module.css` — el mismo camino
   * que ya usa `AccionDeSesion.tsx` para borrar una sesión, y por el mismo motivo: «eliminar
   * al primer clic en una fila de 34 px es cómo se pierde la conversación de una tarde», y
   * la tarjeta del kanban es tan estrecha como esa fila.
   *
   * Task 14: la ventana YA NO lleva un párrafo aparte para `en-proceso` avisando de que el
   * turno seguía corriendo tras el borrado — ese aviso era la confesión de un fallo, y el
   * fallo se arregló en el SERVIDOR (`web/servidor/arranque.ts#atenderAccionDeTarea` corta
   * el turno con `Corredor.cortar` antes de `borrarTarea`), no aquí con más texto. La misma
   * frase corta vale ya para las cuatro: se para el turno si está en marcha, y se borra
   * todo. Dejar el párrafo viejo habría sido describir una versión del producto que ya no
   * existe.
   */
  it("la ventana dice la MISMA frase corta para «en-proceso» y para cualquier otro estado", () => {
    const { unmount } = render(
      <AccionesDeTarea tarea={TAREA({ id: "t7", estado: "en-proceso", motivo: undefined })} conectado alDescartar={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: /^descartar$/i }));
    expect(screen.getByText(/se para el turno/i)).toBeTruthy();
    expect(screen.queryByText(/sigue corriendo/i)).toBeNull();
    unmount();

    render(<AccionesDeTarea tarea={TAREA({ id: "t7", estado: "nuevo", motivo: undefined })} conectado alDescartar={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^descartar$/i }));
    expect(screen.getByText(/se para el turno/i)).toBeTruthy();
  });

  it("feedback: vacío no manda, se recorta y el campo se limpia tras enviar", () => {
    const alEnviarFeedback = vi.fn();
    render(<AccionesDeTarea tarea={TAREA({ id: "t9" })} conectado alEnviarFeedback={alEnviarFeedback} />);
    const campo = screen.getByRole("textbox", { name: /tu feedback/i });
    const boton = screen.getByRole("button", { name: /enviar y continuar/i });
    expect(boton).toHaveProperty("disabled", true);
    fireEvent.change(campo, { target: { value: "   " } });
    expect(boton).toHaveProperty("disabled", true);
    fireEvent.click(boton);
    expect(alEnviarFeedback).not.toHaveBeenCalled();

    fireEvent.change(campo, { target: { value: "  sí, con histórico  " } });
    expect(boton).toHaveProperty("disabled", false);
    fireEvent.click(boton);
    expect(alEnviarFeedback).toHaveBeenCalledWith("t9", "sí, con histórico");
    expect((campo as HTMLTextAreaElement).value).toBe("");
  });

  it("sin `alEnviarFeedback`, la aparcada enseña la pista en vez de un campo muerto", () => {
    render(<AccionesDeTarea tarea={TAREA()} conectado alReintentar={vi.fn()} />);
    expect(screen.getByText(/editando la tarea/i)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("AccionesDeTarea: continuar y arrancar ahora", () => {
  const base = {
    id: "t1", proyecto: "p1", proyectoNombre: "A", titulo: "T", peticion: "p", encargo: "e", adjuntos: [],
    creada: "2026-10-07T10:00:00.000Z",
  };
  it("una aparcada ofrece «Continuar» sin texto; una nueva que puede arrancar ofrece «Arrancar ahora» y dice por qué espera", async () => {
    const alContinuar = vi.fn(async () => undefined);
    const alArrancarAhora = vi.fn(async () => "tu conversación en este proyecto está trabajando");
    const { rerender } = render(<AccionesDeTarea tarea={{ ...base, estado: "requiere-atencion", motivo: "m" }} alContinuar={alContinuar} alArrancarAhora={alArrancarAhora} puedeArrancar />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    });
    expect(alContinuar).toHaveBeenCalledWith("t1");
    expect(screen.queryByRole("button", { name: "Arrancar ahora" })).toBeNull();
    const esperaPorTi = { motivo: "tienes abierta su conversación; arranca cuando la cierres", ceder: true };
    rerender(<AccionesDeTarea tarea={{ ...base, estado: "nuevo", esperaPorTi }} alContinuar={alContinuar} alArrancarAhora={alArrancarAhora} puedeArrancar />);
    expect(screen.getByText(/Esperando: tienes abierta su conversación/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Arrancar ahora" }));
    });
    expect(alArrancarAhora).toHaveBeenCalledWith("t1");
    expect(screen.getByRole("alert").textContent).toContain("está trabajando");
  });

  it("una encadenada que espera a la anterior no ofrece arrancar ni dice que espera a ti", () => {
    const esperaPorTi = { motivo: "tienes abierta su conversación; arranca cuando la cierres", ceder: true };
    render(<AccionesDeTarea tarea={{ ...base, estado: "nuevo", tras: "t0", esperaPorTi }} alArrancarAhora={vi.fn()} puedeArrancar={false} />);
    expect(screen.queryByRole("button", { name: "Arrancar ahora" })).toBeNull();
    expect(screen.queryByText(/Esperando:/)).toBeNull();
  });

  /**
   * IXCODE-61: con un TURNO en marcha ceder el proyecto se negaría, así que el botón no se
   * ofrece — se dice por qué espera y ya. Y sin motivo del servidor (espera por concurrencia, o
   * no espera) tampoco: cerrar tu conversación no la adelantaría.
   */
  it("«Arrancar ahora» solo cuando ceder la desbloquea", () => {
    const turno = { motivo: "tu conversación en este proyecto está trabajando; arranca cuando termine", ceder: false };
    const { rerender } = render(<AccionesDeTarea tarea={{ ...base, estado: "nuevo", esperaPorTi: turno }} alArrancarAhora={vi.fn()} puedeArrancar />);
    expect(screen.getByText(/Esperando: tu conversación en este proyecto está trabajando/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Arrancar ahora" })).toBeNull();
    rerender(<AccionesDeTarea tarea={{ ...base, estado: "nuevo" }} alArrancarAhora={vi.fn()} puedeArrancar />);
    expect(screen.queryByRole("button", { name: "Arrancar ahora" })).toBeNull();
  });
});

describe("editar el encargo (IXCODE-52)", () => {
  it("una que nunca arrancó lo ofrece; una que ya arrancó, aunque vuelva a «nuevo», no", () => {
    const alEditarEncargo = vi.fn(async () => undefined);
    const { container, unmount } = render(<AccionesDeTarea tarea={TAREA({ estado: "nuevo", motivo: undefined })} alEditarEncargo={alEditarEncargo} />);
    expect(within(container).getByRole("button", { name: "Editar la tarea" })).toBeTruthy();
    unmount();
    for (const extra of [{ estado: "en-proceso" as const }, { estado: "nuevo" as const, empezada: "2026-10-14T10:00:00.000Z" }]) {
      const r = render(<AccionesDeTarea tarea={TAREA({ ...extra, motivo: undefined })} alEditarEncargo={alEditarEncargo} alDescartar={vi.fn()} />);
      expect(within(r.container).queryByRole("button", { name: "Editar la tarea" })).toBeNull();
      r.unmount();
    }
  });

  it("guarda lo editado y cierra; una negativa se enseña dentro con lo escrito intacto", async () => {
    let respuesta: string | undefined = "esa tarea ya no está esperando a arrancar";
    const alEditarEncargo = vi.fn(async () => respuesta);
    render(<AccionesDeTarea tarea={TAREA({ estado: "nuevo", motivo: undefined, encargo: "el de antes" })} alEditarEncargo={alEditarEncargo} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar la tarea" }));
    const campo = screen.getByLabelText("Encargo") as HTMLTextAreaElement;
    expect(campo.value).toBe("el de antes");
    // Sin cambios no se manda nada.
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(campo, { target: { value: "el de ahora" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(alEditarEncargo).toHaveBeenCalledWith("t1", "el de ahora", "Arregla el login");
    expect(screen.getByRole("alert").textContent).toMatch(/ya no está esperando/);
    expect((screen.getByLabelText("Encargo") as HTMLTextAreaElement).value).toBe("el de ahora");
    respuesta = undefined;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(screen.queryByLabelText("Encargo")).toBeNull();
  });

  /** Petición suya (21-10-2026): editar deja anexar y pegar imágenes como «Nueva tarea», y quitar las que ya tenía. */
  it("con imágenes: sube las nuevas a su borrador, quita las de antes, y manda las dos cosas al guardar", async () => {
    const alEditarEncargo = vi.fn(async () => undefined as string | undefined);
    const subir = vi.fn(async () => ({ ok: true }));
    const descartar = vi.fn();
    const { container } = render(
      <AccionesDeTarea
        tarea={TAREA({ estado: "nuevo", motivo: undefined, encargo: "el de antes", adjuntos: [{ nombre: "vieja.png", bytes: 3 }] })}
        alEditarEncargo={alEditarEncargo}
        adjuntosDelBorrador={{ subir, descartar }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar la tarea" }));
    expect(screen.getByRole("button", { name: /Añadir fichero o arrástralo aquí/ })).toBeTruthy();
    expect(screen.getByText("Sin cambios todavía")).toBeTruthy();
    const entrada = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(entrada, { target: { files: [new File(["x"], "nueva.png", { type: "image/png" })] } });
    });
    expect(subir).toHaveBeenCalledWith(expect.any(String), "nueva.png", expect.any(File));
    const borrador = (subir.mock.calls[0] as unknown as [string])[0];
    fireEvent.click(screen.getByRole("button", { name: "Quitar vieja.png" }));
    expect(screen.getByText("se quitará al guardar")).toBeTruthy();
    expect(screen.getByText("Al guardar: 1 adjunto nuevo · 1 se quita")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(alEditarEncargo).toHaveBeenCalledWith("t1", "el de antes", "Arregla el login", undefined, { borrador, quitar: ["vieja.png"] });
    // Guardado: el borrador es ya de la tarea, y cerrar no lo descarta.
    expect(descartar).not.toHaveBeenCalled();
  });

  /** IXCODE-55: contestar a una tarea que pregunta con una imagen y un texto. */
  it("«Tu feedback» con imágenes: suben a su borrador, una imagen SOLA ya se puede mandar, y el borrador va con el feedback", async () => {
    const alEnviarFeedback = vi.fn();
    const subir = vi.fn(async () => ({ ok: true }));
    const descartar = vi.fn();
    const { container } = render(
      <AccionesDeTarea tarea={TAREA({ estado: "requiere-atencion" })} alEnviarFeedback={alEnviarFeedback} adjuntosDelBorrador={{ subir, descartar }} />
    );
    const enviarFeedback = () => screen.getByRole("button", { name: "Enviar y continuar" }) as HTMLButtonElement;
    expect(enviarFeedback().disabled).toBe(true);
    const entrada = container.ownerDocument.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(entrada, { target: { files: [new File(["x"], "boceto.png", { type: "image/png" })] } });
    });
    const borrador = (subir.mock.calls[0] as unknown as [string])[0];
    await waitFor(() => expect(enviarFeedback().disabled).toBe(false));
    fireEvent.change(screen.getByLabelText("Tu feedback"), { target: { value: "la cabecera como en la imagen" } });
    fireEvent.click(enviarFeedback());
    expect(alEnviarFeedback).toHaveBeenCalledWith("t1", "la cabecera como en la imagen", borrador);
    // El borrador ya es de la tarea: el formulario nuevo no lo descarta, y empieza vacío.
    expect(descartar).not.toHaveBeenCalled();
    expect(screen.queryByText("boceto.png")).toBeNull();
  });

  it("«Tu feedback» sin adjuntar sigue siendo texto: sin borrador, y sin imágenes que ofrecer si no hay a dónde subirlas", () => {
    const alEnviarFeedback = vi.fn();
    render(<AccionesDeTarea tarea={TAREA({ estado: "requiere-atencion" })} alEnviarFeedback={alEnviarFeedback} />);
    expect(screen.queryByRole("button", { name: /Añadir fichero/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Tu feedback"), { target: { value: "sí" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar y continuar" }));
    expect(alEnviarFeedback).toHaveBeenCalledWith("t1", "sí");
  });

  it("la lista del proyecto lo hace llegar hasta la fila: una prop opcional olvidada por el camino no da error", () => {
    const alEditarEncargo = vi.fn(async () => undefined);
    render(
      <TareasDelProyecto
        tareas={[TAREA({ estado: "nuevo", motivo: undefined })]}
        conectado
        alEditarEncargo={alEditarEncargo}
        alRegenerarEncargo={vi.fn(async () => ({ encargo: "x" }))}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar la tarea" }));
    expect(screen.getByRole("button", { name: "Regenerar el encargo" })).toBeTruthy();
  });

  it("la regla del cliente es la de core", () => {
    for (const t of [
      { estado: "nuevo" as const },
      { estado: "nuevo" as const, empezada: "2026-10-14T10:00:00.000Z" },
      { estado: "en-proceso" as const },
      { estado: "requiere-atencion" as const },
      { estado: "terminada" as const },
    ]) {
      expect(puedeEditarEncargo(t), JSON.stringify(t)).toBe(puedeEditarEncargoEnCore(t));
    }
  });

  it("la PETICIÓN también se edita, y «Regenerar» rellena el encargo sin guardar nada (IXCODE-53)", async () => {
    const alEditarEncargo = vi.fn(async () => undefined);
    const alRegenerarEncargo = vi.fn(async (_id: string, peticion: string) => ({ encargo: `PREPARADO: ${peticion}` }));
    render(
      <AccionesDeTarea
        tarea={TAREA({ estado: "nuevo", motivo: undefined, encargo: "el de antes" })}
        alEditarEncargo={alEditarEncargo}
        alRegenerarEncargo={alRegenerarEncargo}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar la tarea" }));
    const peticion = screen.getByLabelText("Lo que pediste") as HTMLTextAreaElement;
    expect(peticion.value).toBe("Arregla el login");
    fireEvent.change(peticion, { target: { value: "Arregla el login y pon la versión" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Regenerar el encargo" }));
    });
    expect(alRegenerarEncargo).toHaveBeenCalledWith("t1", "Arregla el login y pon la versión");
    expect((screen.getByLabelText("Encargo") as HTMLTextAreaElement).value).toBe("PREPARADO: Arregla el login y pon la versión");
    // Regenerar no guarda: eso es «Guardar».
    expect(alEditarEncargo).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(alEditarEncargo).toHaveBeenCalledWith("t1", "PREPARADO: Arregla el login y pon la versión", "Arregla el login y pon la versión");
  });

  it("si no se puede regenerar, lo dice y deja el encargo como estaba", async () => {
    render(
      <AccionesDeTarea
        tarea={TAREA({ estado: "nuevo", motivo: undefined, encargo: "el de antes" })}
        alEditarEncargo={vi.fn(async () => undefined)}
        alRegenerarEncargo={vi.fn(async () => ({ motivo: "falta la credencial del modelo" }))}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar la tarea" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Regenerar el encargo" }));
    });
    expect(screen.getByRole("alert").textContent).toMatch(/falta la credencial/);
    expect((screen.getByLabelText("Encargo") as HTMLTextAreaElement).value).toBe("el de antes");
  });

  it("vacío no se puede guardar, y lo dice", () => {
    render(<AccionesDeTarea tarea={TAREA({ estado: "nuevo", motivo: undefined })} alEditarEncargo={vi.fn(async () => undefined)} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar la tarea" }));
    fireEvent.change(screen.getByLabelText("Encargo"), { target: { value: "   " } });
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/no puede quedar vacío/)).toBeTruthy();
  });
});

describe("parar una tarea en marcha (IXCODE-50)", () => {
  it("solo «en proceso» ofrece «Parar», y llega a través de la lista del proyecto", () => {
    const alParar = vi.fn(async () => undefined);
    render(<TareasDelProyecto tareas={[TAREA({ estado: "en-proceso", motivo: undefined })]} conectado alParar={alParar} />);
    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    expect(alParar).toHaveBeenCalledWith("t1");
    cleanup();
    for (const estado of ["nuevo", "requiere-atencion", "terminada"] as const) {
      const r = render(<AccionesDeTarea tarea={TAREA({ estado })} alParar={alParar} alDescartar={vi.fn()} />);
      expect(within(r.container).queryByRole("button", { name: "Parar" })).toBeNull();
      r.unmount();
    }
  });

  it("una negativa del servidor se DICE", async () => {
    render(<AccionesDeTarea tarea={TAREA({ estado: "en-proceso", motivo: undefined })} alParar={vi.fn(async () => "su turno lo ejecuta otro proceso")} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    });
    expect(screen.getByRole("alert").textContent).toMatch(/otro proceso/);
  });
});

describe("«Editar la tarea» cambia también la PANTALLA de Stitch (con proyecto vinculado)", () => {
  const conDiseno = (vinculo: { proyecto: string; nombre: string } | null, pedir = vi.fn()) => ({
    diseno: {
      proyecto: "p1",
      vinculo,
      pantallas: [
        { name: "projects/9/screens/aa", title: "Listado de Entregas" },
        { name: "projects/9/screens/bb", title: "Albaranes Pendientes" },
      ],
    },
    pedirPantallas: pedir,
  });

  it("la pestaña Diseño trae la actual marcada; cambiarla guarda la nueva, y quitarla manda null", async () => {
    const alEditarEncargo = vi.fn(async () => undefined);
    const pedir = vi.fn();
    render(
      <DisenoDeTareasContexto.Provider value={conDiseno({ proyecto: "projects/9", nombre: "Maset" }, pedir)}>
        <AccionesDeTarea
          tarea={TAREA({ estado: "nuevo", motivo: undefined, proyecto: "p1", pantallasDeStitch: [{ name: "projects/9/screens/bb", titulo: "Albaranes Pendientes" }] })}
          alEditarEncargo={alEditarEncargo}
        />
      </DisenoDeTareasContexto.Provider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar la tarea" }));
    expect(pedir).toHaveBeenCalledWith("p1");
    expect(screen.getByText("Diseño: «Albaranes Pendientes».")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Diseño · «Albaranes Pendientes»" }));
    expect(screen.getByRole("button", { name: /Albaranes Pendientes/ }).getAttribute("aria-pressed")).toBe("true");
    // Cambiarla: se desmarca la que había y se marca otra (IXCODE-63: pulsar AÑADE, no sustituye).
    fireEvent.click(screen.getByRole("button", { name: /Albaranes Pendientes/ }));
    fireEvent.click(screen.getByRole("button", { name: /Listado de Entregas/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(alEditarEncargo).toHaveBeenCalled());
    expect(alEditarEncargo).toHaveBeenLastCalledWith("t1", expect.any(String), expect.any(String), [
      { name: "projects/9/screens/aa", titulo: "Listado de Entregas" },
    ]);
  });

  it("añadir otra pantalla guarda las dos, en su orden; «Quitar todas» manda null", async () => {
    const alEditarEncargo = vi.fn(async () => undefined);
    render(
      <DisenoDeTareasContexto.Provider value={conDiseno({ proyecto: "projects/9", nombre: "Maset" }, vi.fn())}>
        <AccionesDeTarea
          tarea={TAREA({ estado: "nuevo", motivo: undefined, proyecto: "p1", pantallasDeStitch: [{ name: "projects/9/screens/bb", titulo: "Albaranes Pendientes" }] })}
          alEditarEncargo={alEditarEncargo}
        />
      </DisenoDeTareasContexto.Provider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar la tarea" }));
    fireEvent.click(screen.getByRole("tab", { name: "Diseño · «Albaranes Pendientes»" }));
    fireEvent.click(screen.getByRole("button", { name: /Listado de Entregas/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(alEditarEncargo).toHaveBeenCalledTimes(1));
    expect(alEditarEncargo).toHaveBeenLastCalledWith("t1", expect.any(String), expect.any(String), [
      { name: "projects/9/screens/bb", titulo: "Albaranes Pendientes" },
      { name: "projects/9/screens/aa", titulo: "Listado de Entregas" },
    ]);
  });

  it("sin proyecto de Stitch vinculado no hay pestañas, y guardar no toca la pantalla", async () => {
    const alEditarEncargo = vi.fn(async () => undefined);
    render(
      <DisenoDeTareasContexto.Provider value={conDiseno(null)}>
        <AccionesDeTarea tarea={TAREA({ estado: "nuevo", motivo: undefined, proyecto: "p1", encargo: "a" })} alEditarEncargo={alEditarEncargo} />
      </DisenoDeTareasContexto.Provider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar la tarea" }));
    expect(screen.queryByRole("tab")).toBeNull();
  });
});

/**
 * IXCODE-75: «Editar la tarea» pasaba del alto de la pantalla y «Guardar» quedaba fuera. jsdom no hace layout, así que
 * se vigila la HOJA (el mismo trato que `Aprobacion.test.tsx`).
 */
describe("«Editar la tarea» cabe en la pantalla", () => {
  const hoja = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "AccionesDeTarea.module.css"), "utf8");
  const regla = (selector: string): string => {
    const desde = hoja.slice(hoja.indexOf(`${selector} {`));
    return desde.slice(0, desde.indexOf("}"));
  };

  it("la ventana tiene alto máximo en vh y scroll propio", () => {
    expect(regla(".ventanaAncha")).toMatch(/max-height:\s*90vh/);
    expect(regla(".ventanaAncha")).toMatch(/overflow-y:\s*auto/);
  });

  it("el pie con los botones se queda pegado abajo", () => {
    expect(regla(".pieDeEditar.pieDeEditar")).toMatch(/position:\s*sticky/);
    expect(regla(".pieDeEditar.pieDeEditar")).toMatch(/bottom:\s*0/);
  });
});
