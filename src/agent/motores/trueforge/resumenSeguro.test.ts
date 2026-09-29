import { describe, expect, it } from "vitest";
import { conResumenSeguro, mensajesDeLaPersona } from "./resumenSeguro.js";

const CANDIDATO =
  "<0><user>:Quisiera que creáramos la calculadora\ncon el diseño anexo<1><assistant>:Voy a mirar" +
  "<2><tool-response id=x>:contenido<3><user>:y que salga en el Drawer<4><assistant>:hecho";

const cliente = (respuestas: string[]) => {
  let n = 0;
  return {
    llamadas: () => n,
    createNonStream: (async () => ({ output: { role: "assistant", content: respuestas[n++] ?? "" }, usage: { input_tokens: 1 } })) as unknown as (c: never) => Promise<never>,
    otro: "se conserva",
  };
};
const cuerpo = { messages: [{ role: "user", content: CANDIDATO }, { role: "user", content: "PROMPT" }] } as never;

describe("un resumen de contexto vacío no borra el encargo", () => {
  it("saca los mensajes de la persona del texto de la librería, sin lo del asistente ni las tools", () => {
    expect(mensajesDeLaPersona(CANDIDATO)).toEqual(["Quisiera que creáramos la calculadora\ncon el diseño anexo", "y que salga en el Drawer"]);
  });

  it("un resumen con contenido pasa tal cual y no se reintenta", async () => {
    const c = cliente(["resumen bueno"]);
    const r = (await conResumenSeguro(c).createNonStream(cuerpo)) as unknown as { output: { content: string } };
    expect(r.output.content).toBe("resumen bueno");
    expect(c.llamadas()).toBe(1);
  });

  it("uno vacío se reintenta una vez y se usa el segundo si vale", async () => {
    const c = cliente(["", "ahora sí"]);
    const r = (await conResumenSeguro(c).createNonStream(cuerpo)) as unknown as { output: { content: string } };
    expect(r.output.content).toBe("ahora sí");
    expect(c.llamadas()).toBe(2);
  });

  it("si sigue vacío, el resumen son los mensajes de la persona", async () => {
    const c = cliente(["", "   "]);
    const avisos: string[] = [];
    const r = (await conResumenSeguro(c, (t) => avisos.push(t)).createNonStream(cuerpo)) as unknown as { output: { content: string } };
    expect(r.output.content).toContain("calculadora");
    expect(r.output.content).toContain("Drawer");
    expect(avisos).toHaveLength(2);
  });

  it("el resto del cliente no se toca, y un texto de otro formato no lanza", async () => {
    const c = cliente(["", ""]);
    const envuelto = conResumenSeguro(c);
    expect(envuelto.otro).toBe("se conserva");
    const raro = { messages: [{ role: "user", content: "sin formato" }] } as never;
    const r = (await envuelto.createNonStream(raro)) as unknown as { output: { content: string } };
    expect(r.output.content).toContain("no se pudieron recuperar");
  });
});
