import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { Command, MemorySaver } from "@langchain/langgraph";
import { collectPending } from "../../vendor/hitl.js";
import { buildResume, cambioDe, ficheroDe } from "../turno/interrupts.js";
import { AGENTES_DE_SERIE } from "../subagentes/agentesEnDisco.js";
import { NOMBRE_INCORPORAR_ADJUNTO } from "../../core/adjuntos.js";
import { construirAgente } from "./xoneAgent.js";
import { SkillsEnMemoria } from "../../core/ports.js";
import type { ModelosPort, SubagenteExternoPort } from "../../core/ports.js";

/**
 * El HOP que ningún otro test miraba: `construirAgente` → `backendDeAgente`.
 *
 * `backendDeAgente` tiene sus propios tests (`proyecto.test.ts`) y `abrirSesionReal` tiene
 * los suyos con `construirAgente` simulado (`turnoReal.test.ts`), así que **el paso de la
 * carpeta de adjuntos entre los dos no lo comprobaba nadie**: es exactamente la clase de
 * agujero que este plan ha encontrado cuatro veces —una composición de producción que vive
 * donde todos los tests doblan— y por la que `backendDeAgente` se extrajo en su día.
 *
 * Se mide por COMPORTAMIENTO y no leyendo el objeto: se construye el agente de verdad —con
 * un modelo de mentira, sin red— y se busca su tool `read_file` para leer por ella. El
 * recorrido reflexivo es el mismo patrón que `generalPurpose.test.ts` usa para sacar la
 * descripción de `task`: la librería no expone sus tools por API.
 */
function toolDelAgente(agente: unknown, nombre: string): { invoke: (e: unknown) => Promise<unknown> } | undefined {
  const vistos = new Set<unknown>();
  let encontrada: { invoke: (e: unknown) => Promise<unknown> } | undefined;
  const recorrer = (o: unknown, prof = 0): void => {
    if (encontrada !== undefined || !o || prof > 8 || typeof o !== "object" || vistos.has(o)) return;
    vistos.add(o);
    const r = o as Record<string, unknown>;
    if (r["name"] === nombre && typeof r["invoke"] === "function") {
      encontrada = r as unknown as { invoke: (e: unknown) => Promise<unknown> };
      return;
    }
    for (const v of Object.values(r)) recorrer(v, prof + 1);
  };
  recorrer(agente);
  return encontrada;
}

const modelos: ModelosPort = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paraPapel: () => new FakeListChatModel({ responses: ["ok"] }) as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paraModelo: () => new FakeListChatModel({ responses: ["ok"] }) as any,
  descripcion: () => ({ rapido: "falso", trabajo: "falso", afilado: "falso" }),
};

const sinExternos: SubagenteExternoPort = {
  disponible: async () => false,
  correr: async () => "",
};

describe("construirAgente monta la carpeta de adjuntos que le pasan", () => {
  function proyectoConAdjunto() {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-ag-adj-"));
    writeFileSync(join(raiz, "app.xml"), "<app/>");
    const adjuntos = mkdtempSync(join(tmpdir(), "xonecode-ag-adjs-"));
    writeFileSync(join(adjuntos, "encargo.md"), "lo que quiero es esto");
    return { raiz, adjuntos };
  }

  const comun = { agentes: [], subagenteExterno: sinExternos, modelos, skills: new SkillsEnMemoria() };

  it("con `adjuntos`, el `read_file` del agente lee `/adjuntos/`", async () => {
    const { raiz, adjuntos } = proyectoConAdjunto();
    const agente = await construirAgente({ ...comun, raiz, ficheros: new Set(["/app.xml"]), adjuntos });
    const read = toolDelAgente(agente, "read_file");
    expect(read, "no se encontró la tool `read_file` en el agente construido").toBeDefined();
    const leido = JSON.stringify(await read!.invoke({ file_path: "/adjuntos/encargo.md", offset: 0, limit: 20 }));
    expect(leido).toContain("lo que quiero es esto");
  });

  it("sin `adjuntos`, esa ruta no es nada: no se monta a espaldas de nadie", async () => {
    const { raiz } = proyectoConAdjunto();
    const agente = await construirAgente({ ...comun, raiz, ficheros: new Set(["/app.xml"]) });
    const read = toolDelAgente(agente, "read_file")!;
    const leido = JSON.stringify(await read.invoke({ file_path: "/adjuntos/encargo.md", offset: 0, limit: 20 }));
    expect(leido).not.toContain("lo que quiero es esto");
  });
});

