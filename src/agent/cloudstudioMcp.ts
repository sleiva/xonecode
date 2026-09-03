/**
 * Conexión MCP de CloudStudio.
 *
 * El endpoint protege sus tools con OAuth del IDS. Este adaptador realiza el flujo
 * Authorization Code + PKCE que espera MCP Streamable HTTP: abre el navegador, recibe
 * el callback en loopback y guarda el resultado SOLO en ~/.xonecode, nunca en el repo.
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

const NOMBRE_CARPETA = ".xonecode";
const NOMBRE_AUTH = "cloudstudio-oauth.json";
const VERSION = "0.5.0";
/** Debe ser estable: el IDS registra el redirect_uri del cliente OAuth. */
const PUERTO_CALLBACK = 7634;

type EstadoOAuth = {
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  codeVerifier?: string;
};

/** Resultado reducido: los esquemas completos de tools no deben entrar en el transcript. */
export interface ConexionCloudStudio {
  url: string;
  herramientas: Array<{ nombre: string; descripcion: string }>;
}

export interface OpcionesCloudStudio {
  /** Costura para tests y para no acoplar el agente a un navegador concreto. */
  abrirNavegador?: (url: URL) => void;
  /** Se muestra antes de abrir el navegador; útil también en sesiones SSH. */
  informar?: (texto: string) => void;
  /** Tope de espera de la vuelta del usuario desde el IDS. */
  timeoutMs?: number;
  rutaAuth?: string;
}

function rutaAuthPorDefecto(): string {
  return join(homedir(), NOMBRE_CARPETA, NOMBRE_AUTH);
}

function leerEstado(ruta: string): EstadoOAuth {
  if (!existsSync(ruta)) return {};
  try {
    const bruto: unknown = JSON.parse(readFileSync(ruta, "utf8"));
    return typeof bruto === "object" && bruto !== null && !Array.isArray(bruto) ? bruto as EstadoOAuth : {};
  } catch {
    // Un token corrupto no impide volver a autenticar; nunca se imprime el contenido.
    return {};
  }
}

function guardarEstado(ruta: string, estado: EstadoOAuth): void {
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
  const temporal = `${ruta}.${randomUUID()}.tmp`;
  let fd: number | undefined;
  try {
    fd = openSync(temporal, "wx", 0o600);
    writeFileSync(fd, JSON.stringify(estado, null, 2) + "\n", "utf8");
    closeSync(fd);
    fd = undefined;
    renameSync(temporal, ruta);
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporal); } catch { /* no llegó a crearse */ }
    throw error;
  }
}

function abrirEnSistema(url: URL): void {
  const [comando, args] = process.platform === "darwin"
    ? ["open", [url.toString()]]
    : process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url.toString()]]
      : ["xdg-open", [url.toString()]];
  const proceso = spawn(comando, args, { detached: true, stdio: "ignore" });
  proceso.unref();
}

function urlSegura(valor: string): URL {
  const url = new URL(valor);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    throw new Error("la URL de CloudStudio debe ser HTTPS y no puede incluir credenciales");
  }
  return url;
}

function esperarCallback(timeoutMs: number): Promise<{ url: string; codigo: Promise<string>; cerrar: () => void }> {
  return new Promise((resolver, rechazar) => {
    let resolverCodigo!: (codigo: string) => void;
    let rechazarCodigo!: (error: Error) => void;
    const codigo = new Promise<string>((ok, fallo) => {
      resolverCodigo = ok;
      rechazarCodigo = fallo;
    });
    const servidor = createServer((peticion, respuesta) => {
      const recibida = new URL(peticion.url ?? "/", "http://127.0.0.1");
      const codigo = recibida.searchParams.get("code");
      const error = recibida.searchParams.get("error");
      respuesta.writeHead(error || !codigo ? 400 : 200, { "content-type": "text/html; charset=utf-8" });
      respuesta.end(error || !codigo
        ? "<h1>No se pudo completar el acceso a CloudStudio</h1><p>Vuelve a la consola para ver el detalle.</p>"
        : "<h1>CloudStudio conectado</h1><p>Ya puedes volver a xonecode.</p>");
      limpiar();
      if (error || !codigo) rechazarCodigo(new Error(`el IDS rechazó el acceso${error ? `: ${error}` : ""}`));
      else resolverCodigo(codigo);
    });
    const temporizador = setTimeout(() => {
      limpiar();
      rechazarCodigo(new Error("se agotó la espera del login de CloudStudio"));
    }, timeoutMs);
    const limpiar = () => {
      clearTimeout(temporizador);
      servidor.close();
    };
    servidor.once("error", (error) => {
      limpiar();
      rechazar(new Error(`no se pudo abrir el callback local de OAuth: ${error.message}`));
    });
    servidor.listen(PUERTO_CALLBACK, "127.0.0.1", () => {
      const direccion = servidor.address();
      if (direccion === null || typeof direccion === "string") {
        limpiar();
        rechazar(new Error("no se pudo abrir el callback local de OAuth"));
        return;
      }
      callback = `http://127.0.0.1:${direccion.port}/oauth/callback`;
      resolver({ url: callback, codigo, cerrar: limpiar });
    });
    let callback = "";
  });
}

