/**
 * Los conectores MCP de la consola: servidores REMOTOS de catálogo con los que se conecta
 * esta máquina. Puro a propósito —catálogo, formas del cable y reglas—; el disco y la red
 * viven en `agent/conectores/`.
 *
 * **Todavía no llegan a ningún agente.** Esta pieza es la conexión y la configuración; qué
 * agente recibe sus tools, y con qué política de aprobación, es la pieza siguiente.
 */

export type AutenticacionDeConector = "ninguna" | "oauth";

export interface ConectorDeCatalogo {
  readonly id: string;
  readonly nombre: string;
  readonly url: string;
  readonly descripcion: string;
  readonly autenticacion: AutenticacionDeConector;
}

/**
 * Medido contra los tres servidores el 24-09-2026: deepwiki contesta `listTools` sin
 * credenciales; Notion y Atlassian publican `registration_endpoint` y S256, y aceptan un
 * cliente público con `redirect_uri` en loopback. El transporte NO se declara: se prueba
 * `streamable-http` y, si no, `sse`, como hace TrueForge.
 */
export const CATALOGO_DE_CONECTORES: readonly ConectorDeCatalogo[] = [
  {
    id: "deepwiki",
    nombre: "DeepWiki",
    url: "https://mcp.deepwiki.com/mcp",
    descripcion: "Lee la documentación y pregunta sobre cualquier repositorio público de GitHub.",
    autenticacion: "ninguna",
  },
  {
    id: "jira",
    nombre: "Jira",
    url: "https://mcp.atlassian.com/v1/mcp",
    descripcion: "Busca, lee, crea y actualiza incidencias de Jira.",
    autenticacion: "oauth",
  },
  {
    id: "notion",
    nombre: "Notion",
    url: "https://mcp.notion.com/mcp",
    descripcion: "Busca páginas, lee contenido, consulta bases de datos y crea páginas.",
    autenticacion: "oauth",
  },
];

export function conectorDelCatalogo(id: string): ConectorDeCatalogo | undefined {
  return CATALOGO_DE_CONECTORES.find((c) => c.id === id);
}

/** Lo que dice el DISCO, no una medida: la medida es `PruebaDeConector`. */
export type EstadoDeConector = "sin-autorizacion" | "falta-autorizar" | "autorizado";

export function estadoDeConector(conector: ConectorDeCatalogo, hayTokens: boolean): EstadoDeConector {
  if (conector.autenticacion === "ninguna") return "sin-autorizacion";
  return hayTokens ? "autorizado" : "falta-autorizar";
}

/** Una tool tal como la enseña Ajustes. `soloLectura` ausente = el servidor no lo anota. */
export interface ToolDeConector {
  nombre: string;
  descripcion?: string;
  soloLectura?: boolean;
}

/** La última vez que se probó: una FOTO con hora. Ausente = no se ha probado. */
export type PruebaDeConector =
  | { cuando: number; ok: true; tools: ToolDeConector[] }
  | { cuando: number; ok: false; motivo: string };

/** Un conector AÑADIDO, en la forma del cable. Nunca lleva tokens ni URL de autorización. */
export interface ConectorDelCable {
  id: string;
  estado: EstadoDeConector;
  prueba?: PruebaDeConector;
  /** Hay una autorización abierta en el navegador esperando su callback. */
  autorizando?: boolean;
}

/** 10 min, el mismo plazo que TrueForge da a una autorización pendiente. */
export const TTL_DE_AUTORIZACION_MS = 10 * 60 * 1000;
/** Conectar + listar tools: más que esto es «no responde». */
export const TOPE_DE_CONEXION_MS = 30 * 1000;
/** La ruta del callback. PÚBLICA: la redirección llega sin cookie (`SameSite=Strict`). */
export const RUTA_CALLBACK_MCP = "/mcp/oauth/callback";

export interface Pendiente {
  id: string;
  expira: number;
}

export type ResultadoDeCallback = { ok: true; id: string; code: string } | { ok: false; motivo: string };

/**
 * La autenticación de la ruta pública ES el `state`: aleatorio, de un solo uso y con
 * plazo. Se CONSUME en cuanto se reconoce, vaya bien o mal, para que no se pueda repetir.
 *
 * El `motivo` es siempre una frase NUESTRA: la query la escribe quien redirige, y repetirla
 * en una página nuestra sería servir contenido ajeno desde el origen de la consola.
 */
export function interpretarCallback(query: URLSearchParams, pendientes: Map<string, Pendiente>, ahora: number): ResultadoDeCallback {
  const state = query.get("state");
  if (state === null) return { ok: false, motivo: "la respuesta no trae el identificador de la autorización" };
  const pendiente = pendientes.get(state);
  if (pendiente === undefined) return { ok: false, motivo: "esa autorización no la pidió esta consola, o ya se usó" };
  pendientes.delete(state);
  if (ahora > pendiente.expira) return { ok: false, motivo: "la autorización caducó: vuelve a pulsar Conectar" };
  if (query.get("error") !== null) return { ok: false, motivo: "el servicio no concedió el acceso" };
  const code = query.get("code");
  if (code === null || code.length === 0) return { ok: false, motivo: "la respuesta no trae código de autorización" };
  return { ok: true, id: pendiente.id, code };
}
