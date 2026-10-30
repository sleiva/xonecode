import { describe, expect, it } from "vitest";
import { capacidadDeNotas } from "./capacidades.js";
import { crearControlDeDetencion } from "./detencion.js";
import { crearControlDePresupuesto, textoDePresupuestoAgotado, textoDeVueltasAgotadas } from "./presupuesto.js";

describe("el presupuesto de llamadas de un hijo: al agotarse, cierra con un resumen", () => {
  it("la orden llega ANTES de la llamada número `limite`, una sola vez, y desde ahí solo texto", () => {
    const p = crearControlDePresupuesto();
    p.nacio("hijo", 3);
    expect(p.antesDeLlamar("hijo")).toBeUndefined();
    expect(p.antesDeLlamar("hijo")).toBeUndefined();
    expect(p.soloTexto("hijo")).toBe(false);
    expect(p.antesDeLlamar("hijo")).toBe(textoDePresupuestoAgotado(3));
    expect(p.soloTexto("hijo")).toBe(true);
    expect(p.agotado("hijo")).toBe(3);
    expect(p.antesDeLlamar("hijo")).toBeUndefined();
  });

  it("un corte pedido desde fuera (el tope de vueltas) llega en la SIGUIENTE llamada, una vez, y desde ahí solo texto", () => {
    const p = crearControlDePresupuesto();
    p.nacio("hijo", 100);
    p.cortar("raiz-no-registrado", "x");
    expect(p.antesDeLlamar("raiz-no-registrado")).toBeUndefined();
    p.cortar("hijo", textoDeVueltasAgotadas(6, false));
    expect(p.antesDeLlamar("hijo")).toContain("tope de 6 vueltas de ajuste en este encargo");
    expect(p.soloTexto("hijo")).toBe(true);
    expect(p.antesDeLlamar("hijo")).toBeUndefined();
    p.reiniciar();
    p.nacio("hijo", 100);
    expect(p.antesDeLlamar("hijo")).toBeUndefined();
  });

  it("cada hijo lleva SU cuenta, y el raíz (no registrado) ninguna", () => {
    const p = crearControlDePresupuesto();
    p.nacio("conductor", 1);
    p.nacio("otro", 5);
    expect(p.antesDeLlamar("conductor")).toBe(textoDePresupuestoAgotado(1));
    expect(p.antesDeLlamar("otro")).toBeUndefined();
    expect(p.soloTexto("otro")).toBe(false);
    for (let i = 0; i < 10; i++) expect(p.antesDeLlamar("main")).toBeUndefined();
    expect(p.agotado("main")).toBeUndefined();
  });

  it("reiniciar al empezar un turno olvida cuentas y agotados", () => {
    const p = crearControlDePresupuesto();
    p.nacio("hijo", 1);
    p.antesDeLlamar("hijo");
    p.reiniciar();
    expect(p.soloTexto("hijo")).toBe(false);
    expect(p.antesDeLlamar("hijo")).toBeUndefined();
  });

  it("la orden pide lo MEDIDO, lo que no cuadró y lo que quedaba", () => {
    const t = textoDePresupuestoAgotado(60);
    expect(t).toContain("60 llamadas");
    expect(t).toContain("MEDISTE");
    expect(t).toContain("no te cuadró");
    expect(t).toContain("te quedaba por hacer");
  });
});

describe("viaja por el procesador de notas, el que corre antes de CADA llamada", () => {
  const procesar = async (cap: ReturnType<typeof capacidadDeNotas>, threadId: string) => {
    const proc = (cap.capability as { preLLMProcessors: { processPreLLM: (e: { threadId: string }) => AsyncGenerator<unknown> }[] })
      .preLLMProcessors[0]!;
    const salida: unknown[] = [];
    for await (const e of proc.processPreLLM({ threadId })) salida.push(e);
    return salida as { context: { content: string }[] }[];
  };

  it("al agotarse, el hijo recibe la orden como mensaje antes de su llamada", async () => {
    const presupuesto = crearControlDePresupuesto();
    presupuesto.nacio("hijo", 2);
    const cap = capacidadDeNotas([], { presupuesto });
    expect(await procesar(cap, "hijo")).toEqual([]);
    const [e] = await procesar(cap, "hijo");
    expect(e!.context[0]!.content).toBe(textoDePresupuestoAgotado(2));
  });

  it("con DETENER dada en esa llamada, no se le añade además la del presupuesto", async () => {
    const detencion = crearControlDeDetencion("main");
    const presupuesto = crearControlDePresupuesto();
    detencion.antesDeLlamar("main");
    detencion.nacio("hijo");
    presupuesto.nacio("hijo", 1);
    detencion.detener("para");
    const cap = capacidadDeNotas([], { detencion, presupuesto });
    const [e] = await procesar(cap, "hijo");
    expect(e!.context[0]!.content).not.toContain("presupuesto");
  });
});
