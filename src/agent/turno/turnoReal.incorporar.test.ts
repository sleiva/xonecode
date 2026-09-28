import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { abrirSesionReal } from "./turnoReal.js";
import { SkillsEnMemoria, type ModelosPort } from "../../core/ports.js";
import type { Entorno } from "../config/entorno.js";
import type { Piel } from "../../core/turno.js";
import { NOMBRE_INCORPORAR_ADJUNTO } from "../../core/adjuntos.js";

/**
 * El modo AUTÓNOMO de deepagents con `incorporar_adjunto` (IXCODE-7), por la puerta de verdad
 * —`abrirSesionReal` con `motor: "deepagents"` y el grafo REAL, sin doblar `construirAgente`—.
 *
 * Es el criterio que TrueForge ya tenía probado (`sesionTrueforge.test.ts`) y deepagents no: la
 * rama autónoma de `turnoReal.ts` es genérica (lee la ruta con `ficheroDe` y la apunta en
 * `aplicadasSinPreguntar`), así que no hizo falta código. Pero «es genérica» es una lectura, y
 * esto la convierte en medida: sin nadie delante la copia se aplica, y el aviso NOMBRA la ruta.
 * Y en supervisado, lo contrario: se pregunta, con la tarjeta binaria.
 */
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

function escenario() {
  const raiz = mkdtempSync(join(tmpdir(), "xc-turnoreal-inc-"));
  writeFileSync(join(raiz, "app.xml"), "<app/>\n");
  const adjuntos = mkdtempSync(join(tmpdir(), "xc-turnoreal-incs-"));
  writeFileSync(join(adjuntos, "ic.png"), PNG);
  const modelo = new ModeloConGuion([
    new AIMessage({ content: "", tool_calls: [{ id: "t1", name: "task", args: { subagent_type: "developer-xone", description: "pon el icono en /icons/ic_add.png" } }] }),
    new AIMessage({ content: "", tool_calls: [{ id: "i1", name: NOMBRE_INCORPORAR_ADJUNTO, args: { adjunto: "/adjuntos/ic.png", file_path: "/icons/ic_add.png" } }] }),
    new AIMessage("Hecho."),
    new AIMessage("Listo."),
  ]);
  const modelos: ModelosPort = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    paraPapel: () => modelo as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    paraModelo: () => modelo as any,
    descripcion: () => ({ rapido: "guion", trabajo: "guion", afilado: "guion" }),
  };
  const entorno: Entorno = {
    raiz,
    esProyectoXone: true,
    colecciones: 0,
    vistasAplanadas: [],
    git: { dentro: false, esRaiz: false, tieneCommits: false, prefijo: "", usable: false },
    simulador: { ruta: "x", responde: false },
  };
  const escrito: string[] = [];
  const piel: Piel = {
    token: (t) => void escrito.push(t),
    cerrarLinea: () => {},
    linea: (t) => void escrito.push(t),
    pausa: () => {},
    fin: () => {},
  };
  return { raiz, adjuntos, modelos, entorno, piel, escrito };
}

describe("incorporar_adjunto por abrirSesionReal con motor deepagents", () => {
  it("autónomo: se aplica sin preguntar, con sus bytes, y el aviso NOMBRA la ruta", async () => {
    const { raiz, adjuntos, modelos, entorno, piel, escrito } = escenario();
    let preguntada = false;
    const sesion = await abrirSesionReal({
      raiz, modelos, entorno, skills: new SkillsEnMemoria(), motor: "deepagents", adjuntos,
      sinAprobacion: () => true,
      pedirAprobacion: async (pendientes) => {
        preguntada = true;
        return new Map(pendientes.map((p) => [p.id, { type: "reject" as const }]));
      },
    });
    await sesion.turno("pon el icono adjunto en el menú", piel);
    expect(preguntada).toBe(false);
    expect(readFileSync(join(raiz, "icons", "ic_add.png")).equals(PNG)).toBe(true);
    expect(escrito.join("\n")).toMatch(/aplicadas SIN aprobación: \/icons\/ic_add\.png/);
  }, 30_000);

  it("supervisado: se PREGUNTA con la tarjeta binaria, y rechazado no se escribe", async () => {
    const { raiz, adjuntos, modelos, entorno, piel } = escenario();
    const vistas: { fichero?: string; texto?: string }[] = [];
    const sesion = await abrirSesionReal({
      raiz, modelos, entorno, skills: new SkillsEnMemoria(), motor: "deepagents", adjuntos,
      pedirAprobacion: async (pendientes, ficheros, diffs) => {
        for (const p of pendientes) {
          const fichero = ficheros.get(p.id);
          const texto = diffs.get(p.id)?.[0]?.texto;
          vistas.push({ ...(fichero === undefined ? {} : { fichero }), ...(texto === undefined ? {} : { texto }) });
        }
        return new Map(pendientes.map((p) => [p.id, { type: "reject" as const }]));
      },
    });
    await sesion.turno("pon el icono adjunto en el menú", piel);
    expect(vistas).toHaveLength(1);
    expect(vistas[0]!.fichero).toBe("/icons/ic_add.png");
    expect(vistas[0]!.texto?.startsWith("[fichero binario]")).toBe(true);
    expect(existsSync(join(raiz, "icons", "ic_add.png"))).toBe(false);
  }, 30_000);
});