/**
 * `incorporar_adjunto` en el grafo de VERDAD (IXCODE-7): orquestador → `task` → `developer-xone`
 * → la tool, con el `humanInTheLoopMiddleware` de deepagents y un checkpointer real. Lo que se
 * prueba es el CABLEADO —que la tool llega al especialista y que su nombre está en su
 * `interruptOn`—, que es lo que ningún test de piezas ve: `hitlDe` puede tener la fila y el
 * subagente no recibirla, o al revés.
 *
 * El modelo es un guion COMPARTIDO por los dos hilos (el raíz y el hijo piden al mismo
 * `ModelosPort`), en el orden en que la librería los llama.
 */
describe("incorporar_adjunto en deepagents: se PARA a preguntar, y solo escribe con el «sí»", () => {
  class ModeloConGuion extends BaseChatModel {
    constructor(private readonly guion: AIMessage[]) {
      super({});
    }
    _llmType(): string {
      return "guion";
    }
    bindTools(): this {
      return this;
    }
    async _generate(): Promise<ChatResult> {
      const m = this.guion.shift() ?? new AIMessage("fin del guion");
      return { generations: [{ message: m, text: typeof m.content === "string" ? m.content : "" }] };
    }
  }

  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 1]);
  const developer = AGENTES_DE_SERIE.find((a) => a.nombre === "developer-xone")!;

  async function turnoHastaLaPausa() {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-ag-inc-"));
    writeFileSync(join(raiz, "app.xml"), "<app/>");
    const adjuntos = mkdtempSync(join(tmpdir(), "xonecode-ag-incs-"));
    writeFileSync(join(adjuntos, "ic.png"), PNG);
    const guion = [
      new AIMessage({ content: "", tool_calls: [{ id: "t1", name: "task", args: { subagent_type: "developer-xone", description: "pon el icono en /icons/ic_add.png" } }] }),
      new AIMessage({ content: "", tool_calls: [{ id: "i1", name: NOMBRE_INCORPORAR_ADJUNTO, args: { adjunto: "/adjuntos/ic.png", file_path: "/icons/ic_add.png" } }] }),
      new AIMessage("Hecho."),
      new AIMessage("Listo."),
    ];
    const modelo = new ModeloConGuion(guion);
    const conGuion: ModelosPort = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paraPapel: () => modelo as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paraModelo: () => modelo as any,
      descripcion: () => ({ rapido: "guion", trabajo: "guion", afilado: "guion" }),
    };
    const agente = await construirAgente({
      agentes: [developer],
      subagenteExterno: sinExternos,
      modelos: conGuion,
      skills: new SkillsEnMemoria(),
      raiz,
      ficheros: new Set(["/app.xml"]),
      adjuntos,
      checkpointer: new MemorySaver(),
    });
    const config = { configurable: { thread_id: "inc-1" }, recursionLimit: 50 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = agente as any;
    await a.invoke({ messages: [new HumanMessage("pon el icono adjunto en el menú")] }, config);
    const pendientes = collectPending(await a.getState(config));
    return { raiz, a, config, pendientes };
  }

  it("la pausa lleva el destino como fichero y la línea binaria como vista", async () => {
    const { raiz, pendientes } = await turnoHastaLaPausa();
    expect(pendientes).toHaveLength(1);
    const p = pendientes[0]!;
    expect(p.tool).toBe(NOMBRE_INCORPORAR_ADJUNTO);
    expect(p.description).toContain("[developer-xone]");
    expect(ficheroDe(p)).toBe("/icons/ic_add.png");
    const vista = cambioDe(p, () => "");
    expect(vista?.lineas).toHaveLength(1);
    expect(vista!.lineas[0]!.tipo).toBe("anadido");
    expect(vista!.lineas[0]!.texto.startsWith("[fichero binario]")).toBe(true);
    expect(vista!.lineas[0]!.texto).toContain("/adjuntos/ic.png");
    // Parado ANTES de escribir.
    expect(existsSync(join(raiz, "icons", "ic_add.png"))).toBe(false);
  }, 30_000);

  it("aprobado, el fichero aparece con sus BYTES", async () => {
    const { raiz, a, config, pendientes } = await turnoHastaLaPausa();
    const resume = buildResume(new Map(pendientes.map((p) => [p.id, { type: "approve" as const }])));
    await a.invoke(new Command({ resume }), config);
    expect(readFileSync(join(raiz, "icons", "ic_add.png")).equals(PNG)).toBe(true);
  }, 30_000);

  it("rechazado, no aparece", async () => {
    const { raiz, a, config, pendientes } = await turnoHastaLaPausa();
    const resume = buildResume(new Map(pendientes.map((p) => [p.id, { type: "reject" as const, message: "no" }])));
    await a.invoke(new Command({ resume }), config);
    expect(existsSync(join(raiz, "icons", "ic_add.png"))).toBe(false);
  }, 30_000);
});
