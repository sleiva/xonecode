/** Experimento aislado: agente LangChain + deepseek-flash + esfuerzo high. */
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createAgent } from "langchain";
import { HumanMessage } from "@langchain/core/messages";
import { Modelos } from "../src/agent/config/modelos.js";
import { aplicarAuth } from "../src/agent/config/configEnDisco.js";
import { readFileSync } from "node:fs";

// La credencial por el camino de siempre.
const auth = JSON.parse(readFileSync("/Users/sergioleivaortega/.xonecode/auth.json", "utf8"));
aplicarAuth(auth);

// El instrumento: miramos el cuerpo FINAL que sale por el cable.
let n = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (url: never, init: never) => {
  const opciones = init as { body?: string } | undefined;
  if (typeof opciones?.body === "string") {
    n += 1;
    try {
      const cuerpo = JSON.parse(opciones.body) as { messages?: Array<Record<string, unknown>> };
      const asistentes = (cuerpo.messages ?? []).filter((m) => m["role"] === "assistant");
      const conTools = asistentes.filter((m) => Array.isArray(m["tool_calls"]) && (m["tool_calls"] as unknown[]).length > 0);
      const conEco = conTools.filter((m) => typeof m["reasoning_content"] === "string");
      console.log(
        `  petición ${n}: ${(cuerpo.messages ?? []).length} msgs · asistentes-con-tools ${conTools.length} · CON reasoning_content ${conEco.length}`
        + (conTools.length > 0 && conEco.length === 0 ? "   ← ESTO es lo que da el 400" : "")
      );
    } catch { /* no es JSON: da igual */ }
  }
  return originalFetch(url, init);
}) as typeof fetch;

const leer = tool(async ({ ruta }: { ruta: string }) => `contenido de ${ruta}`, {
  name: "leer",
  description: "Lee un fichero del proyecto",
  schema: z.object({ ruta: z.string() }),
});

const modelos = new Modelos(
  { bandera: "deepseek/deepseek-flash" },
  undefined, undefined, "high",
);

const agente = createAgent({
  model: modelos.paraPapel("trabajo", "high") as never,
  tools: [leer],
});

console.log("--- agente deepseek-flash, esfuerzo high, con una tool ---");
try {
  const r = await agente.invoke({
    messages: [new HumanMessage("Lee /a.txt y despues lee /b.txt. Usa la tool una vez para cada uno.")],
  });
  console.log(`\nOK — ${(r as { messages: unknown[] }).messages.length} mensajes, ${n} peticiones`);
} catch (e) {
  console.log(`\nFALLO tras ${n} peticiones: ${(e as Error).message.slice(0, 140)}`);
}
