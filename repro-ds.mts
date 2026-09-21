import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createAgent } from "langchain";
import { HumanMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
process.env.DEEPSEEK_API_KEY = JSON.parse(
  readFileSync(homedir() + "/.xonecode/auth.json", "utf8"),
).deepseek.key;
const { Modelos } = await import("./src/agent/config/modelos.js");
const { topeDeTools, topeDeLlamadas } = await import("./src/agent/turno/resumenDeContexto.js");

const mirar = tool(async ({ que }: { que: string }) => `contenido de ${que}`, {
  name: "mirar", description: "Lee un fichero del proyecto.", schema: z.object({ que: z.string() }),
});

const modelo = new Modelos({ bandera: "deepseek/deepseek-flash" }).paraPapel("trabajo");
const agente = createAgent({
  model: modelo,
  tools: [mirar],
  middleware: [topeDeLlamadas(8), topeDeTools(8)],
} as never) as { invoke: (x: unknown) => Promise<{ messages: unknown[] }> };

try {
  const r = await agente.invoke({
    messages: [new HumanMessage(
      "Lee A.xne, B.xne, C.xne y D.xne. Hazlo TODO A LA VEZ, en una sola tanda de llamadas paralelas, no una detrás de otra. Luego resume.",
    )],
  });
  console.log("sin error ·", r.messages.length, "mensajes");
} catch (e) {
  console.log("ERROR:", (e as Error).name);
  console.log(String((e as Error).message).slice(0, 220));
}
