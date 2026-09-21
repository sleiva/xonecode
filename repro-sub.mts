import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HumanMessage } from "@langchain/core/messages";
process.env.DEEPSEEK_API_KEY = JSON.parse(
  readFileSync(homedirSafe() + "/.xonecode/auth.json", "utf8"),
).deepseek.key;
function homedirSafe() { return process.env.HOME!; }

const { crearProyecto } = await import("./src/agent/config/crearProyecto.js");
const { cargarAgentes } = await import("./src/agent/subagentes/agentesEnDisco.js");
const { construirAgente } = await import("./src/agent/grafo/xoneAgent.js");
const { Modelos } = await import("./src/agent/config/modelos.js");
const { SkillsEnMemoria, SubagenteExternoGuionizado } = await import("./src/core/ports.js");

const raiz = mkdtempSync(join(tmpdir(), "repro-canal-"));
crearProyecto(raiz, { nombre: "Repro", titulo: "Repro", orientacion: "portrait", login: false });
const { agentes } = cargarAgentes(raiz);
console.log("especialistas:", agentes.filter((a) => a.motor === "modelo").map((a) => a.nombre).join(", "));

const agente = await construirAgente({
  raiz,
  ficheros: new Set<string>(),
  agentes,
  modelos: new Modelos({ bandera: "deepseek/deepseek-flash" }),
  skills: new SkillsEnMemoria(),
  subagenteExterno: new SubagenteExternoGuionizado(),
}) as { invoke: (x: unknown, o?: unknown) => Promise<unknown> };

try {
  await agente.invoke(
    { messages: [new HumanMessage(
      "Necesito CUATRO informes independientes del proyecto y los quiero YA, así que delega los cuatro A LA VEZ en la misma tanda (varias llamadas a `task` en paralelo, no una detrás de otra): 1) qué colecciones hay, 2) cómo arranca la app, 3) qué estilos usa, 4) qué problemas tiene. Sé breve.",
    )] },
    { recursionLimit: 80, configurable: { thread_id: "repro-1" } },
  );
  console.log("sin error");
} catch (e) {
  console.log("ERROR:", (e as Error).name);
  console.log(String((e as Error).message).slice(0, 260));
}
