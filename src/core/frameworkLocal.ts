import { compararVersiones, esVersionPosterior } from "./byxone.js";

/**
 * Las reglas PURAS de la copia LOCAL del framework de Android: qué se guarda de cada APK bajado, cuál
 * se elige por omisión y qué se ofrece al instalar. El disco es `agent/dispositivos/frameworkEnDisco.ts`.
 *
 * **Una versión se identifica por su sha256, nunca por su título ni por el id del catálogo.** Una
 * revisión del catálogo CONSERVA su `Id` y pasa a apuntar a otro fichero (`esAlta: false`), así que
 * «ya la tengo» con el mismo título o el mismo id del catálogo afirmaría tener lo que no se tiene.
 * Con el catálogo delante, la equivalencia es el `ficheroId` —el id del FICHERO, que cambia con cada
 * subida— y, cuando se sabe, su sha.
 *
 * **Lo local manda.** Si hay alguna versión bajada, la más nueva de ellas es la que se elige por
 * omisión para un aparato nuevo: se instala sin red y sin credencial. Las del catálogo se ofrecen
 * detrás, para quien quiera otra.
 */

/** El paquete que tienen fijo los scripts de `xone-hotswap`: otro APK no se instala. */
export const PAQUETE_DEL_FRAMEWORK = "com.xone.android.framework";

/** Una entrada del índice local (`~/.xonecode/frameworks/indice.json`). */
export interface FrameworkLocal {
  /** El nombre de la versión, el `CatTitle` del catálogo (`v5.0.5.8rel`). */
  titulo: string;
  /** El id del FICHERO en byXOne, no el de la entrada del catálogo. */
  ficheroId: number;
  /** sha256 hexadecimal en minúscula, comprobado al bajarlo. Es la identidad y el nombre en disco. */
  sha256: string;
  bytes: number;
  /** ISO-8601, cuándo se bajó. */
  bajado: string;
  /** El paquete leído del manifiesto del APK. */
  paquete: string;
}

/** Una versión que ofrece el catálogo, ya filtrada a Android y Frame. */
export interface FrameworkDelCatalogo {
  titulo: string;
  ficheroId: number;
  sha256?: string;
  bytes?: number;
}

/**
 * Cuánto vale la foto del catálogo para decir «hay un framework más nuevo» en el veredicto de Ejecutar
 * (15 min): pasada, se pide otra en segundo plano. El selector siempre pide una nueva.
 */
export const VIGENCIA_DEL_CATALOGO_MS = 15 * 60_000;

/** Lo que se ofrece al instalar: primero las locales, después las del catálogo que no se tengan. */
export type OpcionDeInstalacion =
  | { origen: "local"; titulo: string; sha256: string; bytes: number; preferida: boolean }
  | { origen: "catalogo"; titulo: string; ficheroId: number; bytes?: number; preferida: boolean };

/** La elección que viaja de vuelta: nunca una URL, siempre algo de la última lista servida. */
export type EleccionDeFramework = { local: string } | { catalogo: number };

/** Las locales de más nueva a más vieja. Mismo orden que el catálogo; a igual título, la última bajada. */
export function ordenarLocales(locales: readonly FrameworkLocal[]): FrameworkLocal[] {
  return [...locales].sort((a, b) => compararVersiones(a.titulo, b.titulo) || b.bajado.localeCompare(a.bajado));
}

/** La que se elige por omisión: la más nueva de las locales, o ninguna. */
export function versionPreferida(locales: readonly FrameworkLocal[]): FrameworkLocal | undefined {
  return ordenarLocales(locales)[0];
}

/** ¿Esta versión del catálogo ya está en local? Por el fichero (y su sha si se sabe), nunca por el título. */
export function estaEnLocal(version: FrameworkDelCatalogo, locales: readonly FrameworkLocal[]): boolean {
  return locales.some((l) => (version.sha256 !== undefined ? l.sha256 === version.sha256.toLowerCase() : l.ficheroId === version.ficheroId));
}

/**
 * Lo que se enseña en el selector. Sin catálogo (sin credencial o sin red), solo las locales. Con
 * locales, la preferida es la local más nueva; sin ninguna, la más nueva del catálogo.
 */
export function opcionesDeInstalacion(
  locales: readonly FrameworkLocal[],
  catalogo?: readonly FrameworkDelCatalogo[]
): OpcionDeInstalacion[] {
  const ordenadas = ordenarLocales(locales);
  const opciones: OpcionDeInstalacion[] = ordenadas.map((l, i) => ({
    origen: "local",
    titulo: l.titulo,
    sha256: l.sha256,
    bytes: l.bytes,
    preferida: i === 0,
  }));
  const remotas = [...(catalogo ?? [])]
    .filter((v) => !estaEnLocal(v, locales))
    .sort((a, b) => compararVersiones(a.titulo, b.titulo));
  remotas.forEach((v, i) =>
    opciones.push({
      origen: "catalogo",
      titulo: v.titulo,
      ficheroId: v.ficheroId,
      ...(v.bytes === undefined ? {} : { bytes: v.bytes }),
      preferida: ordenadas.length === 0 && i === 0,
    })
  );
  return opciones;
}

