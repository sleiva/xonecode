/**
 * Hablar con la granja de dispositivos por su API REST (`core/granja.ts`): por ahora, «Probar conexión».
 *
 * **El certificado se fija por su HUELLA antes de mandar el token.** La granja abierta a la red sirve
 * https con un certificado AUTOFIRMADO, así que la cadena no se puede validar; aceptar cualquiera
 * mandaría el token a quien conteste en esa IP. Por eso el TLS lo abre esto a mano (`tls.connect`),
 * lee `fingerprint256` en `secureConnect` y, si ya hay una aceptada y no coincide, CIERRA sin haber
 * escrito nada. Solo con la huella buena la petición sale por ESE socket (`createConnection`). La
 * primera vez no hay con qué comparar: se acepta la que conteste bien (TOFU) y la guarda quien llama.
 *
 * `http://` solo llega aquí en loopback (`direccionDeGranja` lo impone), y ahí no hay huella.
 *
 * **Todo lo de red entra por `deps.hablar`**: `npm test` no abre sockets. La decisión —qué estado
 * es cada respuesta— es `probarGranja`, y se prueba con el doble.
 */
import { request, type IncomingMessage } from "node:http";
import { isIP, type Socket } from "node:net";
import { connect } from "node:tls";
import type { Readable } from "node:stream";
import WebSocket from "ws";
import type { CopiaDeGranja } from "../../core/canalDeGranja.js";
import {
  resumenDeGranja,
  usuarioDeGranja,
  type PruebaDeGranja,
} from "../../core/granja.js";

/** Lo que se espera a la granja por petición, de abrir el socket a leer el cuerpo. */
export const TOPE_DE_GRANJA_MS = 10_000;

/**
 * Lo que se espera a `reset` de una copia. Medido en la granja real: 4,2 s (cierra la pantalla, `pm clear`, vuelve a
 * conceder permisos y arranca la copia vacía); el tope es holgado porque un `pm clear` de una copia con datos tarda más.
 */
export const TOPE_DE_LIBERAR_MS = 60_000;

/** El cuerpo más grande que se lee: `/api/state` de una granja grande ronda decenas de KB. */
const TOPE_DE_CUERPO_BYTES = 4 * 1024 * 1024;

/** Cómo acabó UNA petición. El token no sale de aquí en ningún caso. */
export type ResultadoDeHablar =
  | { tipo: "respuesta"; http: number; cuerpo: unknown; huella?: string }
  /** El certificado no es el aceptado: NO se escribió nada en el socket. */
  | { tipo: "huella-distinta"; ahora: string }
  /** No se llegó o no terminó: el `code` de Node, sin su mensaje (lleva la dirección). */
  | { tipo: "sin-respuesta"; codigo?: string };

export type Hablar = (peticion: {
  base: string;
  ruta: string;
  token: string;
  huellaAceptada?: string;
}) => Promise<ResultadoDeHablar>;

const codigoDe = (error: unknown): string | undefined => {
  const codigo = (error as { code?: unknown } | null)?.code;
  return typeof codigo === "string" ? codigo : undefined;
};

/** Un socket hacia la granja con el certificado YA comprobado, o por qué no. En `http://` (loopback) no hay socket propio. */
type Conexion =
  | { tipo: "lista"; socket?: Socket; huella?: string }
  | { tipo: "huella-distinta"; ahora: string }
  | { tipo: "sin-respuesta"; codigo?: string };

/**
 * Abre el TLS a mano y comprueba la huella ANTES de escribir nada (ver la cabecera). Con huella aceptada distinta,
 * cierra sin haber mandado un byte: el token no sale. Sin huella aceptada, deja pasar y devuelve la que contestó.
 */
