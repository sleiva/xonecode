import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelosPort, Papel } from "../../core/ports.js";
import type { Esfuerzo } from "../../core/esfuerzo.js";

/**
 * A qué modelo se le pide el ESFUERZO de cada especialista, mirado desde fuera.
 *
 * Existe por el patrón de fallo que este repo ha pagado nueve veces: una composición de
 * producción viviendo en un cierre que todos los tests doblan. El `esfuerzo` del `.md` viaja
 * por cuatro saltos —`leerAgente` → `Agente` → `perfil` → `paraPapel`/`paraModelo`— y
 * `tsc` no se queja de un mapeador que lo deje por el camino: un campo OPCIONAL que se cae
 * es exactamente el caso donde no hay error que leer y el subagente corre sin él.
 *
 * Así que no se comprueba la tabla —eso es de `core/esfuerzo.test.ts`— sino QUÉ recibe la
 * fábrica de modelos. Sin red, sin modelo y sin proyecto real.
 */
vi.mock("deepagents", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return { ...real, createDeepAgent: () => ({ grafo: "de mentira" }) };
});

const { construirAgente } = await import("./xoneAgent.js");
const { SkillsEnMemoria, SubagenteExternoGuionizado, ES_DOBLE } = await import("../../core/ports.js");

/** Apunta con qué esfuerzo se le pidió cada modelo. Lo demás no le importa a este test. */
class ModelosEspia implements ModelosPort {
  readonly [ES_DOBLE] = true;
  readonly porPapel: Array<{ papel: Papel; esfuerzo?: Esfuerzo }> = [];
  readonly porId: Array<{ id: string; esfuerzo?: Esfuerzo }> = [];
  paraPapel(papel: Papel, esfuerzo?: Esfuerzo): unknown {
    this.porPapel.push({ papel, ...(esfuerzo === undefined ? {} : { esfuerzo }) });
    return { guion: [] };
  }
  paraModelo(id: string, esfuerzo?: Esfuerzo): unknown {
    this.porId.push({ id, ...(esfuerzo === undefined ? {} : { esfuerzo }) });
    return { guion: [] };
  }
  descripcion(): Record<Papel, string> {
    return { rapido: "espia", trabajo: "espia", afilado: "espia" };
  }
}

function proyecto(): string {
  const raiz = mkdtempSync(join(tmpdir(), "esfuerzo-cableado-"));
  writeFileSync(join(raiz, "app.xml"), `<?xml version="1.0" encoding="utf-8"?>\n<app name="D"></app>\n`);
  return raiz;
}

const montar = async (
  modelos: ModelosEspia,
  agente: { esfuerzo?: Esfuerzo; modelo?: string },
): Promise<void> => {
  await construirAgente({
    raiz: proyecto(),
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
        ...agente,
      },
    ],
    modelos,
    skills: new SkillsEnMemoria(),
    subagenteExterno: new SubagenteExternoGuionizado(),
  });
};

describe("el esfuerzo de un subagente llega a su modelo", () => {
  it("con `esfuerzo` en el .md y sin modelo propio, viaja con el PAPEL", async () => {
    const modelos = new ModelosEspia();
    await montar(modelos, { esfuerzo: "low" });
    // `soloLectura: true` → papel `rapido`. Y el orquestador pide `rapido` sin esfuerzo,
    // así que no basta con que haya UNA llamada con `low`: tiene que ser la del especialista.
    expect(modelos.porPapel).toContainEqual({ papel: "rapido", esfuerzo: "low" });
  });

  it("con modelo propio, viaja con el MODELO", async () => {
    const modelos = new ModelosEspia();
    await montar(modelos, { esfuerzo: "max", modelo: "anthropic/claude-opus-5" });
    expect(modelos.porId).toEqual([{ id: "anthropic/claude-opus-5", esfuerzo: "max" }]);
  });

  /**
   * Sin `esfuerzo` no se manda nada desde aquí — y eso NO significa que el especialista
   * corra sin él: `Modelos` cae en el de la SESIÓN. La diferencia importa, porque es lo que
   * hace que la pastilla del compositor alcance a todos los especialistas sin tener que
   * escribir el nivel en cada `.md`.
   */
  it("sin `esfuerzo` en el .md no se fija ninguno: manda el de la sesión", async () => {
    const modelos = new ModelosEspia();
    await montar(modelos, {});
    expect(modelos.porPapel.every((l) => l.esfuerzo === undefined)).toBe(true);
    expect(modelos.porId).toEqual([]);
  });
});
