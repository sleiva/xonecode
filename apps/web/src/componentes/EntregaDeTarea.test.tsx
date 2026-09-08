import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EntregaDeTarea } from "./EntregaDeTarea.js";
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
  estado: "terminada",
  creada: "2026-09-08T10:00:00.000Z",
  ...extra,
});

/**
 * F1 de la revisión final: «Terminada» significaba TRES cosas distintas y se pintaban
 * igual. Esta pieza es la que las separa, y estos tests son sobre lo que una persona LEE.
 */
describe("EntregaDeTarea", () => {
  it("una entrega por la puerta completa dice que la aprobó el JUEZ, con sus palabras", () => {
    render(
      <EntregaDeTarea tarea={tarea({ veredicto: { veredicto: "verde", resumen: "hace lo que se pedía" } })} />
    );
    expect(screen.getByText(/juez/i)).toBeTruthy();
    expect(screen.getByText(/hace lo que se pedía/)).toBeTruthy();
    // Y no dice ni media palabra de una persona ni de una condición de menos.
    expect(screen.queryByText(/una persona/i)).toBeNull();
    expect(screen.queryByText(/condición/i)).toBeNull();
  });

  /**
   * `core/entrega.ts`: «una entrega con una condición menos no puede parecer una entrega
   * normal». Ese canal es la `salvedad`, y hasta este arreglo moría en el host.
   */
  it("una entrega con una condición MENOS lo dice, y dice cuál", () => {
    render(
      <EntregaDeTarea
        tarea={tarea({
          veredicto: {
            veredicto: "verde",
            resumen: "hace lo que se pedía",
            salvedad: "el turno no cambió ningún fichero, así que no había nada que verificar",
          },
        })}
      />
    );
    expect(screen.getByText(/no había nada que verificar/)).toBeTruthy();
    expect(screen.getByText(/una condición menos/i)).toBeTruthy();
  });

  it("una que dio por buena una PERSONA lo dice, y no se atribuye al juez", () => {
    render(<EntregaDeTarea tarea={tarea({ terminadaAMano: true })} />);
    expect(screen.getByText(/una persona/i)).toBeTruthy();
    expect(screen.getByText(/sin verificador|sin juez|ni juez/i)).toBeTruthy();
    expect(screen.queryByText(/el juez de QA la aprobó/i)).toBeNull();
  });

  /**
   * El caso que obliga a que la marca exista: una tarea puede llegar al botón «Dar por
   * bueno» con un veredicto VERDE ya guardado (la puerta la aprobó y la escritura del
   * estado final reventó). Sin la marca ganando, esa tarjeta sería la de una entrega por la
   * puerta completa.
   */
  it("la marca de la persona GANA a un veredicto verde ya guardado", () => {
    render(
      <EntregaDeTarea
        tarea={tarea({ terminadaAMano: true, veredicto: { veredicto: "verde", resumen: "hace lo que se pedía" } })}
      />
    );
    expect(screen.getByText(/una persona/i)).toBeTruthy();
    expect(screen.queryByText(/el juez de QA la aprobó/i)).toBeNull();
  });

  it("si la persona pisó un ROJO, se lee lo que el juez había dicho", () => {
    render(
      <EntregaDeTarea
        tarea={tarea({
          terminadaAMano: true,
          veredicto: { veredicto: "rojo", resumen: "falta el campo de la fecha", hallazgos: ["sin título"] },
        })}
      />
    );
    expect(screen.getByText(/una persona/i)).toBeTruthy();
    expect(screen.getByText(/rojo/i)).toBeTruthy();
    expect(screen.getByText(/falta el campo de la fecha/)).toBeTruthy();
    expect(screen.getByText(/sin título/)).toBeTruthy();
  });

  it("un verde CON hallazgos los enseña: aprobar con reservas no es aprobar a secas", () => {
    render(
      <EntregaDeTarea
        tarea={tarea({
          veredicto: { veredicto: "verde", resumen: "cubre el encargo", hallazgos: ["el mensaje de error es genérico"] },
        })}
      />
    );
    expect(screen.getByText(/el mensaje de error es genérico/)).toBeTruthy();
  });

  /**
   * `core/tareas.ts#Tarea.veredicto`: «una tarea terminada no podría distinguir "el juez la
   * aprobó" de "se entregó sin que nadie la juzgara"». Sin veredicto y sin marca no se
   * afirma ninguna de las dos: se dice que no consta.
   */
  it("sin veredicto y sin marca NO se afirma nada: se dice que no consta", () => {
    render(<EntregaDeTarea tarea={tarea()} />);
    expect(screen.getByText(/no consta/i)).toBeTruthy();
    expect(screen.queryByText(/aprobó/i)).toBeNull();
  });

  it("en los otros tres estados no pinta nada: ahí lo que hay que leer es el motivo", () => {
    const { container } = render(
      <EntregaDeTarea
        tarea={tarea({ estado: "requiere-atencion", veredicto: { veredicto: "rojo", resumen: "falta el campo" } })}
      />
    );
    expect(container.textContent).toBe("");
  });
});
