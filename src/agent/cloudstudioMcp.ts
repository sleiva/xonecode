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
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

const NOMBRE_CARPETA = ".xonecode";
const NOMBRE_AUTH = "cloudstudio-oauth.json";
const VERSION = "0.5.0";
/** Debe ser estable: el IDS registra el redirect_uri del cliente OAuth. */
const PUERTO_CALLBACK = 7634;
/** Permisos mínimos para descubrir el catálogo MCP; no otorgan escritura ni ejecución. */
export const SCOPES_CLOUDSTUDIO = ["openid", "profile", "email", "offline_access", "mcp.read"] as const;
export const SCOPES_CLOUDSTUDIO_ESCRITURA = [...SCOPES_CLOUDSTUDIO, "mcp.write"] as const;
/** Un único consentimiento para el trabajo normal del agente; jamás incluye mcp.admin. */
export const SCOPES_CLOUDSTUDIO_AGENTE = [
  "openid", "profile", "email", "offline_access", "xonewebstudioapi",
  "mcp.read", "mcp.write", "mcp.execute", "mcp.branch",
] as const;

type EstadoOAuth = {
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  /** Permisos concedidos junto al token; evita reautorizar si el servidor omite `scope`. */
  scopes?: string[];
};

/** Resultado reducido: los esquemas completos de tools no deben entrar en el transcript. */
export interface ConexionCloudStudio {
  url: string;
  scopes: readonly string[];
  herramientas: Array<{ nombre: string; descripcion: string }>;
  proyectos: Array<{ id: string; nombre: string }>;
}

export interface OpcionesCloudStudio {
  /** Costura para tests y para no acoplar el agente a un navegador concreto. */
  abrirNavegador?: (url: URL) => void;
  /** Se muestra antes de abrir el navegador; útil también en sesiones SSH. */
  informar?: (texto: string) => void;
  /** Tope de espera de la vuelta del usuario desde el IDS. */
  timeoutMs?: number;
  rutaAuth?: string;
  /** Scope elegido conscientemente por el comando o por una futura tool permitida. */
  scopes?: readonly string[];
}

/**
 * El listado de proyectos por orden de preferencia.
 *
 * El servidor real de XOne CloudStudio la publica como `studio_list_projects`; los dos
 * alias siguientes son endpoints anteriores. NO se codifica un solo nombre: cuando el
 * servidor renombra su catálogo, el arranque entero se queda sin proyectos, y el usuario
 * ve «no publicó la herramienta» en vez de su lista.
 */
const NOMBRES_LISTAR_PROYECTOS = ["studio_list_projects", "project_list", "list_projects", "projects_list"] as const;

type DefinicionDeTool = { name: string; description?: string; inputSchema?: unknown };

/** Una tool que exige argumentos no se puede invocar con `{}` en el arranque. */
function pideArgumentos(definicion: DefinicionDeTool): boolean {
  const esquema = definicion.inputSchema;
  if (typeof esquema !== "object" || esquema === null) return false;
  const obligatorios = (esquema as Record<string, unknown>).required;
  return Array.isArray(obligatorios) && obligatorios.length > 0;
}

/**
 * Qué tool lista los proyectos. Primero los nombres conocidos, en orden; si ninguno está,
 * una heurística conservadora: tiene que hablar de listar Y de proyectos, y no pedir
 * argumentos. `studio_open_project` o `studio_download_project` no la superan a propósito
 * — abrir el proyecto equivocado en el arranque es peor que no encontrar la tool.
 */
export function herramientaDeProyectos(tools: readonly DefinicionDeTool[]): DefinicionDeTool | undefined {
  for (const nombre of NOMBRES_LISTAR_PROYECTOS) {
    const exacta = tools.find((t) => t.name === nombre);
    if (exacta !== undefined) return exacta;
  }
  return tools.find((t) => {
    const nombre = t.name.toLowerCase();
    return /list/.test(nombre) && /project|proyecto/.test(nombre) && !pideArgumentos(t);
  });
}

