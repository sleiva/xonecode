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
});
