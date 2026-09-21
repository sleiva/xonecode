import { describe, expect, it } from "vitest";
import {
  ESFUERZOS,
  NIVELES_DE_OLLAMA,
  esEsfuerzo,
  esfuerzoAplicable,
  nivelesDeEsfuerzo,
} from "./esfuerzo.js";

/**
 * Las pruebas de la tabla, y lo que cada una defiende.
 *
 * La mayoría fijan una MEDIDA: si alguien cambia una fila sin volver a medir, esto se pone
 * rojo con el modelo concreto delante. Las de la frontera son las que valen de verdad —
 * lo que la tabla NO reconoce es lo que decide si mandamos un parámetro que da 400.
 */
describe("los niveles de esfuerzo de un modelo", () => {
  it("lo desconocido no admite ninguno, que es lo que evita el 400", () => {
    // Un proveedor sin fila entera.
    expect(nivelesDeEsfuerzo("openai", "gpt-5")).toBeUndefined();
    expect(nivelesDeEsfuerzo("groq", "llama-3.3-70b")).toBeUndefined();
    expect(nivelesDeEsfuerzo("xai", "grok-4")).toBeUndefined();
    // Un personalizado: su modelo lo elige quien dio de alta el endpoint.
    expect(nivelesDeEsfuerzo("custom:mi-llm", "qwen3")).toBeUndefined();
  });

  describe("gemini — la frontera está MEDIDA en la generación 3", () => {
    it("las 3.x lo admiten", () => {
      for (const m of ["gemini-3-flash-preview", "gemini-3.1-pro-preview", "gemini-3.8-flash"]) {
        expect(nivelesDeEsfuerzo("gemini", m), m).toEqual(["low", "medium", "high"]);
      }
    });

    it("2.5 y gemma NO, que es lo que contestó la API con un 400", () => {
      expect(nivelesDeEsfuerzo("gemini", "gemini-2.5-flash")).toBeUndefined();
      expect(nivelesDeEsfuerzo("gemini", "gemini-2.5-pro")).toBeUndefined();
      expect(nivelesDeEsfuerzo("gemini", "gemma-4-31b-it")).toBeUndefined();
    });

    /**
     * Los alias van enumerados y no salen del prefijo, así que son el caso que se rompe
     * solo: un `find` por `gemini-3` los dejaría fuera aunque los tres lo aceptan.
     */
    it("los tres alias «latest» lo admiten aunque no lleven el número", () => {
      for (const m of ["gemini-flash-latest", "gemini-pro-latest", "gemini-flash-lite-latest"]) {
        expect(nivelesDeEsfuerzo("gemini", m), m).toEqual(["low", "medium", "high"]);
      }
    });
  });

  describe("anthropic — tres generaciones y tres respuestas distintas", () => {
    it("de Opus 4.7 en adelante son cinco", () => {
      for (const m of ["claude-opus-5", "claude-sonnet-5", "claude-opus-4-8", "claude-opus-4-7", "claude-fable-5-1"]) {
        expect(nivelesDeEsfuerzo("anthropic", m), m).toEqual(["low", "medium", "high", "xhigh", "max"]);
      }
    });

    it("4.6 tiene «max» pero todavía no «xhigh»", () => {
      expect(nivelesDeEsfuerzo("anthropic", "claude-opus-4-6")).toEqual(["low", "medium", "high", "max"]);
      expect(nivelesDeEsfuerzo("anthropic", "claude-sonnet-4-6")).toEqual(["low", "medium", "high", "max"]);
    });

    /** La frontera que importa: pedírselo a éstos es un error duro, no una respuesta peor. */
    it("Haiku 4.5, Sonnet 4.5 y lo anterior no admiten ninguno", () => {
      for (const m of ["claude-haiku-4-5", "claude-sonnet-4-5", "claude-opus-4-1", "claude-3-5-sonnet"]) {
        expect(nivelesDeEsfuerzo("anthropic", m), m).toBeUndefined();
      }
    });
  });

  describe("deepseek — la lista NO son los tres de siempre", () => {
    /**
     * Su documentación mapea `medium`→high y `xhigh`→high, así que ofrecer low/medium/high
     * daría dos opciones que hacen lo mismo. Los distintos son estos tres.
     */
    it("solo hay tres niveles distintos: low, high y max", () => {
      expect(nivelesDeEsfuerzo("deepseek", "deepseek-flash")).toEqual(["low", "high", "max"]);
      expect(nivelesDeEsfuerzo("deepseek", "deepseek-v4-pro")).toEqual(["low", "high", "max"]);
    });

    it("«medium» no es aplicable ahí, y no se sustituye por el parecido", () => {
      expect(esfuerzoAplicable("medium", "deepseek", "deepseek-flash")).toBeUndefined();
      expect(esfuerzoAplicable("high", "deepseek", "deepseek-flash")).toBe("high");
    });
  });

  describe("nvidia — el enum cambia POR MODELO dentro del mismo proveedor", () => {
    it("nemotron acepta cinco y gpt-oss tres, medido con el mismo token", () => {
      expect(nivelesDeEsfuerzo("nvidia", "nvidia/nemotron-3-super-120b-a12b")).toHaveLength(5);
      expect(nivelesDeEsfuerzo("nvidia", "openai/gpt-oss-20b")).toEqual(["low", "medium", "high"]);
    });

    it("un NIM que no está en la tabla no admite ninguno", () => {
      expect(nivelesDeEsfuerzo("nvidia", "mistralai/mistral-nemotron")).toBeUndefined();
    });
  });

  describe("ollama — se PREGUNTA, no se tabula", () => {
    it("sin capacidades no se afirma nada, que no es afirmar que no puede", () => {
      expect(nivelesDeEsfuerzo("ollama", "granite4.2:3b")).toBeUndefined();
      expect(nivelesDeEsfuerzo("ollama", "granite4.2:3b", {})).toBeUndefined();
    });

    it("con el servidor diciendo que piensa, los cuatro que valida", () => {
      expect(nivelesDeEsfuerzo("ollama", "granite4.2:3b", { piensa: true })).toEqual(NIVELES_DE_OLLAMA);
      expect(nivelesDeEsfuerzo("ollama-cloud", "glm-5.3-flash:cloud", { piensa: true })).toEqual(NIVELES_DE_OLLAMA);
    });

    it("y el modelo que el servidor dice que NO piensa se queda sin control", () => {
      // Medido: `ministral-3:3b` no trae «thinking» en sus capabilities, y pedírselo falla.
      expect(nivelesDeEsfuerzo("ollama", "ministral-3:3b", { piensa: false })).toBeUndefined();
    });

    it("«xhigh» no está entre los suyos: el servidor no lo valida", () => {
      expect(NIVELES_DE_OLLAMA).not.toContain("xhigh");
      expect(esfuerzoAplicable("xhigh", "ollama", "granite4.2:3b", { piensa: true })).toBeUndefined();
    });
  });

  describe("el nivel elegido contra el modelo de ahora", () => {
    /**
     * El caso que justifica la función: el esfuerzo se elige una vez y el modelo se cambia
     * después. Un `xhigh` de Opus 5 sigue puesto al pasarse a Gemini, que no lo tiene.
     */
    it("un nivel que el modelo nuevo no admite no se manda ni se sustituye", () => {
      expect(esfuerzoAplicable("xhigh", "anthropic", "claude-opus-5")).toBe("xhigh");
      expect(esfuerzoAplicable("xhigh", "gemini", "gemini-3.8-flash")).toBeUndefined();
    });

    it("sin nada elegido no hay nada que aplicar", () => {
      expect(esfuerzoAplicable(undefined, "anthropic", "claude-opus-5")).toBeUndefined();
    });
  });

  describe("el vocabulario", () => {
    it("«none» NO es un nivel: es un interruptor y se queda fuera", () => {
      expect(esEsfuerzo("none")).toBe(false);
      expect(ESFUERZOS).not.toContain("none");
    });

    it("cada nivel que una fila nombra es uno del vocabulario", () => {
      const filas: Array<readonly string[]> = [
        nivelesDeEsfuerzo("anthropic", "claude-opus-5")!,
        nivelesDeEsfuerzo("gemini", "gemini-3.8-flash")!,
        nivelesDeEsfuerzo("deepseek", "deepseek-flash")!,
        nivelesDeEsfuerzo("nvidia", "openai/gpt-oss-20b")!,
        NIVELES_DE_OLLAMA,
      ];
      for (const fila of filas) for (const nivel of fila) expect(esEsfuerzo(nivel), nivel).toBe(true);
    });
  });
});
