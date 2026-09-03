/**
 * Extracción del ZIP que devuelve CloudStudio.
 *
 * `fflate` es JS puro: no hay binario nativo que compilar ni `unzip` del sistema que
 * falte en Windows, y la suite puede fabricar un ZIP en el propio test sin red.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { unzipSync } from "fflate";

/**
 * La guarda de *zip slip*: una entrada con `../` o absoluta escribiría fuera de la raíz.
 * Se comprueba sobre la ruta YA resuelta, porque comparar cadenas antes de resolver deja
 * pasar `a/../../x`. Se aborta entero: un ZIP que intenta esto no es de fiar en ninguna
 * de sus entradas.
 */
function destinoSeguro(raiz: string, entrada: string): string {
  const base = resolve(raiz);
  const destino = resolve(base, entrada);
  if (destino !== base && !destino.startsWith(base + sep)) {
    throw new Error(`«${entrada}» apunta fuera de la raíz del proyecto; no se extrae nada`);
  }
  return destino;
}

/** Devuelve las rutas escritas, relativas y en POSIX (las del manifiesto y las de MCP). */
export function extraerZipBase64(base64: string, raiz: string): string[] {
  let entradas: Record<string, Uint8Array>;
  try {
    entradas = unzipSync(new Uint8Array(Buffer.from(base64, "base64")));
  } catch (error) {
    // El mensaje no lleva el contenido: acaba en logs y en capturas de pantalla.
    throw new Error(`la descarga no es un ZIP válido (${(error as Error).message})`);
  }

  const escritas: string[] = [];
  const planificadas = Object.entries(entradas)
    // Las entradas de directorio vienen con barra final y sin contenido.
    .filter(([nombre]) => !nombre.endsWith("/"))
    .map(([nombre, datos]) => ({ nombre, datos, destino: destinoSeguro(raiz, nombre) }));

  // Se resuelven TODAS las rutas antes de escribir ninguna: si una es maliciosa, no
  // queda medio proyecto en disco.
  for (const { nombre, datos, destino } of planificadas) {
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, datos);
    escritas.push(nombre.split(sep).join("/"));
  }
  return escritas;
}
