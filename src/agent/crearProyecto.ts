/**
 * La escritura del esqueleto en el disco del usuario.
 *
 * QUÉ se escribe lo decide `core/esqueleto.ts` (puro, probado sin disco); AQUÍ
 * solo se ejecuta, al estilo de `agent/configEnDisco.ts`. La regla dura es la
 * misma que en todo xonecode: **el disco es del usuario**, así que un fichero
 * que ya exista no se pisa — se salta y se declara en el informe. Un proyecto
 * a medias se completa en la siguiente corrida; un fichero del usuario
 * destruido no se recupera.
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { generarEsqueleto, carpetasDelEsqueleto, type DatosDelProyecto } from "../core/esqueleto.js";

export interface InformeDeCreacion {
  /** Ficheros escritos, como rutas relativas a la raíz. */
  creados: string[];
  /** Ficheros que ya existían y NO se han tocado. */
  saltados: string[];
  /** Carpetas del runtime (creadas ahora o ya existentes). */
  carpetas: string[];
}

export function crearProyecto(raiz: string, datos: DatosDelProyecto): InformeDeCreacion {
  const creados: string[] = [];
  const saltados: string[] = [];

  for (const carpeta of carpetasDelEsqueleto()) {
    // `recursive` y no un existsSync previo: crean lo que falte sin quejarse
    // de lo que ya esté, que es justo lo que pide reintentar una creación a
    // medias.
    mkdirSync(join(raiz, carpeta), { recursive: true });
  }

  for (const ficha of generarEsqueleto(datos)) {
    const destino = join(raiz, ficha.ruta);
    if (existsSync(destino)) {
      saltados.push(ficha.ruta);
      continue;
    }
    writeFileSync(destino, ficha.contenido);
    creados.push(ficha.ruta);
  }

  return { creados, saltados, carpetas: carpetasDelEsqueleto() };
}