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
import { request } from "node:http";
import { isIP } from "node:net";
import { connect } from "node:tls";
import {
  resumenDeGranja,
  usuarioDeGranja,
  type PruebaDeGranja,
} from "../../core/granja.js";

/** Lo que se espera a la granja por petición, de abrir el socket a leer el cuerpo. */
export const TOPE_DE_GRANJA_MS = 10_000;

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

/** Una petición GET de verdad, con la huella comprobada antes de escribir. */
export const hablarConGranja: Hablar = ({ base, ruta, token, huellaAceptada }) =>
  new Promise((resolver) => {
    const url = new URL(base);
    const segura = url.protocol === "https:";
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const puerto = Number(url.port || (segura ? 443 : 80));
    let acabado = false;
    const acabar = (r: ResultadoDeHablar): void => {
      if (acabado) return;
      acabado = true;
      clearTimeout(reloj);
      resolver(r);
    };
    const reloj = setTimeout(() => {
      socket?.destroy();
      acabar({ tipo: "sin-respuesta", codigo: "ETIMEDOUT" });
    }, TOPE_DE_GRANJA_MS);
    let socket: import("node:net").Socket | undefined;

    const pedir = (huella: string | undefined, conexion?: import("node:net").Socket): void => {
      const peticion = request(
        {
          host,
          port: puerto,
          path: ruta,
          method: "GET",
          headers: { authorization: `Bearer ${token}`, accept: "application/json" },
          // OJO, medido: con `agent: false` Node crea un agente NUEVO e IGNORA `createConnection`, y la
          // petición salía en claro por otro socket (el servidor TLS contestaba ERR_SSL_HTTP_REQUEST).
          // Con el socket ya comprobado, `agent` tiene que quedar SIN poner.
          ...(conexion === undefined ? { agent: false } : { createConnection: () => conexion }),
        },
        (respuesta) => {
          const trozos: Buffer[] = [];
          let leidos = 0;
          respuesta.on("data", (trozo: Buffer) => {
            leidos += trozo.length;
            if (leidos > TOPE_DE_CUERPO_BYTES) {
              respuesta.destroy();
              acabar({ tipo: "sin-respuesta", codigo: "EFBIG" });
              return;
            }
            trozos.push(trozo);
          });
          respuesta.on("end", () => {
            let cuerpo: unknown;
            try {
              cuerpo = JSON.parse(Buffer.concat(trozos).toString("utf8"));
            } catch {
              cuerpo = undefined;
            }
            acabar({ tipo: "respuesta", http: respuesta.statusCode ?? 0, cuerpo, ...(huella === undefined ? {} : { huella }) });
          });
          respuesta.on("error", (error) => acabar({ tipo: "sin-respuesta", codigo: codigoDe(error) }));
        },
      );
      peticion.on("error", (error) => acabar({ tipo: "sin-respuesta", codigo: codigoDe(error) }));
      peticion.end();
    };

    if (!segura) {
      pedir(undefined);
      return;
    }
    const tls = connect({
      host,
      port: puerto,
      // SNI solo con un nombre: una IP en `servername` es un aviso de Node y no significa nada.
      ...(isIP(host) === 0 ? { servername: host } : {}),
      rejectUnauthorized: false,
      ALPNProtocols: ["http/1.1"],
    });
    socket = tls;
    tls.once("error", (error) => acabar({ tipo: "sin-respuesta", codigo: codigoDe(error) }));
    tls.once("secureConnect", () => {
      const huella = tls.getPeerCertificate().fingerprint256;
      if (typeof huella !== "string" || huella === "") {
        tls.destroy();
        acabar({ tipo: "sin-respuesta", codigo: "ESINCERTIFICADO" });
        return;
      }
      if (huellaAceptada !== undefined && huella !== huellaAceptada) {
        tls.destroy();
        acabar({ tipo: "huella-distinta", ahora: huella });
        return;
      }
      pedir(huella, tls);
    });
  });

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
