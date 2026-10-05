import { readFileSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import type { ImagenReferida } from "../../core/referenciasDeImagen.js";

/**
 * La lectura de una maqueta (`core/referenciasDeImagen.ts` decide QUÉ rutas valen; esto las abre).
 *
 * **La comprobación se repite dos veces: por el TEXTO (la regla pura) y por el `realpath`.** Un enlace
 * simbólico dentro del proyecto puede apuntar a `/etc` o a `~/.ssh`, y el texto de la ruta no lo dice:
 * es lo que hacen también las escrituras de los motores externos y el lector de Ficheros. Se resuelve
 * el enlace y se exige que lo que salga siga DENTRO de la carpeta de su origen.
 *
 * Solo lee y solo abre lo que ya pasó la regla. **Lanza con un `code`** (ENOENT si el origen no está
 * montado o el fichero no existe, EACCES si el enlace sale de la carpeta): quien la llama devuelve
 * solo ese código, porque el mensaje de un error de Node lleva la ruta absoluta de la máquina.
 */
export interface CarpetasDeReferencia {
  /** La carpeta de artefactos de la sesión. */
  artefactos?: string;
  /** La carpeta de adjuntos (de solo lectura). Ausente = `/adjuntos/` no está montada. */
  adjuntos?: string;
  /** La raíz del proyecto. */
  raiz: string;
}

function errorConCodigo(codigo: string): Error {
  return Object.assign(new Error(codigo), { code: codigo });
}

export function crearLectorDeReferencias(carpetas: CarpetasDeReferencia): (imagen: ImagenReferida) => Promise<Buffer> {
  return async (imagen) => {
    const base = imagen.origen === "artefactos" ? carpetas.artefactos : imagen.origen === "adjuntos" ? carpetas.adjuntos : carpetas.raiz;
    if (base === undefined) throw errorConCodigo("ENOENT");
    const real = realpathSync(join(base, imagen.relativa)); // lanza ENOENT si no existe
    const baseReal = realpathSync(base);
    if (real !== baseReal && !real.startsWith(baseReal.endsWith(sep) ? baseReal : baseReal + sep)) {
      throw errorConCodigo("EACCES");
    }
    return readFileSync(real);
  };
}

/**
 * El `code.html` que acompaña a una maqueta —el de Stitch: `screen.png` y `code.html` en la misma carpeta—,
 * con su ruta en disco, o `undefined` si no hay. Con la MISMA comprobación que la lectura: por el texto de
 * la carpeta y por el `realpath`, para que un enlace no lleve a renderizar un HTML de fuera.
 */
export function crearLocalizadorDeHtmlDeMaqueta(carpetas: CarpetasDeReferencia): (imagen: ImagenReferida) => string | undefined {
  return (imagen) => {
    const base = imagen.origen === "artefactos" ? carpetas.artefactos : imagen.origen === "adjuntos" ? carpetas.adjuntos : carpetas.raiz;
    if (base === undefined) return undefined;
    const carpetaRelativa = imagen.relativa.includes("/") ? imagen.relativa.slice(0, imagen.relativa.lastIndexOf("/")) : "";
    try {
      const real = realpathSync(join(base, carpetaRelativa, "code.html"));
      const baseReal = realpathSync(base);
      return real.startsWith(baseReal.endsWith(sep) ? baseReal : baseReal + sep) ? real : undefined;
    } catch {
      return undefined;
    }
  };
}
