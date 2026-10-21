/**
 * La RED de byXOneDownloads: peticiones firmadas, la ficha de un fichero y la descarga de un APK a la
 * copia local. La firma, la credencial y las frases de error son puras (`core/byxone.ts`); el disco
 * de la copia, `frameworkEnDisco.ts`.
 *
 * **`fetch` entra por parámetro**: `npm test` no toca la red.
 *
 * **La descarga se escribe a un TEMPORAL y se comprueba antes de existir.** El sha256 se calcula
 * mientras llega, el tamaño se corta en cuanto pasa del declarado, y solo con los dos bien —y con el
 * paquete del manifiesto leído— el temporal se renombra a `<sha256>.apk` y se anota en el índice. Una
 * descarga truncada o distinta no deja nada que se pueda instalar.
 */
import { createHash, randomBytes } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  BASE_DE_BYXONE, type CredencialByxone, FICHERO_DE_CREDENCIAL_BYXONE, firmarPeticion, motivoDeRespuestaByxone,
  type OrigenDeCredencialByxone, resolverCredencialByxone,
} from "../../core/byxone.js";
import type { FrameworkLocal } from "../../core/frameworkLocal.js";
import { raizDelPaquete } from "../raizDelPaquete.js";
import { anotarFrameworkLocal, borrarSiExiste, carpetaDeFrameworks, paqueteDeApk, rutaDeApk } from "./frameworkEnDisco.js";
import { TOPE_SIN_SALIDA_MS } from "./procesosEnMaquina.js";

/** Una llamada de LECTURA (catálogo, ficha): no puede quedarse colgada con la ventana esperando. */
export const TOPE_DE_CONSULTA_BYXONE_MS = 30_000;

/** La ficha de un fichero, con lo que hace falta para descargarlo y comprobarlo. */
export interface FichaDeByxone {
  id: number;
  displayName: string;
  sizeBytes: number;
  sha256: string;
  version?: string;
}

export type RespuestaByxone<T> = { ok: true; valor: T } | { ok: false; motivo: string };

/**
 * La credencial que vale ahora, leída en CADA uso (el fichero personal se puede escribir con la
 * consola en marcha). Nunca lanza.
 */
export function credencialByxone(
  deps: { entorno?: Record<string, string | undefined>; casa?: string; raizDelPaquete?: string } = {}
): { credencial: CredencialByxone; origen: OrigenDeCredencialByxone } | { motivo: string } {
  const leer = (ruta: string): unknown => {
    if (!existsSync(ruta)) return undefined;
    try {
      return JSON.parse(readFileSync(ruta, "utf8"));
    } catch {
      return { roto: true };
    }
  };
  const personal = leer(join(deps.casa ?? homedir(), ".xonecode", FICHERO_DE_CREDENCIAL_BYXONE));
  let empaquetada: unknown;
  try {
    empaquetada = leer(join(deps.raizDelPaquete ?? raizDelPaquete(), "dist", FICHERO_DE_CREDENCIAL_BYXONE));
  } catch {
    empaquetada = undefined;
  }
  return resolverCredencialByxone(deps.entorno ?? process.env, personal, empaquetada);
}

export interface ClienteByxone {
  /** GET firmado que devuelve JSON. `ruta` con su query. */
  obtener: (ruta: string) => Promise<RespuestaByxone<unknown>>;
  ficha: (id: number) => Promise<RespuestaByxone<FichaDeByxone>>;
  /**
   * Baja el APK `id` a la copia local, comprobado. Si ya hay uno con ese sha, no baja nada.
   * `titulo` es el nombre de la versión que se anota en el índice.
   */
  descargarApk: (
    id: number,
    titulo: string,
    opciones: { alSalirLinea?: (linea: string) => void; senal?: AbortSignal }
  ) => Promise<RespuestaByxone<FrameworkLocal>>;
}

