import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { ejecutarTareaAutonoma } from "./tareaAutonoma.js";
import { ErrorDeTareaSinHumano } from "../web/servidor/consolaDeTarea.js";
import { motivoDePreguntaPendiente } from "../core/entrega.js";
import { TOPE_DE_RONDAS_DE_TAREA } from "../core/tareas.js";
import type { EjecutorDeTurno } from "../cli/consola.js";
import type { JuezDeTareaPort } from "../core/ports.js";

/** Un repo de verdad con un commit base: esto prueba git, no un doble de git. */
function repo(): string {
  const raiz = mkdtempSync(join(tmpdir(), "tarea-autonoma-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: raiz });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  writeFileSync(join(raiz, "app.xml"), "<app/>");
  git("add", "-A");
  git("commit", "-qm", "base");
  return raiz;
}

const verde: JuezDeTareaPort = { juzgar: async () => ({ veredicto: "verde", resumen: "bien" }) };

describe("ejecutarTareaAutonoma", () => {
  it("escribe, commitea sellado, juzga y cierra", async () => {
    const raiz = repo();
    const ejecutor: EjecutorDeTurno = async (_peticion, _estado, consola) => {
      writeFileSync(join(raiz, "a.xne"), "<coll/>");
      const piel = consola.piel?.();
      piel?.linea("write_file a.xne");
      piel?.token("He creado a.xne.");
      return { verificador: "verde", pendientes: 0 };
    };
    const r = await ejecutarTareaAutonoma({ raiz, encargo: "crea a.xne", fuentes: {}, ejecutor, juez: verde });
    expect(r.entrega.entregable).toBe(true);
    expect(r.comentario).toContain("a.xne");
    expect(r.resumen).toBe("He creado a.xne.");
    const log = execFileSync("git", ["log", "-1", "--format=%B"], { cwd: raiz }).toString();
    expect(log).toContain(r.sesion);
    // Y el árbol queda limpio: el commit se llevó todo lo del turno.
    expect(execFileSync("git", ["status", "--porcelain"], { cwd: raiz }).toString()).toBe("");
  });

  it("una pregunta pendiente no pasa por el juez", async () => {
    const raiz = repo();
    const juez = { juzgar: vi.fn() };
    const ejecutor: EjecutorDeTurno = async () => ({
      verificador: "no-corrio",
      pendientes: 0,
      preguntaPendiente: "¿Qué color?",
    });
    const r = await ejecutarTareaAutonoma({ raiz, encargo: "x", fuentes: {}, ejecutor, juez });
    expect(juez.juzgar).not.toHaveBeenCalled();
    expect(r.entrega).toEqual({ entregable: false, motivo: motivoDePreguntaPendiente("¿Qué color?") });
  });

  it("una tarea que necesita a una persona no lanza", async () => {
    const raiz = repo();
    const ejecutor: EjecutorDeTurno = async () => {
      throw new ErrorDeTareaSinHumano("pide una clave");
    };
    const r = await ejecutarTareaAutonoma({ raiz, encargo: "x", fuentes: {}, ejecutor, juez: verde });
    expect(r.entrega.entregable).toBe(false);
    expect(r.entrega.motivo).toContain("pide una clave");
  });

  it("un juez que no contesta deja la entrega sin evaluar", async () => {
    const raiz = repo();
    const ejecutor: EjecutorDeTurno = async () => {
      writeFileSync(join(raiz, "b.xne"), "<coll/>");
      return { verificador: "verde", pendientes: 0 };
    };
    const colgado: JuezDeTareaPort = { juzgar: () => new Promise(() => {}) };
    const r = await ejecutarTareaAutonoma({
      raiz, encargo: "x", fuentes: {}, ejecutor, juez: colgado, topeDelJuezMs: 20,
    });
    expect(r.entrega.entregable).toBe(false);
    expect(r.entrega.motivo).toMatch(/juez de QA no contestó/);
    expect(r.veredicto).toBeUndefined();
  });

  it("le da al ejecutor una consola de tarea con el tope de tarea", async () => {
    const raiz = repo();
    let visto: { fondo?: boolean; tope?: number } = {};
    const ejecutor: EjecutorDeTurno = async (_p, _e, consola) => {
      visto = { fondo: consola.tareaDeFondo, tope: consola.topeDeAprobaciones };
      return { verificador: "no-corrio", pendientes: 0 };
    };
    await ejecutarTareaAutonoma({ raiz, encargo: "x", fuentes: {}, ejecutor, juez: verde });
    expect(visto).toEqual({ fondo: true, tope: TOPE_DE_RONDAS_DE_TAREA });
  });

  it("y con el tope de rondas que se le dé", async () => {
    const raiz = repo();
    let tope: number | undefined;
    const ejecutor: EjecutorDeTurno = async (_p, _e, consola) => {
      tope = consola.topeDeAprobaciones;
      return { verificador: "no-corrio", pendientes: 0 };
    };
    await ejecutarTareaAutonoma({ raiz, encargo: "x", fuentes: {}, ejecutor, juez: verde, topeDeRondas: 7 });
    expect(tope).toBe(7);
  });

  it("el resumen sobrevive a las líneas que llegan después de la respuesta final", async () => {
    // El verificador y el juez del turno pintan DESPUÉS de que el agente conteste: si una línea
    // borrara lo dicho, el resumen saldría vacío justo en los turnos que acaban bien.
    const raiz = repo();
    const ejecutor: EjecutorDeTurno = async (_p, _e, consola) => {
      const piel = consola.piel?.();
      piel?.token("Primero miro.");
      piel?.linea("read_file app.xml");
      piel?.token("Hecho: ");
      piel?.token("todo en orden.");
      piel?.linea("✓ verificador en verde");
      return { verificador: "no-corrio", pendientes: 0 };
    };
    const r = await ejecutarTareaAutonoma({ raiz, encargo: "x", fuentes: {}, ejecutor, juez: verde });
    expect(r.resumen).toBe("Hecho: todo en orden.");
  });

  it("un error que no es de la tarea sale, pero lo escrito queda commiteado", async () => {
    const raiz = repo();
    const ejecutor: EjecutorDeTurno = async () => {
      writeFileSync(join(raiz, "c.xne"), "<coll/>");
      throw new Error("el modelo se cayó");
    };
    await expect(ejecutarTareaAutonoma({ raiz, encargo: "x", fuentes: {}, ejecutor, juez: verde })).rejects.toThrow(
      "el modelo se cayó"
    );
    expect(execFileSync("git", ["status", "--porcelain"], { cwd: raiz }).toString()).toBe("");
  });
});
