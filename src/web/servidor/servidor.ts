/**
 * El servidor de la consola web: `node:http`, loopback, sin framework.
 *
 * Tres cosas son de seguridad y no de estilo:
 *  - **Loopback y nada más.** No hay bandera para `0.0.0.0`: un servidor local que abre
 *    la red expone el proyecto entero del usuario y su `auth.json` está a un bug de
 *    distancia.
 *  - **`Host` y `Origin` en TODA petición.** El ataque real a un servidor local no es que
 *    alguien escanee el puerto: es DNS rebinding, donde una web cualquiera resuelve su
 *    dominio a 127.0.0.1 y le habla a este proceso desde el navegador de la víctima. Un
 *    `Host` que no sea loopback, o un `Origin` que no sea el nuestro, es 403.
 *  - **`.xonecode` no se sirve NUNCA.** Ni el del proyecto ni el del home. Va antes que
 *    la comprobación de existencia, para que un 403 y un 404 no cuenten cosas distintas.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { realpathSync, readFileSync, statSync } from "node:fs";
import { join, sep, extname } from "node:path";

/** Nombre de la cookie de sesión. No lleva "token" para no repetirlo en cabeceras de log. */
const NOMBRE_COOKIE = "xonecode_sesion";

/** Segmento de ruta que jamás se sirve, esté donde esté dentro de la raíz de estáticos. */
const SEGMENTO_VETADO = ".xonecode";

const TIPOS_MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export type ManejadorRuta = (
  peticion: IncomingMessage,
  respuesta: ServerResponse
) => void | Promise<void>;

export interface ServidorWeb {
  readonly puerto: number;
  /** La dirección de bind REAL (`servidorHttp.address().address`), no una construida. */
  readonly direccion: string;
  readonly token: string;
  readonly url: string;
  /** Registra un manejador propio para `MÉTODO ruta` — usado por tareas futuras (SSE, acciones). */
  registrarRuta(metodo: string, ruta: string, manejador: ManejadorRuta): void;
  cerrar(): Promise<void>;
}

interface OpcionesServidor {
  puerto: number;
  raizEstaticos: string;
}

interface ContextoPeticion {
  raizReal: string;
  token: string;
  rutas: Map<string, ManejadorRuta>;
  puerto: number;
}

export async function arrancarServidor(opciones: OpcionesServidor): Promise<ServidorWeb> {
  // Resuelta UNA vez al arrancar: cada petición se compara contra esta cadena canónica,
  // nunca contra `opciones.raizEstaticos` sin resolver (un enlace simbólico ahí dejaría
  // pasar cualquier cosa que el enlace apunte).
  const raizReal = realpathSync(opciones.raizEstaticos);
  const token = randomBytes(32).toString("base64url");
  const rutas = new Map<string, ManejadorRuta>();

  let puertoReal = opciones.puerto;
  let direccionReal = "127.0.0.1";
  const contexto = (): ContextoPeticion => ({ raizReal, token, rutas, puerto: puertoReal });

  const servidorHttp: Server = createServer((peticion, respuesta) => {
    manejarPeticion(peticion, respuesta, contexto()).catch(() => {
      // Un fallo inesperado no puede tumbar el proceso: corre en la máquina del
      // desarrollador, junto al resto de su trabajo.
      if (!respuesta.headersSent) respuesta.writeHead(500);
      respuesta.end();
    });
  });

  await new Promise<void>((resolver, rechazar) => {
    servidorHttp.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        // El mensaje por defecto de Node es una traza de `listen`, muda sobre qué hacer.
        // Aquí el puerto y la salida (`--puerto`) son lo único que el usuario necesita.
        rechazar(
          new Error(`El puerto ${opciones.puerto} ya está en uso — prueba con --puerto <otro>.`)
        );
        return;
      }
      rechazar(error);
    });
    servidorHttp.once("listening", () => {
      // `address()` es la única fuente de verdad del bind real; un test que compare
      // contra una cadena que él mismo construye pasaría igual con `listen(..., "0.0.0.0")`.
      const direccion = servidorHttp.address();
      if (typeof direccion === "object" && direccion !== null) {
        puertoReal = direccion.port;
        direccionReal = direccion.address;
      }
      resolver();
    });
    servidorHttp.listen(opciones.puerto, "127.0.0.1");
  });

  return {
    get puerto() {
      return puertoReal;
    },
    get direccion() {
      return direccionReal;
    },
    token,
    get url() {
      return `http://127.0.0.1:${puertoReal}/?t=${token}`;
    },
    registrarRuta(metodo, ruta, manejador) {
      rutas.set(`${metodo.toUpperCase()} ${ruta}`, manejador);
    },
    async cerrar() {
      // El SSE deja respuestas abiertas de por vida; sin `closeAllConnections()` el
      // `close()` normal espera a que esas conexiones se cierren solas, cosa que no
      // hacen, y el proceso — el de este test incluido — se queda colgado.
      servidorHttp.closeAllConnections();
      await new Promise<void>((resolver) => servidorHttp.close(() => resolver()));
    },
  };
}

