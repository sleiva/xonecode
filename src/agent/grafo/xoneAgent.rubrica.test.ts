import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A QUIÉN se le cablea el bucle de rúbrica, mirado desde fuera.
 *
 * Existe por el patrón de fallo que este repo ha pagado nueve veces, y aquí con un agravante:
 * el middleware se monta **condicionalmente**. Un `...(x === undefined ? [] : [y])` puede
 * quedarse siempre en la rama vacía sin que nada se ponga rojo, porque el agente se construye
 * igual de bien sin él. Sin mirar lo que recibe `createDeepAgent`, esto sería una regla escrita.
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
  const raiz = mkdtempSync(join(tmpdir(), "rubrica-cableado-"));
  writeFileSync(join(raiz, "app.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<app name="D"></app>\n`);
  return raiz;
}

async function construir(conCalificador: boolean): Promise<string[]> {
  capturado.opciones = undefined;
  await construirAgente({
    raiz: proyecto(),
    ficheros: new Set(["/app.xml"]),
    agentes: [],
    modelos: new ModeloGuionizado(),
    skills: new SkillsEnMemoria(),
    subagenteExterno: new SubagenteExternoGuionizado(),
    ...(conCalificador
      ? { calificador: async () => ({ veredicto: "satisfecho" as const, comentario: "" }) }
      : {}),
  });
  const mw = (capturado.opciones?.["middleware"] ?? []) as { name?: string }[];
  return mw.map((m) => m.name ?? "(sin nombre)");
}

describe("el cableado del bucle de rúbrica", () => {
  it("con calificador, el middleware ESTÁ montado en el orquestador", async () => {
    expect(await construir(true)).toContain("RubricaMiddleware");
  });

  it("sin calificador NO se monta, que es el caso normal", async () => {
    // Montarlo siempre no rompería nada —sin rúbrica no hace nada—, pero un middleware que no
    // puede juzgar es una pieza de pega sin declarar: parecería que hay revisión y no la hay.
    expect(await construir(false)).not.toContain("RubricaMiddleware");
  });

  it("va DELANTE del tracker, o su salto al modelo dejaría llamadas sin contar", async () => {
    // El orden importa: si el bucle salta de vuelta al modelo por detrás de quien cuenta, esas
    // vueltas no aparecerían en el gasto y la rúbrica saldría gratis en la traza.
    const nombres = await construir(true);
    const rubrica = nombres.indexOf("RubricaMiddleware");
    const tracker = nombres.findIndex((n) => n.toLowerCase().includes("token"));
    expect(rubrica).toBeGreaterThanOrEqual(0);
    if (tracker >= 0) expect(rubrica).toBeLessThan(tracker);
  });
});
