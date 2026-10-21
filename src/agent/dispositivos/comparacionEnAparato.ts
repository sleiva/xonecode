/**
 * Preguntar al aparato qué ficheros del proyecto tiene DISTINTOS, para «Copiar solo los
 * modificados» (pestaña Ejecutar). La regla es pura y vive en `core/comparacionConAparato.ts`;
 * aquí solo están los efectos: leer el disco, el CRC32 y el comando `getFileChecksum` del canal.
 *
 * El CRC32 es el de `node:zlib` (el mismo polinomio que el script `xone-recargar-android`), y el
 * comando va con el nombre de la app en MINÚSCULAS: la carpeta del aparato es `app_<minúsculas>`.
 */
import { readFileSync } from "node:fs";
import { crc32 } from "node:zlib";
import {
  ficheroQueFaltaEnElAparato,
  ficherosDistintos,
  MOTIVO_DEMASIADOS_NUEVOS,
  TOPE_DE_NUEVOS,
} from "../../core/comparacionConAparato.js";
import type { ClienteHotswap } from "./hotswap.js";
import { ficherosQueViajan } from "./paqueteDelProyecto.js";

export type ResultadoDeComparacion =
  | { estado: "ok"; comparados: number; distintos: string[]; nuevos: number }
  | { estado: "fallo"; motivo: string };

/**
 * Compara los ficheros que viajarían en el paquete con los del aparato. **Nunca lanza**: un canal
 * que se cae o un comando que el framework no conoce vuelven como `fallo` con una línea.
 */
export async function compararConAparato(
  raiz: string,
  app: string,
  cliente: Pick<ClienteHotswap, "comando">
): Promise<ResultadoDeComparacion> {
  try {
    const locales = new Map<string, number>();
    for (const { ruta, absoluta } of ficherosQueViajan(raiz)) locales.set(ruta, crc32(readFileSync(absoluta)));

    const nuevos = new Set<string>();
    let pedir = [...locales.keys()];
    let remotos: Record<string, unknown> = {};
    while (pedir.length > 0) {
      const respuesta = await cliente.comando("getFileChecksum", {
        appName: app.toLowerCase(),
        files: pedir,
        checksumType: "crc32",
      });
      if (respuesta.result !== false && typeof respuesta.result === "object" && respuesta.result !== null) {
        remotos = respuesta.result as Record<string, unknown>;
        break;
      }
      const mensaje = String(respuesta["exceptionMessage"] ?? respuesta.status ?? "");
      const falta = ficheroQueFaltaEnElAparato(mensaje);
      if (falta === undefined || !pedir.includes(falta)) {
        return { estado: "fallo", motivo: `no se pudo comparar con el aparato: ${mensaje || "sin motivo"}` };
      }
      nuevos.add(falta);
      if (nuevos.size >= TOPE_DE_NUEVOS) return { estado: "fallo", motivo: MOTIVO_DEMASIADOS_NUEVOS };
      pedir = pedir.filter((ruta) => ruta !== falta);
    }

    return {
      estado: "ok",
      comparados: locales.size,
      distintos: ficherosDistintos(locales, remotos, nuevos),
      nuevos: nuevos.size,
    };
  } catch (error) {
    // De un error de Node solo su `code`: su mensaje lleva la ruta absoluta del fichero.
    const codigo = (error as { code?: unknown } | null)?.code;
    const texto =
      typeof codigo === "string" ? codigo : (error instanceof Error ? error.message : String(error)).split(/\r?\n/)[0];
    return { estado: "fallo", motivo: `no se pudo comparar con el aparato: ${texto}` };
  }
}