/** Provider OAuth persistente, deliberadamente pequeño y compatible con el SDK MCP. */
class ProviderCloudStudio implements OAuthClientProvider {
  private estado: EstadoOAuth;
  private readonly metadata: OAuthClientMetadata;

  constructor(
    private readonly ruta: string,
    redirectUrl: string,
    private readonly alRedirigir: (url: URL) => void,
  ) {
    this.estado = leerEstado(ruta);
    this.metadata = {
      client_name: "xonecode",
      client_uri: "https://github.com/xonecode/xonecode",
      redirect_uris: [redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      // Mínimo privilegio: conectar y descubrir tools no necesita escribir ni ejecutar.
      scope: "openid profile email offline_access mcp.read",
    };
  }
  get redirectUrl(): string { return this.metadata.redirect_uris![0]!; }
  get clientMetadata(): OAuthClientMetadata { return this.metadata; }
  clientInformation(): OAuthClientInformationMixed | undefined { return this.estado.clientInformation; }
  saveClientInformation(info: OAuthClientInformationMixed): void { this.estado.clientInformation = info; guardarEstado(this.ruta, this.estado); }
  tokens(): OAuthTokens | undefined { return this.estado.tokens; }
  saveTokens(tokens: OAuthTokens): void { this.estado.tokens = tokens; guardarEstado(this.ruta, this.estado); }
  redirectToAuthorization(url: URL): void { this.alRedirigir(url); }
  saveCodeVerifier(verifier: string): void { this.estado.codeVerifier = verifier; guardarEstado(this.ruta, this.estado); }
  codeVerifier(): string {
    if (!this.estado.codeVerifier) throw new Error("no hay verificador PKCE para el login de CloudStudio");
    return this.estado.codeVerifier;
  }
}

/**
 * Inicia (o reutiliza) OAuth, completa initialize y lista las tools disponibles.
 * La conexión de tools al grafo vendrá después: esta función prueba la conexión sin
 * incorporar los esquemas de todas las tools al prompt del agente.
 */
export async function conectarCloudStudio(urlTexto: string, opciones: OpcionesCloudStudio = {}): Promise<ConexionCloudStudio> {
  const url = urlSegura(urlTexto);
  const callback = await esperarCallback(opciones.timeoutMs ?? 5 * 60_000);
  const ruta = opciones.rutaAuth ?? rutaAuthPorDefecto();
  const provider = new ProviderCloudStudio(ruta, callback.url, (autorizacion) => {
    opciones.informar?.(`Abriendo IDS de CloudStudio…\n${autorizacion.toString()}\n`);
    (opciones.abrirNavegador ?? abrirEnSistema)(autorizacion);
  });
  const cliente = new Client({ name: "xonecode", version: VERSION });
  const transporte = new StreamableHTTPClientTransport(url, { authProvider: provider });
  try {
    try {
      await cliente.connect(transporte);
    } catch (error) {
      if (!(error instanceof UnauthorizedError)) throw error;
      const codigo = await callback.codigo;
      await transporte.finishAuth(codigo);
      await cliente.connect(transporte);
    }
    const listado = await cliente.listTools();
    return {
      url: url.toString(),
      herramientas: listado.tools.map((tool) => ({ nombre: tool.name, descripcion: tool.description ?? "" })),
    };
  } finally {
    callback.cerrar();
    await transporte.close();
  }
}
