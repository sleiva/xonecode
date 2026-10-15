import { describe, expect, it, vi } from "vitest";

/** El SDK de Claude Code, doblado: apunta con qué opciones se lanzó el hijo y contesta en el acto. */
const lanzados: { options: Record<string, unknown> }[] = [];
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (p: { options: Record<string, unknown> }) => {
    lanzados.push(p);
    return (async function* () {
      yield { type: "result", subtype: "success", is_error: false, result: "hecho", usage: {}, modelUsage: {} };
    })();
  },
}));

const { crearSubagenteExterno } = await import("./subagenteExterno.js");

/**
 * Un hijo de Claude Code ve SOLO las skills de su `.md` y ningún MCP. Medido en una tarea de Maset: sin la opción
 * `skills` veía también las del usuario, y con sus ajustes cargados arrancaba sus MCP (Playwright, el de XOne).
 */
describe("con qué se lanza un hijo de Claude Code", () => {
  const correr = (skills?: string[]) =>
    crearSubagenteExterno({}).correr({
      motor: "claude-code",
      cwd: process.cwd(),
      instrucciones: "",
      tarea: "haz algo",
      agente: "dev",
      permitirEscritura: false,
      ...(skills === undefined ? {} : { skills }),
    });

  it("sus skills, con el prefijo del plugin, y ningún MCP de fuera", async () => {
    expect(await correr(["xone-development"])).toBe("hecho");
    const opciones = lanzados.at(-1)!.options;
    expect(opciones.strictMcpConfig).toBe(true);
    // Ni los ajustes del proyecto ni los del usuario: ni sus hooks, ni sus plugins, ni sus `allow`.
    expect(opciones.settingSources).toEqual([]);
    expect(opciones.mcpServers).toBeUndefined();
    expect(opciones.plugins).toBeDefined();
    expect(opciones.skills).toEqual(["xonecode:xone-development"]);
  });

  it("sin skills en su `.md`, ninguna: la lista vacía, nunca la opción ausente («no es skills off»)", async () => {
    await correr();
    expect(lanzados.at(-1)!.options.skills).toEqual([]);
  });

  it("con ejecución, su prompt DICE qué shell tiene: sus scripts y cómo llamarlos", async () => {
    await crearSubagenteExterno({}).correr({
      motor: "claude-code", cwd: process.cwd(), instrucciones: "Eres el desarrollador.", tarea: "x", agente: "dev", permitirEscritura: false,
      ejecucion: { scripts: ["xone-captura-android"], entorno: {}, lecturas: [] },
    });
    const append = (lanzados.at(-1)!.options.systemPrompt as { append: string }).append;
    expect(append).toContain("Eres el desarrollador.");
    expect(append).toContain("SHELL: `Bash` solo para estos scripts de tus skills, uno por llamada, por su NOMBRE y sin ruta: `xone-captura-android`");
  });

  it("el `esfuerzo` de su `.md` llega como `effort`; sin él, no se manda", async () => {
    const base = { motor: "claude-code" as const, cwd: process.cwd(), instrucciones: "", tarea: "x", agente: "dev", permitirEscritura: false };
    await crearSubagenteExterno({}).correr({ ...base, esfuerzo: "medium" });
    expect(lanzados.at(-1)!.options.effort).toBe("medium");
    await crearSubagenteExterno({}).correr(base);
    expect(lanzados.at(-1)!.options.effort).toBeUndefined();
  });
});
