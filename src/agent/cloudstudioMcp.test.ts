import { describe, expect, it } from "vitest";
import { proyectosDeResultado } from "./cloudstudioMcp.js";

describe("proyectosDeResultado", () => {
  it("extrae identidades de una respuesta estructurada sin conservar el resto", () => {
    expect(proyectosDeResultado({
      projects: [
        { id: "a", name: "Ventas", secreto: "nunca llega a config" },
        { projectId: "b", title: "Inventario" },
        { id: "a", name: "Duplicado" },
      ],
    })).toEqual([
      { id: "a", nombre: "Ventas" },
      { id: "b", nombre: "Inventario" },
    ]);
  });

  it("admite JSON textual y descarta una respuesta que no representa proyectos", () => {
    expect(proyectosDeResultado('{"items":[{"project_id":"a","nombre":"Ventas"}]}')).toEqual([
      { id: "a", nombre: "Ventas" },
    ]);
    expect(proyectosDeResultado("texto libre")).toEqual([]);
  });
});
