/**
 * Lo que deepagents RECORTA de un resultado de tool antes de meterlo en el contexto, en TrueForge.
 *
 * Medido en una sesión real de MyAllXOne con la MISMA petición («lanza la app en el emulador»):
 * TrueForge gastó 510k de entrada y deepagents 227k, con un número de tools parecido. La diferencia
 * no estaba en el motor sino en lo que cada resultado DEJABA en el contexto: el `FilesystemMiddleware`
 * de deepagents hace tres cosas que el adaptador de TrueForge no hacía, y un resultado que entra
 * entero se vuelve a mandar en CADA llamada siguiente de ese hilo.
 *
 * 1. **Desaloja** lo que pasa de `toolTokenLimitBeforeEvict` tokens (a 4 caracteres por token) en
 *    `execute` y en las tools que no son de fichero: lo escribe en `/large_tool_results/` y al
 *    modelo le llega la ruta y un extracto de cabeza y cola. Las de fichero no se desalojan —ya
 *    paginan—, igual que en la librería.
 * 2. **Trunca** `ls`, `glob` y `grep` por encima de 80.000 caracteres.
 * 3. **Topa** `grep` en `grepMaxCount` coincidencias.
 *
 * Los VALORES son los nuestros de deepagents (`OPCIONES_BUSQUEDA_FICHEROS`), no una copia: dos
 * motores con dos umbrales serían dos gastos que no se pueden comparar.
 */
import { OPCIONES_BUSQUEDA_FICHEROS } from "../../grafo/opcionesDeFicheros.js";

/** Por encima de esto `ls`/`glob`/`grep` se truncan (el `truncateIfTooLong` de deepagents). */
export const CARACTERES_ANTES_DE_TRUNCAR = 80_000;
/** Lo que se conserva al truncar: 20.000 tokens a 4 caracteres, como la librería. */
const CARACTERES_TRAS_TRUNCAR = 20_000 * 4;
export const AVISO_DE_TRUNCADO = "\n... [resultados truncados: afina el patrón o la ruta]";

/** Por encima de esto un resultado de `execute` o de una tool propia se desaloja del contexto. */
export const CARACTERES_ANTES_DE_DESALOJAR = OPCIONES_BUSQUEDA_FICHEROS.toolTokenLimitBeforeEvict * 4;
export const MAXIMO_DE_COINCIDENCIAS = OPCIONES_BUSQUEDA_FICHEROS.grepMaxCount;

export function truncarSiLargo(texto: string): string {
  return texto.length > CARACTERES_ANTES_DE_TRUNCAR ? texto.slice(0, CARACTERES_TRAS_TRUNCAR) + AVISO_DE_TRUNCADO : texto;
}

const numerar = (lineas: readonly string[], desde: number): string =>
  lineas.map((l, i) => `${String(desde + i).padStart(6)}\t${l.slice(0, 1000)}`).join("\n");

/** Cabeza y cola numeradas, con cuántas líneas se saltan en medio (`createContentPreview`). */
export function vistaPrevia(texto: string, cabeza = 5, cola = 5): string {
  const lineas = texto.split("\n");
  if (lineas.length <= cabeza + cola) return numerar(lineas, 1);
  return [
    numerar(lineas.slice(0, cabeza), 1),
    `... [${lineas.length - cabeza - cola} líneas omitidas] ...`,
    numerar(lineas.slice(-cola), lineas.length - cola + 1),
  ].join("\n");
}

/** Lo que hace falta del backend para desalojar: escribir en la ruta virtual. */
export interface EscritorDeDesalojo {
  write(ruta: string, contenido: string): unknown;
}

let secuencia = 0;

/**
 * El texto que VE el modelo: el mismo si cabe, o la ruta donde quedó y un extracto si no. Si no
 * se puede guardar —sin carpeta de artefactos no hay dónde colgar `/large_tool_results/`, y la
 * guarda del proyecto lo rechaza, como debe— se dice y va el extracto igual: meter el resultado
 * entero es justo lo que esto evita.
 */
export async function desalojarSiGrande(texto: string, backend: EscritorDeDesalojo): Promise<string> {
  if (texto.length <= CARACTERES_ANTES_DE_DESALOJAR) return texto;
  const ruta = `/large_tool_results/tf-${Date.now()}-${++secuencia}.txt`;
  let error: string | undefined;
  try {
    const r = (await backend.write(ruta, texto)) as { error?: string } | undefined;
    error = r?.error;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const extracto = vistaPrevia(texto);
  if (error !== undefined) {
    return `Resultado demasiado grande (${texto.length} caracteres) y no se pudo guardar aparte (${error}). Extracto:\n\n${extracto}`;
  }
  return (
    `Resultado demasiado grande (${texto.length} caracteres): se guardó en ${ruta}. Léelo con read_file por ` +
    `partes (offset y limit), no entero. Extracto de cabeza y cola:\n\n${extracto}`
  );
}
