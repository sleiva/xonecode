import { describe, expect, it } from "vitest";
import {
  criteriosAAuditar,
  leerAuditoria,
  lineasDeAuditoria,
  PROMPT_DEL_AUDITOR,
  repartoDeImagenes,
  textoDeCasillaMarcada,
  TOPE_DE_IMAGENES_DE_AUDITORIA,
  type CriterioAAuditar,
} from "./auditoriaDeCierre.js";
import { fichaNueva, type Evidencia, type FichaDeTrabajo } from "./fichaDeTrabajo.js";
import { leerTareasDelPlan } from "./tareasDelPlan.js";

const TASKS = `# Calc

## 02 — El visor
**Estado:** en curso
- [x] al abrir, el visor no enseña valores de ejemplo
- [ ] el resultado se ve en grande
- [x] AC lo deja en 0
`;
const captura = (id: string, cuando: string, resumen = `/artefactos/captura-${id}.png`, version: Record<string, string> = { "/C.xne": "h1" }): Evidencia => ({
  id, tipo: "captura", cuando, quien: "developer-xone", resumen, version,
});
const conFicha = (evidencias: Evidencia[], respaldos: FichaDeTrabajo["respaldos"]): FichaDeTrabajo => ({ ...fichaNueva(), escritos: { "/C.xne": "h1" }, evidencias, respaldos });
const tareas = new Map([["calc", leerTareasDelPlan(TASKS).tareas]]);

describe("qué se audita al cerrar", () => {
  it("la casilla N es la N-ésima casilla de la tarea, y solo si está marcada", () => {
    const cuerpo = leerTareasDelPlan(TASKS).tareas[0]!.cuerpo;
    expect(textoDeCasillaMarcada(cuerpo, 1)).toBe("al abrir, el visor no enseña valores de ejemplo");
    expect(textoDeCasillaMarcada(cuerpo, 2)).toBeUndefined();
    expect(textoDeCasillaMarcada(cuerpo, 3)).toBe("AC lo deja en 0");
  });

  it("solo las marcadas con prueba VIGENTE: una caducada ya la baja el código, sin preguntar", () => {
    const f = conFicha(
      [captura("e1", "2026-11-03T10:00:00Z"), captura("e2", "2026-11-03T09:00:00Z", "/artefactos/vieja.png", { "/C.xne": "h0" })],
      [
        { plan: "calc", tarea: "02", criterio: 1, evidencia: "e1", cuando: "x" },
        { plan: "calc", tarea: "02", criterio: 3, evidencia: "e2", cuando: "x" },
        { plan: "calc", tarea: "02", criterio: 2, evidencia: "e1", cuando: "x" },
      ]
    );
    const a = criteriosAAuditar(f, tareas, { "/C.xne": "h1" });
    // La 3 está caducada (otra huella) y la 2 no está marcada en TASKS.md: solo queda la 1.
    expect(a.map((c) => c.id)).toEqual(["calc/02/1"]);
    expect(a[0]!.texto).toBe("al abrir, el visor no enseña valores de ejemplo");
    expect(a[0]!.ficha).toContain("02 — El visor");
  });

  it("se enseñan como mucho dos capturas, las más recientes; la que no cabe o no guardó su ruta, «no se ve» sin preguntar", () => {
    const c = (id: string, e: Evidencia): CriterioAAuditar => ({ id, plan: "calc", tarea: "02", criterio: 1, texto: "t", ficha: "f", evidencia: e });
    const r = repartoDeImagenes([
      c("a", captura("e1", "2026-11-03T08:00:00Z")),
      c("b", captura("e2", "2026-11-03T09:00:00Z")),
      c("c", captura("e3", "2026-11-03T10:00:00Z")),
      c("d", captura("e4", "2026-11-03T11:00:00Z", "captura")),
    ]);
    expect(r.rutas).toHaveLength(TOPE_DE_IMAGENES_DE_AUDITORIA);
    expect(r.rutas).toEqual(["/artefactos/captura-e3.png", "/artefactos/captura-e2.png"]);
    expect([...r.sinImagen.keys()].sort()).toEqual(["a", "d"]);
  });
});

describe("la respuesta del auditor", () => {
  const ids = ["calc/02/1", "calc/02/3", "calc/04/1"];

  it("«contradice» con su cita refuta; SIN cita no refuta nada (medido: refutaba diciendo que no había contradicción)", () => {
    const a = leerAuditoria(
      '```json\n{"criterios":[' +
        '{"id":"calc/02/1","porque":"enseña la expresión de ejemplo","cita":"4,850.50 ÷ 2.5","veredicto":"contradice"},' +
        '{"id":"calc/02/3","porque":"no hay contradicción","cita":"","veredicto":"contradice"},' +
        '{"id":"calc/04/1","porque":"1940.2","veredicto":"cumple"}]}\n```',
      ids
    );
    expect(a.get("calc/02/1")).toEqual({ veredicto: "contradice", porque: "enseña la expresión de ejemplo", cita: "4,850.50 ÷ 2.5" });
    expect(a.get("calc/02/3")!.veredicto).toBe("no-se-ve");
    expect(a.get("calc/04/1")!.veredicto).toBe("cumple");
  });

  it("lo que no contesta, lo que no se entiende y un id inventado quedan «no se ve» o se ignoran: nunca «cumple»", () => {
    const a = leerAuditoria('{"criterios":[{"id":"otro","veredicto":"cumple"},{"id":"calc/02/1","veredicto":"si"}]}', ids);
    expect([...a.values()].map((v) => v.veredicto)).toEqual(["no-se-ve", "no-se-ve", "no-se-ve"]);
    expect(a.has("otro")).toBe(false);
    expect([...leerAuditoria("no es JSON", ids).values()].every((v) => v.veredicto === "no-se-ve")).toBe(true);
  });

  it("el cierre dice solo lo que no se sostiene, con la cita", () => {
    const a = leerAuditoria('{"criterios":[{"id":"calc/02/1","porque":"p","cita":"4,850.50 ÷ 2.5","veredicto":"contradice"},{"id":"calc/04/1","porque":"ok","veredicto":"cumple"}]}', ["calc/02/1", "calc/04/1"]);
    expect(lineasDeAuditoria(a)).toEqual(["calc/02/1 marcado, y su prueba enseña lo contrario: «4,850.50 ÷ 2.5» (p)"]);
  });

  it("el prompt es el MEDIDO: porqué antes que veredicto, etiquetas sin «no», y el alcance de la prueba (de Codex)", () => {
    expect(PROMPT_DEL_AUDITOR.indexOf('"porque"')).toBeLessThan(PROMPT_DEL_AUDITOR.indexOf('"veredicto"'));
    expect(PROMPT_DEL_AUDITOR).toContain("cumple|contradice|no-se-ve");
    expect(PROMPT_DEL_AUDITOR).toContain("ANTES DEL PRIMER caso");
    expect(PROMPT_DEL_AUDITOR).toContain("La prueba tiene que cubrir TODO lo que pide el criterio");
  });
});
