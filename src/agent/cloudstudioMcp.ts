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
import type { Entorno } from "../core/settings.js";

const NOMBRE_CARPETA = ".xonecode";
const NOMBRE_AUTH = "cloudstudio-oauth.json";
const VERSION = "0.5.0";
/**
 * Debe ser estable: el IDS registra el redirect_uri del cliente OAuth.
 *
 * Se exporta porque `cli/main.ts` necesita el mismo número para rechazar `--puerto 7634`
 * en el servidor web (el callback de OAuth y la web no pueden compartir puerto). Antes
 * había una copia literal en `main.ts` porque este valor era privado; una sola fuente
 * evita que las dos constantes diverjan si el puerto cambia algún día.
 */
export const PUERTO_CALLBACK = 7634;
/**
 * El CloudStudio oficial. Vive aquí y no en `cli/consola.ts` (de donde se movió) porque
 * es la dirección de un SERVIDOR, no un detalle de la piel de consola, y
 * `adoptarLegadoSiProcede` —de este mismo fichero— la necesita para decidir si el fichero
 * plano de antes de los entornos pertenece al oficial: `agent/` no puede importar de
 * `cli/` (convención documentada en `agent/turnoReal.ts`), así que si esto se hubiera
 * quedado en `consola.ts` la migración habría tenido que duplicar el literal.
 */
export const URL_CLOUDSTUDIO_POR_OMISION = "https://mcp.xonewebstudio.com/mcp";
/** Permisos mínimos para descubrir el catálogo MCP; no otorgan escritura ni ejecución. */
export const SCOPES_CLOUDSTUDIO = ["openid", "profile", "email", "offline_access", "mcp.read"] as const;
export const SCOPES_CLOUDSTUDIO_ESCRITURA = [...SCOPES_CLOUDSTUDIO, "mcp.write"] as const;
/** Un único consentimiento para el trabajo normal del agente; jamás incluye mcp.admin. */
export const SCOPES_CLOUDSTUDIO_AGENTE = [
  "openid", "profile", "email", "offline_access", "xonewebstudioapi",
  "mcp.read", "mcp.write", "mcp.execute", "mcp.branch",
] as const;

/** El juego de credenciales de UN entorno. Es el `EstadoOAuth` plano de antes de que
 *  hubiera más de un CloudStudio. */
export type EstadoDeEntorno = {
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  /** Permisos concedidos junto al token; evita reautorizar si el servidor omite `scope`. */
  scopes?: string[];
};

/** El id reservado para el fichero plano de antes de los entornos: ver `leerEstado`. */
const CLAVE_LEGADO = "legado";

/**
 * El fichero entero: un juego POR ENTORNO.
 *
 * Antes era un solo juego plano en la raíz del fichero, porque solo existía un
 * CloudStudio. Con entornos registrables —los dos oficiales y el on-premise de un
 * cliente— hace falta indexar: cerrar sesión en uno no puede tocar los tokens de los
 * demás, así que cada entorno vive en su propia clave y una escritura solo toca la suya.
 *
 * La clave `legado` es el fichero plano de antes, ya envuelto. No se puede adivinar a
 * qué entorno pertenecía —el formato viejo no guardaba la URL—, así que se conserva
 * intacto hasta que `adoptarLegadoSiProcede` lo adopta al registrar el entorno de
 * `URL_CLOUDSTUDIO_POR_OMISION`, la única URL que ese fichero pudo haber usado por
 * omisión (si el usuario tecleó otra URL en el paso de alta, la migración automática no
 * la alcanza y el fichero se queda en `legado` para siempre: no hay forma de saberlo).
 */
export type EstadoOAuth = {
  version: 2;
  porEntorno: Record<string, EstadoDeEntorno>;
};

const ESTADO_VACIO: EstadoOAuth = { version: 2, porEntorno: {} };

