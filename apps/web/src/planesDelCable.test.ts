import { describe, expect, it } from "vitest";
import { leerPlanesDelCable } from "./planesDelCable.js";

describe("leerPlanesDelCable", () => {
  it("copia lo que tiene forma y descarta la tarea o el plan malos sin tirar el resto", () => {
    expect(
      leerPlanesDelCable([
        {
          nombre: "visitas",
          ficheros: ["PLAN.md", 3],
          modificado: 5,
          plan: { texto: "# P", recortado: false },
          tareas: {
            titulo: "Plan",
            tareas: [
              { numero: "01", titulo: "Tabla", estado: "hecha", bloqueadaPor: [], criterios: { hechos: 1, total: 2 }, cuerpo: "x", colado: 1 },
              { numero: "02", titulo: "Sin criterios", bloqueadaPor: ["01"], cuerpo: "y" },
            ],
          },
          colado: "no",
        },
        { ficheros: [] },
      ])
    ).toEqual([
      {
        nombre: "visitas",
        ficheros: ["PLAN.md"],
        modificado: 5,
        plan: { texto: "# P", recortado: false },
        tareas: {
          titulo: "Plan",
          tareas: [{ numero: "01", titulo: "Tabla", estado: "hecha", bloqueadaPor: [], criterios: { hechos: 1, total: 2 }, cuerpo: "x" }],
        },
      },
    ]);
  });

  it("el progreso de cada tarea cruza, y una palabra que no es de las cuatro no", () => {
    const plan = (progreso: unknown) =>
      leerPlanesDelCable([
        { nombre: "p", ficheros: [], modificado: 1, tareas: { tareas: [{ numero: "T1", titulo: "t", bloqueadaPor: [], criterios: { hechos: 0, total: 1 }, cuerpo: "", progreso }] } },
      ])![0]!.tareas!.tareas[0]!;
    expect(plan("implementada").progreso).toBe("implementada");
    expect(plan("finalizada").progreso).toBe("finalizada");
    expect(plan("hecha")).not.toHaveProperty("progreso");
  });

  it("lo que no es una lista no es «no hay planes»", () => {
    expect(leerPlanesDelCable(undefined)).toBeUndefined();
    expect(leerPlanesDelCable([])).toEqual([]);
  });
});
