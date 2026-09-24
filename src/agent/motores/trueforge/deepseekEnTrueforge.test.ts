/**
 * **DeepSeek piensa, pide una tool, TrueForge la ejecuta, y la siguiente petición LLEVA su
 * razonamiento.** Es la prueba de compatibilidad que hay que pasar antes de subir la librería: 0.3
 * saca `reasoning_content` del contexto del hilo, y DeepSeek documenta que con `tools` hay que
 * devolvérselo o contesta 400.
 *
 * Se mira en el CABLE —el cuerpo que sale hacia `/chat/completions`— y no en los mensajes de
 * TrueForge, porque quien lo repone no es la librería sino el eco (`ecoDeRazonamiento.ts`), a nivel
 * HTTP y por id de tool call. Esa es la razón de que esto no dependa de qué haga TrueForge con su
 * contexto: aguanta 0.2.1 y aguantará 0.3 mientras los ids de las tool calls viajen, que viajan.
 *
 * El `fetch` es de pega —sin red, sin clave de verdad—, pero el cliente es el REAL
 * (`Modelos` → `ChatOpenAI` con su `configuration.fetch`), que es lo que hay que probar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Modelos } from "../../config/modelos.js";
import { abrirSesionTrueforge } from "./sesionTrueforge.js";

const sse = (trozos: unknown[]): Response =>
  new Response(trozos.map((t) => `data: ${JSON.stringify(t)}\n\n`).join("") + "data: [DONE]\n\n", {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
const trozo = (delta: Record<string, unknown>, fin: string | null = null, usage?: unknown) => ({
  id: "r",
  object: "chat.completion.chunk",
  created: 1,
  model: "deepseek-flash",
  choices: [{ index: 0, delta, finish_reason: fin }],
  ...(usage === undefined ? {} : { usage }),
});
const USO = { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 };

/** El guion de DeepSeek: piensa y pide `ls`; luego contesta. Apunta cada cuerpo que le llega. */
function deepseekDePega() {
  const cuerpos: Array<{ messages: Array<Record<string, unknown>> }> = [];
  const respuestas = [
    () =>
      sse([
        trozo({ role: "assistant", reasoning_content: "PIENSO-QUE-HAY-QUE-LISTAR" }),
        trozo({ tool_calls: [{ index: 0, id: "call_ds_1", type: "function", function: { name: "ls", arguments: JSON.stringify({ path: "/" }) } }] }),
        trozo({}, "tool_calls", USO),
      ]),
    () => sse([trozo({ role: "assistant", content: "Hay un app.xml." }), trozo({}, "stop", USO)]),
  ];
  const fetchFalso = async (_url: unknown, init?: { body?: unknown }) => {
    if (typeof init?.body === "string") cuerpos.push(JSON.parse(init.body));
    return (respuestas.shift() ?? respuestas[respuestas.length - 1] ?? (() => sse([trozo({}, "stop", USO)])))();
  };
  return { cuerpos, fetchFalso };
}

describe("DeepSeek en TrueForge: el razonamiento vuelve con la tool call", () => {
  const clave = process.env["DEEPSEEK_API_KEY"];
  beforeEach(() => {
    process.env["DEEPSEEK_API_KEY"] = "sk-de-pega";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (clave === undefined) delete process.env["DEEPSEEK_API_KEY"];
    else process.env["DEEPSEEK_API_KEY"] = clave;
  });

  it("la segunda petición lleva el `reasoning_content` del asistente que pidió la tool", async () => {
    const { cuerpos, fetchFalso } = deepseekDePega();
    vi.stubGlobal("fetch", fetchFalso);
    const raiz = mkdtempSync(join(tmpdir(), "xc-ds-tf-"));
    writeFileSync(join(raiz, "app.xml"), "<app/>\n");
    const s = await abrirSesionTrueforge({
      raiz,
      // El cliente REAL de DeepSeek, con su eco; sin identidad, para no leer ningún login.
      modelos: new Modelos({ bandera: "deepseek/deepseek-flash" }, () => [], undefined, undefined, () => undefined),
      entorno: { git: { usable: false, prefijo: "" } } as never,
      skills: [],
    });
    const tokens: string[] = [];
    await s.turno("¿qué hay en la raíz?", { token: (t) => void tokens.push(t), cerrarLinea: () => {}, linea: () => {}, pausa: () => {}, fin: () => {} });
    expect(tokens.join("")).toBe("Hay un app.xml.");
    expect(cuerpos).toHaveLength(2);
    const asistente = cuerpos[1]!.messages.find((m) => m["role"] === "assistant" && Array.isArray(m["tool_calls"]));
    expect(asistente).toBeDefined();
    expect((asistente!["tool_calls"] as Array<{ id: string }>)[0]!.id).toBe("call_ds_1");
    expect(asistente!["reasoning_content"]).toBe("PIENSO-QUE-HAY-QUE-LISTAR");
  }, 30_000);
});
