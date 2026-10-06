/**
 * La geometría que `xone-captura-android` / `xone-hotswap shot` guardan con cada captura
 * (`<captura sin extensión>.geometria.json` en `/hotswap/`, ver `skills/xone-hotswap/lib/geometria.mjs`).
 *
 * Se empareja por el NOMBRE de la captura, nunca por la fecha de los ficheros: emparejar por fecha cruzó
 * una vez el árbol de una ronda con la captura de otra. Nunca lanza: lo que no está o no se entiende es
 * `undefined`, y el crítico lo dice.
 *
 * **Y, si el nombre no la encuentra, por el CONTENIDO** (`geometriaPorContenido`). Medido en Maset: el conductor
 * sacaba `xone-hotswap shot` (`captura-1791288505460.jpg`, con su geometría) y la convertía con `sips` a
 * `menu_ronda7.png`; el crítico, sin árbol que leer, se quedaba en la opinión del modelo dos rondas seguidas. La
 * geometría se acepta solo si la captura ORIGINAL que nombra sigue en `/artefactos/` con los MISMOS píxeles que la
 * que se juzga: una conversión o un renombrado la conservan; una captura de otro momento, no. La fecha solo acota
 * cuántas se miran, nunca decide.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ImagenRgba } from "../../core/compararCapturas.js";

/** El nombre del fichero de geometría de una captura. La MISMA regla que `nombreDeGeometria` del script. */
export function nombreDeGeometria(nombreDeCaptura: string): string {
  const base = nombreDeCaptura.slice(nombreDeCaptura.lastIndexOf("/") + 1);
  return `${base.replace(/\.[A-Za-z0-9]{2,4}$/, "")}.geometria.json`;
}

/** Cuántas geometrías, de las más recientes, se miran al buscar por contenido. */
export const GEOMETRIAS_A_MIRAR = 12;
/**
 * Cuántos píxeles DISTINTOS se toleran, en fracción de la imagen. Una captura reconvertida (JPEG → PNG) repite los
 * píxeles exactos; dos rondas distintas de la MISMA pantalla difieren en poco —la banda movida unos píxeles—, y por eso
 * no vale una diferencia MEDIA: medido en Maset, la ronda 6 pasaba por la ronda 7 con una media por debajo de 2.
 * Medido con las capturas reales (con `UMBRAL_DE_CANAL` 40): la misma captura reconvertida por `sips` difiere en un
 * 0,02 % de los píxeles —dos decodificadores de JPEG no redondean igual en los bordes—, y dos rondas consecutivas en un
 * 0,72 %. El tope va en medio, más cerca de la misma.
 */
const PIXELES_DISTINTOS_TOLERADOS = 0.001;
/** Un píxel es distinto si algún canal se aparta más de esto: la holgura del ruido entre decodificadores de JPEG (medido). */
const UMBRAL_DE_CANAL = 40;

/** Cuántos píxeles distintos hay, en fracción; `Infinity` si no tienen el mismo tamaño. Recorre la imagen ENTERA. Pura. */
export function fraccionDistinta(a: ImagenRgba, b: ImagenRgba): number {
  if (a.ancho !== b.ancho || a.alto !== b.alto) return Infinity;
  let distintos = 0;
  for (let i = 0; i < a.datos.length; i += 4) {
    if (
      Math.abs(a.datos[i]! - b.datos[i]!) > UMBRAL_DE_CANAL ||
      Math.abs(a.datos[i + 1]! - b.datos[i + 1]!) > UMBRAL_DE_CANAL ||
      Math.abs(a.datos[i + 2]! - b.datos[i + 2]!) > UMBRAL_DE_CANAL
    ) {
      distintos += 1;
    }
  }
  return distintos / (a.ancho * a.alto);
}

/** ¿Son la MISMA imagen (la misma captura, quizá reconvertida)? Pura. */
export function mismaImagen(a: ImagenRgba, b: ImagenRgba): boolean {
  return fraccionDistinta(a, b) <= PIXELES_DISTINTOS_TOLERADOS;
}

const leerGeometria = (ruta: string): Record<string, unknown> | undefined => {
  try {
    const leido = JSON.parse(readFileSync(ruta, "utf8")) as Record<string, unknown>;
    return leido["v"] === 1 ? leido : undefined;
  } catch {
    return undefined;
  }
};

export interface BusquedaPorContenido {
  /** La carpeta REAL de artefactos, donde están la captura que se juzga y las originales. */
  carpetaDeArtefactos: string;
  decodificar: (bytes: Buffer) => ImagenRgba;
}

/** La geometría de otra captura con los mismos píxeles que ésta, o `undefined`. Nunca lanza. */
export function geometriaPorContenido(carpetaDeHotswap: string, nombreDeCaptura: string, busqueda: BusquedaPorContenido): unknown {
  try {
    const base = nombreDeCaptura.slice(nombreDeCaptura.lastIndexOf("/") + 1);
    const juzgada = busqueda.decodificar(readFileSync(join(busqueda.carpetaDeArtefactos, base)));
    const candidatas = readdirSync(carpetaDeHotswap)
      .filter((n) => n.endsWith(".geometria.json"))
      .map((n) => ({ n, t: statSync(join(carpetaDeHotswap, n)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
      .slice(0, GEOMETRIAS_A_MIRAR);
    let mejor: { g: Record<string, unknown>; f: number } | undefined;
    for (const { n } of candidatas) {
      const g = leerGeometria(join(carpetaDeHotswap, n));
      const original = g?.["captura"];
      if (g === undefined || typeof original !== "string" || original === base) continue;
      const pantalla = g["pantalla"] as { ancho?: number; alto?: number } | undefined;
      if (pantalla !== undefined && (pantalla.ancho !== juzgada.ancho || pantalla.alto !== juzgada.alto)) continue;
      try {
        const otra = busqueda.decodificar(readFileSync(join(busqueda.carpetaDeArtefactos, original.slice(original.lastIndexOf("/") + 1))));
        const f = fraccionDistinta(juzgada, otra);
        if (f <= PIXELES_DISTINTOS_TOLERADOS && (mejor === undefined || f < mejor.f)) mejor = { g, f };
      } catch {
        // La original ya no está o no se lee: esa no.
      }
    }
    // La MÁS parecida de las que pasan, no la primera: la más reciente no tiene por qué ser la suya.
    if (mejor !== undefined) return mejor.g;
  } catch {
    // Sin captura que leer o sin carpeta: sin geometría.
  }
  return undefined;
}

export async function geometriaDeCaptura(carpetaDeHotswap: string, nombreDeCaptura: string, busqueda?: BusquedaPorContenido): Promise<unknown> {
  const porNombre = leerGeometria(join(carpetaDeHotswap, nombreDeGeometria(nombreDeCaptura)));
  if (porNombre !== undefined || busqueda === undefined) return porNombre;
  return geometriaPorContenido(carpetaDeHotswap, nombreDeCaptura, busqueda);
}
