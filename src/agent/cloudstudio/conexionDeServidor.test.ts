// src/agent/cloudstudio/conexionDeServidor.test.ts
import { describe, expect, it, vi } from "vitest";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { conectarStudioDeServidor, type ClienteMcpMinimo } from "./conexionDeServidor.js";
import { AVISO_DE_URL_DE_MCP } from "./cloudstudioMcp.js";

const provider = {} as OAuthClientProvider;

function clienteDoble(tools: { name: string; inputSchema?: unknown }[], respuestaListado: unknown): ClienteMcpMinimo {
  return {
    listTools: vi.fn(async () => ({ tools })),
    callTool: vi.fn(async (p: { name: string }) =>
      p.name === tools[0]?.name ? respuestaListado : { content: [{ type: "text", text: "ok" }] }
    ),
    close: vi.fn(async () => {}),
  };
}

const LISTADO = {
  content: [{ type: "text", text: JSON.stringify({ recents: { a: { pid: "p-1", name: "Maset" } } }) }],
};

describe("conectarStudioDeServidor", () => {
  it("conecta con el proveedor dado y lista los proyectos", async () => {
    const cliente = clienteDoble([{ name: "studio_list_projects" }], LISTADO);
    const conexion = await conectarStudioDeServidor({
      url: "https://mcp.example.com/mcp",
      authProvider: provider,
      autorizar: async () => "AUTHORIZED",
      conectar: async () => cliente,
    });
    const proyectos = await conexion.proyectos();
    expect(proyectos.map((p) => p.nombre)).toContain("Maset");
    await conexion.cerrar();
    expect(cliente.close).toHaveBeenCalled();
  });

  it("se niega si el proveedor pide autorización interactiva", async () => {
    const conectar = vi.fn();
    await expect(
      conectarStudioDeServidor({
        url: "https://mcp.example.com/mcp",
        authProvider: provider,
        autorizar: async () => "REDIRECT",
        conectar,
      })
    ).rejects.toThrow(/autorización interactiva/);
    expect(conectar).not.toHaveBeenCalled();
  });

  it("rechaza una URL no segura sin tocar la red", async () => {
    const autorizar = vi.fn();
    await expect(
      conectarStudioDeServidor({ url: "http://mcp.example.com/mcp", authProvider: provider, autorizar })
    ).rejects.toThrow(AVISO_DE_URL_DE_MCP);
    expect(autorizar).not.toHaveBeenCalled();
  });

  it("dice que no hay listado si el servidor no lo publica", async () => {
    const conexion = await conectarStudioDeServidor({
      url: "https://mcp.example.com/mcp",
      authProvider: provider,
      autorizar: async () => "AUTHORIZED",
      conectar: async () => clienteDoble([{ name: "otra_cosa", inputSchema: { required: ["x"] } }], {}),
    });
    await expect(conexion.proyectos()).rejects.toThrow(/ninguna herramienta de listado/);
  });
});
