import { tool } from "@langchain/core/tools";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { unaCriticaPorTarea } from "./unaCriticaPorTarea.js";

describe("el crítico del orquestador, una vez por tarea", () => {
  it("la primera crítica de una tarea pasa; la segunda, no; otra tarea vuelve a pasar; sin tarea no se limita", async () => {
    let llamadas = 0;
    const critica = tool(async () => (llamadas++, "ROJO: el = es más saturado"), { name: "xone_critica_visual", description: "x", schema: z.object({ captura: z.string() }) });
    let tarea: string | undefined = "calc|1";
    const limitada = unaCriticaPorTarea(critica as never, () => tarea);
    expect(limitada.name).toBe("xone_critica_visual");
    expect(String(await limitada.invoke({ captura: "/a.png" }))).toContain("ROJO");
    expect(String(await limitada.invoke({ captura: "/a.png" }))).toContain("UNA por tarea");
    tarea = "calc|2";
    expect(String(await limitada.invoke({ captura: "/a.png" }))).toContain("ROJO");
    tarea = undefined;
    await limitada.invoke({ captura: "/a.png" });
    await limitada.invoke({ captura: "/a.png" });
    expect(llamadas).toBe(4);
  });
});