async function manejarPeticion(
  peticion: IncomingMessage,
  respuesta: ServerResponse,
  contexto: ContextoPeticion
): Promise<void> {
  const { raizReal, token, rutas, puerto } = contexto;

  // DNS rebinding: una web ajena resuelve su dominio a 127.0.0.1 y le habla a este
  // proceso desde el navegador de la víctima, que sí tiene la cookie. El único `Host`
  // válido es el propio loopback con el puerto real de este arranque.
  const anfitrion = peticion.headers.host;
  if (anfitrion !== `127.0.0.1:${puerto}` && anfitrion !== `localhost:${puerto}`) {
    responderProhibido(respuesta);
    return;
  }

  // El `Origin` solo lo manda el navegador en peticiones que un atacante controla
  // (fetch/XHR de otra pestaña); si está, tiene que ser el nuestro.
  const origen = peticion.headers.origin;
  if (
    origen !== undefined &&
    origen !== `http://127.0.0.1:${puerto}` &&
    origen !== `http://localhost:${puerto}`
  ) {
    responderProhibido(respuesta);
    return;
  }

  // Partido a mano, NUNCA con `new URL()`: WHATWG normaliza los segmentos `..` del
  // pathname en el propio parseo (medido), así que un recorrido crudo llegaría ya
  // colapsado y el test de seguridad no probaría nada. `indexOf("?")` no toca los
  // segmentos de la ruta.
  const bruto = peticion.url ?? "/";
  const indiceQuery = bruto.indexOf("?");
  const rutaBruta = indiceQuery === -1 ? bruto : bruto.slice(0, indiceQuery);
  const query = indiceQuery === -1 ? "" : bruto.slice(indiceQuery + 1);

  let rutaDecodificada: string;
  try {
    rutaDecodificada = decodeURIComponent(rutaBruta);
  } catch {
    responderTexto(respuesta, 400, "");
    return;
  }

  const autenticacion = autenticar(peticion.headers.cookie, new URLSearchParams(query).get("t"), token);
  if (!autenticacion.autenticado) {
    responderTexto(respuesta, 401, "");
    return;
  }
  if (autenticacion.cookieNueva !== undefined) {
    respuesta.setHeader("Set-Cookie", autenticacion.cookieNueva);
  }

  const manejador = rutas.get(`${peticion.method} ${rutaDecodificada}`);
  if (manejador !== undefined) {
    await manejador(peticion, respuesta);
    return;
  }

  servirEstatico(peticion, respuesta, raizReal, rutaDecodificada);
}

interface ResultadoAuth {
  autenticado: boolean;
  cookieNueva?: string;
}

function autenticar(
  cabeceraCookie: string | undefined,
  tokenDeQuery: string | null,
  token: string
): ResultadoAuth {
  const cookieToken = extraerCookie(cabeceraCookie, NOMBRE_COOKIE);
  if (cookieToken !== undefined && compararTokens(cookieToken, token)) {
    return { autenticado: true };
  }
  if (tokenDeQuery !== null && compararTokens(tokenDeQuery, token)) {
    return { autenticado: true, cookieNueva: construirCookie(token) };
  }
  return { autenticado: false };
}

