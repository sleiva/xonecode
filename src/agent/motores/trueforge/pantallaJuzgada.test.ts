import { tool } from "@langchain/core/tools";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { crearPantallasJuzgadas, maquetaDeReferencia, sinJuzgarDosVeces, textoDeMedidaInformativa } from "./pantallaJuzgada.js";

const CALC = "/artefactos/diseno/screen.jpg";
const OTRA = "/artefactos/diseno/1/screen.png";

describe("una pantalla se juzga en su tarea", () => {
  it("lo criticado en una tarea queda juzgado al pasar a otra; arrastrándola, no; otra maqueta sigue libre", () => {
    const p = crearPantallasJuzgadas();
    p.alCriticar("calc|1", CALC);
    expect(p.juzgadaEn(CALC)).toBeUndefined();
    p.alPasar("calc|1", true);
    expect(p.juzgadaEn(CALC)).toBeUndefined();
    p.alPasar("calc|1", false);
    expect(p.juzgadaEn(CALC)).toBe("calc|1");
    expect(p.juzgadaEn(OTRA)).toBeUndefined();
    // Una tarea sin crítico no juzga nada, y lo juzgado no cambia de tarea.
    p.alPasar("calc|2", false);
    p.alCriticar("calc|3", CALC);
    p.alPasar("calc|3", false);
    expect(p.juzgadaEn(CALC)).toBe("calc|1");
    expect(p.juzgadaEn(undefined)).toBeUndefined();
  });

  it("la referencia casa por ruta, por carpeta y fichero, o es la única maqueta si no la trae", () => {
    expect(maquetaDeReferencia(CALC, [CALC, OTRA])).toBe(CALC);
    expect(maquetaDeReferencia("/diseno/screen.jpg", [CALC, OTRA])).toBe(CALC);
    expect(maquetaDeReferencia(undefined, [CALC])).toBe(CALC);
    expect(maquetaDeReferencia(undefined, [CALC, OTRA])).toBeUndefined();
    expect(maquetaDeReferencia("/adjuntos/otra.png", [CALC])).toBeUndefined();
  });

  it("el crítico contra una maqueta juzgada en OTRA tarea no corre; en la misma, sí; y solo apunta lo que dio veredicto", async () => {
    let llamadas = 0;
    let respuesta = "Veredicto visual de «calc» (comparado con la referencia): rojo.";
    const critica = tool(async () => (llamadas++, respuesta), { name: "xone_critica_visual", description: "x", schema: z.object({ pantalla: z.string(), referencia: z.string().optional() }) });
    const p = crearPantallasJuzgadas();
    let tarea = "calc|1";
    const envuelta = sinJuzgarDosVeces(critica as never, (a) => maquetaDeReferencia((a as { referencia?: string }).referencia, [CALC, OTRA]), p, () => tarea);
    expect(envuelta.name).toBe("xone_critica_visual");
    // Una crítica que falla no juzga nada.
    respuesta = "No pude abrir «c.png» (Error).";
    await envuelta.invoke({ pantalla: "/artefactos/c.png", referencia: CALC });
    p.alPasar("calc|1", false);
    expect(p.juzgadaEn(CALC)).toBeUndefined();
    // Con veredicto, sí: y en la tarea siguiente ya no corre contra esa maqueta.
    tarea = "calc|1";
    respuesta = "Veredicto visual de «calc» (comparado con la referencia): rojo.";
    expect(String(await envuelta.invoke({ pantalla: "/artefactos/c.png", referencia: CALC }))).toContain("rojo");
    p.alPasar("calc|1", false);
    tarea = "calc|2";
    const repetida = String(await envuelta.invoke({ pantalla: "/artefactos/c.png", referencia: "/diseno/screen.jpg" }));
    expect(repetida).toContain("ya se juzgó en la tarea 01 de /planes/calc/");
    expect(repetida).toContain("OBSERVACIÓN");
    // Otra maqueta corre; y volver a encargar la tarea de la pantalla la deja juzgar otra vez.
    expect(String(await envuelta.invoke({ pantalla: "/artefactos/c.png", referencia: OTRA }))).toContain("rojo");
    tarea = "calc|1";
    expect(String(await envuelta.invoke({ pantalla: "/artefactos/c.png", referencia: CALC }))).toContain("rojo");
    expect(llamadas).toBe(4);
  });

  it("la medida contra una maqueta juzgada es un dato: ni ronda visual ni crítico que pedir", () => {
    const t = textoDeMedidaInformativa({ captura: "c.png", maqueta: CALC, tarea: "calc|1", resumen: "vertical 13 %, horizontal 5 %" });
    expect(t).toContain("DATO");
    expect(t).toContain("vertical 13 %");
    expect(t).not.toMatch(/ronda visual \d|xone_critica_visual|No lo des por terminado/);
  });
});