export function clienteByxone(
  credencial: CredencialByxone,
  deps: { fetch?: typeof fetch; casa?: string; ahora?: () => number; base?: string } = {}
): ClienteByxone {
  const llamar = deps.fetch ?? fetch;
  const base = deps.base ?? BASE_DE_BYXONE;
  const ahora = deps.ahora ?? (() => Date.now());

  /** Una petición firmada. Un nonce NUEVO cada vez: el servicio rechaza uno repetido. */
  const pedir = (ruta: string, senal?: AbortSignal): Promise<Response> => {
    const cabeceras = firmarPeticion(credencial, {
      metodo: "GET",
      ruta,
      ts: Math.floor(ahora() / 1000),
      nonce: randomBytes(8).toString("hex"),
    });
    return llamar(base + ruta, { headers: { ...cabeceras }, redirect: "error", ...(senal === undefined ? {} : { signal: senal }) });
  };

  const fallo = async (r: Response): Promise<{ ok: false; motivo: string }> => {
    let codigo: string | undefined;
    try {
      const cuerpo = (await r.json()) as { error?: unknown };
      if (typeof cuerpo.error === "string") codigo = cuerpo.error;
    } catch {
      // Sin cuerpo JSON (un 404 no lo trae, a propósito): basta el código HTTP.
    }
    return { ok: false, motivo: motivoDeRespuestaByxone(r.status, codigo) };
  };

  const obtener = async (ruta: string): Promise<RespuestaByxone<unknown>> => {
    try {
      const r = await pedir(ruta, AbortSignal.timeout(TOPE_DE_CONSULTA_BYXONE_MS));
      if (!r.ok) return fallo(r);
      return { ok: true, valor: await r.json() };
    } catch (error) {
      return { ok: false, motivo: `no se pudo hablar con byXOne: ${unaLinea(error)}` };
    }
  };

  const ficha = async (id: number): Promise<RespuestaByxone<FichaDeByxone>> => {
    const r = await obtener(`/api/files/${id}`);
    if (!r.ok) return r;
    const f = r.valor as Partial<FichaDeByxone> | null;
    if (
      f === null || typeof f !== "object" || typeof f.id !== "number" || typeof f.sizeBytes !== "number" ||
      typeof f.sha256 !== "string" || !/^[0-9a-fA-F]{64}$/.test(f.sha256) || typeof f.displayName !== "string"
    ) {
      return { ok: false, motivo: "byXOne devolvió una ficha que no se entiende (sin tamaño o sin sha256)" };
    }
    return { ok: true, valor: { id: f.id, displayName: f.displayName, sizeBytes: f.sizeBytes, sha256: f.sha256.toLowerCase(), ...(typeof f.version === "string" ? { version: f.version } : {}) } };
  };

  const descargarApk: ClienteByxone["descargarApk"] = async (id, titulo, opciones) => {
    const decir = (linea: string): void => opciones.alSalirLinea?.(linea);
    const datos = await ficha(id);
    if (!datos.ok) return datos;
    const { sha256, sizeBytes } = datos.valor;
    const final = rutaDeApk(sha256, deps.casa);
    const entrada = (paquete: string): FrameworkLocal => ({
      titulo, ficheroId: id, sha256, bytes: sizeBytes, bajado: new Date(ahora()).toISOString(), paquete,
    });

    if (existsSync(final)) {
      const paquete = paqueteDeApk(final);
      if (paquete !== undefined) {
        decir(`${titulo} ya estaba descargada: no se vuelve a bajar`);
        const e = entrada(paquete);
        anotarFrameworkLocal(e, deps.casa);
        return { ok: true, valor: e };
      }
    }

    mkdirSync(carpetaDeFrameworks(deps.casa), { recursive: true });
    const temporal = join(carpetaDeFrameworks(deps.casa), `.${sha256}.${process.pid}.descarga`);
    const abortador = new AbortController();
    const alCancelar = (): void => abortador.abort();
    opciones.senal?.addEventListener("abort", alCancelar, { once: true });
    let colgada = false;
    let vigilante: ReturnType<typeof setTimeout> | undefined;
    const rearmar = (): void => {
      if (vigilante !== undefined) clearTimeout(vigilante);
      vigilante = setTimeout(() => {
        colgada = true;
        abortador.abort();
      }, TOPE_SIN_SALIDA_MS);
    };

    try {
      rearmar();
      const r = await pedir(`/api/files/${id}/download`, abortador.signal);
      if (!r.ok) return await fallo(r);
      if (r.body === null) return { ok: false, motivo: "byXOne contestó sin cuerpo" };

      decir(`descargando ${titulo} (${Math.max(1, Math.round(sizeBytes / 1024 ** 2))} MB)…`);
      const hash = createHash("sha256");
      const escritor = createWriteStream(temporal);
      // **Un error del disco (lleno, sin permiso) NO puede quedar sin escuchar**: un `'error'` de un
      // stream sin oyente es una excepción no capturada, y este proceso es el servidor de todas las
      // pestañas. Se apunta, y las dos esperas de abajo lo ven en vez de quedarse colgadas.
      let errorDeDisco: unknown;
      const alFallarElDisco = new Promise<never>((_ok, mal) => {
        escritor.once("error", (e) => {
          errorDeDisco = e;
          mal(e);
        });
      });
      alFallarElDisco.catch(() => {});
      const esperar = (hecho: (ok: () => void) => void): Promise<void> =>
        Promise.race([new Promise<void>((ok) => hecho(ok)), alFallarElDisco]);
      const lector = r.body.getReader();
      let recibido = 0;
      let ultimo = -10;
      try {
        for (;;) {
          const { done, value } = await lector.read();
          if (done) break;
          rearmar();
          recibido += value.length;
          if (recibido > sizeBytes) {
            abortador.abort();
            return { ok: false, motivo: "la descarga pesa más de lo que dice su ficha: se para" };
          }
          hash.update(value);
          if (errorDeDisco !== undefined) throw errorDeDisco;
          if (!escritor.write(value)) await esperar((ok) => escritor.once("drain", () => ok()));
          const porcentaje = sizeBytes > 0 ? Math.floor((recibido / sizeBytes) * 100) : 0;
          if (porcentaje >= ultimo + 10) {
            decir(`descargando… ${porcentaje}%`);
            ultimo = porcentaje;
          }
        }
      } finally {
        if (errorDeDisco === undefined) await esperar((ok) => escritor.end(() => ok())).catch(() => {});
        else escritor.destroy();
      }
      if (errorDeDisco !== undefined) return { ok: false, motivo: `no se pudo escribir la descarga en disco: ${unaLinea(errorDeDisco)}` };

      if (recibido !== sizeBytes) return { ok: false, motivo: `la descarga se cortó: llegaron ${recibido} de ${sizeBytes} bytes` };
      if (hash.digest("hex") !== sha256) return { ok: false, motivo: "el APK descargado no coincide con su sha256: no se usa" };

      const paquete = paqueteDeApk(temporal);
      if (paquete === undefined) return { ok: false, motivo: "el fichero descargado no es un APK que se pueda leer" };
      renameSync(temporal, final);
      const e = entrada(paquete);
      anotarFrameworkLocal(e, deps.casa);
      decir(`${titulo} descargada y comprobada`);
      return { ok: true, valor: e };
    } catch (error) {
      if (colgada) return { ok: false, motivo: `byXOne dejó de mandar datos durante ${Math.round(TOPE_SIN_SALIDA_MS / 60_000)} min` };
      if (opciones.senal?.aborted === true) return { ok: false, motivo: "descarga cancelada" };
      return { ok: false, motivo: `la descarga falló: ${unaLinea(error)}` };
    } finally {
      if (vigilante !== undefined) clearTimeout(vigilante);
      opciones.senal?.removeEventListener("abort", alCancelar);
      borrarSiExiste(temporal);
    }
  };

  return { obtener, ficha, descargarApk };
}

/** De un error, una línea. De un error de Node, solo su `code`: su mensaje lleva rutas de la máquina. */
function unaLinea(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string") return code;
  if (error instanceof Error) return error.name === "AbortError" || error.name === "TimeoutError" ? "no contestó a tiempo" : (error.message.split(/\r?\n/)[0] ?? "error");
  return "error";
}