/** `timingSafeEqual` exige buffers de igual longitud: la desigualdad ya descarta el intento. */
function compararTokens(candidato: string, token: string): boolean {
  const bufferCandidato = Buffer.from(candidato);
  const bufferToken = Buffer.from(token);
  if (bufferCandidato.length !== bufferToken.length) return false;
  return timingSafeEqual(bufferCandidato, bufferToken);
}

function construirCookie(token: string): string {
  // Sin `Secure`: esto es `http://` en loopback, y con `Secure` el navegador la
  // descartaría sin avisar — la sesión nunca se establecería.
  return `${NOMBRE_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`;
}

function extraerCookie(cabecera: string | undefined, nombre: string): string | undefined {
  if (cabecera === undefined) return undefined;
  for (const parte of cabecera.split(";")) {
    const indice = parte.indexOf("=");
    if (indice === -1) continue;
    if (parte.slice(0, indice).trim() === nombre) return parte.slice(indice + 1).trim();
  }
  return undefined;
}

function servirEstatico(
  peticion: IncomingMessage,
  respuesta: ServerResponse,
  raizReal: string,
  rutaDecodificada: string
): void {
  // `.xonecode` se rechaza por el TEXTO de la ruta, antes de tocar el disco: así el
  // fichero puede existir o no, y en ambos casos la respuesta es la misma 403 — un 404
  // aquí delataría cuáles de sus ficheros están presentes.
  // Comparación en minúsculas: MEDIDO en este disco (APFS por omisión, insensible a
  // mayúsculas) — `/.XONECODE/secreto.json` pasa el `includes` sensible a caso, y el
  // `realpathSync` de más abajo NO normaliza el caso de un componente que no es un
  // enlace simbólico, así que el 403 nunca llegaría a dispararse y el fichero se
  // serviría entero.
  const segmentos = rutaDecodificada.split("/").filter((s) => s.length > 0);
  if (segmentos.some((s) => s.toLowerCase() === SEGMENTO_VETADO)) {
    responderProhibido(respuesta);
    return;
  }

  const relativa = rutaDecodificada === "/" ? "index.html" : rutaDecodificada;
  // `join` colapsa los `..` léxicamente contra `raizReal`: un recorrido que se salga de
  // la raíz ya se nota aquí, SIN tocar el disco y sin depender de que exista el fichero
  // apuntado — así el 403 no depende de si `/etc/passwd` existe en la máquina que corre
  // el test.
  const objetivoLexico = join(raizReal, relativa);
  if (objetivoLexico !== raizReal && !objetivoLexico.startsWith(raizReal + sep)) {
    responderProhibido(respuesta);
    return;
  }

  if (peticion.method !== "GET" && peticion.method !== "HEAD") {
    responderTexto(respuesta, 405, "");
    return;
  }

  let objetivoReal: string;
  try {
    // Resuelve enlaces simbólicos DE VERDAD: un `.xne` que enlace fuera de `raizReal`
    // pasaría el chequeo léxico de arriba y solo se detecta comparando la ruta ya resuelta.
    objetivoReal = realpathSync(objetivoLexico);
  } catch {
    responderTexto(respuesta, 404, "");
    return;
  }

  if (objetivoReal !== raizReal && !objetivoReal.startsWith(raizReal + sep)) {
    responderProhibido(respuesta);
    return;
  }

  const info = statSync(objetivoReal);
  if (!info.isFile()) {
    responderTexto(respuesta, 404, "");
    return;
  }

  const cuerpo = readFileSync(objetivoReal);
  respuesta.writeHead(200, {
    "Content-Type": TIPOS_MIME[extname(objetivoReal)] ?? "application/octet-stream",
    "Content-Length": cuerpo.length,
  });
  respuesta.end(peticion.method === "HEAD" ? undefined : cuerpo);
}

function responderProhibido(respuesta: ServerResponse): void {
  responderTexto(respuesta, 403, "Prohibido");
}

function responderTexto(respuesta: ServerResponse, estado: number, cuerpo: string): void {
  respuesta.writeHead(estado, { "Content-Type": "text/plain; charset=utf-8" });
  respuesta.end(cuerpo);
}
