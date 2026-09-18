import { describe, expect, it } from "vitest";
import {
  ErrorDelJuezVisual,
  juzgarPantalla,
  PROMPT_VISUAL,
  TOPE_DE_OBSERVACIONES,
  type InvocarVisual,
} from "./juezVisual.js";

const PANTALLA = { base64: "/9j/4AAQ", mime: "image/jpeg" };
const contesta = (texto: string): InvocarVisual => async () => texto;

describe("juzgarPantalla", () => {
  it("lee el veredicto y las observaciones", async () => {
    const v = await juzgarPantalla(
      PANTALLA,
      { pantalla: "Calculadora" },
      contesta('{"veredicto":"rojo","hallazgos":["el texto de los botones sale cortado"]}'),
    );

    expect(v.veredicto).toBe("rojo");
    expect(v.observaciones).toEqual(["el texto de los botones sale cortado"]);
  });

  /** Los modelos envuelven el JSON en una valla aunque se les pida crudo. Medido tres veces. */
  it("tolera la valla de código ```json", async () => {
    const v = await juzgarPantalla(
      PANTALLA,
      { pantalla: "Calculadora" },
      contesta('```json\n{"veredicto":"verde","hallazgos":[]}\n```'),
    );

    expect(v.veredicto).toBe("verde");
  });

  /**
   * Fail-closed, igual que el juez de tareas: lo que no se entiende NO es un verde. Y aquí
   * importa más todavía, porque este veredicto puede acabar frenando una entrega.
   */
  it("lo que no parsea es INDETERMINADO, nunca verde", async () => {
    for (const basura of ["", "no sé qué decirte", '{"veredicto":"quizá"}', "{roto"]) {
      const v = await juzgarPantalla(PANTALLA, { pantalla: "X" }, contesta(basura));
      expect(v.veredicto, `«${basura}» no puede ser verde`).toBe("indeterminado");
    }
  });

  /**
   * Un rojo sin nada que enseñar no se puede actuar: nadie sabe qué mirar. Es la misma regla
   * que «un verde sin resumen» del juez de tareas.
   */
  it("un ROJO sin observaciones es indeterminado", async () => {
    const v = await juzgarPantalla(PANTALLA, { pantalla: "X" }, contesta('{"veredicto":"rojo","hallazgos":[]}'));

    expect(v.veredicto).toBe("indeterminado");
  });

  /**
   * MEDIDO tres veces sobre la MISMA captura: 4, 2 y 4 observaciones, con redacción distinta.
   * No es una huella, y por eso esto se acota como se acota el resumen de un juez: para que
   * quepa en una tarjeta, no para compararlo.
   */
  it("acota cuántas observaciones y cuánto ocupa cada una", async () => {
    const muchas = Array.from({ length: 30 }, (_, i) => `observación ${i} ${"x".repeat(500)}`);
    const v = await juzgarPantalla(
      PANTALLA,
      { pantalla: "X" },
      contesta(JSON.stringify({ veredicto: "rojo", hallazgos: muchas })),
    );

    expect(v.observaciones).toHaveLength(TOPE_DE_OBSERVACIONES);
    for (const o of v.observaciones) expect(o.length).toBeLessThanOrEqual(200);
  });

  /**
   * El prompt pide lo que SE VE y no la causa. **Ojo con lo que este test NO afirma**: se midió
   * y la instrucción NO evita la falsa explicación — con ella puesta, las tres vueltas
   * siguieron diciendo «girado 180°» de un texto que está CORTADO. Se queda porque acota el
   * resto (nada de gustos ni de paleta), no porque funcione para esto. El remedio vive en
   * quien enseñe las observaciones, avisando de que la redacción no es fiable.
   */
  it("el prompt pide lo que SE VE y prohíbe diagnosticar la causa", () => {
    expect(PROMPT_VISUAL).toMatch(/no digas la causa|no expliques por qué|sin diagnosticar/i);
    expect(PROMPT_VISUAL).toMatch(/lo que se ve/i);
  });

  /** Y el tipo lo dice también: son OBSERVACIONES, no hallazgos con fichero y línea. */
  it("no se pudo preguntar es fallo del ENTORNO, no un veredicto", async () => {
    const invocar: InvocarVisual = async () => {
      throw new Error("sin red");
    };

    await expect(juzgarPantalla(PANTALLA, { pantalla: "X" }, invocar)).rejects.toThrow(ErrorDelJuezVisual);
  });

  it("la imagen y la pantalla llegan al modelo", async () => {
    let vistos: unknown;
    const invocar: InvocarVisual = async (_papel, prompt, imagen) => {
      vistos = { prompt, imagen };
      return '{"veredicto":"verde","hallazgos":[]}';
    };

    await juzgarPantalla(PANTALLA, { pantalla: "Calculadora" }, invocar);

    expect(vistos).toMatchObject({ imagen: PANTALLA });
    expect((vistos as { prompt: string }).prompt).toContain("Calculadora");
  });
});