export function conectarVerificado(base: string, huellaAceptada: string | undefined, tope = TOPE_DE_GRANJA_MS): Promise<Conexion> {
  const url = new URL(base);
  if (url.protocol !== "https:") return Promise.resolve({ tipo: "lista" });
  const host = url.hostname.replace(/^\[|\]$/g, "");
  return new Promise((resolver) => {
    let acabado = false;
    const acabar = (c: Conexion): void => {
      if (acabado) return;
      acabado = true;
      clearTimeout(reloj);
      resolver(c);
    };
    const tls = connect({
      host,
      port: Number(url.port || 443),
      // SNI solo con un nombre: una IP en `servername` es un aviso de Node y no significa nada.
      ...(isIP(host) === 0 ? { servername: host } : {}),
      rejectUnauthorized: false,
      ALPNProtocols: ["http/1.1"],
    });
    const reloj = setTimeout(() => {
      tls.destroy();
      acabar({ tipo: "sin-respuesta", codigo: "ETIMEDOUT" });
    }, tope);
    tls.once("error", (error) => acabar({ tipo: "sin-respuesta", codigo: codigoDe(error) }));
    tls.once("secureConnect", () => {
      const huella = tls.getPeerCertificate().fingerprint256;
      if (typeof huella !== "string" || huella === "") {
        tls.destroy();
        return acabar({ tipo: "sin-respuesta", codigo: "ESINCERTIFICADO" });
      }
      if (huellaAceptada !== undefined && huella !== huellaAceptada) {
        tls.destroy();
        return acabar({ tipo: "huella-distinta", ahora: huella });
      }
      acabar({ tipo: "lista", socket: tls, huella });
    });
  });
}

/** Lo que hace falta para hablar con la granja. El token no sale de aquí. */
export interface ConexionDeGranja {
  direccion: string;
  token: string;
  huella?: string;
}

/**
 * Una petición a la granja con la huella comprobada, devolviendo la respuesta EN FLUJO (para la subida de una app, que
 * puede pesar decenas de MB). `cuerpo` se escribe tal cual; sin él, la petición va vacía.
 */
export async function pedirAGranja(
  conexion: ConexionDeGranja,
  peticion: { metodo: "GET" | "POST"; ruta: string; cabeceras?: Record<string, string>; cuerpo?: Buffer | Readable; tope?: number },
): Promise<{ tipo: "respuesta"; http: number; respuesta: IncomingMessage; huella?: string } | Exclude<Conexion, { tipo: "lista" }>> {
  const tope = peticion.tope ?? TOPE_DE_GRANJA_MS;
  const c = await conectarVerificado(conexion.direccion, conexion.huella, tope);
  if (c.tipo !== "lista") return c;
  const url = new URL(conexion.direccion);
  return new Promise((resolver) => {
    let acabado = false;
    const acabar = (r: Awaited<ReturnType<typeof pedirAGranja>>): void => {
      if (acabado) return;
      acabado = true;
      clearTimeout(reloj);
      resolver(r);
    };
    const q = request(
      {
        host: url.hostname.replace(/^\[|\]$/g, ""),
        port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
        path: peticion.ruta,
        method: peticion.metodo,
        headers: { ...peticion.cabeceras, authorization: `Bearer ${conexion.token}` },
        // OJO, medido: con `agent: false` Node crea un agente NUEVO e IGNORA `createConnection`, y la
        // petición salía en claro por otro socket (el servidor TLS contestaba ERR_SSL_HTTP_REQUEST).
        // Con el socket ya comprobado, `agent` tiene que quedar SIN poner.
        ...(c.socket === undefined ? { agent: false } : { createConnection: () => c.socket! }),
      },
      (respuesta) => acabar({ tipo: "respuesta", http: respuesta.statusCode ?? 0, respuesta, ...(c.huella === undefined ? {} : { huella: c.huella }) }),
    );
    const reloj = setTimeout(() => {
      q.destroy();
      acabar({ tipo: "sin-respuesta", codigo: "ETIMEDOUT" });
    }, tope);
    q.on("error", (error) => acabar({ tipo: "sin-respuesta", codigo: codigoDe(error) }));
    const cuerpo = peticion.cuerpo;
    if (cuerpo === undefined) q.end();
    else if (Buffer.isBuffer(cuerpo)) q.end(cuerpo);
    else cuerpo.pipe(q);
  });
}