/**
 * La versión a la que ACTUALIZAR un aparato que tiene `instalada`: la más nueva de las ofrecidas que
 * sea posterior por números (`esVersionPosterior`), o ninguna. A igual versión, la local (va antes en
 * `opciones`): se instala sin red. Sin `instalada` no hay actualización que proponer.
 */
export function actualizacionDisponible(
  opciones: readonly OpcionDeInstalacion[],
  instalada: string | undefined
): OpcionDeInstalacion | undefined {
  if (instalada === undefined) return undefined;
  const posteriores = opciones.filter((o) => esVersionPosterior(o.titulo, instalada));
  // `sort` es estable: entre dos del mismo título queda la que iba antes, la local.
  return [...posteriores].sort((a, b) => compararVersiones(a.titulo, b.titulo))[0];
}

/** ¿Esta elección está en la lista que se sirvió? Lo que no, no se instala. */
export function eleccionServida(eleccion: EleccionDeFramework, servidas: readonly OpcionDeInstalacion[]): OpcionDeInstalacion | undefined {
  return servidas.find((o) =>
    "local" in eleccion ? o.origen === "local" && o.sha256 === eleccion.local : o.origen === "catalogo" && o.ficheroId === eleccion.catalogo
  );
}

/** Por qué un APK no se instala por su paquete, o `undefined`. */
export function motivoDePaqueteInaceptable(paquete: string | undefined): string | undefined {
  if (paquete === undefined) return "no se pudo leer el paquete del APK, así que no se sabe qué se instalaría";
  if (paquete !== PAQUETE_DEL_FRAMEWORK) {
    return `el APK es «${paquete}» y no ${PAQUETE_DEL_FRAMEWORK}: instalarlo dejaría dos frameworks en el aparato, que se pelean por el puerto del canal`;
  }
  return undefined;
}

/** Lo que una línea de `adb install` dice al fallar, en una frase que dice qué hacer. */
export function motivoDeFalloDeInstalacion(salida: string): string {
  if (/INSTALL_FAILED_UPDATE_INCOMPATIBLE/.test(salida)) {
    return "el framework instalado está firmado con otra clave y Android no deja actualizarlo encima. Hay que desinstalarlo a mano (adb uninstall " +
      PAQUETE_DEL_FRAMEWORK + "), y eso BORRA los datos de las apps de ese aparato; XoneCode no lo hace solo.";
  }
  if (/INSTALL_FAILED_VERSION_DOWNGRADE/.test(salida)) {
    return "el aparato tiene una versión MÁS NUEVA que la elegida, y Android no baja de versión sin permiso explícito: elige otra o instala bajando de versión a propósito.";
  }
  if (/INSTALL_FAILED_INSUFFICIENT_STORAGE/.test(salida)) return "el aparato no tiene espacio para el APK.";
  if (/INSTALL_PARSE_FAILED|INSTALL_FAILED_INVALID_APK/.test(salida)) return "Android dice que el APK no es válido.";
  if (/INSTALL_FAILED_NO_MATCHING_ABIS/.test(salida)) return "el APK no trae código para la arquitectura de este aparato.";
  const linea = /Failure \[[^\]]*\]/.exec(salida)?.[0] ?? salida.trim().split(/\r?\n/).pop() ?? "";
  return linea === "" ? "adb install falló sin decir por qué." : `adb install falló: ${linea}`;
}

/**
 * El `versionName` de la salida de `adb shell dumpsys package <paquete>`, o `undefined`. Con una app
 * de sistema actualizada salen DOS bloques (la instalada y la de fábrica): manda el primero, que es el
 * de la versión en uso.
 */
export function versionDeDumpsys(salida: string): string | undefined {
  const m = /^\s*versionName=(\S+)\s*$/m.exec(salida);
  return m?.[1];
}

/** La tool del agente que instala el framework en el aparato de la sesión. */
export const NOMBRE_INSTALAR_FRAMEWORK = "instalar_framework";

/**
 * Quién la recibe: quien EJECUTA en el aparato (el conductor) y quien lo llama en su bucle (el
 * desarrollador). Regla de DATO, no un nombre. Solo `motor: "modelo"`: un externo no recibe tools propias.
 */
export function recibeInstalarFramework(a: { ejecucion?: boolean; llama?: string[] }): boolean {
  return a.ejecucion === true || (a.llama ?? []).length > 0;
}
