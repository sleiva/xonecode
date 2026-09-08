import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AccionesDeTarea } from "./AccionesDeTarea.js";
import { Kanban } from "./Kanban.js";
import { TareasDelProyecto } from "./TareasDelProyecto.js";
import { TRANSICIONES, type TareaDelCable } from "../tipos.js";

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
    expect(accionesVisibles(enKanban)).toContain("Enviar feedback");
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
    const boton = screen.getByRole("button", { name: /enviar feedback/i });
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