/** Resultado reducido: los esquemas completos de tools no deben entrar en el transcript. */
export interface ConexionCloudStudio {
  url: string;
  scopes: readonly string[];
  herramientas: Array<{ nombre: string; descripcion: string }>;
  proyectos: Array<{ id: string; nombre: string }>;
  /**
   * Cómo se llama a sí mismo el servidor MCP (el `serverInfo` del `initialize`). Ausente
   * cuando no publica ninguno legible: entonces no se afirma nada — quien registra el
   * entorno se queda con el nombre que dedujo de la URL.
   */
  servidor?: { nombre: string; version?: string };
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
  /**
   * Qué entorno guarda/lee sus credenciales, dentro del fichero único indexado por
   * entorno. Se cae a `legado` cuando no se indica: es el mismo juego que usaba el
   * fichero plano de antes de que existieran entornos registrables, así que un
   * llamador que todavía no conoce su id de entorno (el flujo de terminal de hoy;
   * `cli/main.ts` no lo pasa) sigue leyendo y escribiendo exactamente donde lo hacía.
   */
  entornoId?: string;
  /**
   * A dónde mandar el navegador cuando la autorización SALE BIEN.
   *
   * La página del callback termina diciendo «Ya puedes volver a xonecode», que en la
   * consola de terminal es cierto y en la web es una instrucción falsa: quien autorizó
   * desde el navegador ya está donde tiene que estar, y lo que le hace falta es volver a
   * SU pestaña. Con esta opción el callback responde un 302 a la URL de la web.
   *
   * El puerto del callback (7634) no se mueve: el IDS registra ese `redirect_uri`. Lo que
   * cambia es lo que se contesta DESPUÉS de recibir el código, que el IDS no mira.
   *
   * El fallo NO redirige, a propósito: la web todavía no sabe nada del error —se entera
   * por la promesa rechazada, y lo cuenta por su propio canal— así que mandarla allí
   * enseñaría un vestíbulo en blanco en lugar del motivo. La página de error se queda, con
   * un texto que no presupone terminal.
   */
  redirigirA?: string;
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

/** Dónde vive el estado OAuth cuando nadie inyecta otra ruta. Exportada porque
 *  `web/servidor/vestibulo.ts` la necesita para `adoptarLegadoSiProcede`: una segunda copia
 *  del literal es cómo divergen las rutas el día que una se corrige y la otra no. */
export function rutaAuthPorDefecto(): string {
  return join(homedir(), NOMBRE_CARPETA, NOMBRE_AUTH);
}

/** Un candidato de `porEntorno` que no es objeto (fichero tocado a mano) no puede colar
 *  un valor no indexable: `leerEstado` filtra antes de devolverlo, no cada llamador. */
function porEntornoValido(bruto: unknown): Record<string, EstadoDeEntorno> {
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return {};
  const salida: Record<string, EstadoDeEntorno> = {};
  for (const [id, valor] of Object.entries(bruto as Record<string, unknown>)) {
    if (typeof valor === "object" && valor !== null && !Array.isArray(valor)) {
      salida[id] = valor as EstadoDeEntorno;
    }
  }
  return salida;
}

/**
 * Lee el fichero entero. Un formato SIN `version` es el plano de antes de los entornos:
 * se envuelve como `{ version: 2, porEntorno: { legado: <plano> } }` **solo en memoria**
 * — un arranque de solo lectura (`xonecode config`, `describe`) no puede reescribir el
 * disco del usuario, así que la migración se materializa recién en la primera escritura
 * (`guardarEstadoDeEntorno`, `adoptarLegadoSiProcede`), nunca aquí.
 */
export function leerEstado(ruta: string): EstadoOAuth {
  if (!existsSync(ruta)) return ESTADO_VACIO;
  try {
    const bruto: unknown = JSON.parse(readFileSync(ruta, "utf8"));
    if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return ESTADO_VACIO;
    const objeto = bruto as Record<string, unknown>;
    if (objeto.version === undefined) {
      // El formato plano no tenía `version`; el objeto entero ES el juego de un entorno.
      return { version: 2, porEntorno: { [CLAVE_LEGADO]: objeto as EstadoDeEntorno } };
    }
    if (objeto.version !== 2) return ESTADO_VACIO; // formato futuro/desconocido: fail-closed, no se inventa
    return { version: 2, porEntorno: porEntornoValido(objeto.porEntorno) };
  } catch {
    // Un fichero corrupto no impide volver a autenticar; nunca se imprime su contenido.
    return ESTADO_VACIO;
  }
}

/**
 * Un fichero de una versión futura y desconocida no se puede sobrescribir a ciegas: este
 * código no sabe qué juegos de credenciales lleva dentro, y `leerEstado` lo trata como
 * vacío para no tumbar un arranque de solo lectura. Escribir SOBRE ese vacío destruiría
 * lo que hubiera. Un JSON corrupto (parse roto) es harina de otro costal —ya se
 * sobrescribía así antes de que existieran los entornos, es el comportamiento actual que
 * el enunciado pide no tocar— así que solo se bloquea la versión reconocible pero
 * distinta de 2, nunca el texto irrecuperable.
 */
export class EstadoOAuthVersionIncompatible extends Error {}

function comprobarVersionEscribible(ruta: string): void {
  if (!existsSync(ruta)) return;
  let bruto: unknown;
  try {
    bruto = JSON.parse(readFileSync(ruta, "utf8"));
  } catch {
    return; // corrupto: se sobrescribe, como ya hacía antes de los entornos.
  }
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return;
  const version = (bruto as Record<string, unknown>).version;
  if (version !== undefined && version !== 2) {
    throw new EstadoOAuthVersionIncompatible(
      `${ruta}: versión de estado OAuth desconocida (${JSON.stringify(version)}); no se sobrescribe`
    );
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

/**
 * Sustituye el juego de credenciales de UN entorno y deja los demás tal cual estaban:
 * lee el fichero entero, reemplaza solo `porEntorno[id]` y reescribe con la misma
 * mecánica de temporal + `rename` de `guardarEstado` — es la que asegura 0600/0700 y que
 * un fallo a mitad de escritura no deja el fichero truncado.
 */
export function guardarEstadoDeEntorno(ruta: string, id: string, datos: EstadoDeEntorno): void {
  comprobarVersionEscribible(ruta);
  const estado = leerEstado(ruta);
  guardarEstado(ruta, { version: 2, porEntorno: { ...estado.porEntorno, [id]: datos } });
}

/**
 * Cierra sesión en UN entorno. Si no tenía nada guardado no hay nada que tocar: escribir
 * de todos modos reescribiría el fichero entero (y su mtime) sin que haya cambiado nada
 * observable.
 */
export function olvidarEntorno(ruta: string, id: string): void {
  comprobarVersionEscribible(ruta);
  const estado = leerEstado(ruta);
  if (!(id in estado.porEntorno)) return;
  const { [id]: _omitido, ...resto } = estado.porEntorno;
  guardarEstado(ruta, { version: 2, porEntorno: resto });
}

/**
 * Adopta `legado` como el juego del entorno recién registrado, y SOLO si su URL es la
 * oficial por omisión — es la única URL que el fichero plano pudo haber usado sin que el
 * usuario tecleara una distinta a mano (ver el comentario de `EstadoOAuth`). Si `legado`
 * no existe, o ya hay algo guardado bajo `entorno.id`, no hace nada: no hay nada que
 * migrar en el primer caso, y pisar un juego ya autenticado sería peor que dejar el
 * plano huérfano en el segundo.
 */
export function adoptarLegadoSiProcede(ruta: string, entorno: Pick<Entorno, "id" | "url">): void {
  if (entorno.url !== URL_CLOUDSTUDIO_POR_OMISION) return;
  comprobarVersionEscribible(ruta);
  const estado = leerEstado(ruta);
  const legado = estado.porEntorno[CLAVE_LEGADO];
  if (legado === undefined || entorno.id in estado.porEntorno) return;
  const { [CLAVE_LEGADO]: _omitido, ...resto } = estado.porEntorno;
  guardarEstado(ruta, { version: 2, porEntorno: { ...resto, [entorno.id]: legado } });
}

/**
 * Abre una URL en el navegador del sistema. Exportada porque la consola web hace lo mismo
 * al arrancar (`web/servidor/arranque.ts`) y tres `spawn` con la misma tabla de comandos
 * en dos ficheros es cómo divergen.
 *
 * El `on("error")` no es decorativo: `spawn` de un comando que no existe —un contenedor
 * sin `xdg-open`, un SSH sin escritorio— no lanza, EMITE `error`, y sin escucha eso es una
 * excepción no capturada que se lleva el proceso por delante. Aquí abrir el navegador es
 * siempre lo ACCESORIO: la URL ya está impresa, y el servidor tiene que seguir en pie.
 */
export function abrirEnSistema(url: URL): void {
  const [comando, args] = process.platform === "darwin"
    ? ["open", [url.toString()]]
    : process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url.toString()]]
      : ["xdg-open", [url.toString()]];
  const proceso = spawn(comando, args, { detached: true, stdio: "ignore" });
  proceso.on("error", () => {});
  proceso.unref();
}

/**
 * Los hosts que hacen de `http://` algo aceptable. Lista CERRADA, por el mismo motivo que
 * la de basura del sistema operativo en `arbolLimpio`: «lo que parezca local» deja pasar
 * `mcp.localhost.ejemplo.com`, que es una máquina de otro.
 */
const LOOPBACK: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export const AVISO_DE_URL_DE_MCP =
  "la URL del MCP debe ser HTTPS —solo se admite http:// en 127.0.0.1 o localhost, para un on-premise en desarrollo— y no puede incluir credenciales";

/**
 * La ÚNICA regla de qué URL de MCP vale, y por eso vive aquí y no en cada gate.
 *
 * Había tres puertas con dos criterios: el wizard del navegador aceptaba loopback,
 * `vestibulo.ts#urlDeEntornoValida` exigía HTTPS y lo rechazaba, y esta función —la última,
 * la que de verdad conecta— también. Registrar un entorno on-premise de desarrollo era
 * imposible por la segunda, y aflojar solo la segunda habría dejado registrar uno que
 * después fallaba al primer `conectarCloudStudio`: un alta que se puede escribir y no se
 * puede usar es peor que el rechazo claro de hoy.
 *
 * Se resuelve por el lado PERMISIVO porque el caso existe —un CloudStudio on-premise
 * levantado en local durante el desarrollo— y porque en loopback el texto plano no cruza
 * ninguna red: es el mismo trato que ya se da al `redirect_uri` del callback de OAuth
 * (`http://127.0.0.1:7634`) y a la propia consola web. Fuera de loopback, HTTPS y nada más.
 * La copia del cliente (`apps/web/src/componentes/Wizard.tsx#urlDeEntornoAceptable`) dice
 * lo mismo y no puede importar esta: lo prohíbe `src/web/frontera.test.ts`.
 */
export function urlDeMcpAceptable(valor: string): boolean {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return false;
  }
  // Una URL con credenciales dentro acaba en `settings.json` y en cada traza que la enseñe.
  if (url.username !== "" || url.password !== "") return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOOPBACK.has(url.hostname);
}

