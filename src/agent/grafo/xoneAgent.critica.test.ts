import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A QUIÉN se le cablea `xone_critica_visual`, mirado desde FUERA.
 *
 * Mismo motivo que el fichero hermano de `xone_navegacion`: `construirAgente` lo doblan todos
 * los tests que lo tocan, así que un cableado compuesto ahí dentro puede quedarse escrito y no
 * montado, con todo en verde. Es el patrón de fallo que este repo ha pagado nueve veces.
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

const nombres = (opciones: Record<string, unknown> | undefined): string[] =>
  ((opciones?.["tools"] ?? []) as { name?: string }[]).map((t) => t.name ?? "(sin nombre)");

function proyecto(): string {
  const raiz = mkdtempSync(join(tmpdir(), "critica-"));
  writeFileSync(join(raiz, "app.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<app name="D"></app>\n`);
  return raiz;
}

const construir = async (artefactos?: { carpeta: string; alEscribir: () => void }) => {
  capturado.opciones = undefined;
  await construirAgente({
    raiz: proyecto(),
    ficheros: new Set(["/app.xml"]),
    agentes: [
      {
        nombre: "device-controller",
        descripcion: "conduce",
        motor: "modelo",
        soloLectura: false,
        ejecucion: true,
        skills: [],
        instrucciones: "",
        origen: "global",
      },
    ],
    modelos: new ModeloGuionizado(),
    skills: new SkillsEnMemoria(),
    subagenteExterno: new SubagenteExternoGuionizado(),
    ...(artefactos === undefined ? {} : { artefactos }),
  });
};

describe("el cableado de xone_critica_visual", () => {
  /**
   * Va al ORQUESTADOR porque es quien reparte: el crítico pide pantallas por nombre y el único
   * que puede ir a por ellas es el conductor.
   */
  it("llega al orquestador cuando la sesión tiene carpeta de artefactos", async () => {
    await construir({ carpeta: mkdtempSync(join(tmpdir(), "arte-")), alEscribir: () => {} });

    expect(nombres(capturado.opciones)).toContain("xone_critica_visual");
    // Y no sustituye a la otra: contestan preguntas distintas.
    expect(nombres(capturado.opciones)).toContain("xone_navegacion");
  });

  /**
   * Sin carpeta no hay ninguna captura que mirar. Una tool cuyo único final posible es «no
   * encuentro nada» es un botón muerto, y encima cobrando su esquema en cada llamada.
   */
  it("y NO se monta si no hay carpeta de artefactos", async () => {
    await construir();

    expect(nombres(capturado.opciones)).not.toContain("xone_critica_visual");
    expect(nombres(capturado.opciones)).toContain("xone_navegacion");
  });

  /**
   * **Al conductor NO**: que el que navega y captura sea además quien dictamina es que el
   * trabajo se puntúe solo — lo que `juezDeTarea` prohíbe por escrito y lo que el prompt del
   * propio conductor le prohíbe afirmar.
   */
  it("y el conductor NO la lleva: el que trabaja no se puntúa solo", async () => {
    await construir({ carpeta: mkdtempSync(join(tmpdir(), "arte-")), alEscribir: () => {} });

    const subagentes = (capturado.opciones?.["subagents"] ?? []) as {
      name: string;
      tools?: { name?: string }[];
    }[];
    const conductor = subagentes.find((s) => s.name === "device-controller");
    expect(conductor).toBeDefined();
    expect((conductor!.tools ?? []).map((t) => t.name)).not.toContain("xone_critica_visual");
  });
});