/** Lee una respuesta entera como JSON, con tope de tamaño; lo que no es JSON es `undefined`. */
function leerJson(respuesta: IncomingMessage): Promise<{ cuerpo: unknown } | { codigo: string }> {
  return new Promise((resolver) => {
    const trozos: Buffer[] = [];
    let leidos = 0;
    respuesta.on("data", (trozo: Buffer) => {
      leidos += trozo.length;
      if (leidos > TOPE_DE_CUERPO_BYTES) {
        respuesta.destroy();
        resolver({ codigo: "EFBIG" });
        return;
      }
      trozos.push(trozo);
    });
    respuesta.on("end", () => {
      try {
        resolver({ cuerpo: JSON.parse(Buffer.concat(trozos).toString("utf8")) });
      } catch {
        resolver({ cuerpo: undefined });
      }
    });
    respuesta.on("error", (error) => resolver({ codigo: codigoDe(error) ?? "EIO" }));
  });
}

/** Una petición GET de verdad, con la huella comprobada antes de escribir. */
export const hablarConGranja: Hablar = async ({ base, ruta, token, huellaAceptada }) => {
  const r = await pedirAGranja(
    { direccion: base, token, ...(huellaAceptada === undefined ? {} : { huella: huellaAceptada }) },
    { metodo: "GET", ruta, cabeceras: { accept: "application/json" } },
  );
  if (r.tipo !== "respuesta") return r;
  const leido = await leerJson(r.respuesta);
  if ("codigo" in leido) return { tipo: "sin-respuesta", codigo: leido.codigo };
  return { tipo: "respuesta", http: r.http, cuerpo: leido.cuerpo, ...(r.huella === undefined ? {} : { huella: r.huella }) };
};

/** La ruta de la API de una copia: `/api/devices/<serial>/slots/<n>`. */
export function rutaDeCopia(copia: CopiaDeGranja): string {
  return `/api/devices/${encodeURIComponent(copia.serial)}/slots/${copia.numero}`;
}

/**
 * Libera una copia: `POST …/reset` (la limpia con `pm clear` y la deja sin dueño). Solo el dueño o un admin. Nunca lanza.
 */
export async function liberarCopiaDeGranja(conexion: ConexionDeGranja, copia: CopiaDeGranja): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const r = await pedirAGranja(conexion, {
    metodo: "POST",
    ruta: `${rutaDeCopia(copia)}/reset`,
    cabeceras: { "content-type": "application/json" },
    cuerpo: Buffer.from("{}"),
    tope: TOPE_DE_LIBERAR_MS,
  });
  if (r.tipo === "huella-distinta") return { ok: false, motivo: "el certificado de la granja ha cambiado" };
  if (r.tipo === "sin-respuesta") return { ok: false, motivo: `la granja no responde${r.codigo === undefined ? "" : ` (${r.codigo})`}` };
  r.respuesta.resume();
  return r.http === 200 ? { ok: true } : { ok: false, motivo: `la granja contestó ${r.http}` };
}

/** El canal hotswap de una copia, abierto por la puerta de la granja. */
export interface CanalDeGranja {
  enviar(texto: string): void;
  alMensaje(oyente: (texto: string) => void): void;
  alCerrar(oyente: () => void): void;
  cerrar(): void;
}

/** Por qué no se pudo abrir: `ocupada` = 403 (la copia ya es de otro, o no se puede tocar). */
export type FalloDeCanal = { tipo: "ocupada" } | { tipo: "huella-distinta" } | { tipo: "sin-respuesta"; codigo?: string; http?: number };

export type AbrirCanalDeGranja = (conexion: ConexionDeGranja, copia: CopiaDeGranja) => Promise<CanalDeGranja | FalloDeCanal>;

/**
 * Abre `wss://<granja>/ws/hotswap?serial&slot` con el token y la huella comprobada (el WebSocket va por el MISMO socket
 * TLS verificado: `createConnection` de `ws`). Conectarse COGE la copia si estaba libre (medido). La granja añade sola
 * el token del canal del teléfono: aquí no hace falta conocerlo.
 */
