/**
 * Leer un ARTEFACTO de la sesión: lo que el agente dibujó y no es del proyecto.
 *
 * Los escribe el backend por la ruta virtual `/artefactos/<nombre>` (`agent/proyecto.ts`) y
 * caen en `.xonecode/sesiones/<id>/artefactos/`. Esta es la puerta de vuelta, la que deja
 * ENSEÑARLOS en la consola web: un HTML en un iframe, una imagen en su visor, y la
 * descarga.
 *
 * Dos lectores y no uno, porque son dos transportes con necesidades opuestas:
 *  - `leerArtefactoDeSesion` devuelve la misma forma que un fichero del proyecto
 *    (`FicheroLeido`) para viajar por el CABLE: texto recortado al tope, imagen en base64,
 *    codificación declarada. Así los visores del cliente son los MISMOS que los de la
 *    pestaña Ficheros, sin una segunda familia de componentes.
 *  - `leerArtefactoCrudo` devuelve los bytes tal cual para la RUTA HTTP, que es la única
 *    forma de darle un documento a un iframe. Ahí no vale recortar —un HTML cortado no
 *    abre— ni inflar un tercio con base64.
 *
 * **La carpeta `.xonecode` está denegada en todas partes, y esto no es una excepción a esa
 * regla: es la razón de que la barrera de aquí sea propia.** El servidor estático rechaza
 * `.xonecode` por el texto de la ruta y `puedeLeerRuta` la deniega al agente; lo que se
 * abre aquí es UNA carpeta concreta de dentro, la de los artefactos de UNA sesión, y solo
 * por nombre de fichero. Nada de este módulo acepta una ruta: acepta un nombre, y compone.
 */
