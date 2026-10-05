/**
 * La geometría que `xone-captura-android` / `xone-hotswap shot` guardan con cada captura
 * (`<captura sin extensión>.geometria.json` en `/hotswap/`, ver `skills/xone-hotswap/lib/geometria.mjs`).
 *
 * Se empareja por el NOMBRE de la captura, nunca por la fecha de los ficheros: emparejar por fecha cruzó
 * una vez el árbol de una ronda con la captura de otra. Nunca lanza: lo que no está o no se entiende es
 * `undefined`, y el crítico lo dice.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** El nombre del fichero de geometría de una captura. La MISMA regla que `nombreDeGeometria` del script. */
export function nombreDeGeometria(nombreDeCaptura: string): string {
  const base = nombreDeCaptura.slice(nombreDeCaptura.lastIndexOf("/") + 1);
  return `${base.replace(/\.[A-Za-z0-9]{2,4}$/, "")}.geometria.json`;
}

export async function geometriaDeCaptura(carpetaDeHotswap: string, nombreDeCaptura: string): Promise<unknown> {
  try {
    const leido = JSON.parse(readFileSync(join(carpetaDeHotswap, nombreDeGeometria(nombreDeCaptura)), "utf8")) as Record<string, unknown>;
    return leido["v"] === 1 ? leido : undefined;
  } catch {
    return undefined;
  }
}