/** Extrae solo una identidad visible; el resultado íntegro nunca va al transcript. */
export function proyectosDeResultado(valor: unknown): Array<{ id: string; nombre: string }> {
  if (typeof valor === "string") {
    try { return proyectosDeResultado(JSON.parse(valor)); } catch { return []; }
  }
  // Medido contra el servidor real: `studio_list_projects` NO devuelve una lista, sino un
  // MAPA indexado por id bajo «recents». Por eso cada clave admite las dos formas y la
  // clave del mapa se conserva: es el id cuando la entrada no lo repite en «pid».
  const entradas = (candidato: unknown): unknown[] =>
    Array.isArray(candidato)
      ? candidato
      : typeof candidato === "object" && candidato !== null
        ? Object.entries(candidato).map(([clave, entrada]) =>
            typeof entrada === "object" && entrada !== null && !Array.isArray(entrada)
              ? { ...entrada, __clave: clave }
              : entrada
          )
        : [];

  const lista = Array.isArray(valor)
    ? valor
    : typeof valor === "object" && valor !== null
      ? ["projects", "proyectos", "items", "data", "recents"].flatMap((clave) =>
          entradas((valor as Record<string, unknown>)[clave])
        )
      : [];
  // Los SDK MCP devuelven el resultado textual dentro de `content`; no se conserva
  // nada salvo los pares id/nombre. El wrapper LangChain de abajo serializa ese
  // resultado para poder usar `.invoke({})` sin traducir los esquemas ajenos.
  if (lista.length === 0 && typeof valor === "object" && valor !== null) {
    const contenido = (valor as Record<string, unknown>).content;
    if (Array.isArray(contenido)) {
      return contenido.flatMap((bloque) =>
        typeof bloque === "object" && bloque !== null && (bloque as Record<string, unknown>).type === "text"
          ? proyectosDeResultado((bloque as Record<string, unknown>).text)
          : []
      );
    }
  }
  const vistos = new Set<string>();
  return lista.flatMap((candidato) => {
    if (typeof candidato !== "object" || candidato === null || Array.isArray(candidato)) return [];
    const dato = candidato as Record<string, unknown>;
    const id = [dato.id, dato.pid, dato.projectId, dato.project_id, dato.__clave].find((v): v is string => typeof v === "string" && v.trim() !== "");
    const nombre = [dato.name, dato.nombre, dato.title].find((v): v is string => typeof v === "string" && v.trim() !== "");
    if (id === undefined || nombre === undefined || vistos.has(id)) return [];
    vistos.add(id);
    return [{ id, nombre }];
  });
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
    private readonly scopes: readonly string[],
  ) {
    this.estado = leerEstado(ruta);
    // Un refresh token de solo lectura no sirve para elevar privilegios. Borrarlo aquí
    // fuerza Authorization Code + consentimiento nuevo en lugar de fingir una elevación.
    const concedidos = new Set(this.estado.scopes ?? (this.estado.tokens?.scope ?? "").split(/\s+/));
    if (this.estado.tokens !== undefined && !this.scopes.every((scope) => concedidos.has(scope))) {
      delete this.estado.tokens;
      guardarEstado(this.ruta, this.estado);
    }
    this.metadata = {
      client_name: "xonecode",
      client_uri: "https://github.com/xonecode/xonecode",
      redirect_uris: [redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      // Mínimo privilegio: conectar y descubrir tools no necesita escribir ni ejecutar.
      scope: scopes.join(" "),
    };
  }
  get redirectUrl(): string { return this.metadata.redirect_uris![0]!; }
  get clientMetadata(): OAuthClientMetadata { return this.metadata; }
  clientInformation(): OAuthClientInformationMixed | undefined { return this.estado.clientInformation; }
  saveClientInformation(info: OAuthClientInformationMixed): void { this.estado.clientInformation = info; guardarEstado(this.ruta, this.estado); }
  tokens(): OAuthTokens | undefined { return this.estado.tokens; }
  saveTokens(tokens: OAuthTokens): void {
    this.estado.tokens = tokens;
    this.estado.scopes = [...this.scopes];
    guardarEstado(this.ruta, this.estado);
  }
  redirectToAuthorization(url: URL): void { this.alRedirigir(url); }
  saveCodeVerifier(verifier: string): void { this.estado.codeVerifier = verifier; guardarEstado(this.ruta, this.estado); }
  codeVerifier(): string {
    if (!this.estado.codeVerifier) throw new Error("no hay verificador PKCE para el login de CloudStudio");
    return this.estado.codeVerifier;
  }
}

