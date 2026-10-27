/**
 * La copia de la granja de cada sesión y el relé local por el que los scripts le hablan (fase 2 de la granja).
 *
 * **No se reserva nada** (decisión suya): la sesión tiene un canal LOCAL desde que se abre, pero la copia se pide a la
 * granja la PRIMERA vez que algo se conecta a él —el agente con un script, la recarga, Ejecutar—. Y se LIBERA (`reset`,
 * que la limpia) al acabar el turno en que se usó, siempre, también si el turno revienta o se cancela (lo llama el
 * `finally` del turno, `vestibulo.ts`); la persona no tiene botón de liberar. Si el proceso muere antes, la granja la
 * suelta sola a los diez minutos sin conexión.
 *
 * **UNA conexión hacia la granja por sesión** (medido: una segunda ECHA a la primera, y una copia sin conexión se
 * libera y se borra a los diez minutos): el relé abre la suya al coger la copia y la mantiene; cada script que se
 * conecta al canal local recibe el saludo guardado y sus comandos van por esa conexión, con las respuestas repartidas
 * en orden (`core/canalDeGranja.ts#EnrutadorDeCanal`). Si la conexión cae, el siguiente cliente la reabre sobre la
 * MISMA copia; si ya no es nuestra (403), se pide otra y se dice.
 *
 * Partido en dos por `npm test`, que no abre sockets: `crearGestorDeCopias` decide (con dobles en los tests) y
 * `servirReleDeGranja` es el pegamento de red —un servidor en loopback—, medido contra la granja real.
 */
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import { EnrutadorDeCanal, copiasLibres, mismaCopia, nombreDeCopia, type CopiaDeGranja } from "../../core/canalDeGranja.js";
import {
  abrirCanalDeGranja,
  hablarConGranja,
  liberarCopiaDeGranja,
  pedirAGranja,
  rutaDeCopia,
  type AbrirCanalDeGranja,
  type CanalDeGranja,
  type ConexionDeGranja,
} from "./granjaEnRed.js";

/** Lo que se espera al saludo del canal de la copia tras abrirlo: el servidor del teléfono saluda en cuanto acepta. */
export const TOPE_DE_SALUDO_DE_GRANJA_MS = 15_000;

/** Cuántas veces se reabre una copia que se abrió sin saludar (recién liberada, su canal aún arrancando). */
export const REINTENTOS_DE_SALUDO = 3;

/** Entre reintento y reintento: lo que tarda una copia recién limpiada en levantar su canal. */
export const PAUSA_DE_REINTENTO_DE_GRANJA_MS = 2_000;

/** Un cliente LOCAL del canal (un script, la recarga): a quién darle sus respuestas. */
export interface ClienteDelCanal {
  enviar(texto: string): void;
  cerrar(motivo: string): void;
}

/** El hueco de un cliente que se fue con respuestas pendientes: las recibe y las tira. */
const HUECO: ClienteDelCanal = { enviar: () => undefined, cerrar: () => undefined };

export interface DependenciasDeCopias {
  /** Dirección, token y huella de AHORA (Ajustes); `undefined` = la granja no está configurada. */
  conexion: () => ConexionDeGranja | undefined;
  /** `GET /api/state`; `undefined` = no contestó. */
  pedirEstado?: (c: ConexionDeGranja) => Promise<unknown>;
  abrirCanal?: AbrirCanalDeGranja;
  liberar?: (c: ConexionDeGranja, copia: CopiaDeGranja) => Promise<{ ok: true } | { ok: false; motivo: string }>;
  informar: (texto: string) => void;
  /** Cambió la copia de una sesión (cogida o liberada): para decirlo en la pastilla. */
  alCambiarCopia?: (sesion: string, copia: CopiaDeGranja | undefined) => void;
  /** Cuánto se espera el saludo y entre reintentos; los tests lo acortan. */
  topeDeSaludo?: number;
  pausaDeReintento?: number;
}

interface EstadoDeSesion {
  clave: string;
  copia?: CopiaDeGranja;
  canal?: CanalDeGranja;
  enrutador: EnrutadorDeCanal<ClienteDelCanal>;
  clientes: Set<ClienteDelCanal>;
  pidiendo?: Promise<CopiaDeGranja | { motivo: string }>;
}

