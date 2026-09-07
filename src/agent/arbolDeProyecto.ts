import { existsSync } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { ficherosDelProyecto } from "./turnoReal.js";
import { puedeLeerRuta } from "./perfiles.js";
import { esVistaAplanada } from "./proyecto.js";

/**
 * El proyecto tal como lo enseña la pestaña Ficheros de la consola web: el árbol y el
 * contenido de un fichero, de SOLO lectura.
 *
 * Lo que se lista y lo que se lee es lo mismo que ve el agente, con las mismas reglas y
 * por las mismas funciones: `puedeLeerRuta` (la barrera de las tools propias) y
 * `esVistaAplanada` (los `.xml` que genera XOne Studio no se tocan). Reescribirlas aquí
 * sería la segunda copia que diverge el primer día.
 */

/** Profundidad del árbol de la web: sin tope práctico (el del Tab es 4). */
export const PROFUNDIDAD_DEL_ARBOL = 32;
/** Entradas a partir de las cuales el árbol se recorta y lo dice. */
export const TOPE_DE_ENTRADAS = 5_000;
/** Bytes de contenido que viajan como mucho: el mismo tope que el parche de Revisión. */
export const TOPE_DE_FICHERO = 400_000;
/** Ventana en la que un NUL delata un binario. */
export const VENTANA_DE_BINARIO = 8_192;

/** El motivo con el que se rechaza una vista aplanada. Uno solo: se comprueba dos veces. */
const MOTIVO_APLANADA = "es una vista aplanada que genera XOne Studio; la fuente es el .xne del mismo nombre";

export interface ArbolDeProyecto {
  /** Relativas a la raíz, sin barra inicial, ordenadas: carpetas antes que ficheros. */
  rutas: string[];
  recortado: boolean;
}

export interface FicheroLeido {
  /** La ruta tal como se pidió, nunca la resuelta en disco. */
  ruta: string;
  /** Falta si es binario o si la ruta se rechazó. */
  texto?: string;
  recortado: boolean;
  binario: boolean;
  /** Tamaño real en disco, aunque el texto vaya recortado. */
  bytes: number;
  codificacion?: "utf-8" | "latin1";
  /** El motivo del paso que falló. Sin él, la lectura fue bien. */
  error?: string;
}

const comparador = new Intl.Collator("es", { sensitivity: "base" });

/**
 * Carpetas antes que ficheros en cada nivel, y dentro alfabético sin distinguir mayúsculas.
 * Se compara segmento a segmento: en el primero que difiere, si uno es hoja (último
 * segmento de su ruta) y el otro carpeta, la carpeta va antes.
 */
export function ordenarRutas(rutas: readonly string[]): string[] {
  return [...rutas].sort((a, b) => {
    const sa = a.split("/");
    const sb = b.split("/");
    const n = Math.min(sa.length, sb.length);
    for (let i = 0; i < n; i++) {
      const aHoja = i === sa.length - 1;
      const bHoja = i === sb.length - 1;
      if (aHoja !== bHoja) return aHoja ? 1 : -1;
      if (sa[i] !== sb[i]) return comparador.compare(sa[i]!, sb[i]!) || (sa[i]! < sb[i]! ? -1 : 1);
    }
    return sa.length - sb.length;
  });
}

export function arbolDeProyecto(raiz: string): ArbolDeProyecto {
  const todas = ficherosDelProyecto(raiz, 0, PROFUNDIDAD_DEL_ARBOL);
  const visibles = [...todas].filter((r) => puedeLeerRuta(r) && !esVistaAplanada(r, todas)).map((r) => r.slice(1));
  const ordenadas = ordenarRutas(visibles);
  if (ordenadas.length > TOPE_DE_ENTRADAS) return { rutas: ordenadas.slice(0, TOPE_DE_ENTRADAS), recortado: true };
  return { rutas: ordenadas, recortado: false };
}

/**
 * Por qué una ruta del cable no se acepta, o `undefined` si vale. Es la criba de balde,
 * antes de tocar el disco: relativa, sin `.`/`..`/segmentos vacíos, y admitida por la
 * barrera de lectura. La segunda criba —que el camino REAL siga dentro de la raíz— es de
 * `leerFicheroDeProyecto`, porque necesita `realpath`.
 */
export function motivoDeRutaInaceptable(ruta: string): string | undefined {
  if (ruta === "") return "la ruta está vacía";
  if (isAbsolute(ruta) || ruta.startsWith("/") || ruta.startsWith("\\") || /^[A-Za-z]:/.test(ruta)) {
    return "la ruta tiene que ser relativa al proyecto";
  }
  const segmentos = ruta.split(/[\\/]/);
  if (segmentos.some((s) => s === "" || s === "." || s === "..")) {
    return "la ruta no puede llevar «.», «..» ni segmentos vacíos";
  }
  if (!puedeLeerRuta(`/${segmentos.join("/")}`)) return "esa ruta no se enseña";
  return undefined;
}