function urlSegura(valor: string): URL {
  if (!urlDeMcpAceptable(valor)) throw new Error(AVISO_DE_URL_DE_MCP);
  return new URL(valor);
}

/**
 * Qué se le contesta al navegador que vuelve del IDS.
 *
 * Sale del servidor y se prueba aparte porque montarlo exige el puerto 7634 —fijo, porque
 * el IDS registra ese `redirect_uri`— y ahí no se puede escoger uno efímero: un test que
 * atara el puerto real fallaría en cuanto alguien tuviera una autorización en curso.
 */
export function respuestaDeCallback(
  codigo: string | null,
  error: string | null,
  redirigirA?: string
): { estado: number; cabeceras: Record<string, string>; cuerpo: string } {
  if (error || !codigo) {
    // Sin redirección tampoco en modo web: la web aún no sabe del fallo (se entera por la
    // promesa rechazada) y mandarla allí escondería el motivo. El texto no nombra «la
    // consola» porque quien llega aquí puede estar usando el navegador.
    return {
      estado: 400,
      cabeceras: { "content-type": "text/html; charset=utf-8" },
      cuerpo: "<h1>No se pudo completar el acceso a CloudStudio</h1><p>Vuelve a xonecode para ver el detalle.</p>",
    };
  }
  if (redirigirA !== undefined) {
    return { estado: 302, cabeceras: { location: redirigirA }, cuerpo: "" };
  }
  return {
    estado: 200,
    cabeceras: { "content-type": "text/html; charset=utf-8" },
    cuerpo: "<h1>CloudStudio conectado</h1><p>Ya puedes volver a xonecode.</p>",
  };
}