import { readFile, realpath, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import {
  RUTA_ARTEFACTOS,
  carpetaDeArtefactosDeSesion,
  esRutaDeArtefacto,
  mimeDeArtefacto,
} from "../core/artefactos.js";
import { leerContenidoDeFichero, type FicheroLeido } from "./arbolDeProyecto.js";

/**
 * Bytes que la ruta HTTP sirve como mucho.
 *
 * No es el tope del cable (`TOPE_DE_FICHERO`, 400 KB) y no puede serlo: por aquí pasa el
 * documento que el iframe pinta, y medio HTML no es medio panel — es una página rota. Un
 * panel de `artifacts-builder` con sus datos horneados dentro ronda el megabyte, así que el
 * tope está donde deja de ser un artefacto y empieza a ser un descuido; existe para que un
 * fichero de 800 MB no se lea entero a memoria en la máquina del usuario, no para acotar lo
 * que el agente puede dibujar.
 */
export const TOPE_DE_ARTEFACTO = 20_000_000;

/** El resultado de la lectura cruda. Discriminado, y con el motivo separado, porque la ruta
 *  HTTP tiene que contestar un código distinto a cada cosa: 403 lo rechazado, 404 lo que no
 *  está, 413 lo que no cabe. Fundirlos daría un 404 para todo, que es la respuesta que hace
 *  imposible saber si el fichero existe o si el nombre estaba mal. */
export type LecturaCruda =
  | { ok: true; nombre: string; datos: Buffer; mime?: string }
  | { ok: false; motivo: "rechazado" | "no-existe" | "demasiado-grande" };

/**
 * El camino REAL de un artefacto, o `undefined` si no se puede afirmar que sea uno.
 *
 * La barrera se aplica DOS veces, la misma disciplina que `leerFicheroDeProyecto` y por los
 * mismos agujeros medidos allí:
 *  - Sobre el TEXTO, de balde y antes de tocar el disco: `esRutaDeArtefacto` exige que cada
 *    segmento sea texto llano, lo que deja fuera `..`, `.`, el hueco de un `//`, la barra
 *    invertida de Windows, el NUL y un `%2e%2e` sin decodificar. Es la MISMA función que
 *    decide que una escritura ahí no pide aprobación humana: una regla, no dos que puedan
 *    divergir el día que alguien toque una.
 *  - Sobre el camino que el disco resuelve DE VERDAD: un enlace simbólico dentro de la
 *    carpeta cuyo destino esté fuera pasa la primera criba —su nombre es un segmento
 *    llano— y solo se ve comparando el `realpath`. El agente no crea enlaces con
 *    `write_file`, pero la carpeta está en el disco del usuario y quien la barra es esto.
 */
async function caminoDeArtefacto(
  raiz: string,
  sesion: string,
  nombre: string
): Promise<string | undefined> {
  if (!esRutaDeArtefacto(`${RUTA_ARTEFACTOS}${nombre}`)) return undefined;
  let carpeta: string;
  try {
    // `segmentoSeguro` LANZA con un id que lleve separadores. El id lo pone el servidor y es
    // un uuid, así que aquí no debería llegar nunca uno malo — y precisamente por eso se
    // atrapa: el día que llegue, la respuesta tiene que ser un rechazo y no una excepción
    // que suba hasta el manejador de la ruta.
    carpeta = carpetaDeArtefactosDeSesion(raiz, sesion);
  } catch {
    return undefined;
  }
  try {
    const carpetaReal = await realpath(carpeta);
    const real = await realpath(join(carpeta, nombre));
    if (!real.startsWith(carpetaReal + sep)) return undefined;
    return real;
  } catch {
    // No existe: ni la carpeta (una sesión que nunca dibujó nada no la tiene, y eso es lo
    // normal) ni el fichero. Quien llama distingue las dos cosas de un rechazo.
    return undefined;
  }
}

/** ¿Se rechazó el NOMBRE, o simplemente no hay nada ahí? Son dos respuestas distintas y la
 *  ruta HTTP las contesta con códigos distintos, así que la pregunta del texto se hace
 *  aparte —es pura y de balde— en vez de deducirla del fallo del disco. */
const nombreAceptable = (nombre: string): boolean =>
  esRutaDeArtefacto(`${RUTA_ARTEFACTOS}${nombre}`);

/**
 * Para el CABLE: la misma forma con la que viaja un fichero del proyecto.
 *
 * La `ruta` que vuelve es la VIRTUAL (`/artefactos/<nombre>`), nunca la del disco: el cable
 * puede ir por un túnel, y es la misma regla por la que la ruta de una herramienta se queda
 * en el host. El error tampoco la lleva.
 */
export async function leerArtefactoDeSesion(
  raiz: string,
  sesion: string,
  nombre: string
): Promise<FicheroLeido> {
  const ruta = `${RUTA_ARTEFACTOS}${nombre}`;
  const rechazo = (error: string): FicheroLeido => ({
    ruta,
    recortado: false,
    binario: false,
    bytes: 0,
    error,
  });

  if (!nombreAceptable(nombre)) return rechazo("ese nombre no es de un artefacto");
  const real = await caminoDeArtefacto(raiz, sesion, nombre);
  if (real === undefined) return rechazo("no existe");
  // El mime se saca del NOMBRE que se pidió, no del camino real: es el nombre que el
  // usuario ve y el que el agente eligió decir que era.
  return leerContenidoDeFichero(real, ruta, mimeDeImagenDeArtefacto(nombre));
}

/**
 * El mime SOLO si es una imagen que el visor sabe pintar.
 *
 * `leerContenidoDeFichero` usa este parámetro para elegir camino —imagen entera, o SVG con
 * sus dos caras—, así que aquí no puede entrar el `text/html` de `mimeDeArtefacto`: un HTML
 * es texto y tiene que seguir el camino del texto. La ruta HTTP sí quiere el mime completo,
 * y por eso lo pide ella a `mimeDeArtefacto`.
 */
function mimeDeImagenDeArtefacto(nombre: string): string | undefined {
  const mime = mimeDeArtefacto(nombre);
  return mime !== undefined && mime.startsWith("image/") ? mime : undefined;
}

/** Para la RUTA HTTP: los bytes, sin recortar y sin base64. Ver `TOPE_DE_ARTEFACTO`. */
export async function leerArtefactoCrudo(
  raiz: string,
  sesion: string,
  nombre: string
): Promise<LecturaCruda> {
  if (!nombreAceptable(nombre)) return { ok: false, motivo: "rechazado" };
  const real = await caminoDeArtefacto(raiz, sesion, nombre);
  if (real === undefined) return { ok: false, motivo: "no-existe" };

  const info = await stat(real);
  if (!info.isFile()) return { ok: false, motivo: "no-existe" };
  // El tamaño se mira ANTES de leer: el tope existe para no traer 800 MB a memoria, y
  // comprobarlo después de `readFile` no protegería de nada.
  if (info.size > TOPE_DE_ARTEFACTO) return { ok: false, motivo: "demasiado-grande" };

  const mime = mimeDeArtefacto(nombre);
  return { ok: true, nombre, datos: await readFile(real), ...(mime === undefined ? {} : { mime }) };
}
