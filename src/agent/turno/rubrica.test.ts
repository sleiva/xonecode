import { describe, expect, it, vi } from "vitest";
import { createAgent, FakeToolCallingModel } from "langchain";
import { HumanMessage } from "@langchain/core/messages";
import { middlewareDeRubrica, type Calificador } from "./rubrica.js";
import type { Calificacion, EstadoDeRubrica } from "../../core/rubrica.js";

/**
 * El bucle entero, contra la librería DE VERDAD y sin red: el modelo es
 * `FakeToolCallingModel` y el calificador es un doble. Es lo que hace probable un middleware
 * que, por diseño, vive dentro del grafo.
 */
function correr(calificar: Calificador, estadoExtra: Record<string, unknown>, tope?: number) {
  const evaluaciones: Array<{ estado: EstadoDeRubrica; vuelta: number }> = [];
  const agente = createAgent({
    model: new FakeToolCallingModel({ responses: [] } as never),
    tools: [],
    middleware: [
      middlewareDeRubrica({
        calificar,
        ...(tope === undefined ? {} : { tope }),
        alEvaluar: (estado, vuelta) => evaluaciones.push({ estado, vuelta }),
      }),
    ],
  } as never) as { invoke: (x: unknown) => Promise<{ messages: Array<{ content?: unknown }> }> };
  return { evaluaciones, correr: () => agente.invoke({ messages: [new HumanMessage("hola")], ...estadoExtra }) };
}

const dice = (veredicto: Calificacion["veredicto"], comentario = ""): Calificador =>
  async () => ({ veredicto, comentario });

const textos = (r: { messages: Array<{ content?: unknown }> }): string =>
  r.messages.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");

describe("middlewareDeRubrica", () => {
  it("SIN rúbrica no hace nada, ni siquiera llama al calificador", async () => {
    // Por eso se puede montar siempre: lo que decide si hay bucle es el dato, no una bandera.
    // Si llamara al calificador «por si acaso», cada turno normal pagaría una llamada de más.
    const calificar = vi.fn(dice("necesita-revision", "falta"));
    const { correr: ir, evaluaciones } = correr(calificar, {});
    await ir();
    expect(calificar).not.toHaveBeenCalled();
    expect(evaluaciones).toEqual([]);
  });

  it("una rúbrica en BLANCO tampoco cuenta como rúbrica", async () => {
    const calificar = vi.fn(dice("satisfecho"));
    const { correr: ir } = correr(calificar, { rubrica: "   " });
    await ir();
    expect(calificar).not.toHaveBeenCalled();
  });

  it("satisfecho cierra sin decir nada y sin volver al modelo", async () => {
    const { correr: ir, evaluaciones } = correr(dice("satisfecho"), { rubrica: "que se lea entero" });
    const r = await ir();
    expect(evaluaciones).toEqual([{ estado: "satisfecho", vuelta: 1 }]);
    expect(textos(r)).not.toContain("[harness]");
    expect(textos(r)).not.toContain("⚠");
  });

  it("necesita-revision devuelve el trabajo al modelo con el comentario", async () => {
    // El salto de vuelta es lo que hace de esto un bucle y no un informe.
    const { correr: ir } = correr(dice("necesita-revision", "sigue cortado"), { rubrica: "r" }, 3);
    const r = await ir();
    expect(textos(r)).toContain("sigue cortado");
    expect(textos(r)).toContain("[harness]");
  });

  it("el tope corta el bucle y lo DICE", async () => {
    // Sin esto, un calificador que nunca se da por satisfecho es un bucle que nadie frena —y en
    // una tarea de fondo no hay humano delante—.
    const { correr: ir, evaluaciones } = correr(dice("necesita-revision", "no"), { rubrica: "r" }, 1);
    const r = await ir();
    expect(evaluaciones.at(-1)?.estado).toBe("tope-de-vueltas");
    expect(textos(r)).toContain("revisión NO satisfecha");
  });

  it("un calificador que REVIENTA no tumba el turno, y se distingue del trabajo malo", async () => {
    // `error-del-calificador` culpa al entorno; `fallido` culpa a la rúbrica. Mezclarlos manda
    // a arreglar lo que no estaba roto.
    const { correr: ir, evaluaciones } = correr(async () => { throw new Error("sin clave"); }, { rubrica: "r" });
    const r = await ir();
    expect(evaluaciones.at(-1)?.estado).toBe("error-del-calificador");
    expect(textos(r)).toMatch(/fallo del entorno/i);
  });

  it("`fallido` cierra y lleva el comentario del calificador", async () => {
    const { correr: ir, evaluaciones } = correr(dice("fallido", "la rúbrica habla de otra cosa"), { rubrica: "r" });
    const r = await ir();
    expect(evaluaciones.at(-1)?.estado).toBe("fallido");
    expect(textos(r)).toContain("la rúbrica habla de otra cosa");
  });

  it("no vuelve a juzgar un turno ya cerrado", async () => {
    // Sin la guarda, volver a pasar por el gancho reabriría un bucle que ya había decidido.
    const calificar = vi.fn(dice("satisfecho"));
    const { correr: ir } = correr(calificar, { rubrica: "r", estadoDeRubrica: "satisfecho" });
    await ir();
    expect(calificar).not.toHaveBeenCalled();
  });
});
