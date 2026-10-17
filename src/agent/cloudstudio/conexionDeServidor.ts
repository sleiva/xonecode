// src/agent/cloudstudio/conexionDeServidor.ts
/**
 * Conexión a CloudStudio para un SERVIDOR: sin navegador, sin callback y sin fichero de estado.
 *
 * `sesionCloudStudio` (`cloudstudioMcp.ts`) está hecha para una persona delante: autoriza con
 * código + PKCE, escucha un callback en un puerto fijo y guarda los tokens en
 * `~/.xonecode/cloudstudio-oauth.json`. En un servidor no hay nadie que abra el navegador, y
 * el IDS admite *client credentials* para un cliente de máquina. Esto es la otra puerta, y es
 * un fichero APARTE a propósito: la de las personas no cambia ni una línea.
 *
 * El proveedor llega HECHO (`ClientCredentialsProvider` del SDK, o el que sea): aquí no se
 * decide cómo se autentica nadie, solo se usa. Si aun así el proveedor pide redirigir, es que
 * no es de máquina, y se dice en vez de quedarse esperando un callback que no llegará.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import {
  AVISO_DE_URL_DE_MCP,
  SCOPES_CLOUDSTUDIO_AGENTE,
  herramientaDeProyectos,
  invocarSobre,
  proyectosDeResultado,
  urlDeMcpAceptable,
  type InvocarMcp,
  type ProyectoRemoto,
} from "./cloudstudioMcp.js";

/** Lo que se usa de un cliente MCP: lo justo para poder doblarlo en los tests. */
export interface ClienteMcpMinimo {
  listTools(): Promise<{ tools: { name: string; description?: string; inputSchema?: unknown }[] }>;
  callTool(peticion: { name: string; arguments?: Record<string, unknown> }): Promise<unknown>;
  close(): Promise<void>;
}

export interface ConexionDeServidor {
  invocar: InvocarMcp;
  /** Los proyectos que ve el cliente de máquina. Se pregunta cada vez: no se cachea. */
  proyectos(): Promise<ProyectoRemoto[]>;
  cerrar(): Promise<void>;
}

export interface OpcionesDeConexionDeServidor {
  url: string;
  authProvider: OAuthClientProvider;
  scopes?: readonly string[];
  /** Costura de test: por omisión, `auth` del SDK. */
  autorizar?: (
    provider: OAuthClientProvider,
    opciones: { serverUrl: URL; resourceMetadataUrl: URL; scope: string }
  ) => Promise<"AUTHORIZED" | "REDIRECT">;
  /** Costura de test: por omisión, `Client` + `StreamableHTTPClientTransport` del SDK. */
  conectar?: (url: URL, provider: OAuthClientProvider) => Promise<ClienteMcpMinimo>;
}

async function conectarDeVerdad(url: URL, provider: OAuthClientProvider): Promise<ClienteMcpMinimo> {
  const cliente = new Client({ name: "xonecode-servidor", version: "1" });
  const transporte = new StreamableHTTPClientTransport(url, { authProvider: provider });
  try {
    await cliente.connect(transporte);
  } catch (error) {
    await transporte.close();
    throw error;
  }
  return {
    listTools: () => cliente.listTools(),
    callTool: (p) => cliente.callTool(p),
    close: () => transporte.close(),
  };
}

export async function conectarStudioDeServidor(opciones: OpcionesDeConexionDeServidor): Promise<ConexionDeServidor> {
  if (!urlDeMcpAceptable(opciones.url)) throw new Error(AVISO_DE_URL_DE_MCP);
  const url = new URL(opciones.url);
  const scopes = opciones.scopes ?? SCOPES_CLOUDSTUDIO_AGENTE;
  const autorizar = opciones.autorizar ?? auth;
  const resultado = await autorizar(opciones.authProvider, {
    serverUrl: url,
    resourceMetadataUrl: new URL("/.well-known/oauth-protected-resource", url.origin),
    scope: scopes.join(" "),
  });
  if (resultado !== "AUTHORIZED") {
    throw new Error(
      "el proveedor pidió autorización interactiva: en un servidor hace falta un cliente de máquina (client credentials)"
    );
  }
  const cliente = await (opciones.conectar ?? conectarDeVerdad)(url, opciones.authProvider);
  return {
    invocar: invocarSobre((peticion) => cliente.callTool(peticion) as never),
    proyectos: async () => {
      const listado = await cliente.listTools();
      const definicion = herramientaDeProyectos(listado.tools);
      if (definicion === undefined) {
        throw new Error("CloudStudio no publicó ninguna herramienta de listado de proyectos");
      }
      return proyectosDeResultado(await cliente.callTool({ name: definicion.name, arguments: {} }));
    },
    cerrar: () => cliente.close(),
  };
}
