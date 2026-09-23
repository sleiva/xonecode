import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { HumanMessage, ToolMessage } from "@langchain/core/messages";
import { Modelos } from "../src/agent/config/modelos.js";
import { aplicarAuth } from "../src/agent/config/configEnDisco.js";
import { readFileSync } from "node:fs";
aplicarAuth(JSON.parse(readFileSync("/Users/sergioleivaortega/.xonecode/auth.json", "utf8")));

let n = 0;
const real = globalThis.fetch;
globalThis.fetch = (async (u: never, i: never) => {
  const o = i as { body?: string } | undefined;
  if (typeof o?.body === "string") {
    n += 1;
    try {
      const c = JSON.parse(o.body) as { messages?: Array<Record<string, unknown>>; stream?: boolean };
      const ct = (c.messages ?? []).filter((m) => m["role"] === "assistant" && Array.isArray(m["tool_calls"]) && (m["tool_calls"] as unknown[]).length > 0);
      const eco = ct.filter((m) => typeof m["reasoning_content"] === "string");
      console.log(`  pet ${n}: stream=${c.stream === true} · asis-con-tools ${ct.length} · con eco ${eco.length}`
        + (ct.length > eco.length ? "   ← FALTA ECO" : ""));
    } catch { /* */ }
  }
  return real(u, i);
}) as typeof fetch;

const leer = tool(async ({ ruta }: { ruta: string }) => `contenido de ${ruta}`, {
  name: "leer", description: "Lee un fichero", schema: z.object({ ruta: z.string() }),
});
const modelo = (new Modelos({ bandera: "deepseek/deepseek-flash" }, undefined, undefined, "high")
  .paraPapel("trabajo", "high") as { bindTools: (t: unknown[]) => { stream: (m: unknown[]) => AsyncIterable<unknown> } });
const conTools = modelo.bindTools([leer]);

async function turnoStreameado(mensajes: unknown[]) {
  let acc: { tool_calls?: Array<{ id?: string; name?: string }>; concat?: unknown } | undefined;
  for await (const trozo of await conTools.stream(mensajes)) {
    acc = acc === undefined ? trozo as never : (acc as { concat: (x: unknown) => never }).concat(trozo);
  }
  return acc!;
}

console.log("--- turno 1: STREAM de verdad, con tools ---");
const msgs: unknown[] = [new HumanMessage("Lee /a.txt, /b.txt y /c.txt. Pide las TRES A LA VEZ en el mismo mensaje.")];
const ai = await turnoStreameado(msgs);
const llamadas = ai.tool_calls ?? [];
console.log(`  el modelo pidió ${llamadas.length} tool(s)`);

msgs.push(ai);
for (const tc of llamadas) msgs.push(new ToolMessage({ content: "hola", tool_call_id: tc.id! , name: tc.name }));

console.log("--- turno 2: reenviando ese historial, otra vez STREAM ---");
try { await turnoStreameado(msgs); console.log(`  OK tras ${n} peticiones`); }
catch (e) { console.log(`  FALLO: ${(e as Error).message.slice(0, 150)}`); }