export interface GestorDeCopias {
  /** La clave secreta de la ruta local de la sesión (la crea si no la hay). No coge nada. */
  claveDe(sesion: string): string;
  /** La sesión de una clave, o `undefined`. */
  sesionDeClave(clave: string): string | undefined;
  copiaDe(sesion: string): CopiaDeGranja | undefined;
  /** La copia de la sesión, pidiéndola si no la hay, con el canal abierto y saludado. */
  asegurarCopia(sesion: string): Promise<CopiaDeGranja | { motivo: string }>;
  /** Un cliente local se conectó: recibe el saludo, o se cierra con el motivo. */
  conectarCliente(sesion: string, cliente: ClienteDelCanal): Promise<void>;
  mensajeDelCliente(sesion: string, cliente: ClienteDelCanal, texto: string): void;
  clienteSeFue(sesion: string, cliente: ClienteDelCanal): void;
  /** Al acabar el turno (o cerrar la sesión): si se cogió copia, se cierra el canal y se libera. Nunca lanza. */
  liberar(sesion: string): Promise<void>;
  /** Libera y olvida la sesión (al cerrarla). */
  olvidar(sesion: string): Promise<void>;
}

export function crearGestorDeCopias(deps: DependenciasDeCopias): GestorDeCopias {
  const sesiones = new Map<string, EstadoDeSesion>();
  const pedirEstado =
    deps.pedirEstado ??
    (async (c: ConexionDeGranja) => {
      const r = await hablarConGranja({ base: c.direccion, ruta: "/api/state", token: c.token, ...(c.huella === undefined ? {} : { huellaAceptada: c.huella }) });
      return r.tipo === "respuesta" && r.http === 200 ? r.cuerpo : undefined;
    });
  const abrirCanal = deps.abrirCanal ?? abrirCanalDeGranja;
  const liberarEnGranja = deps.liberar ?? liberarCopiaDeGranja;
  const topeDeSaludo = deps.topeDeSaludo ?? TOPE_DE_SALUDO_DE_GRANJA_MS;
  const pausaDeReintento = deps.pausaDeReintento ?? PAUSA_DE_REINTENTO_DE_GRANJA_MS;

  const estado = (sesion: string): EstadoDeSesion => {
    let e = sesiones.get(sesion);
    if (e === undefined) {
      e = { clave: randomBytes(18).toString("base64url"), enrutador: new EnrutadorDeCanal(), clientes: new Set() };
      sesiones.set(sesion, e);
    }
    return e;
  };

  /** Engancha el canal recién abierto y espera su saludo. `false` = no saludó a tiempo (y se cierra). */
  const enganchar = (e: EstadoDeSesion, canal: CanalDeGranja): Promise<boolean> =>
    new Promise((resolver) => {
      let saludado = false;
      const reloj = setTimeout(() => {
        if (saludado) return;
        canal.cerrar();
        resolver(false);
      }, topeDeSaludo);
      canal.alMensaje((texto) => {
        const destino = e.enrutador.recibido(texto);
        if (!saludado && e.enrutador.saludo !== undefined) {
          saludado = true;
          clearTimeout(reloj);
          resolver(true);
        }
        destino?.enviar(texto);
      });
      canal.alCerrar(() => {
        clearTimeout(reloj);
        if (e.canal === canal) e.canal = undefined;
        // Lo pendiente no va a llegar: se dice a quien esperaba, y los clientes se cierran (el siguiente reabre).
        e.enrutador.vaciar();
        for (const c of e.clientes) c.cerrar("el canal con la granja se cerró");
        e.clientes.clear();
        if (!saludado) resolver(false);
      });
    });

  const pedir = async (sesion: string, e: EstadoDeSesion): Promise<CopiaDeGranja | { motivo: string }> => {
    const conexion = deps.conexion();
    if (conexion === undefined) {
      return { motivo: "la granja no está configurada: pon su dirección y tu token en Ajustes → Dispositivos → Granja" };
    }
    /**
     * Abre el canal de UNA copia: lo abierto, o por qué no; `ocupada` = es de otro. `cogida` = la conexión se ABRIÓ (y
     * eso ya la hace nuestra, medido) aunque luego no saludara: hay que apuntarla para liberarla, nunca dejarla suelta.
     */
    const intentar = async (copia: CopiaDeGranja): Promise<"ok" | "ocupada" | { motivo: string; cogida?: true }> => {
      const r = await abrirCanal(conexion, copia);
      if ("tipo" in r) {
        if (r.tipo === "ocupada") return "ocupada";
        if (r.tipo === "huella-distinta") return { motivo: "el certificado de la granja ha cambiado: revísalo en Ajustes → Dispositivos → Granja" };
        return { motivo: `la granja no responde${r.codigo === undefined ? "" : ` (${r.codigo})`}${r.http === undefined ? "" : ` (${r.http})`}` };
      }
      e.canal = r;
      if (!(await enganchar(e, r))) {
        e.canal = undefined;
        return { motivo: `la copia ${nombreDeCopia(copia)} no saludó`, cogida: true };
      }
      return "ok";
    };
    /**
     * Medido: una copia recién liberada por otro turno sale `running` pero su servidor del canal aún no escucha; la
     * conexión se abre (y la coge) y se cierra sin saludo. Se reintenta sobre la MISMA, que ya es nuestra.
     */
    const conReintentos = async (copia: CopiaDeGranja): Promise<Awaited<ReturnType<typeof intentar>>> => {
      let r = await intentar(copia);
      for (let vez = 1; vez <= REINTENTOS_DE_SALUDO && typeof r === "object" && r.cogida === true; vez++) {
        await new Promise((x) => setTimeout(x, pausaDeReintento));
        r = await intentar(copia);
      }
      return r;
    };
    /** Una copia que ya es nuestra (cogida al conectarse): se apunta y se dice, salude o no. */
    const apuntar = (copia: CopiaDeGranja): void => {
      if (e.copia !== undefined && mismaCopia(e.copia, copia)) return;
      e.copia = copia;
      deps.informar(`granja: copia del turno ${nombreDeCopia(copia)}`);
      deps.alCambiarCopia?.(sesion, copia);
    };
    // Con copia ya cogida (el canal cayó), se reabre la MISMA: lo desplegado en ella sigue ahí.
    if (e.copia !== undefined) {
      const r = await conReintentos(e.copia);
      if (r === "ok") return e.copia;
      if (r !== "ocupada") return r;
      deps.informar(`granja: la copia ${nombreDeCopia(e.copia)} ya no es nuestra (se liberó o la cogió otro); se pide otra`);
      e.copia = undefined;
      deps.alCambiarCopia?.(sesion, undefined);
    }
    const descartadas: CopiaDeGranja[] = [];
    for (;;) {
      const libres = copiasLibres(await pedirEstado(conexion), descartadas);
      const copia = libres[0];
      if (copia === undefined) {
        return descartadas.length === 0 ? { motivo: "no hay ninguna copia libre en la granja ahora mismo" } : { motivo: "otros cogieron las copias libres mientras se pedía una: vuelve a intentarlo" };
      }
      const r = await conReintentos(copia);
      if (r === "ocupada") {
        // Otro se la llevó entre la foto y la conexión: la siguiente.
        descartadas.push(copia);
        continue;
      }
      // Abierta = nuestra, aunque no saludara: se apunta para que el fin del turno la libere.
      if (r === "ok" || r.cogida === true) apuntar(copia);
      if (r !== "ok") return r;
      return copia;
    }
  };

  const gestor: GestorDeCopias = {
    claveDe: (sesion) => estado(sesion).clave,
    sesionDeClave: (clave) => [...sesiones.entries()].find(([, e]) => e.clave === clave)?.[0],
    copiaDe: (sesion) => sesiones.get(sesion)?.copia,
    asegurarCopia: async (sesion) => {
      const e = estado(sesion);
      if (e.canal !== undefined && e.copia !== undefined) return e.copia;
      if (e.pidiendo !== undefined) return e.pidiendo;
      e.pidiendo = pedir(sesion, e).finally(() => {
        e.pidiendo = undefined;
      });
      return e.pidiendo;
    },
    conectarCliente: async (sesion, cliente) => {
      const r = await gestor.asegurarCopia(sesion);
      if ("motivo" in r) return cliente.cerrar(r.motivo);
      const e = estado(sesion);
      e.clientes.add(cliente);
      // El saludo de la copia, como si fuera suyo: el script lo espera antes de mandar nada.
      if (e.enrutador.saludo !== undefined) cliente.enviar(e.enrutador.saludo);
    },
    mensajeDelCliente: (sesion, cliente, texto) => {
      const e = sesiones.get(sesion);
      if (e?.canal === undefined || !e.clientes.has(cliente)) return cliente.cerrar("el canal con la granja no está abierto");
      e.enrutador.enviado(cliente);
      e.canal.enviar(texto);
    },
    clienteSeFue: (sesion, cliente) => {
      const e = sesiones.get(sesion);
      if (e === undefined) return;
      e.clientes.delete(cliente);
      e.enrutador.olvidar(cliente, HUECO);
    },
    liberar: async (sesion) => {
      const e = sesiones.get(sesion);
      if (e === undefined) return;
      // Una petición en vuelo termina antes: liberar a medias dejaría una copia cogida sin nadie que la suelte.
      await e.pidiendo?.catch(() => undefined);
      const copia = e.copia;
      if (copia === undefined) return;
      e.copia = undefined;
      const canal = e.canal;
      e.canal = undefined;
      canal?.cerrar();
      for (const c of e.clientes) c.cerrar("la copia de la granja se liberó al acabar el turno");
      e.clientes.clear();
      e.enrutador.vaciar();
      deps.alCambiarCopia?.(sesion, undefined);
      const conexion = deps.conexion();
      const r = conexion === undefined ? { ok: false as const, motivo: "la granja ya no está configurada" } : await liberarEnGranja(conexion, copia);
      deps.informar(
        r.ok
          ? `granja: liberada ${nombreDeCopia(copia)}`
          : `granja: no se pudo liberar ${nombreDeCopia(copia)} (${r.motivo}); la granja la soltará sola si nadie la usa`,
      );
    },
    olvidar: async (sesion) => {
      await gestor.liberar(sesion);
      sesiones.delete(sesion);
    },
  };
  return gestor;
}

