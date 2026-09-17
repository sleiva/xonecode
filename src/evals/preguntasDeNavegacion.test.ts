import { describe, it, expect } from "vitest";
import {
  CUBIERTAS,
  HUECOS,
  OPERACIONES,
  PREGUNTAS_DE_NAVEGACION,
} from "./preguntasDeNavegacion.js";
import { crearNavegacionXone } from "../agent/grafo/navegacionXone.js";
import type { CargarIndice } from "../agent/navegacion/indiceEnDisco.js";

const VACIO: CargarIndice = async () => ({
  inventario: () => [],
  definicion: () => [],
  referencias: () => [],
  campos: () => [],
  app: () => ({ entrada: [], login: [], estilos: [], conexiones: [] }),
  detalle: () => undefined,
  problemas: () => ({ rotas: [], huerfanas: [] }),
});

describe("el catálogo de preguntas de navegación", () => {
  /**
   * **El test que impide que el catálogo mienta.**
   *
   * Una pregunta marcada como cubierta nombra una operación; si esa operación no existe de
   * verdad en la tool, el inventario diría que cubrimos algo que no cubrimos — que es la peor
   * forma de una lista de cobertura, porque se lee como tranquilizadora. Se comprueba contra
   * el ESQUEMA de la tool, no contra una constante copiada.
   */
  /** Los valores que el enum de la tool acepta de verdad, leídos de su esquema. */
  function operacionesDeLaTool(): string[] {
    const esquema = crearNavegacionXone(VACIO, new Set()).schema as {
      shape?: { operacion?: { options?: readonly string[] } };
    };
    // En zod 4 `.options` de un enum es un ARRAY. Se lee con su forma real y no con un
    // `Object.values` sobre un supuesto record: eso funcionaba en ejecución por accidente
    // —sobre un array también devuelve los elementos— y mentía en el tipo.
    return [...(esquema.shape?.operacion?.options ?? [])];
  }

  it("toda operación nombrada existe de verdad en `xone_navegacion`", () => {
    const valores = new Set(operacionesDeLaTool());
    expect(valores.size).toBeGreaterThan(0);
    for (const p of CUBIERTAS) {
      expect(valores.has(p.operacion!), `«${p.nombre}» dice usar «${p.operacion}»`).toBe(true);
    }
  });

  it("y `OPERACIONES` no se separa de lo que la tool acepta", () => {
    expect(operacionesDeLaTool().sort()).toEqual([...OPERACIONES].sort());
  });

  it("un HUECO dice qué cuesta y qué falta: una lista de huecos sin coste se lee toda igual", () => {
    for (const p of HUECOS) {
      expect(p.hueco, `«${p.nombre}» no dice qué le falta`).toBeDefined();
      expect(p.hueco!.falta.length, `«${p.nombre}»`).toBeGreaterThan(20);
    }
  });

  it("una pregunta cubierta NO lleva hueco, y al revés: son excluyentes", () => {
    for (const p of PREGUNTAS_DE_NAVEGACION) {
      expect(p.operacion === undefined, `«${p.nombre}»`).toBe(p.hueco !== undefined);
    }
  });

  it("un `limite` solo lo lleva una CUBIERTA: es cobertura a medias, no un hueco", () => {
    // Una cobertura con asterisco y sin decir cuál es peor que un hueco declarado: se lee
    // como completa.
    for (const p of PREGUNTAS_DE_NAVEGACION) {
      if (p.limite !== undefined) {
        expect(p.operacion, `«${p.nombre}» tiene límite pero no operación`).toBeDefined();
        expect(p.limite.length).toBeGreaterThan(20);
      }
    }
  });

  it("los nombres no se repiten: se usan para nombrar filas de una tabla", () => {
    const nombres = PREGUNTAS_DE_NAVEGACION.map((p) => p.nombre);
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  it("las preguntas están escritas como las diría una persona, no en jerga de la tool", () => {
    // Si se escribieran «llama a `referencias` con Clientes» estaríamos midiendo nuestra
    // propia nomenclatura en vez de lo que la gente pregunta.
    for (const p of PREGUNTAS_DE_NAVEGACION) {
      expect(p.texto, `«${p.nombre}»`).toMatch(/[¿?]/);
      for (const op of OPERACIONES) expect(p.texto.toLowerCase()).not.toContain(`\`${op}\``);
    }
  });

  it("hay huecos declarados: un catálogo sin ninguno no está buscando", () => {
    // Si algún día no queda ninguno, este test hay que borrarlo A MANO — y esa es la idea:
    // que alguien lo mire en vez de que el catálogo se quede quieto pareciendo completo.
    expect(HUECOS.length).toBeGreaterThan(0);
    expect(CUBIERTAS.length).toBeGreaterThan(0);
  });
});
