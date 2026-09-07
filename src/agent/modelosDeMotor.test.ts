import { describe, expect, it } from "vitest";
import { ALIAS_DE_CLAUDE_CODE, modelosDeMotor, modelosDeRespuestaDeCodex } from "./modelosDeMotor.js";

describe("los modelos de un motor EXTERNO", () => {
  it("los de Claude Code son sus ALIAS, y salen de una tabla, no de un proceso", async () => {
    // Los documenta su propio SDK (`sdk.d.ts`: «Model alias (e.g. 'fable', 'opus',
    // 'sonnet', 'haiku')»). Se prefieren a un id pinchado porque sobreviven a la siguiente
    // versión, que es justo para lo que el producto los ofrece — un `claude-opus-4-8`
    // escrito hoy se queda viejo solo.
    const r = await modelosDeMotor("claude-code", {});
    expect(r.modelos.map((m) => m.id)).toEqual([...ALIAS_DE_CLAUDE_CODE]);
    expect(r.error).toBeUndefined();
  });

  it("los de Codex se le PREGUNTAN a él: `model/list`", async () => {
    // Medido contra el binario real: `codex app-server` declara `model/list` en el esquema
    // que él mismo genera, y contesta con la lista de la cuenta de quien lo tiene
    // instalado. Inventar aquí cinco nombres sería quedarse viejo en la próxima versión.
    const r = await modelosDeMotor("codex", {
      preguntarACodex: async () => [
        { id: "gpt-5.6-sol", nombre: "GPT-5.6-Sol" },
        { id: "gpt-5.5", nombre: "GPT-5.5" },
      ],
    });
    expect(r.modelos).toEqual([
      { id: "gpt-5.6-sol", nombre: "GPT-5.6-Sol" },
      { id: "gpt-5.5", nombre: "GPT-5.5" },
    ]);
  });

  it("si Codex no está o no contesta, se DICE y la lista va vacía", async () => {
    // Un desplegable vacío sin motivo se lee como que la ventana está rota; el motivo dice
    // que hay que instalar Codex, que es accionable.
    const r = await modelosDeMotor("codex", {
      preguntarACodex: async () => {
        throw new Error("codex no está instalado");
      },
    });
    expect(r.modelos).toEqual([]);
    expect(r.error).toMatch(/codex/i);
  });

  it("el motor de MODELO no tiene lista propia: la suya es el catálogo de proveedores", async () => {
    const r = await modelosDeMotor("modelo", {});
    expect(r.modelos).toEqual([]);
  });
});

describe("modelosDeRespuestaDeCodex", () => {
  /** La forma REAL, recortada de la respuesta medida el 2026-09-07 contra el binario. */
  const REAL = {
    data: [
      { id: "gpt-5.6-sol", model: "gpt-5.6-sol", displayName: "GPT-5.6-Sol", hidden: false, description: "…" },
      { id: "gpt-5.4-mini", model: "gpt-5.4-mini", displayName: "GPT-5.4-Mini", hidden: false },
    ],
  };

  it("se queda con el id y el nombre para leer, y nada más", () => {
    // La respuesta trae esfuerzos de razonamiento, modalidades, tramos de servicio y avisos
    // de crédito. Nada de eso se necesita para elegir un modelo, y arrastrarlo por el cable
    // sería llevar datos de la cuenta de alguien sin motivo.
    expect(modelosDeRespuestaDeCodex(REAL)).toEqual([
      { id: "gpt-5.6-sol", nombre: "GPT-5.6-Sol" },
      { id: "gpt-5.4-mini", nombre: "GPT-5.4-Mini" },
    ]);
  });

  it("los OCULTOS no se ofrecen: el propio Codex los marca", () => {
    expect(modelosDeRespuestaDeCodex({ data: [{ id: "x", displayName: "X", hidden: true }] })).toEqual([]);
  });

  it("una respuesta con otra forma no revienta: lista vacía", () => {
    expect(modelosDeRespuestaDeCodex(undefined)).toEqual([]);
    expect(modelosDeRespuestaDeCodex({ data: "no es una lista" })).toEqual([]);
    expect(modelosDeRespuestaDeCodex({ data: [{ sinId: 1 }] })).toEqual([]);
  });

  it("sin `displayName` se usa el id: un nombre inventado sería peor", () => {
    expect(modelosDeRespuestaDeCodex({ data: [{ id: "gpt-x" }] })).toEqual([{ id: "gpt-x", nombre: "gpt-x" }]);
  });
});