/**
 * La URL de callback es determinista —`PUERTO_CALLBACK` es fijo, porque el IDS registra
 * ese `redirect_uri`— así que conocerla no exige que el servidor esté escuchando. El
 * `provider` la necesita SIEMPRE, la escuche `auth()` o no: la lleva en su
 * `clientMetadata` para el registro/descubrimiento aunque el token guardado sea válido y
 * `auth()` nunca llegue a redirigir. Separada de `escucharCallback` (abajo) justo por
 * eso: construir la URL no es un efecto colateral, EMPEZAR A ESCUCHAR sí lo es.
 */
function urlDeCallback(): string {
  return `http://127.0.0.1:${PUERTO_CALLBACK}/oauth/callback`;
}

/**
 * Arranca el servidor HTTP local que recibe el `code` de la redirección, con su
 * temporizador de espera. Se llama solo cuando `auth()` YA dijo `REDIRECT` —antes se
 * llamaba SIEMPRE, incluso con un token guardado y válido que no iba a redirigir nunca—:
 * MEDIDO, eso ocupaba el puerto 7634 fijo y armaba un temporizador de cinco minutos en
 * cada llamada a `abrirCliente`, y dos llamadas seguidas o solapadas (dos conexiones del
 * vestíbulo listando proyectos del mismo entorno, por ejemplo) chocaban por el mismo
 * puerto sin que hiciera falta ningún login de verdad.
 */
