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
export async function desalojarSiGrande(texto: string, backend: EscritorDeDesalojo, forzar = false): Promise<string> {
  if (!forzar && texto.length <= CARACTERES_ANTES_DE_DESALOJAR) return texto;
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

/**
 * **El presupuesto de un PASO**, que el recorte de arriba no ve: cada resultado se mira solo, así
 * que cinco `execute` en paralelo de 20.000 caracteres pasan uno a uno y juntos meten 100.000 en
 * el contexto. Es la regla del `largeToolResponse` de TrueForge, con su umbral (10.000 tokens),
 * portada y no montada: con los dos puestos la misma salida se procesaría dos veces.
 */
export const CARACTERES_DEL_PASO = 10_000 * 4;
/** Un error que haya que recortar se TRUNCA a esto en vez de desalojarse: ahí no hay nada que releer. */
export const CARACTERES_DE_UN_ERROR = 500;

/** Lo que se usa de un resultado de tool de TrueForge dentro de un `toolResponseProcessor`. */
export interface ResultadoDelPaso {
  message: { content: unknown };
  failure?: unknown;
  isStructuredContent?: boolean;
}

const textoDelResultado = (r: ResultadoDelPaso): string =>
  typeof r.message.content === "string" ? r.message.content : JSON.stringify(r.message.content ?? "");

function recortarError(r: ResultadoDelPaso, texto: string): void {
  if (texto.length <= CARACTERES_DE_UN_ERROR) return;
  r.message.content = `${texto.slice(0, CARACTERES_DE_UN_ERROR)}\n... [error truncado: ${texto.length} caracteres]`;
  r.isStructuredContent = false;
}

/**
 * Los resultados de UN paso, dentro del presupuesto: un error ENORME se trunca, y mientras el
 * total se pase se desalojan los mayores primero. Modifica los resultados, que es el contrato del
 * procesador de la librería; no quita ninguno (la librería lanza si falta uno).
 */
export async function recortarPaso(resultados: ResultadoDelPaso[], backend: EscritorDeDesalojo): Promise<void> {
  for (const r of resultados) {
    const texto = textoDelResultado(r);
    if (r.failure && texto.length > CARACTERES_ANTES_DE_DESALOJAR) recortarError(r, texto);
  }
  let total = resultados.reduce((suma, r) => suma + textoDelResultado(r).length, 0);
  const porTamano = [...resultados].sort((a, b) => textoDelResultado(b).length - textoDelResultado(a).length);
  for (const r of porTamano) {
    if (total <= CARACTERES_DEL_PASO) break;
    const antes = textoDelResultado(r);
    if (r.failure) recortarError(r, antes);
    else {
      r.message.content = await desalojarSiGrande(antes, backend, true);
      r.isStructuredContent = false;
    }
    total -= antes.length - textoDelResultado(r).length;
  }
}

/** El procesador que TrueForge llama con todos los resultados de un paso. */
export function presupuestoDelPaso(backend: EscritorDeDesalojo) {
  return {
    process: async (resultados: ResultadoDelPaso[]) => {
      await recortarPaso(resultados, backend);
      return {};
    },
  };
}