export const abrirCanalDeGranja: AbrirCanalDeGranja = async (conexion, copia) => {
  const c = await conectarVerificado(conexion.direccion, conexion.huella);
  if (c.tipo === "huella-distinta") return { tipo: "huella-distinta" };
  if (c.tipo === "sin-respuesta") return { tipo: "sin-respuesta", ...(c.codigo === undefined ? {} : { codigo: c.codigo }) };
  const url = new URL(conexion.direccion);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/hotswap";
  url.search = `?serial=${encodeURIComponent(copia.serial)}&slot=${copia.numero}`;
  return new Promise((resolver) => {
    const ws = new WebSocket(url.toString(), {
      headers: { authorization: `Bearer ${conexion.token}` },
      rejectUnauthorized: false,
      handshakeTimeout: TOPE_DE_GRANJA_MS,
      ...(c.socket === undefined ? {} : { createConnection: () => c.socket as never }),
    });
    let abierto = false;
    ws.once("unexpected-response", (_q, respuesta) => {
      respuesta.resume();
      ws.terminate();
      resolver(respuesta.statusCode === 403 ? { tipo: "ocupada" } : { tipo: "sin-respuesta", http: respuesta.statusCode ?? 0 });
    });
    ws.once("error", (error) => {
      if (!abierto) resolver({ tipo: "sin-respuesta", ...(codigoDe(error) === undefined ? {} : { codigo: codigoDe(error)! }) });
    });
    ws.once("open", () => {
      abierto = true;
      resolver({
        enviar: (texto) => ws.send(texto),
        alMensaje: (oyente) => void ws.on("message", (dato) => oyente(String(dato))),
        alCerrar: (oyente) => void ws.on("close", () => oyente()),
        cerrar: () => ws.close(),
      });
    });
  });
};

/**
 * «Probar conexión»: quién eres (`/api/me`) y qué hay (`/api/state`). Cada salida es un estado de
 * `PruebaDeGranja` con su arreglo propio; nunca lanza.
 */
export async function probarGranja(
  configuracion: { direccion?: string; token?: string; huella?: string },
  deps: { hablar?: Hablar } = {},
): Promise<PruebaDeGranja> {
  const { direccion, token, huella } = configuracion;
  if (direccion === undefined) return { estado: "sin-configurar", falta: "direccion" };
  if (token === undefined) return { estado: "sin-configurar", falta: "token" };
  const hablar = deps.hablar ?? hablarConGranja;
  const peticion = { base: direccion, token, ...(huella === undefined ? {} : { huellaAceptada: huella }) };

  const yo = await hablar({ ...peticion, ruta: "/api/me" });
  if (yo.tipo === "huella-distinta") return { estado: "huella-distinta", aceptada: huella ?? "", ahora: yo.ahora };
  if (yo.tipo === "sin-respuesta") return { estado: "no-responde", ...(yo.codigo === undefined ? {} : { codigo: yo.codigo }) };
  if (yo.http === 401) return { estado: "token-rechazado" };
  if (yo.http === 403 && (yo.cuerpo as { mustChange?: unknown } | undefined)?.mustChange === true) {
    return { estado: "debe-cambiar-contrasena" };
  }
  const quien = yo.http === 200 ? usuarioDeGranja(yo.cuerpo) : undefined;
  if (quien === undefined) return { estado: "respuesta-inesperada", http: yo.http };

  const estado = await hablar({ ...peticion, ruta: "/api/state" });
  if (estado.tipo === "huella-distinta") return { estado: "huella-distinta", aceptada: huella ?? "", ahora: estado.ahora };
  if (estado.tipo === "sin-respuesta") {
    return { estado: "no-responde", ...(estado.codigo === undefined ? {} : { codigo: estado.codigo }) };
  }
  const resumen = estado.http === 200 ? resumenDeGranja(estado.cuerpo) : undefined;
  if (resumen === undefined) return { estado: "respuesta-inesperada", http: estado.http };
  return { estado: "conectada", ...quien, resumen, ...(yo.huella === undefined ? {} : { huella: yo.huella }) };
}
