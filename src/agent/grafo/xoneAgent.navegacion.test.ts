import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A QUIÉN se le cablea `xone_navegacion`, mirado desde fuera.
 *
 * Este fichero existe por el patrón de fallo que este repo ha pagado nueve veces: una
 * composición de producción viviendo en un cierre que todos los tests doblan. `construirAgente`
 * se simula en los tests que lo tocan, así que sin mirar lo que le llega a `createDeepAgent`
 * el cableado podía quedarse escrito y no montado — con todo en verde.
 *
 * Se espía `createDeepAgent` y se lee lo que recibe. No hay modelo, ni red, ni proyecto real.
 */
const capturado: { opciones?: Record<string, unknown> } = {};

vi.mock("deepagents", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return {
    ...real,
    createDeepAgent: (opciones: Record<string, unknown>) => {
      capturado.opciones = opciones;
      return { grafo: "de mentira" };
    },
  };
});

const { construirAgente } = await import("./xoneAgent.js");
const { SkillsEnMemoria, ModeloGuionizado, SubagenteExternoGuionizado } = await import("../../core/ports.js");

function proyecto(): string {
  const raiz = mkdtempSync(join(tmpdir(), "nav-cableado-"));
  writeFileSync(join(raiz, "app.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<app name="D"></app>\n`);
  return raiz;
}

const nombresDeTools = (subagente: { tools?: readonly { name?: string }[] }): string[] =>
  (subagente.tools ?? []).map((t) => t.name ?? "(sin nombre)");

describe("el cableado de xone_navegacion", () => {
  it("llega a un especialista de modelo, junto a regex_search", async () => {
    const raiz = proyecto();
    await construirAgente({
      raiz,
      ficheros: new Set(["/app.xml"]),
      agentes: [
        {
          nombre: "analyst-xone",
          descripcion: "mira el proyecto",
          motor: "modelo",
          soloLectura: true,
          skills: [],
          instrucciones: "",
          origen: "global",
        },
      ],
      modelos: new ModeloGuionizado(),
      skills: new SkillsEnMemoria(),
      subagenteExterno: new SubagenteExternoGuionizado(),
      // Doblado: lo que se mide aquí es a quién se le da, no qué contesta.
      navegacion: async () => ({
        inventario: () => [],
        definicion: () => [],
        referencias: () => [],
        campos: () => [],
      }),
    });

    const subagentes = (capturado.opciones?.["subagents"] ?? []) as { name: string; tools?: { name?: string }[] }[];
    const analista = subagentes.find((s) => s.name === "analyst-xone");
    expect(analista).toBeDefined();
    expect(nombresDeTools(analista!)).toContain("xone_navegacion");
    // Y sigue teniendo la otra: contestan preguntas distintas y no se sustituyen.
    expect(nombresDeTools(analista!)).toContain("regex_search");
  });

  it("el ORQUESTADOR no la recibe: no tiene tools propias, delega", async () => {
    const raiz = proyecto();
    await construirAgente({
      raiz,
      ficheros: new Set(["/app.xml"]),
      agentes: [],
      modelos: new ModeloGuionizado(),
      skills: new SkillsEnMemoria(),
      subagenteExterno: new SubagenteExternoGuionizado(),
      navegacion: async () => ({
        inventario: () => [],
        definicion: () => [],
        referencias: () => [],
        campos: () => [],
      }),
    });

    const suyas = (capturado.opciones?.["tools"] ?? []) as { name?: string }[];
    expect(suyas.map((t) => t.name)).not.toContain("xone_navegacion");
  });
});
