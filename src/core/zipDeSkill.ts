/**
 * Instalar una skill desde un `.zip`: QUÉ se acepta y con qué nombre queda.
 *
 * **Este módulo es PURO.** Quién descomprime es `agent/grafo/skills.ts`; aquí vive la regla,
 * que es la parte que hay que poder probar sin un fichero de verdad delante.
 *
 * Un `.zip` que alguien descarga de internet y suelta en esta ventana es la entrada menos
 * de fiar de todo el harness: sus nombres de entrada los eligió quien lo empaquetó. De ahí
 * que la lista de lo que se admite sea BLANCA y no una lista de lo que se rechaza:
 *
 * - **Ninguna entrada puede salir de la carpeta de destino.** Es el «zip slip» de siempre:
 *   una entrada llamada `../../.ssh/authorized_keys` escribe donde le da la gana. Se exige
 *   una ruta relativa de segmentos llanos, y cualquier otra cosa —`..`, una absoluta, una
 *   con `\` (que en Windows ES separador), una con dos puntos de unidad, un byte nulo— se
 *   rechaza. No se «normaliza» nada: normalizar es interpretar, e interpretar es donde
 *   aparecen los agujeros.
 * - **Tres topes, y los tres son contra un zip BOMBA**: cuánto ocupa descomprimido, cuántas
 *   entradas trae y cuánto ocupa la mayor. Un `.zip` de cien kilobytes puede descomprimirse
 *   en gigabytes, y el tope del cuerpo HTTP no lo ve.
 * - **Tiene que traer un `SKILL.md`**, porque sin él no es una skill: sería una carpeta de
 *   ficheros sueltos que el modelo no puede descubrir.
 *
 * Y el NOMBRE no se pregunta: se DEDUCE, y si no vale se dice cuál valdría. Un campo más en
 * la ventana para algo que el propio `.zip` ya contesta es una pregunta que no lo es.
 */

import { motivoDeNombreDeSkillInaceptable, nombreDeSkillSugerido } from "./skills.js";

/** Lo que ocupa el `.zip` que se sube, en bytes. Es el tope del cuerpo HTTP. */
export const TOPE_DEL_ZIP = 8 * 1024 * 1024;

/** Lo que puede ocupar DESCOMPRIMIDO. El de arriba no lo ve: un zip bomba cabe en nada. */
export const TOPE_DESCOMPRIMIDO = 32 * 1024 * 1024;

/** Cuántos ficheros puede traer. Una skill son unas decenas; mil es otra cosa. */
export const TOPE_DE_ENTRADAS = 500;

/** Una entrada del `.zip`, ya descomprimida por quien sabe hacerlo. */
export interface EntradaDeZip {
  /** La ruta tal como viene DENTRO del zip, sin tocar. */
  ruta: string;
  bytes: number;
}

/** Lo que hay que escribir, y con qué nombre. */
export interface PlanDeInstalacion {
  /** El nombre de la carpeta que queda: un slug. */
  nombre: string;
  /** Las rutas ACEPTADAS, relativas a la carpeta de la skill y con `/`. */
  ficheros: string[];
  /** Cuántos segmentos hay que quitarle a cada ruta del zip. 0 o 1. */
  prefijo: string;
}

/**
 * ¿Esta ruta de dentro del zip se puede escribir bajo una carpeta?
 *
 * Lista BLANCA de forma, no un `startsWith` ni un `includes("..")`: es la misma postura que
 * `esRutaDeArtefacto`. Se admite una sucesión de segmentos llanos separados por `/`, y nada
 * más — así lo que no se entiende queda FUERA por omisión en vez de colarse por el hueco que
 * no se pensó.
 */
