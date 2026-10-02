import { describe, expect, it } from "vitest";
import { planAutorizado, type OperacionDeSubida } from "./cloudstudio.js";

const PLAN: OperacionDeSubida[] = [
  { tipo: "texto", ruta: "a.xne", clase: "nuevo" },
  { tipo: "texto", ruta: "js/b.js", clase: "modificado" },
  { tipo: "borrado", ruta: "viejo.xne" },
];

describe("planAutorizado", () => {
  it("true es el plan entero y false es nada", () => {
    expect(planAutorizado(PLAN, true)).toEqual(PLAN);
    expect(planAutorizado(PLAN, false)).toEqual([]);
  });

  it("una selección es la INTERSECCIÓN con el plan, en el orden del plan", () => {
    expect(planAutorizado(PLAN, { rutas: ["viejo.xne", "a.xne", "inventada.xne"] }).map((o) => o.ruta)).toEqual([
      "a.xne",
      "viejo.xne",
    ]);
  });

  it("una selección vacía no autoriza nada, aunque el objeto sea «verdadero»", () => {
    expect(planAutorizado(PLAN, { rutas: [] })).toEqual([]);
  });

  it("lo que llega mal formado por el cable no autoriza nada", () => {
    expect(planAutorizado(PLAN, { rutas: [1, null] as unknown as string[] })).toEqual([]);
    expect(planAutorizado(PLAN, { rutas: "a.xne" } as unknown as { rutas: string[] })).toEqual([]);
  });
});
