import { describe, expect, it } from "vitest";
import {
  CARACTERES_DE_MOTIVO,
  CARACTERES_DE_TITULO,
  componerPanorama,
  LINEAS_DE_DIFF_EN_PANORAMA,
  TAREAS_TERMINADAS_EN_PANORAMA,
  type EntradaDePanorama,
  type TareaDePanorama,
} from "./panorama.js";

const consola = (id: string, o: Partial<EntradaDePanorama["consolas"][number]> = {}): EntradaDePanorama["consolas"][number] => ({
  id, proyecto: `P${id}`, foco: false, turnoEnVuelo: false, preguntaPendiente: false, ...o,
});
const aprob = (n = 1, diffs: Record<string, { tipo: "igual"; texto: string }[]> = {}) => ({
  pendientes: Array.from({ length: n }, (_, i) => ({ id: `a${i}`, origen: "developer-xone", descripcion: "escribir", decisionesPermitidas: ["approve", "reject"] })),
  ficheros: {}, diffs,
});
const tarea = (id: string, estado: TareaDePanorama["estado"], o: Partial<TareaDePanorama> = {}): TareaDePanorama => ({
  id, titulo: `T${id}`, proyecto: "App", estado, creada: `2026-10-0${id.length}T00:00:00Z`, ...o,
});

describe("componerPanorama", () => {
  it("el estado de cada consola sale por prioridad", () => {
    const p = componerPanorama({
      consolas: [
        consola("a", { aprobacion: aprob(), preguntaPendiente: true, turnoEnVuelo: true }),
        consola("b", { preguntaPendiente: true, turnoEnVuelo: true }),
        consola("c", { turnoEnVuelo: true }),
        consola("d"),
      ],
      tareas: [],
    });
    expect(Object.fromEntries(p.consolas.map((c) => [c.id, c.estado]))).toEqual({
      a: "esperando-aprobacion", b: "esperando-respuesta", c: "trabajando", d: "parada",
    });
  });

  it("el foco va primero y luego por urgencia", () => {
    const p = componerPanorama({
      consolas: [consola("d"), consola("c", { turnoEnVuelo: true }), consola("f", { foco: true }), consola("a", { aprobacion: aprob() })],
      tareas: [],
    });
    expect(p.consolas.map((c) => c.id)).toEqual(["f", "a", "c", "d"]);
  });

  it("tareas: atención, en proceso, nuevas y las últimas terminadas; una encadenada va tras su anterior", () => {
    const terminadas = Array.from({ length: TAREAS_TERMINADAS_EN_PANORAMA + 2 }, (_, i) =>
      tarea(`t${i}`, "terminada", { creada: "2026-01-01", acabada: `2026-02-0${i + 1}` }),
    );
    const p = componerPanorama({
      consolas: [],
      tareas: [
        tarea("n2", "nuevo", { creada: "2026-03-01", tras: "n1" }),
        tarea("n0", "nuevo", { creada: "2026-03-02" }),
        tarea("n1", "nuevo", { creada: "2026-03-03" }),
        tarea("ep", "en-proceso"),
        tarea("ra", "requiere-atencion", { motivo: "falta algo" }),
        ...terminadas,
      ],
    });
    const ids = p.tareas.map((t) => t.id);
    expect(ids.slice(0, 2)).toEqual(["ra", "ep"]);
    expect(ids.indexOf("n2")).toBe(ids.indexOf("n1") + 1);
    const term = p.tareas.filter((t) => t.estado === "terminada").map((t) => t.id);
    expect(term).toEqual(["t6", "t5", "t4", "t3", "t2"]);
  });

  it("una nueva cuya anterior ya terminó se queda en su bloque, no entre las terminadas", () => {
    const p = componerPanorama({
      consolas: [],
      tareas: [
        tarea("n1", "nuevo", { creada: "2026-03-01", tras: "t1" }),
        tarea("n0", "nuevo", { creada: "2026-03-02" }),
        tarea("t1", "terminada", { creada: "2026-01-01", acabada: "2026-02-01" }),
      ],
    });
    expect(p.tareas.map((t) => t.id)).toEqual(["n1", "n0", "t1"]);
  });

  it("una tarea que se nombra a sí misma en `tras` no se mueve", () => {
    const p = componerPanorama({
      consolas: [],
      tareas: [
        tarea("ra", "requiere-atencion"),
        tarea("n1", "nuevo", { creada: "2026-03-01" }),
        tarea("n2", "nuevo", { creada: "2026-03-02", tras: "n2" }),
      ],
    });
    expect(p.tareas.map((t) => t.id)).toEqual(["ra", "n1", "n2"]);
  });

  it("recorta título, motivo (solo con requiere-atencion) y diffs por fichero", () => {
    const largo = "x".repeat(1000);
    const lineas = Array.from({ length: LINEAS_DE_DIFF_EN_PANORAMA + 10 }, (_, i) => ({ tipo: "igual" as const, texto: `l${i}` }));
    const p = componerPanorama({
      consolas: [consola("a", { aprobacion: aprob(1, { a0: lineas, a1: lineas.slice(0, 3) }) })],
      tareas: [
        tarea("ra", "requiere-atencion", { titulo: largo, motivo: largo }),
        tarea("ep", "en-proceso", { motivo: largo }),
      ],
    });
    const [ra, ep] = p.tareas;
    expect(ra.titulo.length).toBe(CARACTERES_DE_TITULO);
    expect(ra.motivo?.length).toBe(CARACTERES_DE_MOTIVO);
    expect(ep.motivo).toBeUndefined();
    const ap = p.consolas[0].aprobacion!;
    expect(ap.diffs.a0).toHaveLength(LINEAS_DE_DIFF_EN_PANORAMA);
    expect(ap.diffs.a1).toHaveLength(3);
    expect(ap.recortada).toBe(true);
  });

  it("sin recorte no marca `recortada`", () => {
    const p = componerPanorama({ consolas: [consola("a", { aprobacion: aprob(1, { a0: [{ tipo: "igual", texto: "x" }] }) })], tareas: [] });
    expect(p.consolas[0].aprobacion).not.toHaveProperty("recortada");
  });

  it("esperando suma pendientes de todas las consolas y tareas en requiere-atencion", () => {
    const p = componerPanorama({
      consolas: [consola("a", { aprobacion: aprob(2) }), consola("b", { aprobacion: aprob(1) }), consola("c")],
      tareas: [tarea("ra", "requiere-atencion", { motivo: "m" }), tarea("ep", "en-proceso")],
    });
    expect(p.esperando).toBe(4);
  });

  it("ningún campo tiene aspecto de ruta absoluta de la máquina", () => {
    const p = componerPanorama({
      consolas: [consola("a", { sesion: "Mi sesión", foco: true, ultimaActividad: "2026-10-13T10:00:00Z", aprobacion: aprob(1, { a0: [{ tipo: "igual", texto: "x" }] }) })],
      tareas: [tarea("ra", "requiere-atencion", { motivo: "falta algo" })],
    });
    const textos: string[] = [];
    const recorrer = (v: unknown, clave = ""): void => {
      if (typeof v === "string") textos.push(clave === "tipo" ? "" : v);
      else if (Array.isArray(v)) v.forEach((x) => recorrer(x));
      else if (typeof v === "object" && v !== null) for (const [k, x] of Object.entries(v)) recorrer(x, k);
    };
    recorrer(p);
    for (const t of textos) expect(t).not.toMatch(/^(\/|[A-Za-z]:[\\/]|~)/);
    expect(JSON.stringify(Object.keys(p.consolas[0]))).not.toMatch(/raiz/i);
  });
});
