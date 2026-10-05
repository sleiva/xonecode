/**
 * El agente lee y escribe un texto del proyecto en la codificación que YA tenía.
 *
 * `FilesystemBackend` de deepagents lee y escribe SIEMPRE en UTF-8 (`readFile(…, "utf-8")`,
 * `writeFile(…, "utf-8")`, medido en su código). Sobre un `.xne` Latin-1 de un proyecto XOne
 * antiguo eso es un bug mudo en dos tiempos: al LEER, cada tilde llega al modelo como «�»; al
 * EDITAR —que es leer-modificar-escribir del fichero entero— el fichero vuelve al disco en UTF-8
 * con U+FFFD en lugar de cada letra, aunque el cambio fuera en otra línea, y la tool contesta que
 * bien. Medido contra `backendDeAgente` antes de este arreglo (`codificacionDelProyecto.test.ts`).
 *
 * El arreglo vive en NUESTRA capa, como Proxy sobre el backend base, y solo toma el control cuando
 * hace falta; todo lo demás va al método original sin tocarlo:
 *
 * - LEER (`read`, y `readRaw`, que usa `regex_search`): un fichero que existe, normal (ni enlace ni
 *   carpeta), sin NUL, NO UTF-8 y que la librería trata como TEXTO se decodifica con SU tabla de 8
 *   bits (`core/codificacion.ts`: ISO-8859-15 si su prólogo lo declara, si no windows-1252, las
 *   mismas que la pestaña Ficheros) y se pagina como la librería.
 * - ESCRIBIR / EDITAR: la codificación la decide `codificacionParaEscribir`, la misma regla que el
 *   editor —lo que no es UTF-8 sigue en su tabla; un UTF-8 con tildes sigue en UTF-8; un ASCII puro
 *   o un fichero NUEVO siguen el `encoding=` que DECLARE lo que se escribe—. Lo último es toda
 *   colección nueva de la plantilla de la skill, que declara `iso-8859-15`: sin ello, sus tildes iban
 *   en UTF-8 bajo esa declaración. El ancla de `edit` se busca sobre el texto bien decodificado. Un
 *   carácter que no cabe se DEVUELVE como `{error}` —nunca se lanza: una excepción se lleva el turno
 *   y el agente no reintenta— y el disco no se toca.
 *
 * El sitio: el MÁS INTERNO de la pila de `backendDeAgente`, pegado al backend que toca bytes. Así
 * `sinContenidoInvalido` (que reconstruye el «después» leyendo por `read`) valida el texto de
 * verdad, y la cola de `escriturasEnSerie` sigue siendo la de fuera.
 *
 * **Límites declarados**: `grep` y `glob` siguen siendo los de la librería (un `grep` con tildes
 * no encuentra una línea Latin-1), igual que `xone_navegacion`, que lee el disco por su cuenta; y
 * el rechazo de un carácter que no cabe llega DESPUÉS de la aprobación, porque la tarjeta la pone
 * la librería antes de correr la tool (el mismo precedente que el rechazo de una reescritura).
 */
import { constants } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import { normalizeReadPagination } from "deepagents";
import {
  codificacionParaEscribir,
  codificar8Bits,
  decodificar8Bits,
  esUtf8Valido,
  nombreDeTabla,
  tablaDeLosBytes,
  type Tabla8Bits,
} from "../../core/codificacion.js";

/** La misma ventana que la lectura de Ficheros para olfatear un binario: un NUL ahí y no es texto. */
const VENTANA_DE_BINARIO = 8000;

/** En Windows no existe `O_NOFOLLOW`; el `lstat` previo es entonces la única guarda, como en la librería. */
const SIN_SEGUIR_ENLACES = constants.O_NOFOLLOW ?? 0;

/** El modo con que la librería crea un fichero nuevo (`FilesystemBackend.write`). */
const MODO_DE_FICHERO_NUEVO = 0o644;

type Metodo = (...args: unknown[]) => Promise<unknown>;

