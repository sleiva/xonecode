import { describe, expect, it } from "vitest";
import { arbolDeFinalizadas, type NodoDeTarea } from "./arbolDeTareas.js";
import type { TareaDelCable } from "./tipos.js";

const t = (id: string, extra: Partial<TareaDelCable> = {}): TareaDelCable => ({
  id, proyecto: "p", proyectoNombre: "P", titulo: id, peticion: "p", encargo: "e", adjuntos: [], estado: "terminada",
  creada: "2026-10-19T08:00:00.000Z", ...extra,
});
const forma = (nodos: NodoDeTarea[]): unknown => nodos.map((n) => (n.hijas.length === 0 ? n.tarea.id : { [n.tarea.id]: forma(n.hijas) }));

describe("las finalizadas como árbol", () => {
  it("una continuación cuelga de su tarea, y la de una continuación, de esa", () => {
    const arbol = arbolDeFinalizadas([
      t("menu", { acabada: "2026-10-19T09:00:00.000Z" }),
      t("menu-2", { continuaDe: "menu", creada: "2026-10-19T10:00:00.000Z", acabada: "2026-10-19T11:00:00.000Z" }),
      t("menu-3", { continuaDe: "menu-2", creada: "2026-10-19T12:00:00.000Z", acabada: "2026-10-19T13:00:00.000Z" }),
      t("otra", { acabada: "2026-10-19T12:30:00.000Z" }),
    ]);
    // La familia del menú acabó lo último (13:00): va arriba aunque su raíz acabara antes que «otra».
    expect(forma(arbol)).toEqual([{ menu: [{ "menu-2": ["menu-3"] }] }, "otra"]);
  });

  it("las hijas en el orden en que se crearon", () => {
    const arbol = arbolDeFinalizadas([
      t("a"),
      t("a-tarde", { continuaDe: "a", creada: "2026-10-19T12:00:00.000Z" }),
      t("a-pronto", { continuaDe: "a", creada: "2026-10-19T10:00:00.000Z" }),
    ]);
    expect(forma(arbol)).toEqual([{ a: ["a-pronto", "a-tarde"] }]);
  });

  it("si su padre no está en la lista es raíz, y un ciclo no esconde a nadie", () => {
    expect(forma(arbolDeFinalizadas([t("huerfana", { continuaDe: "borrada" })]))).toEqual(["huerfana"]);
    const enCiclo = arbolDeFinalizadas([t("x", { continuaDe: "y" }), t("y", { continuaDe: "x" })]);
    const ids = JSON.stringify(forma(enCiclo));
    expect(ids).toContain("x");
    expect(ids).toContain("y");
  });
});