function escucharCallback(timeoutMs: number, redirigirA?: string): Promise<{ codigo: Promise<string>; cerrar: () => void }> {
  return new Promise((resolver, rechazar) => {
    let resolverCodigo!: (codigo: string) => void;
    let rechazarCodigo!: (error: Error) => void;
    const codigo = new Promise<string>((ok, fallo) => {
      resolverCodigo = ok;
      rechazarCodigo = fallo;
    });
    const servidor = createServer((peticion, respuesta) => {
      const recibida = new URL(peticion.url ?? "/", "http://127.0.0.1");
      const codigoRecibido = recibida.searchParams.get("code");
      const error = recibida.searchParams.get("error");
      const contestacion = respuestaDeCallback(codigoRecibido, error, redirigirA);
      respuesta.writeHead(contestacion.estado, contestacion.cabeceras);
      respuesta.end(contestacion.cuerpo);
      limpiar();
      if (error || !codigoRecibido) rechazarCodigo(new Error(`el IDS rechazó el acceso${error ? `: ${error}` : ""}`));
      else resolverCodigo(codigoRecibido);
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
      resolver({ codigo, cerrar: limpiar });
    });
  });
}

/** Provider OAuth persistente, deliberadamente pequeño y compatible con el SDK MCP. */
/**
 * Exportada SOLO para poder probar `invalidateCredentials` —el gancho del que depende que
 * el SDK sepa recuperarse de un token muerto— sin red ni navegador. Nadie fuera de este
 * módulo la construye para usarla: quien abre sesión llama a `sesionCloudStudio` o a
 * `conectarCloudStudio`, que la montan por dentro.
 */
export class ProviderCloudStudio implements OAuthClientProvider {
  private estado: EstadoDeEntorno;
  private readonly metadata: OAuthClientMetadata;