/** Lo que hay en la ruta, visto antes de decidir. `delegar` es cualquier duda: lo contesta la librería. */
type Inspeccion =
  | { tipo: "delegar" }
  | { tipo: "nuevo"; real: string }
  | { tipo: "existe"; real: string; bytes: Buffer; utf8: boolean };

/** Un fichero de 8 bits al que hay que atender a mano. */
interface FicheroDe8Bits {
  real: string;
  texto: string;
  tabla: Tabla8Bits;
  /** El que la librería le da por extensión, para que `read` conteste lo mismo que ella. */
  mimeType: unknown;
}

export function conCodificacionDelFichero<T extends object>(backend: T): T {
  const original = (prop: string): Metodo => {
    const m = Reflect.get(backend, prop, backend) as Metodo;
    return m.bind(backend);
  };

  /**
   * Qué hay en la ruta. Cualquier duda —ruta que no resuelve, enlace, carpeta, NUL, un error al
   * leer— es `delegar`: lo que la librería contestaría hoy.
   */
  async function inspeccionar(ruta: unknown): Promise<Inspeccion> {
    if (typeof ruta !== "string") return { tipo: "delegar" };
    let real: string;
    try {
      // `resolvePath` es de la propia librería (protegido en sus tipos, normal en ejecución): el
      // mismo confinamiento de `virtualMode` que usarían sus métodos.
      real = (backend as unknown as { resolvePath(r: string): string }).resolvePath(ruta);
    } catch {
      return { tipo: "delegar" };
    }
    try {
      const info = await lstat(real);
      if (!info.isFile()) return { tipo: "delegar" };
      const fh = await open(real, constants.O_RDONLY | SIN_SEGUIR_ENLACES);
      let bytes: Buffer;
      try {
        bytes = await fh.readFile();
      } finally {
        await fh.close();
      }
      if (bytes.subarray(0, VENTANA_DE_BINARIO).includes(0)) return { tipo: "delegar" };
      return { tipo: "existe", real, bytes, utf8: esUtf8Valido(bytes) };
    } catch (e) {
      return (e as NodeJS.ErrnoException)?.code === "ENOENT" ? { tipo: "nuevo", real } : { tipo: "delegar" };
    }
  }

  /**
   * Binario o texto lo decide la LIBRERÍA (por extensión), preguntándole a ella y no con una copia
   * de su tabla: una imagen casi nunca es UTF-8 válido, y tomarla por Latin-1 haría que `write`
   * codificara su base64 como texto en vez de decodificarlo. Devuelve el `mimeType` del texto.
   */
  async function sondaDeTexto(ruta: string): Promise<{ mimeType: unknown } | undefined> {
    try {
      const sonda = (await original("read")(ruta, 0, 0)) as { content?: unknown; mimeType?: unknown };
      return ArrayBuffer.isView(sonda?.content) ? undefined : { mimeType: sonda?.mimeType };
    } catch {
      return undefined;
    }
  }

  /** ¿Es un texto de 8 bits que la librería estropearía al LEER? Si no, se delega. */
  async function de8Bits(ruta: unknown): Promise<FicheroDe8Bits | undefined> {
    const i = await inspeccionar(ruta);
    if (i.tipo !== "existe" || i.utf8) return undefined;
    const sonda = await sondaDeTexto(ruta as string);
    if (sonda === undefined) return undefined;
    const tabla = tablaDeLosBytes(i.bytes);
    const texto = decodificar8Bits(i.bytes, tabla);
    // Un texto en blanco lo contesta la librería con su aviso de fichero vacío.
    if (texto.trim() === "") return undefined;
    return { real: i.real, texto, tabla, mimeType: sonda.mimeType };
  }

  /** Lo de la librería, línea a línea (`FilesystemBackend.read`), sobre el texto bien decodificado. */
  function paginar(texto: string, offset: unknown, limit: unknown, mimeType: unknown): Record<string, unknown> {
    const { offset: desde, limit: cuantas } = normalizeReadPagination(
      typeof offset === "number" ? offset : 0,
      typeof limit === "number" ? limit : 500
    );
    const lineas = texto.split("\n");
    const total = lineas[lineas.length - 1] === "" ? lineas.length - 1 : lineas.length;
    const corte = Math.min(desde + cuantas, lineas.length);
    const fin = Math.min(desde + cuantas, total);
    if (desde >= total) return { error: `Line offset ${desde} exceeds file length (${total} lines)` };
    const elegidas = lineas.slice(desde, corte);
    if (elegidas.length === 0 || cuantas === 0) return { content: elegidas.join("\n"), mimeType };
    return {
      content: elegidas.join("\n"),
      mimeType,
      totalLines: total,
      startLine: desde + 1,
      endLine: fin,
      nextOffset: fin < total ? fin : undefined,
    };
  }

  /**
   * Codifica con `tabla` y escribe como la librería (`O_TRUNC` sin seguir enlaces; uno nuevo con su
   * carpeta y su modo), o devuelve el motivo sin tocar el disco.
   */
  async function escribir(real: string, ruta: string, texto: string, tabla: Tabla8Bits, nuevo: boolean): Promise<{ error: string } | undefined> {
    const r = codificar8Bits(texto, tabla);
    if (!("bytes" in r)) return { error: motivoDeNoRepresentable(ruta, r.caracter, r.linea, tabla) };
    if (nuevo) await mkdir(dirname(real), { recursive: true });
    const banderas = constants.O_WRONLY | constants.O_TRUNC | SIN_SEGUIR_ENLACES | (nuevo ? constants.O_CREAT : 0);
    const fh = await open(real, banderas, MODO_DE_FICHERO_NUEVO);
    try {
      await fh.writeFile(r.bytes);
    } finally {
      await fh.close();
    }
    return undefined;
  }

  const propios: Record<string, Metodo> = {
    async read(ruta, offset, limit) {
      const f = await de8Bits(ruta);
      if (f === undefined) return original("read")(ruta, offset, limit);
      return paginar(f.texto, offset, limit, f.mimeType);
    },
    /** Lo usa `regex_search` (`busquedaRegex.ts`): sin esto buscaría sobre «�». */
    async readRaw(ruta) {
      const f = await de8Bits(ruta);
      const r = (await original("readRaw")(ruta)) as { data?: Record<string, unknown> } & Record<string, unknown>;
      if (f === undefined || r?.data === undefined || typeof r.data["content"] !== "string") return r;
      return { ...r, data: { ...r.data, content: f.texto } };
    },
    async write(ruta, contenido) {
      if (typeof contenido !== "string") return original("write")(ruta, contenido);
      const i = await inspeccionar(ruta);
      if (i.tipo === "delegar") return original("write")(ruta, contenido);
      // Un existente que no es UTF-8 tiene que ser TEXTO para la librería: un PNG no se toca.
      if (i.tipo === "existe" && !i.utf8 && (await sondaDeTexto(ruta as string)) === undefined) {
        return original("write")(ruta, contenido);
      }
      const destino = codificacionParaEscribir(i.tipo === "existe" ? i.bytes : undefined, contenido);
      if (destino === "utf-8") return original("write")(ruta, contenido);
      try {
        const fallo = await escribir(i.real, ruta as string, contenido, destino, i.tipo === "nuevo");
        return fallo ?? { path: ruta, filesUpdate: null };
      } catch (e) {
        return { error: `Error writing file '${String(ruta)}': ${codigoDe(e)}` };
      }
    },
    async edit(ruta, viejo, nuevo, todas) {
      const delegar = () => original("edit")(ruta, viejo, nuevo, todas);
      if (typeof viejo !== "string" || typeof nuevo !== "string") return delegar();
      const i = await inspeccionar(ruta);
      if (i.tipo !== "existe") return delegar();
      let texto: string;
      if (i.utf8) {
        // Un UTF-8 con tildes se queda en UTF-8: la librería lo hace bien. Solo un ASCII puro puede
        // acabar en 8 bits, si lo que queda DECLARA una tabla de 8 bits.
        if (i.bytes.some((b) => b >= 0x80)) return delegar();
        texto = i.bytes.toString("latin1");
      } else {
        if ((await sondaDeTexto(ruta as string)) === undefined) return delegar();
        texto = decodificar8Bits(i.bytes, tablaDeLosBytes(i.bytes));
      }
      const r = reemplazar(texto, viejo, nuevo, todas === true);
      if (typeof r === "string") return { error: r };
      const destino = codificacionParaEscribir(i.bytes, r[0]);
      if (destino === "utf-8") return delegar();
      try {
        const fallo = await escribir(i.real, ruta as string, r[0], destino, false);
        return fallo ?? { path: ruta, filesUpdate: null, occurrences: r[1] };
      } catch (e) {
        return { error: `Error editing file '${String(ruta)}': ${codigoDe(e)}` };
      }
    },
  };

  return new Proxy(backend, {
    get(destino, prop) {
      // Contra el OBJETIVO, no contra el proxy: `LocalShellBackend.id` es un getter sobre un campo
      // privado y leerlo con el proxy de receptor lanza al MONTAR el `CompositeBackend`.
      const valor = Reflect.get(destino, prop, destino);
      if (typeof valor !== "function") return valor;
      if (typeof prop === "string" && prop in propios) return propios[prop];
      return (valor as (...a: unknown[]) => unknown).bind(destino);
    },
  }) as T;
}

