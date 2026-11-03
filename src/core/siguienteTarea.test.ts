import { describe, expect, it } from "vitest";
import { leerTareasDelPlan } from "./tareasDelPlan.js";
import { siguienteTareaPendiente, textoDeSiguienteTarea, textoSinMasTareas } from "./siguienteTarea.js";

const TASKS = `# Plan

## 01 — Pantalla
**Estado:** hecha
- [x] se abre

## 02 — Teclado
**Estado:** implementada
- [x] teclas
- [ ] suma

## 03 — Iconos
**Estado:** pendiente
- [ ] iconos

## 04 — Historial
**Estado:** pendiente
- [ ] lista
`;

const tareas = leerTareasDelPlan(TASKS).tareas;

describe("la siguiente tarea del desarrollador continuo", () => {
  it("la primera no finalizada que no es la actual ni se cerró ya", () => {
    expect(siguienteTareaPendiente(tareas, "02", new Set())?.numero).toBe("03");
    expect(siguienteTareaPendiente(tareas, "03", new Set(["02"]))?.numero).toBe("04");
  });

  it("no vuelve a una que ya cerró en este encargo aunque la dejara a medias, y al final no hay más", () => {
    expect(siguienteTareaPendiente(tareas, "04", new Set(["2", "T03"]))).toBeUndefined();
  });

  it("los textos dicen qué tarea se cerró, cómo seguir y cuándo acabar", () => {
    expect(textoDeSiguienteTarea("02", "TAREA: 03\nficha")).toContain("Tarea 02 cerrada. SIGUE en esta misma conversación");
    expect(textoDeSiguienteTarea("02", "TAREA: 03\nficha")).toContain("TAREA: 03\nficha");
    expect(textoSinMasTareas("calc", ["01", "02"])).toContain("cerradas en este encargo: 01, 02");
  });
});
