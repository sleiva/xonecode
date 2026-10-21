/**
 * La copia LOCAL del framework de Android: `~/.xonecode/frameworks/`, con un APK por versión
 * (`<sha256>.apk`) y un `indice.json` con lo que se sabe de cada uno. Las reglas —cuál se prefiere,
 * qué se ofrece, qué paquete vale— son puras y viven en `core/frameworkLocal.ts`; aquí solo el disco.
 *
 * **El nombre en disco es el sha256**, no el título: una revisión del catálogo conserva el título y
 * cambia el fichero, y dos APK distintos con el mismo nombre se pisarían. Con el sha, «ya lo tengo»
 * es literalmente «este fichero existe».
 *
 * **El índice se cruza con el disco al leerlo**: una entrada cuyo APK ya no está no se ofrece. Lo
 * contrario —un APK sin entrada— no se adopta: sin su ficha no se sabe qué versión es.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import type { FrameworkLocal } from "../../core/frameworkLocal.js";
import { paqueteDelManifiesto } from "../../core/manifiestoApk.js";

export const CARPETA_DE_FRAMEWORKS = "frameworks";
const INDICE = "indice.json";
const SHA = /^[0-9a-f]{64}$/;

export function carpetaDeFrameworks(casa: string = homedir()): string {
  return join(casa, ".xonecode", CARPETA_DE_FRAMEWORKS);
}

export function rutaDeApk(sha256: string, casa?: string): string {
  if (!SHA.test(sha256)) throw new Error("sha256 inválido");
  return join(carpetaDeFrameworks(casa), `${sha256}.apk`);
}

/** Lo que está en el índice Y en el disco. Un índice roto o ausente es «no hay ninguna», nunca un error. */
export function leerFrameworksLocales(casa?: string, existe: (ruta: string) => boolean = existsSync): FrameworkLocal[] {
  return leerIndice(casa).filter((f) => existe(rutaDeApk(f.sha256, casa)));
}

/** Anota una versión ya comprobada y con su APK en sitio. Reemplaza la entrada del mismo sha. */
export function anotarFrameworkLocal(entrada: FrameworkLocal, casa?: string): void {
  const resto = leerIndice(casa).filter((f) => f.sha256 !== entrada.sha256);
  const carpeta = carpetaDeFrameworks(casa);
  mkdirSync(carpeta, { recursive: true });
  const ruta = join(carpeta, INDICE);
  const temporal = `${ruta}.${process.pid}.tmp`;
  writeFileSync(temporal, JSON.stringify({ version: 1, frameworks: [...resto, entrada] }, null, 2) + "\n");
  renameSync(temporal, ruta);
}

function leerIndice(casa?: string): FrameworkLocal[] {
  try {
    const crudo = JSON.parse(readFileSync(join(carpetaDeFrameworks(casa), INDICE), "utf8")) as { frameworks?: unknown };
    if (!Array.isArray(crudo.frameworks)) return [];
    return crudo.frameworks.filter(esEntrada);
  } catch {
    return [];
  }
}

function esEntrada(x: unknown): x is FrameworkLocal {
  const e = x as Partial<FrameworkLocal> | null;
  return (
    typeof e === "object" && e !== null &&
    typeof e.titulo === "string" && typeof e.ficheroId === "number" && typeof e.sha256 === "string" && SHA.test(e.sha256) &&
    typeof e.bytes === "number" && typeof e.bajado === "string" && typeof e.paquete === "string"
  );
}

/**
 * El paquete de un APK en disco, leído de su manifiesto binario. Solo se DESCOMPRIME esa entrada,
 * pero el zip se lee entero (un APK del framework son decenas de MB: cabe de sobra).
 */
export function paqueteDeApk(ruta: string): string | undefined {
  try {
    const entradas = unzipSync(readFileSync(ruta), { filter: (f) => f.name === "AndroidManifest.xml" });
    const manifiesto = entradas["AndroidManifest.xml"];
    return manifiesto === undefined ? undefined : paqueteDelManifiesto(manifiesto);
  } catch {
    return undefined;
  }
}

/** Borra un fichero sin quejarse si ya no está: limpieza de un temporal o de una descarga mala. */
export function borrarSiExiste(ruta: string): void {
  try {
    rmSync(ruta, { force: true });
  } catch {
    // Nada que hacer: un resto en la carpeta de frameworks no se ofrece (no está en el índice).
  }
}
