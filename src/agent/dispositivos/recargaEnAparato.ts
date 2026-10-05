/**
 * Llevar al Android UN fichero recién guardado en el editor, sin desplegar el proyecto entero.
 *
 * Es la versión del host de `skills/xone-hotswap/scripts/xone-recargar-android`, para un solo
 * fichero y por el MISMO canal (`hotswap.ts`): túnel, ¿está viva?, `uploadFile`, y aplicar según
 * `core/recargaEnCaliente.ts#claseDeRecarga`. Cinco reglas:
 *
 * - **Es TRANSPARENTE para el guardado**: corre DESPUÉS de escribir, y nunca lanza. Sin aparato o
 *   sin app contesta `sin-app` sin haber tocado nada; el guardado ya está hecho.
 * - **El túnel se REAPLICA antes de hablar** (`adb forward tcp:<puerto del AVD> tcp:8443`): un
 *   emulador reiniciado pierde el suyo, y entonces el canal da `ECONNREFUSED`, que se leería como
 *   «la app no está» sin serlo. El puerto es el de SU AVD: con dos emuladores y el 8443, se le
 *   hablaría al otro sin error.
 * - **La vida se pregunta UNA vez y sin reintentar la conexión**: si la app no está, se dice ya. El
 *   reintento de un minuto de `lanzarYComprobar` es para un framework que ARRANCA, no para uno que
 *   no está.
 * - **`result:true` no es «aplicado»**: lo que se afirma es que la app CONTESTA su árbol después.
 * - **Relanzar es `lanzarYComprobar`, y solo a petición**: un `launchApplication` suelto sobre una
 *   app viva la TUMBA (medido), y `lanzarYComprobar` solo reenvía detrás de una lectura que dice
 *   «no está».
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { PUERTO_DEL_HOTSWAP } from "../../core/puertosDeAvd.js";
import {
  claseDeRecarga,
  codificacionParaElAparato,
  destinoEnElAparato,
  xmlParaCargarEnMemoria,
  type ResultadoDeRecarga,
} from "../../core/recargaEnCaliente.js";
import { resolverEnProyecto } from "../grafo/arbolDeProyecto.js";
import { localizadorDeAndroid } from "./dispositivosEnMaquina.js";
import {
  abrirHotswap,
  estaViva,
  lanzarYComprobar,
  type AbrirSocketHotswap,
  type ClienteHotswap,
  type RespuestaHotswap,
} from "./hotswap.js";

export interface PeticionDeRecarga {
  /** El serial de adb del aparato de la sesión. */
  serie: string;
  /** El puerto LOCAL del túnel: el del AVD, o el de fábrica para un físico. */
  puerto: number;
  /** El nombre de la app, el MISMO que usa Ejecutar (`puedeLanzarse`). */
  app: string;
  /** La ruta relativa al proyecto, con `/`. */
  ruta: string;
  /** Los bytes del fichero TAL CUAL están en disco: su codificación decide cómo se le dice. */
  bytes: Uint8Array;
}

export interface DependenciasDeRecarga {
  /** Aplicar el túnel. Devuelve el motivo si falló, `undefined` si quedó puesto. */
  aplicarTunel?: (serie: string, puerto: number) => Promise<string | undefined>;
  abrirSocket?: AbrirSocketHotswap;
}

/** Cuánto se espera a que la app conteste una pregunta. Corto: esto va detrás de un guardado. */
const TOPE_DE_RESPUESTA_MS = 20_000;

/** Lleva el fichero al aparato y lo aplica. Nunca lanza. */
export async function recargarEnAparato(
  peticion: PeticionDeRecarga,
  deps: DependenciasDeRecarga = {}
): Promise<ResultadoDeRecarga> {
  const clase = claseDeRecarga(peticion.ruta, peticion.bytes);
  if (clase === "no-aplica") return { estado: "no-aplica" };

  const tunel = await (deps.aplicarTunel ?? aplicarTunelReal)(peticion.serie, peticion.puerto);
  if (tunel !== undefined) return { estado: "sin-app", motivo: tunel };

  let cliente: ClienteHotswap | undefined;
  try {
    cliente = abrirHotswap(destinoDe(peticion.puerto), deps.abrirSocket === undefined ? {} : { abrirSocket: deps.abrirSocket });
    const c = cliente;
    const pedir = (nombre: string, extra?: Record<string, unknown>): Promise<RespuestaHotswap> =>
      conTope(c.comando(nombre, extra), `${nombre} no contestó en ${TOPE_DE_RESPUESTA_MS / 1000} s`);

    const antes = await pedir("getAllElements", { format: "xone" });
    if (!estaViva(antes)) return { estado: "sin-app", motivo: decirDe(antes) };

    // 1. A disco, siempre: lo que solo está en memoria se pierde al relanzar.
    const subida = await pedir("uploadFile", {
      destinationPath: destinoEnElAparato(peticion.app, peticion.ruta),
      fileData: Buffer.from(peticion.bytes).toString("base64"),
    });
    if (subida.result !== true) return { estado: "fallo", clase, motivo: `uploadFile: ${decirDe(subida)}` };

    if (clase === "relanzar") return { estado: "relanzar", clase };

    // 2. Aplicar. Una colección va a memoria en UTF-8 con su prólogo diciéndolo (medido: con los
    //    bytes Latin-1 cada tilde salía doble); un include se lee del DISCO, en la tabla de sus bytes.
    const aplicado =
      clase === "coleccion"
        ? await pedir("loadCollection", {
            xmlNode: Buffer.from(xmlParaCargarEnMemoria(peticion.bytes)).toString("base64"),
            encoding: "UTF-8",
          })
        : await pedir("loadIncludeFile", {
            file: peticion.ruta.replace(/^\/+/, ""),
            language: "javascript",
            encoding: codificacionParaElAparato(peticion.bytes),
            compile: true,
          });
    if (aplicado.result !== true) {
      return { estado: "fallo", clase, motivo: `${clase === "coleccion" ? "loadCollection" : "loadIncludeFile"}: ${decirDe(aplicado)}` };
    }

    // 3. Comprobar: el árbol, no el `result:true`.
    const despues = await pedir("getAllElements", { format: "xone" });
    if (!estaViva(despues)) {
      return { estado: "fallo", clase, motivo: "se aplicó y la app dejó de contestar: puede haber reventado al cargarlo" };
    }
    return { estado: "aplicada", clase };
  } catch (error) {
    return { estado: "sin-app", motivo: unaLinea(error) };
  } finally {
    cliente?.cerrar();
  }
}