  constructor(
    private readonly ruta: string,
    /** El entorno cuyo juego de credenciales lee y escribe este provider: opera SOLO
     *  sobre `porEntorno[entornoId]`, nunca sobre el fichero entero, para que abrir
     *  sesión en un entorno no pueda pisar el juego de otro. */
    private readonly entornoId: string,
    redirectUrl: string,
    private readonly alRedirigir: (url: URL) => void,
    private readonly scopes: readonly string[],
  ) {
    this.estado = leerEstado(ruta).porEntorno[entornoId] ?? {};
    // Un refresh token de solo lectura no sirve para elevar privilegios. Borrarlo aquí
    // fuerza Authorization Code + consentimiento nuevo en lugar de fingir una elevación.
    const concedidos = new Set(this.estado.scopes ?? (this.estado.tokens?.scope ?? "").split(/\s+/));
    if (this.estado.tokens !== undefined && !this.scopes.every((scope) => concedidos.has(scope))) {
      delete this.estado.tokens;
      this.guardar();
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
  /** Solo esta clave se toca en el fichero, nunca `porEntorno` entero: es lo que hace
   *  que abrir sesión en un entorno deje intactos los tokens de los demás. */
  private guardar(): void { guardarEstadoDeEntorno(this.ruta, this.entornoId, this.estado); }
  get redirectUrl(): string { return this.metadata.redirect_uris![0]!; }
  get clientMetadata(): OAuthClientMetadata { return this.metadata; }
  clientInformation(): OAuthClientInformationMixed | undefined { return this.estado.clientInformation; }
  saveClientInformation(info: OAuthClientInformationMixed): void { this.estado.clientInformation = info; this.guardar(); }
  tokens(): OAuthTokens | undefined { return this.estado.tokens; }
  saveTokens(tokens: OAuthTokens): void {
    this.estado.tokens = tokens;
    this.estado.scopes = [...this.scopes];
    this.guardar();
  }
  redirectToAuthorization(url: URL): void { this.alRedirigir(url); }
  /**
   * El gancho de recuperación del SDK, y no un extra: `auth()` (`client/auth.js`) atrapa
   * `InvalidGrantError` —el refresh token muerto— e `InvalidClientError`, llama a esto y
   * REINTENTA el flujo entero. Sin implementarlo, esa llamada es un no-op: el SDK reintenta
   * con las mismas credenciales podridas, vuelve a fallar y lanza. O sea que un token
   * caducado sin refresco válido era un fallo duro —«hay que borrar el fichero a mano»—
   * cuando el propio SDK sabía volver a autenticar solo.
   *
   * Cada alcance borra LO SUYO y nada más, y se escribe en el acto: lo que se está
   * arreglando es justo un estado a medias, y dejarlo en memoria sin guardar significaría
   * que el siguiente arranque lo vuelve a leer del fichero.
   */
  invalidateCredentials(alcance: "all" | "client" | "tokens" | "verifier" | "discovery"): void {
    if (alcance === "all") {
      // Todo menos el hueco: el entorno sigue existiendo, lo que se va son sus credenciales.
      this.estado = {};
    } else if (alcance === "tokens") {
      delete this.estado.tokens;
      // Los scopes concedidos van CON el token: conservarlos haría creer al constructor
      // que ya hay permiso concedido para unos tokens que ya no existen.
      delete this.estado.scopes;
    } else if (alcance === "client") {
      delete this.estado.clientInformation;
    } else if (alcance === "verifier") {
      delete this.estado.codeVerifier;
    }
    // `discovery` no tiene nada que borrar aquí: este provider no cachea el descubrimiento
    // (no implementa `discoveryState`), así que el SDK lo rehace solo.
    this.guardar();
  }
  saveCodeVerifier(verifier: string): void { this.estado.codeVerifier = verifier; this.guardar(); }
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

/**
 * El servidor pierde el proyecto abierto al caducar la sesión; lo dice con este texto
 * (medido). Duplicado a propósito del mismo patrón en `agent/cloudstudioClient.ts`: es
 * la señal, no un detalle de transporte, y ninguno de los dos módulos importa del otro.
 */
const SESION_PERDIDA = /no project is open/i;

/** Tools cuyo `isError` puede traer de vuelta nuestro propio contenido: un rechazo de
 *  `studio_edit_file` en modo `patch`, o de `studio_upload_file`, puede incluir el
 *  fragmento o fichero que se intentó mandar. Nunca se reenvía ese cuerpo. */
const TOOLS_DE_ESCRITURA = new Set(["studio_edit_file", "studio_upload_file"]);

/** Cuánto de la primera línea de un error se conserva. Basta para «File extension
 *  '.jpg' is not allowed…»; no basta para un volcado de fichero entero. */
const TOPE_MENSAJE_ERROR = 200;

/** El texto de un error de TOOL (`isError`), tal cual lo manda el servidor. Puede
 *  incluir identidad («…not found for user 'sleiva@xone.es'») o, en una tool de
 *  escritura, el propio contenido rechazado: por eso `mensajeDeErrorDeTool` decide
 *  cuánto de esto sale de aquí, nunca esta función. */
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

/** La ruta del fichero de la llamada, cuando la tool la lleva en `filePath`. Solo para
 *  nombrar el error; nunca su contenido. */
function rutaDe(argumentos: Record<string, unknown>): string | undefined {
  return typeof argumentos.filePath === "string" ? argumentos.filePath : undefined;
}

/** La primera línea, acotada. Un texto de una sola línea corta pasa intacto. */
function primeraLineaAcotada(texto: string): string {
  const primeraLinea = texto.split(/\r?\n/, 1)[0] ?? "";
  return primeraLinea.length > TOPE_MENSAJE_ERROR
    ? `${primeraLinea.slice(0, TOPE_MENSAJE_ERROR)}…`
    : primeraLinea;
}

/**
 * El mensaje final de la excepción: nombra siempre la tool, para que el error siga
 * sirviendo para diagnosticar, pero decide cuánto del cuerpo del servidor deja pasar.
 *
 * La caducidad de sesión es la excepción a la excepción: es un texto fijo y corto —
 * nunca contenido de fichero—, y es la señal de la que depende toda la reapertura en
 * `clienteCloudStudio`, incluida la de las tools de escritura. Redactar el cuerpo ahí
 * dejaría un `escribirTexto`/`subirBinario` con la sesión caducada sin forma de
 * reabrir y reintentar.
 */
function mensajeDeErrorDeTool(nombre: string, argumentos: Record<string, unknown>, resultado: unknown): string {
  const detalle = textoDeErrorDeTool(resultado);
  if (SESION_PERDIDA.test(detalle)) return `${nombre}: ${primeraLineaAcotada(detalle)}`;
  if (TOOLS_DE_ESCRITURA.has(nombre)) {
    const ruta = rutaDe(argumentos);
    // Sin el cuerpo: en una tool de escritura ese cuerpo puede ser nuestro propio
    // fichero (o el fragmento de un patch) rebotando.
    return `CloudStudio rechazó ${nombre}${ruta !== undefined ? ` (${ruta})` : ""}`;
  }
  return `${nombre}: ${primeraLineaAcotada(detalle)}`;
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
      throw new Error(mensajeDeErrorDeTool(nombre, argumentos, resultado));
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
  const ruta = opciones.rutaAuth ?? rutaAuthPorDefecto();
  const provider = new ProviderCloudStudio(ruta, opciones.entornoId ?? CLAVE_LEGADO, urlDeCallback(), (autorizacion) => {
    // La URL de autorización no aporta nada al transcript normal y puede tener parámetros
    // sensibles de OAuth. El navegador se abre sin volcarla; quien use SSH puede inyectar
    // `abrirNavegador` y decidir cómo presentarla.
    (opciones.abrirNavegador ?? abrirEnSistema)(autorizacion);
  }, scopes);
  let transporte: StreamableHTTPClientTransport | undefined;
  // Solo se rellena si `auth()` de verdad redirige — ver `escucharCallback` arriba.
  let callback: { codigo: Promise<string>; cerrar: () => void } | undefined;
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
      callback = await escucharCallback(opciones.timeoutMs ?? 5 * 60_000, opciones.redirigirA);
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
    callback?.cerrar();
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

/** Lo más largo que se acepta de un nombre que viene del OTRO lado. Cabe cualquier nombre
 *  real de servidor y no cabe un párrafo. */
const TOPE_NOMBRE_DE_SERVIDOR = 60;

/**
 * El nombre del servidor MCP, saneado, o `undefined` si no publica ninguno usable.
 *
 * Es texto que llega de fuera y acaba en `settings.json` y en la barra lateral, así que
 * pasa por la misma disciplina que cualquier otro dato remoto de este fichero: se quita lo
 * que no es imprimible (un `\n` o un `\r` en un nombre parte la línea de un log y disfraza
 * lo que venga detrás), se colapsan los espacios y se acota. Lo que NUNCA sale de aquí es
 * un identificador: el id del entorno se deduce del host y no de esto, porque el id es un
 * segmento de ruta y el servidor no puede elegir carpetas en el disco de nadie.
 *
 * `title` antes que `name` porque es la convención de MCP: `title` es el nombre para leer y
 * `name` el programático (`xone-cloudstudio`). Si no hay `title`, `name` es mejor que nada.
 */
export function servidorDeImplementacion(
  info: { name?: unknown; title?: unknown; version?: unknown } | undefined
): { nombre: string; version?: string } | undefined {
  const crudo = [info?.title, info?.name].find((v) => typeof v === "string" && v.trim() !== "");
  if (typeof crudo !== "string") return undefined;
  const nombre = crudo
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TOPE_NOMBRE_DE_SERVIDOR);
  if (nombre === "") return undefined;
  const version = typeof info?.version === "string" ? info.version.trim().slice(0, TOPE_NOMBRE_DE_SERVIDOR) : "";
  return { nombre, ...(version === "" ? {} : { version }) };
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
    // El `serverInfo` del initialize, ya saneado. Se lee DESPUÉS de `connect`, que es
    // cuando el SDK lo tiene; antes devuelve `undefined`.
    const servidor = servidorDeImplementacion(cliente.getServerVersion());
    return {
      url: url.toString(),
      scopes,
      herramientas: listado.tools.map((tool) => ({ nombre: tool.name, descripcion: tool.description ?? "" })),
      proyectos,
      ...(servidor === undefined ? {} : { servidor }),
    };
  } finally {
    await cerrar();
  }
}
