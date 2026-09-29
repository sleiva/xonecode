import { describe, it, expect, vi, afterEach } from "vitest";
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
import { NOMBRE_BUSCAR_ICONO } from "../../core/iconos.js";

/**
 * `buscar_icono` por la puerta de VERDAD (IXCODE-18): `abrirSesionReal` SIN la opción `iconos`, o
 * sea la composición de producción —`opciones.iconos ?? iconosEnRed()`— con el grafo real, y solo
 * `fetch` doblado. Es el patrón de fallo de esta arquitectura: los otros tests inyectan
 * `IconosEnMemoria` y nunca recorren esa línea, así que sin este la regla estaba escrita, no probada.
 * Los dos motores; el SVG recorre el camino entero hasta el disco (`write_file` con su aprobación).
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

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path stroke="#1a73e8" d="M3 3h18"/></svg>';

function escenario(motor: "deepagents" | "trueforge") {
  const raiz = mkdtempSync(join(tmpdir(), "xc-turnoreal-ico-"));
  writeFileSync(join(raiz, "app.xml"), "<app/>\n");
  const modelo = new ModeloConGuion([
    // Cada motor delega con SU tool: `task` en deepagents, `create_sub_agent` en TrueForge.
    new AIMessage({
      content: "",
      tool_calls: [
        motor === "deepagents"
          ? { id: "t1", name: "task", args: { subagent_type: "designer-xone", description: "pon un icono de casa" } }
          : { id: "t1", name: "create_sub_agent", args: { name: "designer-xone", input: "pon un icono de casa" } },
      ],
    }),
    new AIMessage({ content: "", tool_calls: [{ id: "i1", name: NOMBRE_BUSCAR_ICONO, args: { operacion: "obtener", id: "lucide:home", color: "#1a73e8", tamano: 24 } }] }),
    new AIMessage({ content: "", tool_calls: [{ id: "w1", name: "write_file", args: { file_path: "/icons/ic_home.svg", content: SVG } }] }),
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
  const piel: Piel = { token: () => {}, cerrarLinea: () => {}, linea: () => {}, pausa: () => {}, fin: () => {} };
  return { raiz, modelos, entorno, piel };
}

afterEach(() => vi.unstubAllGlobals());

describe.each(["deepagents", "trueforge"] as const)("buscar_icono por abrirSesionReal con motor %s, sin la opción iconos", (motor) => {
  it("llama a Iconify con color y altura, y el SVG llega al proyecto tras la aprobación", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(String(url));
      return new Response(SVG, { status: 200 });
    });
    const { raiz, modelos, entorno, piel } = escenario(motor);
    const aprobadas: string[] = [];
    const sesion = await abrirSesionReal({
      raiz, modelos, entorno, skills: new SkillsEnMemoria(), motor,
      pedirAprobacion: async (pendientes, ficheros) => {
        for (const p of pendientes) aprobadas.push(ficheros.get(p.id) ?? "?");
        return new Map(pendientes.map((p) => [p.id, { type: "approve" as const }]));
      },
    });
    await sesion.turno("pon un icono de casa en el menú", piel);
    expect(urls).toHaveLength(1);
    const u = new URL(urls[0]!);
    expect(u.origin + u.pathname).toBe("https://api.iconify.design/lucide/home.svg");
    expect(u.searchParams.get("color")).toBe("#1a73e8");
    expect(u.searchParams.get("height")).toBe("24");
    // La escritura del SVG pasa por su aprobación de siempre: la tool de red no escribe.
    expect(aprobadas).toContain("/icons/ic_home.svg");
    expect(existsSync(join(raiz, "icons", "ic_home.svg"))).toBe(true);
    expect(readFileSync(join(raiz, "icons", "ic_home.svg"), "utf8")).toBe(SVG);
  }, 30_000);
});
