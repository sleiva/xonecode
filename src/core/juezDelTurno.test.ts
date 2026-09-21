import { describe, expect, it } from "vitest";
import {
  accionDelJuez,
  promptDelJuezDelTurno,
  veredictoDelTurnoDeTexto,
} from "./juezDelTurno.js";

describe("el veredicto del juez del turno", () => {
  it("lee los tres valores que sabe contestar", () => {
    for (const c of ["cumplido", "no-cumplido", "dudoso"] as const) {
      expect(veredictoDelTurnoDeTexto(`{"cumplimiento":"${c}","motivo":"porque sí"}`).cumplimiento).toBe(c);
    }
  });

  it("acepta el JSON envuelto: una respuesta no se tira por su presentación", () => {
    const texto = 'Aquí tienes:\n```json\n{"cumplimiento":"cumplido","motivo":"la app arranca"}\n```';
    expect(veredictoDelTurnoDeTexto(texto)).toEqual({ cumplimiento: "cumplido", motivo: "la app arranca" });
  });

  /**
   * La dirección del fallo, que es la mitad del valor de este juez: decir «cumplido» sin
   * serlo cierra el turno en falso y quien lo pidió se entera al usar la app.
   */
  describe("fail-closed: lo que no se entiende NUNCA es «cumplido»", () => {
    for (const [nombre, texto] of [
      ["texto sin JSON", "pues yo diría que está bien"],
      ["JSON roto", '{"cumplimiento":"cumplido"'],
      ["un valor que no es de los tres", '{"cumplimiento":"verde","motivo":"x"}'],
      ["una lista", "[1,2,3]"],
      ["vacío", ""],
    ] as const) {
      it(nombre, () => {
        expect(veredictoDelTurnoDeTexto(texto).cumplimiento).toBe("dudoso");
      });
    }
  });

  it("sin motivo se dice que no lo dio, en vez de dejar la frase vacía", () => {
    expect(veredictoDelTurnoDeTexto('{"cumplimiento":"no-cumplido"}').motivo).toMatch(/no dio motivo/);
  });
});

describe("qué hace el harness con el veredicto", () => {
  const con = (cumplimiento: "cumplido" | "no-cumplido" | "dudoso") => ({ cumplimiento, motivo: "falta el login" });

  it("cumplido no dice NADA: un juez que felicita en cada turno es ruido", () => {
    expect(accionDelJuez(con("cumplido"), { hayHumano: true })).toEqual({ tipo: "nada" });
    expect(accionDelJuez(con("cumplido"), { hayHumano: false })).toEqual({ tipo: "nada" });
  });

  it("no cumplido AVISA y no pregunta: no hay nada que decidir, hay algo que decir", () => {
    const accion = accionDelJuez(con("no-cumplido"), { hayHumano: true });
    expect(accion.tipo).toBe("aviso");
    // El motivo viaja: un aviso sin el qué es el que enseña a ignorar los avisos.
    expect(accion.tipo === "aviso" && accion.texto).toContain("falta el login");
  });

  it("dudoso PREGUNTA cuando hay alguien a quien preguntar", () => {
    const accion = accionDelJuez(con("dudoso"), { hayHumano: true });
    expect(accion.tipo).toBe("preguntar");
    expect(accion.tipo === "preguntar" && accion.texto).toContain("falta el login");
  });

  /** Sin humano la duda se DEGRADA a aviso, nunca a silencio: en una tarea de fondo es
   *  justo donde nadie está mirando. */
  it("y sin humano la duda se dice igual, como aviso", () => {
    const accion = accionDelJuez(con("dudoso"), { hayHumano: false });
    expect(accion.tipo).toBe("aviso");
    expect(accion.tipo === "aviso" && accion.texto).toContain("falta el login");
  });
});

describe("lo que el juez ve", () => {
  const caso = (hechos: Parameters<typeof promptDelJuezDelTurno>[0]["hechos"]) =>
    promptDelJuezDelTurno({ objetivo: "arregla el arranque", respuesta: "hecho", hechos });

  it("lleva el objetivo y la respuesta, que es lo que tiene que cruzar", () => {
    const p = caso({});
    expect(p).toContain("arregla el arranque");
    expect(p).toContain("hecho");
  });

  it("dice que el simulador NO corrió en vez de callarlo", () => {
    // Callarlo dejaría al juez suponiendo que el proyecto está sano.
    expect(caso({})).toMatch(/no llegó a correr/);
    expect(caso({ verificador: "verde" })).toContain("VERDE");
  });

  it("los hechos ausentes NO se afirman: «no consta» no es «no pasó»", () => {
    const sinNada = caso({});
    expect(sinNada).not.toMatch(/No se cambió ningún fichero/);
    expect(sinNada).not.toMatch(/Quedaron escrituras/);
    expect(sinNada).not.toMatch(/sin presupuesto/);
    // Y una lista vacía sí es un hecho medido: se dice.
    expect(caso({ ficheros: [] })).toMatch(/No se cambió ningún fichero/);
  });

  it("cuenta lo que el agente no va a contar: cortes y escrituras sin resolver", () => {
    const p = caso({ escriturasSinResolver: true, algunEspecialistaCortado: true });
    expect(p).toMatch(/SIN aplicar/);
    expect(p).toMatch(/sin presupuesto/);
  });

  /** Sin esta regla el juez castigaría un turno que hizo su encargo y además algo más. */
  it("avisa de que hacer de MÁS no es incumplir", () => {
    expect(caso({})).toMatch(/Hacer MÁS de lo que se pidió no es incumplir/);
  });

  it("y de que decirlo no es haberlo hecho", () => {
    expect(caso({})).toMatch(/no es que lo hiciera/);
  });
});