export function rutaDeZipAceptable(ruta: string): boolean {
  if (ruta === "" || ruta.length > 255) return false;
  // Un byte nulo trunca la ruta en las capas de C de debajo: lo que el chequeo ve y lo que
  // el sistema abre dejarían de ser lo mismo.
  if (ruta.includes("\0")) return false;
  // `\` es separador en Windows, así que una entrada con él no es un segmento llano aquí.
  if (ruta.includes("\\")) return false;
  // Absoluta, o con unidad: `/etc/passwd`, `C:/…`.
  if (ruta.startsWith("/") || /^[A-Za-z]:/.test(ruta)) return false;
  const segmentos = ruta.split("/");
  return segmentos.every((s) => s !== "" && s !== "." && s !== ".." && !/^\s|\s$/.test(s));
}

/**
 * El único segmento de primer nivel que comparten TODAS las entradas, si lo hay.
 *
 * Exportada porque `agent/dispositivos/descargaDeHerramientas.ts` necesita la MISMA
 * pregunta —¿este zip trae una sola carpeta envolvente?— para el JDK y las cmdline-tools de
 * Android, que hay que renombrar a una ruta fija tras descomprimir: una segunda copia de esto
 * es donde divergiría en silencio.
 */
export function carpetaComun(rutas: readonly string[]): string | undefined {
  const primeros = new Set(rutas.map((r) => r.split("/")[0] ?? ""));
  if (primeros.size !== 1) return undefined;
  const unico = [...primeros][0]!;
  // Solo cuenta como carpeta envolvente si TODAS cuelgan de ella: un zip con un solo
  // fichero en la raíz no tiene carpeta que quitar.
  return rutas.every((r) => r.startsWith(`${unico}/`)) ? unico : undefined;
}

/**
 * Decide qué se instala y cómo se va a llamar. Devuelve el motivo si no se puede, nunca lanza.
 *
 * `nombreDelFichero` es el nombre del `.zip` que subió la persona, y solo se usa cuando el
 * zip trae el `SKILL.md` en su raíz — o sea, cuando no hay carpeta dentro de la que sacar el
 * nombre. Es lo que la persona ve en su disco, así que es lo que menos la sorprende.
 */
export function planDeInstalacion(
  entradas: readonly EntradaDeZip[],
  nombreDelFichero: string
): PlanDeInstalacion | { error: string } {
  if (entradas.length === 0) return { error: "el .zip está vacío" };
  if (entradas.length > TOPE_DE_ENTRADAS) {
    return { error: `el .zip trae más de ${TOPE_DE_ENTRADAS} ficheros: eso no es una skill` };
  }

  const mala = entradas.find((e) => !rutaDeZipAceptable(e.ruta));
  if (mala !== undefined) {
    // El nombre de la entrada NO se devuelve: lo eligió quien empaquetó el zip, y esto se
    // pinta en la ventana de alguien. Se dice QUÉ pasa, que es lo accionable.
    return { error: "el .zip trae una ruta que se sale de su carpeta, y no se instala" };
  }

  const total = entradas.reduce((suma, e) => suma + e.bytes, 0);
  if (total > TOPE_DESCOMPRIMIDO) {
    return { error: "el .zip ocupa demasiado descomprimido" };
  }

  const prefijo = carpetaComun(entradas.map((e) => e.ruta));
  const ficheros =
    prefijo === undefined ? entradas.map((e) => e.ruta) : entradas.map((e) => e.ruta.slice(prefijo.length + 1));

  if (!ficheros.includes("SKILL.md")) {
    return { error: "el .zip no trae ningún SKILL.md: sin él no es una skill" };
  }

  const crudo = prefijo ?? nombreDelFichero.replace(/\.zip$/i, "");
  const motivo = motivoDeNombreDeSkillInaceptable(crudo);
  if (motivo !== undefined) {
    const sugerido = nombreDeSkillSugerido(crudo);
    return {
      error:
        sugerido === undefined
          ? `«${crudo}» no vale como nombre de skill: ${motivo}`
          : `«${crudo}» no vale como nombre de skill (${motivo}): renombra el .zip o su carpeta a «${sugerido}»`,
    };
  }

  return { nombre: crudo, ficheros, prefijo: prefijo === undefined ? "" : `${prefijo}/` };
}
