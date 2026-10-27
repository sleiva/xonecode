import { describe, expect, it } from "vitest";
import { conPlanesAbiertos, TOPE_DE_PLANES, TOPE_DE_TAREAS } from "./planesAbiertos.js";
import { leerTareasDelPlan } from "./tareasDelPlan.js";

const TASKS = [
  "# Wireframes v2",
  "",
  "### T1 — Inicio",
  "**Estado:** hecha",
  "- [x] pinta el saludo",
  "",
  "### T2 — Hoja «Cuándo»",
  "**Estado:** implementada",
  "**Bloqueada por:** T1",
  "- [x] abre la hoja",
  "- [ ] el atrás la cierra",
  "",
  "### T3 — Rótulo cortado",
  "**Estado:** pendiente",
  "- [ ] se lee entero",
  "",
  "## Orden de ejecución",
  "T1, T2, T3",
].join("\n");

describe("conPlanesAbiertos", () => {
  it("dice las tareas abiertas, por dónde van y dónde está su ficha; la terminada no sale", () => {
    const texto = conPlanesAbiertos("continúa", [{ nombre: "busme", tareas: leerTareasDelPlan(TASKS) }]);
    expect(texto.startsWith("continúa\n\nPLANES ABIERTOS")).toBe(true);
    expect(texto).toContain("- /planes/busme/TASKS.md «Wireframes v2»: 1 de 3 tareas finalizadas. Abiertas:");
    expect(texto).toContain("  - T2 Hoja «Cuándo» — implementada, sin comprobar del todo, 1/2 criterios, bloqueada por T1 (ficha: offset=6 limit=6)");
    expect(texto).toContain("  - T3 Rótulo cortado — pendiente, 0/1 criterios (ficha: offset=12 limit=4)");
    expect(texto).not.toContain("T1 Inicio");
  });

  it("el offset y el limit que da leen EXACTAMENTE la ficha de la tarea, sin la siguiente ni el «## Orden»", () => {
    const lineas = TASKS.split("\n");
    for (const t of leerTareasDelPlan(TASKS).tareas) {
      const ficha = lineas.slice(t.linea - 1, t.linea - 1 + t.lineas);
      expect(ficha[0]).toMatch(new RegExp(`^### ${t.numero} — `));
      expect(ficha.slice(1).some((l) => /^##/.test(l))).toBe(false);
    }
  });

  it("sin planes abiertos la petición sale TAL CUAL: todo terminado, sin TASKS.md o sin poder leer", () => {
    const terminado = leerTareasDelPlan("### T1 — Uno\n**Estado:** hecha\n");
    expect(conPlanesAbiertos("hola", [{ nombre: "a", tareas: terminado }, { nombre: "b" }])).toBe("hola");
    expect(conPlanesAbiertos("hola", [])).toBe("hola");
  });

  it("lo que no cabe se CUENTA: planes y tareas de más", () => {
    const muchas = Array.from({ length: TOPE_DE_TAREAS + 3 }, (_, i) => `### T${i + 1} — Tarea ${i + 1}\n**Estado:** pendiente\n`).join("\n");
    const planes = Array.from({ length: TOPE_DE_PLANES + 2 }, (_, i) => ({ nombre: `p${i}`, tareas: leerTareasDelPlan(muchas) }));
    const texto = conPlanesAbiertos("x", planes);
    expect(texto).toContain("(y 3 abiertas más: están en el TASKS.md)");
    expect(texto).toContain("(y 2 planes abiertos más en /planes/)");
    expect(texto).not.toContain(`/planes/p${TOPE_DE_PLANES}/`);
  });
});