/** Lo que tarda como mucho una subida o bajada de ficheros por el relé: una app grande por una red lenta. */
const TOPE_DE_FICHEROS_MS = 10 * 60_000;

/**
 * El pegamento de red: un servidor en LOOPBACK con, por sesión, `ws://127.0.0.1:<p>/granja/<clave>/hotswap` (el canal) y
 * `/granja/<clave>/file_upload|file_download|screenshot|restart` (reenviados a la API de la copia con el token y la huella). La clave es
 * aleatoria por sesión: el relé solo escucha en loopback, como un `adb forward`, y la clave impide hablarle a la copia
 * de otra sesión. El token no sale nunca de aquí hacia el cliente local.
 */
export async function servirReleDeGranja(gestor: GestorDeCopias, conexion: () => ConexionDeGranja | undefined): Promise<{
  urlDe(sesion: string): string;
  cerrar(): Promise<void>;
}> {
  const wss = new WebSocketServer({ noServer: true });
  const servidor: Server = createServer((peticion, respuesta) => void atenderFicheros(peticion, respuesta));

  const partes = (url: string | undefined): { sesion?: string; resto: string; busqueda: string } => {
    const u = new URL(url ?? "/", "http://127.0.0.1");
    const m = /^\/granja\/([A-Za-z0-9_-]+)\/(.+)$/.exec(u.pathname);
    const sesion = m === null ? undefined : gestor.sesionDeClave(m[1]!);
    return { ...(sesion === undefined ? {} : { sesion }), resto: m?.[2] ?? "", busqueda: u.search };
  };

  servidor.on("upgrade", (peticion: IncomingMessage, socket: Duplex, cabeza: Buffer) => {
    const { sesion, resto } = partes(peticion.url);
    if (sesion === undefined || resto !== "hotswap") {
      socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
      return;
    }
    wss.handleUpgrade(peticion, socket, cabeza, (ws) => {
      const cliente: ClienteDelCanal = {
        enviar: (texto) => ws.send(texto),
        // El motivo va en el cierre (tope de 123 bytes del protocolo WebSocket).
        cerrar: (motivo) => ws.close(1011, Buffer.from(motivo).subarray(0, 120).toString()),
      };
      // Lo que llegue antes de tener canal se guarda y se manda después, en orden.
      const antes: string[] = [];
      let listo = false;
      ws.on("message", (dato) => {
        if (listo) gestor.mensajeDelCliente(sesion, cliente, String(dato));
        else antes.push(String(dato));
      });
      ws.on("close", () => gestor.clienteSeFue(sesion, cliente));
      void gestor.conectarCliente(sesion, cliente).then(() => {
        listo = true;
        for (const texto of antes) gestor.mensajeDelCliente(sesion, cliente, texto);
      });
    });
  });

  const atenderFicheros = async (peticion: IncomingMessage, respuesta: ServerResponse): Promise<void> => {
    const { sesion, resto, busqueda } = partes(peticion.url);
    const metodo = peticion.method === "POST" ? "POST" : peticion.method === "GET" ? "GET" : undefined;
    // Lo que la API de la copia ofrece y los scripts necesitan sin conocer el token: los ficheros, la CAPTURA de su
    // pantalla virtual (`adb screencap` no la ve; esta sí pinta los diálogos) y `restart` (el `force-stop` de la granja:
    // destruye la pantalla y la recrea vacía, y CIERRA el canal, que el relé reabre en la siguiente conexión).
    const permitido =
      (resto === "file_upload" && metodo === "POST") ||
      (resto === "file_download" && metodo === "GET") ||
      (resto === "screenshot" && metodo === "GET") ||
      (resto === "restart" && metodo === "POST");
    if (sesion === undefined || metodo === undefined || !permitido) {
      respuesta.writeHead(404).end();
      return;
    }
    const negar = (codigo: number, motivo: string): void => void respuesta.writeHead(codigo, { "content-type": "text/plain; charset=utf-8" }).end(motivo);
    const copia = await gestor.asegurarCopia(sesion);
    const c = conexion();
    if ("motivo" in copia) return negar(503, copia.motivo);
    if (c === undefined) return negar(503, "la granja no está configurada");
    const cabeceras: Record<string, string> = {};
    for (const nombre of ["content-type", "content-length"]) {
      const v = peticion.headers[nombre];
      if (typeof v === "string") cabeceras[nombre] = v;
    }
    // La granja exige JSON en todo POST de su API (415 sin él): `restart` va con su cuerpo `{}`, y entonces la longitud
    // es la de ESE cuerpo y no la de la petición local (medido: con el `content-length: 0` del script, 400).
    if (resto === "restart") {
      cabeceras["content-type"] = "application/json";
      cabeceras["content-length"] = "2";
    }
    const r = await pedirAGranja(c, {
      metodo,
      ruta: `${rutaDeCopia(copia)}/${resto}${busqueda}`,
      cabeceras,
      ...(resto === "restart" ? { cuerpo: Buffer.from("{}") } : metodo === "POST" ? { cuerpo: peticion } : {}),
      tope: TOPE_DE_FICHEROS_MS,
    });
    if (r.tipo === "huella-distinta") return negar(502, "el certificado de la granja ha cambiado");
    if (r.tipo === "sin-respuesta") return negar(502, `la granja no responde${r.codigo === undefined ? "" : ` (${r.codigo})`}`);
    const tipo = r.respuesta.headers["content-type"];
    respuesta.writeHead(r.http, typeof tipo === "string" ? { "content-type": tipo } : {});
    r.respuesta.pipe(respuesta);
  };

  await new Promise<void>((resolver, rechazar) => {
    servidor.once("error", rechazar);
    servidor.listen(0, "127.0.0.1", () => resolver());
  });
  const puerto = (servidor.address() as { port: number }).port;
  // No mantiene vivo el proceso por sí solo.
  servidor.unref();
  return {
    urlDe: (sesion) => `ws://127.0.0.1:${puerto}/granja/${gestor.claveDe(sesion)}/hotswap`,
    cerrar: () =>
      new Promise<void>((resolver) => {
        for (const ws of wss.clients) ws.terminate();
        servidor.close(() => resolver());
      }),
  };
}