/**
 * Lo que el agente lee cuando su texto no cabe. Le dice qué hacer en lugar de solo «no»: en un XML
 * la entidad numérica es el mismo carácter para XOne; en JavaScript, el escape `\u`; en CSS, `\XX `.
 */
export function motivoDeNoRepresentable(ruta: string, caracter: string, linea: number, tabla: Tabla8Bits = "windows-1252"): string {
  const punto = caracter.codePointAt(0)!;
  const js = /\.js$/i.test(ruta);
  // En JavaScript, por unidades UTF-16 (`😀` para un emoji): el runtime de XOne es ES5 y
  // no entiende `\u{…}`.
  const escape = Array.from({ length: caracter.length }, (_, i) =>
    `\\u${caracter.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0")}`
  ).join("");
  // En CSS, el escape de barra con el code point en hexadecimal y un espacio que lo cierra.
  const css = /\.css$/i.test(ruta);
  const alternativa = js
    ? `el escape ${escape}`
    : css
      ? `el escape CSS \\${punto.toString(16).toUpperCase()} (con un espacio detrás)`
      : `la entidad &#${punto};`;
  return `este fichero está en ${nombreDeTabla(tabla)} y «${caracter}» (línea ${linea}) no cabe en esa codificación: no se ha escrito nada. Usa solo caracteres ${nombreDeTabla(tabla)}, o ${alternativa}`;
}

/**
 * El reemplazo de la librería (`performStringReplacement`, que no exporta), con sus MISMOS
 * mensajes: el modelo tiene que leer lo mismo sea cual sea la codificación del fichero.
 */
function reemplazar(texto: string, viejo: string, nuevo: string, todas: boolean): [string, number] | string {
  if (texto === "" && viejo === "") return [nuevo, 0];
  if (viejo === "") return "Error: oldString cannot be empty when file has content";
  const veces = texto.split(viejo).length - 1;
  if (veces === 0) return `Error: String not found in file: '${viejo}'`;
  if (veces > 1 && !todas) {
    return `Error: String '${viejo}' has multiple occurrences (appears ${veces} times) in file. Use replace_all=True to replace all instances, or provide a more specific string with surrounding context.`;
  }
  return [texto.split(viejo).join(nuevo), veces];
}

/** Solo el `code` de un error de Node: su mensaje lleva la ruta absoluta de la máquina. */
function codigoDe(e: unknown): string {
  const code = (e as NodeJS.ErrnoException)?.code;
  return code === undefined ? "no se pudo escribir" : code;
}