/** A qué aparato y app va una recarga: lo resuelve el servidor, no el cliente. */
export type DestinoDeRecarga = Pick<PeticionDeRecarga, "serie" | "puerto" | "app">;

/**
 * Lee el fichero del proyecto con las MISMAS guardas que el lector de Ficheros
 * (`resolverEnProyecto`: texto y `realpath`) y lo recarga. Lo que no se deja leer no viaja.
 */
export async function recargarFicheroDelProyecto(
  raiz: string,
  ruta: string,
  destino: DestinoDeRecarga,
  deps: DependenciasDeRecarga = {}
): Promise<ResultadoDeRecarga> {
  try {
    const resuelta = await resolverEnProyecto(raiz, ruta);
    if ("error" in resuelta) return { estado: "no-aplica" };
    const bytes = await readFile(resuelta.real);
    return await recargarEnAparato({ ...destino, ruta: resuelta.relativa, bytes }, deps);
  } catch (error) {
    // Solo el código: el mensaje de un error de Node lleva la ruta absoluta.
    const codigo = (error as { code?: unknown } | null)?.code;
    return { estado: "fallo", motivo: typeof codigo === "string" ? codigo : "no se pudo leer el fichero" };
  }
}

/** Relanzar la app, a petición de la persona. Nunca lanza. */
export async function relanzarEnAparato(
  peticion: Pick<PeticionDeRecarga, "serie" | "puerto" | "app">,
  deps: DependenciasDeRecarga = {}
): Promise<ResultadoDeRecarga> {
  const tunel = await (deps.aplicarTunel ?? aplicarTunelReal)(peticion.serie, peticion.puerto);
  if (tunel !== undefined) return { estado: "sin-app", motivo: tunel };
  const arranque = await lanzarYComprobar(peticion.app, {
    destino: destinoDe(peticion.puerto),
    ...(deps.abrirSocket === undefined ? {} : { abrirSocket: deps.abrirSocket }),
  });
  return arranque.viva ? { estado: "relanzada" } : { estado: "fallo", motivo: arranque.motivo ?? "la app no volvió a contestar" };
}

function destinoDe(puerto: number): string {
  return `wss://127.0.0.1:${puerto}/hotswap`;
}

function conTope<T>(promesa: Promise<T>, motivo: string): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promesa,
    new Promise<T>((_, fallar) => {
      reloj = setTimeout(() => fallar(new Error(motivo)), TOPE_DE_RESPUESTA_MS);
    }),
  ]).finally(() => clearTimeout(reloj));
}

function decirDe(respuesta: RespuestaHotswap): string {
  const status = typeof respuesta.status === "string" ? respuesta.status.trim() : "";
  const excepcion = typeof respuesta["exceptionMessage"] === "string" ? respuesta["exceptionMessage"].trim() : "";
  return (excepcion || status || JSON.stringify(respuesta)).split(/\r?\n/)[0]!.slice(0, 160);
}

/** Una línea, nunca una ruta de la máquina. */
function unaLinea(error: unknown): string {
  const e = error as { code?: unknown; message?: unknown } | null;
  if (e !== null && typeof e === "object" && e.code === "ECONNREFUSED") return "no hay app escuchando en el aparato";
  const mensaje = e !== null && typeof e === "object" && typeof e.message === "string" ? e.message : String(error);
  return mensaje.split(/\r?\n/)[0]!.slice(0, 160);
}

/** El `adb forward` de verdad, con el adb que localiza la detección de dispositivos. */
const aplicarTunelReal = (serie: string, puerto: number): Promise<string | undefined> => {
  const adb = localizadorDeAndroid({ plataforma: process.platform, entorno: process.env, home: homedir(), existe: existsSync }).enSdk(
    "adb",
    "platform-tools"
  );
  if (adb === undefined) return Promise.resolve("no está adb");
  return new Promise((resolver) => {
    execFile(adb, ["-s", serie, "forward", `tcp:${puerto}`, `tcp:${PUERTO_DEL_HOTSWAP}`], { timeout: 10_000 }, (error) => {
      // Solo el código: el mensaje de Node lleva la ruta del binario.
      resolver(error === null ? undefined : `adb forward falló (${String((error as { code?: unknown }).code ?? "error")})`);
    });
  });
};
