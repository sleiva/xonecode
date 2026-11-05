import { tool } from "@langchain/core/tools";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { unaCriticaPorTarea } from "./unaCriticaPorTarea.js";

describe("el crítico del orquestador, una vez por tarea", () => {
  it("la primera crítica de una tarea pasa; la segunda, no; otra tarea vuelve a pasar; sin tarea no se limita", async () => {
    let llamadas = 0;
    const critica = tool(async () => (llamadas++, "Veredicto visual de «calc»: rojo. El = es más saturado"), { name: "xone_critica_visual", description: "x", schema: z.object({ captura: z.string() }) });
    let tarea: string | undefined = "calc|1";
    const limitada = unaCriticaPorTarea(critica as never, () => tarea);
    expect(limitada.name).toBe("xone_critica_visual");
    expect(String(await limitada.invoke({ captura: "/a.png" }))).toContain("rojo");
    expect(String(await limitada.invoke({ captura: "/a.png" }))).toContain("UNA por tarea");
    tarea = "calc|2";
    expect(String(await limitada.invoke({ captura: "/a.png" }))).toContain("rojo");
    tarea = undefined;
    await limitada.invoke({ captura: "/a.png" });
    await limitada.invoke({ captura: "/a.png" });
    expect(llamadas).toBe(4);
  });

  it("una crítica que FALLA no gasta la de su tarea: la siguiente corre", async () => {
    let respuesta = "No pude abrir «c.png» (Error).";
    const critica = tool(async () => respuesta, { name: "xone_critica_visual", description: "x", schema: z.object({ captura: z.string() }) });
    const limitada = unaCriticaPorTarea(critica as never, () => "calc|1");
    expect(String(await limitada.invoke({ captura: "/c.png" }))).toContain("No pude abrir");
    respuesta = "Veredicto visual de «calc» (comparado con la referencia): verde.";
    expect(String(await limitada.invoke({ captura: "/c.png" }))).toContain("verde");
    expect(String(await limitada.invoke({ captura: "/c.png" }))).toContain("UNA por tarea");
  });
});