export async function leerFicheroDeProyecto(raiz: string, ruta: string): Promise<FicheroLeido> {
  const rechazo = (error: string): FicheroLeido => ({ ruta, recortado: false, binario: false, bytes: 0, error });

  const motivo = motivoDeRutaInaceptable(ruta);
  if (motivo !== undefined) return rechazo(motivo);

  // La misma regla que `esVistaAplanada` (un `.xml` con su `.xne` al lado), preguntada al
  // disco en O(1) en vez de recorrer el árbol entero por cada fichero que se abre.
  const normal = ruta.split(/[\\/]/).join("/");
  if (normal.endsWith(".xml") && existsSync(resolve(raiz, `${normal.slice(0, -4)}.xne`))) {
    return rechazo(MOTIVO_APLANADA);
  }

  let real: string;
  let raizReal: string;
  try {
    raizReal = await realpath(raiz);
    // Se resuelve con `normal`, no con `ruta`: en POSIX `path.resolve` trata «\» como
    // carácter literal de nombre, así que una ruta con separadores de Windows pasaba la
    // criba de vista aplanada (ya normalizada) y luego se buscaba en disco con la barra
    // invertida sin traducir, fallando con «no existe» aunque el fichero SÍ estuviera.
    real = await realpath(resolve(raiz, normal));
  } catch {
    return rechazo("no existe");
  }
  // Un enlace simbólico dentro del proyecto que apunte fuera se queda aquí: la lección que
  // el repo ya pagó con `virtualMode: true` en el backend del agente.
  if (!real.startsWith(raizReal + sep)) return rechazo("está fuera del proyecto");

  // **La barrera se aplica DOS veces, y una sola no basta.** La primera pasada es sobre el
  // TEXTO que teclea el cliente (`motivoDeRutaInaceptable` y la criba de aplanadas de
  // arriba): es de balde y evita tocar el disco. Esta segunda es sobre el camino que el
  // disco ha resuelto DE VERDAD, y cierra tres agujeros medidos:
  //  - En un sistema de ficheros que no distingue mayúsculas (APFS, NTFS) «.ENV» no es
  //    «/.env» para `puedeLeerRuta`, pero abre `.env`. Lo mismo «.Xonecode/config.json».
  //  - Un enlace simbólico DENTRO de la raíz que apunte a un fichero denegado
  //    («enlace-env.txt» → «.env») o a una carpeta denegada («carpeta-enlazada» →
  //    «.xonecode») pasa la comprobación de arriba, porque su camino real sí está dentro
  //    del proyecto: lo que falla no es el sitio, es el destino.
  //  - Un enlace a una vista aplanada («alias.xml» → «app/Clientes.xml») no tiene ningún
  //    «alias.xne» al lado, así que la criba de balde no puede verlo.
  // `realpath` canonicaliza las mayúsculas y sigue los enlaces, así que recomprobar sobre
  // su resultado cierra los tres a la vez. Y sigue siendo una recomprobación y no una
  // prohibición de enlaces: un enlace a un fichero que SÍ se enseña se lee con normalidad.
  const relReal = relative(raizReal, real).split(sep).join("/");
  if (!puedeLeerRuta(`/${relReal}`)) return rechazo("esa ruta no se enseña");
  if (relReal.endsWith(".xml") && existsSync(`${real.slice(0, -4)}.xne`)) return rechazo(MOTIVO_APLANADA);

  const info = await stat(real);
  if (!info.isFile()) return rechazo("no es un fichero");

  const fh = await open(real, "r");
  try {
    const buffer = Buffer.alloc(Math.min(info.size, TOPE_DE_FICHERO + 1));
    const { bytesRead } = await fh.read(buffer, 0, buffer.length, 0);
    const leido = buffer.subarray(0, bytesRead);
    const bytes = info.size;
    if (leido.subarray(0, VENTANA_DE_BINARIO).includes(0)) {
      return { ruta, recortado: false, binario: true, bytes };
    }
    const recortado = bytesRead > TOPE_DE_FICHERO;
    const cuerpo = recortado ? leido.subarray(0, TOPE_DE_FICHERO) : leido;
    const { texto, codificacion } = decodificar(cuerpo, recortado);
    return { ruta, texto, recortado, binario: false, bytes, codificacion };
  } finally {
    await fh.close();
  }
}

/**
 * UTF-8 estricto, y si no lo es, latin1 (que en Node es windows-1252: lo que traen los
 * proyectos XOne antiguos hechos en Windows). Cuando el cuerpo va RECORTADO el corte puede
 * partir un carácter multibyte, y eso no es «no es UTF-8»: se reintenta quitando hasta tres
 * bytes del final antes de dar el fichero por latin1.
 */
function decodificar(cuerpo: Uint8Array, recortado: boolean): { texto: string; codificacion: "utf-8" | "latin1" } {
  const estricto = new TextDecoder("utf-8", { fatal: true });
  const intentos = recortado ? [0, 1, 2, 3] : [0];
  for (const quitar of intentos) {
    try {
      return { texto: estricto.decode(cuerpo.subarray(0, cuerpo.length - quitar)), codificacion: "utf-8" };
    } catch {
      // siguiente intento
    }
  }
  return { texto: new TextDecoder("latin1").decode(cuerpo), codificacion: "latin1" };
}
