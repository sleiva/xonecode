import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createAgent } from "langchain";
import { HumanMessage } from "@langchain/core/messages";
import { Modelos } from "../src/agent/config/modelos.js";
import { aplicarAuth } from "../src/agent/config/configEnDisco.js";
import { readFileSync } from "node:fs";
aplicarAuth(JSON.parse(readFileSync("/Users/sergioleivaortega/.xonecode/auth.json", "utf8")));

let n = 0; let ultimo = "";
const real = globalThis.fetch;
globalThis.fetch = (async (u: never, i: never) => {
  const o = i as { body?: string } | undefined;
  if (typeof o?.body === "string") {
    n += 1;
    try {
      const c = JSON.parse(o.body) as { messages?: Array<Record<string, unknown>>; stream?: boolean };
      const ct = (c.messages ?? []).filter((m) => m["role"] === "assistant" && Array.isArray(m["tool_calls"]) && (m["tool_calls"] as unknown[]).length > 0);
      const eco = ct.filter((m) => typeof m["reasoning_content"] === "string");
      const nTools = ct.map((m) => (m["tool_calls"] as unknown[]).length).join(",");
      ultimo = `pet ${n}: stream=${c.stream === true} · asis-con-tools ${ct.length} (tools por msg: ${nTools || "-"}) · con eco ${eco.length}`;
      console.log("  " + ultimo + (ct.length > eco.length ? "   ← FALTA ECO" : ""));
    } catch { /* */ }
  }
  return real(u, i);
}) as typeof fetch;

const leer = tool(async ({ ruta }: { ruta: string }) => `contenido de ${ruta}`, {
  name: "leer", description: "Lee un fichero", schema: z.object({ ruta: z.string() }),
});
const modelos = new Modelos({ bandera: "deepseek/deepseek-flash" }, undefined, undefined, "high");
const agente = createAgent({ model: modelos.paraPapel("trabajo", "high") as never, tools: [leer] });

async function prueba(nombre: string, texto: string, streaming: boolean) {
  n = 0;
  console.log(`\n--- ${nombre} (stream=${streaming}) ---`);
  try {
    if (streaming) {
      for await (const _ of await agente.stream({ messages: [new HumanMessage(texto)] }, { streamMode: "values" })) { /* consumir */ }
    } else {
      await agente.invoke({ messages: [new HumanMessage(texto)] });
    }
    console.log(`  OK tras ${n} peticiones`);
  } catch (e) { console.log(`  FALLO tras ${n}: ${(e as Error).message.slice(0, 120)}`); }
}

// 1) secuencial + streaming   2) PARALELO (dos ficheros a la vez)   3) paralelo + streaming
await prueba("secuencial", "Lee /a.txt y luego /b.txt, una tool cada vez.", true);
await prueba("paralelo", "Lee /a.txt, /b.txt y /c.txt. Pide las TRES lecturas A LA VEZ, en el mismo mensaje.", false);
await prueba("paralelo+stream", "Lee /x.txt, /y.txt y /z.txt. Pide las TRES A LA VEZ, en el mismo mensaje.", true);