/** El `invocar` que consume `clienteCloudStudio` (`agent/cloudstudioClient.ts`).
 *  Se define aquí por estructura, no por import, para no crear un ciclo entre los dos
 *  módulos: ambos son adaptadores del mismo servidor pero no dependen entre sí. */
export type InvocarMcp = (nombre: string, argumentos: Record<string, unknown>) => Promise<unknown>;

/** Sesión MCP viva: `invocar` llama tools, `cerrar` libera el transporte. */
export interface SesionCloudStudio {
  invocar: InvocarMcp;
  cerrar: () => Promise<void>;
}

/** El texto de un error de TOOL (`isError`), nunca del transporte. Puede incluir rutas
 *  del servidor («No project is open»), nunca contenido de fichero ni el token: eso no
 *  viaja en el mensaje de error de una tool, solo en su resultado de éxito. */
function textoDeErrorDeTool(resultado: unknown): string {
  const contenido = typeof resultado === "object" && resultado !== null
    ? (resultado as Record<string, unknown>).content
    : undefined;
  if (Array.isArray(contenido)) {
    const texto = contenido
      .filter((b): b is { type: string; text: string } =>
        typeof b === "object" && b !== null && (b as { type?: string }).type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
    if (texto !== "") return texto;
  }
  return "CloudStudio devolvió un error sin detalle";
}

/**
 * Envuelve un `callTool` crudo del SDK en la función `invocar` que espera
 * `clienteCloudStudio`. Separada de `sesionCloudStudio` para poder probar la conversión
 * `isError → excepción` con un `callTool` falso, sin tocar OAuth ni el transporte: es la
 * pieza de la que depende toda la reapertura de sesión en `agent/cloudstudioClient.ts`,
 * y una implementación que se limitara a `return callTool(...)` pasaría los tests de
 * `clienteCloudStudio` igual de mal que los de aquí bien, si esto no se probara aparte.
 */
export function invocarSobre(
  callTool: (peticion: { name: string; arguments: Record<string, unknown> }) => Promise<unknown>,
): InvocarMcp {
  return async (nombre, argumentos) => {
    const resultado = await callTool({ name: nombre, arguments: argumentos });
    // El SDK MCP no lanza cuando la TOOL falla (`isError: true` es una respuesta RPC
    // válida, con el motivo dentro de `content`); sin convertirlo en excepción, «No
    // project is open» nunca llegaría a un catch y `clienteCloudStudio` no podría
    // reabrir la sesión.
    if (typeof resultado === "object" && resultado !== null && (resultado as { isError?: boolean }).isError) {
      throw new Error(textoDeErrorDeTool(resultado));
    }
    return resultado;
  };
}

/**
 * Abre (o reutiliza) OAuth y conecta el transporte MCP. Es la base común de
 * `sesionCloudStudio` y `conectarCloudStudio`: la segunda necesita además
 * `listTools()`, que no es una tool invocable y por eso no cabe en `{ invocar, cerrar }`.
 *
 * En error se cierra el transporte aquí mismo, porque nadie más llega a recibir el
 * `cerrar()` que lo liberaría; en éxito la sesión queda VIVA a propósito, y es quien
 * llama quien decide cuándo cerrarla.
 */
async function abrirCliente(
  urlTexto: string,
  opciones: OpcionesCloudStudio,
): Promise<{ cliente: Client; url: URL; cerrar: () => Promise<void> }> {
  const url = urlSegura(urlTexto);
  const scopes = opciones.scopes ?? SCOPES_CLOUDSTUDIO_AGENTE;
  const callback = await esperarCallback(opciones.timeoutMs ?? 5 * 60_000);
  const ruta = opciones.rutaAuth ?? rutaAuthPorDefecto();
  const provider = new ProviderCloudStudio(ruta, callback.url, (autorizacion) => {
    // La URL de autorización no aporta nada al transcript normal y puede tener parámetros
    // sensibles de OAuth. El navegador se abre sin volcarla; quien use SSH puede inyectar
    // `abrirNavegador` y decidir cómo presentarla.
    (opciones.abrirNavegador ?? abrirEnSistema)(autorizacion);
  }, scopes);
  let transporte: StreamableHTTPClientTransport | undefined;
  try {
    // No se usa `client.connect()` para iniciar OAuth: ese transporte queda marcado como
    // iniciado incluso cuando redirige y no admite un segundo connect. `auth()` realiza
    // primero el descubrimiento/PKCE y solo se crea el transporte DESPUÉS del callback.
    const opcionesAuth = {
      serverUrl: url,
      resourceMetadataUrl: new URL("/.well-known/oauth-protected-resource", url.origin),
      scope: scopes.join(" "),
    };
    const inicial = await auth(provider, opcionesAuth);
    if (inicial === "REDIRECT") {
      const codigo = await callback.codigo;
      const final = await auth(provider, { ...opcionesAuth, authorizationCode: codigo });
      if (final !== "AUTHORIZED") throw new Error("el IDS no completó la autorización de CloudStudio");
    }
    const cliente = new Client({ name: "xonecode", version: VERSION });
    transporte = new StreamableHTTPClientTransport(url, { authProvider: provider });
    await cliente.connect(transporte);
    const transporteVivo = transporte;
    return { cliente, url, cerrar: () => transporteVivo.close() };
  } catch (error) {
    await transporte?.close();
    throw error;
  } finally {
    callback.cerrar();
  }
}

/**
 * Sesión MCP viva contra CloudStudio, para `clienteCloudStudio`
 * (`agent/cloudstudioClient.ts`): descarga, escribe y cambia de rama necesitan una
 * conexión que sobreviva a más de una llamada, cosa que `conectarCloudStudio` no ofrece
 * porque cierra el transporte en cuanto termina de mirar el catálogo.
 */
export async function sesionCloudStudio(urlTexto: string, opciones: OpcionesCloudStudio = {}): Promise<SesionCloudStudio> {
  const { cliente, cerrar } = await abrirCliente(urlTexto, opciones);
  return {
    invocar: invocarSobre((peticion) => cliente.callTool(peticion)),
    cerrar,
  };
}

/**
 * Inicia (o reutiliza) OAuth, completa initialize y lista las tools disponibles.
 * La conexión de tools al grafo vendrá después: esta función prueba la conexión sin
 * incorporar los esquemas de todas las tools al prompt del agente.
 */
export async function conectarCloudStudio(urlTexto: string, opciones: OpcionesCloudStudio = {}): Promise<ConexionCloudStudio> {
  const scopes = opciones.scopes ?? SCOPES_CLOUDSTUDIO_AGENTE;
  const { cliente, url, cerrar } = await abrirCliente(urlTexto, opciones);
  try {
    const listado = await cliente.listTools();
    const definicion = herramientaDeProyectos(listado.tools);
    if (definicion === undefined) {
      const disponibles = listado.tools.map((tool) => tool.name).filter(Boolean).join(", ");
      throw new Error(`CloudStudio no publicó ninguna herramienta de listado de proyectos${disponibles ? ` (disponibles: ${disponibles})` : ""}`);
    }
    const proyectos = proyectosDeResultado(await cliente.callTool({ name: definicion.name, arguments: {} }));
    return {
      url: url.toString(),
      scopes,
      herramientas: listado.tools.map((tool) => ({ nombre: tool.name, descripcion: tool.description ?? "" })),
      proyectos,
    };
  } finally {
    await cerrar();
  }
}
