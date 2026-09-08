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
});
