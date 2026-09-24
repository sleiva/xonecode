import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Planes } from "./Planes.js";
import type { PlanDelCable } from "../tipos.js";

afterEach(cleanup);

const tarea = (numero: string, extra: Partial<PlanDelCable["tareas"] extends infer T ? T extends { tareas: (infer U)[] } ? U : never : never> = {}) => ({
  numero,
  titulo: `Tarea ${numero}`,
  bloqueadaPor: [],
  criterios: { hechos: 0, total: 2 },
  cuerpo: `**Qué entrega:** algo de la ${numero}\n\n- [ ] uno\n- [ ] dos`,
  ...extra,
});

const VISITAS: PlanDelCable = {
  nombre: "visitas-clientes",
  ficheros: ["PLAN.md", "TASKS.md"],
  modificado: 2,
  plan: { texto: "# El plan\n\nContexto largo.", recortado: false },
  tareas: {
    titulo: "Plan de ejecución — Visitas",
    tareas: [
      tarea("01", { estado: "hecha", criterios: { hechos: 2, total: 2 }, bloqueadaPorTexto: "Ninguna — puede empezar ya" }),
      tarea("02", { estado: "pendiente", bloqueadaPor: ["01"], bloqueadaPorTexto: "01" }),
      tarea("03", { bloqueadaPorTexto: "Ninguna en el código — pero requiere ejecución externa" }),
    ],
  },
};

describe("Planes", () => {
  it("rotula que es lo que DICE el plan, con el estado como está escrito y los criterios", () => {
    render(<Planes planes={[VISITAS]} />);
    expect(screen.getByRole("heading", { name: "Plan de ejecución — Visitas" })).toBeTruthy();
    expect(screen.getByText(/Según el plan: 1 de 3 tareas con todos sus criterios marcados/)).toBeTruthy();
    expect(screen.getByText(/nadie los ha medido/)).toBeTruthy();
    const filas = screen.getAllByRole("button", { expanded: false }).map((b) => b.textContent);
    expect(filas).toEqual(["01Tarea 01hecha2 de 2", "02Tarea 02pendiente0 de 2", "03Tarea 030 de 2"]);
  });

  it("las dependencias: los números, y la prosa solo cuando dice algo más que «puede empezar ya»", () => {
    render(<Planes planes={[VISITAS]} />);
    expect(screen.getByText("bloqueada por 01")).toBeTruthy();
    expect(screen.getByText(/requiere ejecución externa/)).toBeTruthy();
    expect(screen.queryByText(/puede empezar ya/)).toBeNull();
  });

  it("pulsar una tarea abre su ficha en markdown; «Ver PLAN.md» cambia a la spec", () => {
    render(<Planes planes={[VISITAS]} />);
    fireEvent.click(screen.getByRole("button", { name: /Tarea 02/ }));
    expect(screen.getByText("algo de la 02", { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver PLAN.md" }));
    expect(screen.getByRole("heading", { name: "El plan" })).toBeTruthy();
  });

  it("un plan sin TASKS.md lo dice con lo que sí tiene, sin inventar tareas", () => {
    render(<Planes planes={[{ nombre: "solo", ficheros: ["PLAN.md"], modificado: 1 }]} />);
    expect(screen.getByText(/todavía no tiene tareas: tiene PLAN.md/)).toBeTruthy();
  });

  it("con varios, se elige; en camino o con error, se dice", () => {
    const { rerender } = render(<Planes planes={[VISITAS, { nombre: "otro", ficheros: [], modificado: 1 }]} />);
    fireEvent.click(screen.getByRole("button", { name: "otro" }));
    expect(screen.getByText(/la carpeta vacía/)).toBeTruthy();
    rerender(<Planes />);
    expect(screen.getByText("Leyendo los planes…")).toBeTruthy();
    rerender(<Planes error="no se pudieron leer los planes" />);
    expect(screen.getByText(/No se han podido leer los planes/)).toBeTruthy();
  });
});
