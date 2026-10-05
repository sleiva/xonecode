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
 * hace falta: un fichero que EXISTE, normal (ni enlace ni carpeta), sin NUL, cuyos bytes NO son
 * UTF-8 y que la librería trata como TEXTO. Todo lo demás —UTF-8, nuevo, imagen, ruta rara— va al
 * método original sin tocarlo, así que no hay regresión posible fuera de ese caso.
 *
 * - LEER: se decodifica con el MISMO `TextDecoder("latin1")` que la pestaña Ficheros
 *   (`core/codificacion.ts`) y se pagina como la librería.
 * - ESCRIBIR / EDITAR: el resultado se codifica en windows-1252 con el codificador inverso de esa
 *   misma tabla. El ancla de `edit` se busca sobre el texto bien decodificado. Un carácter que no
 *   cabe se DEVUELVE como `{error}` —nunca se lanza: una excepción se lleva el turno y el agente no
 *   reintenta— y el disco no se toca.
 *
 * El sitio: el MÁS INTERNO de la pila de `backendDeAgente`, pegado al backend que toca bytes. Así
 * `sinContenidoInvalido` (que reconstruye el «después» leyendo por `read`) valida el texto de
 * verdad, y la cola de `escriturasEnSerie` sigue siendo la de fuera.
 *
 * **Límites declarados**: `grep` y `glob` siguen siendo los de la librería (un `grep` con tildes
 * no encuentra una línea Latin-1), igual que las tools propias que leen el disco por su cuenta;
 * un fichero Latin-1 que hoy es ASCII puro ES UTF-8 válido, así que su primera tilde se escribe en
 * UTF-8; y la tabla es windows-1252, no ISO-8859-15: un «€» nuevo va como 0x80, no como 0xA4.
 */
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { normalizeReadPagination } from "deepagents";
import { codificarWindows1252, decodificarWindows1252, esUtf8Valido } from "../../core/codificacion.js";

/** La misma ventana que la lectura de Ficheros para olfatear un binario: un NUL ahí y no es texto. */
const VENTANA_DE_BINARIO = 8000;

/** En Windows no existe `O_NOFOLLOW`; el `lstat` previo es entonces la única guarda, como en la librería. */
const SIN_SEGUIR_ENLACES = constants.O_NOFOLLOW ?? 0;

type Metodo = (...args: unknown[]) => Promise<unknown>;

/** El fichero Latin-1 al que hay que atender a mano, o `undefined` para delegar en la librería. */
interface FicheroLatin1 {
  real: string;
  texto: string;
  /** El que la librería le da por extensión, para que `read` conteste lo mismo que ella. */
  mimeType: unknown;
}

export function conCodificacionDelFichero<T extends object>(backend: T): T {
  const original = (prop: string): Metodo => {
    const m = Reflect.get(backend, prop, backend) as Metodo;
    return m.bind(backend);
  };

  /**
   * ¿Es un texto Latin-1 que la librería estropearía? Cualquier duda —ruta que no resuelve, no
   * existe, es un enlace, tiene NUL, es UTF-8, la librería lo trata como binario— es «no», y
   * entonces se delega: lo que la librería contestaría hoy.
   */
  async function latin1(ruta: unknown): Promise<FicheroLatin1 | undefined> {
    if (typeof ruta !== "string") return undefined;
    try {
      // `resolvePath` es de la propia librería (protegido en sus tipos, normal en ejecución): el
      // mismo confinamiento de `virtualMode` que usarían sus métodos.
      const real = (backend as unknown as { resolvePath(r: string): string }).resolvePath(ruta);
      const info = await lstat(real);
      if (!info.isFile()) return undefined;
      const fh = await open(real, constants.O_RDONLY | SIN_SEGUIR_ENLACES);
      let bytes: Buffer;
      try {
        bytes = await fh.readFile();
      } finally {
        await fh.close();
      }
      if (bytes.subarray(0, VENTANA_DE_BINARIO).includes(0)) return undefined;
      if (esUtf8Valido(bytes)) return undefined;
      // Binario o texto lo decide la LIBRERÍA (por extensión), preguntándole a ella y no con una
      // copia de su tabla: una imagen casi nunca es UTF-8 válido, y tomarla por Latin-1 haría que
      // `write` codificara su base64 como texto en vez de decodificarlo.
      const sonda = (await original("read")(ruta, 0, 0)) as { content?: unknown; mimeType?: unknown };
      if (ArrayBuffer.isView(sonda?.content)) return undefined;
      const texto = decodificarWindows1252(bytes);
      // Un texto en blanco lo contesta la librería con su aviso de fichero vacío.
      if (texto.trim() === "") return undefined;
      return { real, texto, mimeType: sonda?.mimeType };
    } catch {
      return undefined;
    }
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

  /** Codifica y escribe en sitio (como la librería: `O_TRUNC` sin seguir enlaces), o devuelve el motivo. */
  async function escribir(f: FicheroLatin1, ruta: string, texto: string): Promise<{ error: string } | undefined> {
    const r = codificarWindows1252(texto);
    if (!("bytes" in r)) return { error: motivoDeNoRepresentable(ruta, r.caracter, r.linea) };
    const fh = await open(f.real, constants.O_WRONLY | constants.O_TRUNC | SIN_SEGUIR_ENLACES);
    try {
      await fh.writeFile(r.bytes);
    } finally {
      await fh.close();
    }
    return undefined;
  }

  const propios: Record<string, Metodo> = {
    async read(ruta, offset, limit) {
      const f = await latin1(ruta);
      if (f === undefined) return original("read")(ruta, offset, limit);
      return paginar(f.texto, offset, limit, f.mimeType);
    },
    async write(ruta, contenido) {
      const f = await latin1(ruta);
      if (f === undefined || typeof contenido !== "string") return original("write")(ruta, contenido);
      try {
        const fallo = await escribir(f, ruta as string, contenido);
        return fallo ?? { path: ruta, filesUpdate: null };
      } catch (e) {
        return { error: `Error writing file '${String(ruta)}': ${codigoDe(e)}` };
      }
    },
    async edit(ruta, viejo, nuevo, todas) {
      const f = await latin1(ruta);
      if (f === undefined || typeof viejo !== "string" || typeof nuevo !== "string") {
        return original("edit")(ruta, viejo, nuevo, todas);
      }
      const r = reemplazar(f.texto, viejo, nuevo, todas === true);
      if (typeof r === "string") return { error: r };
      try {
        const fallo = await escribir(f, ruta as string, r[0]);
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
export function motivoDeNoRepresentable(ruta: string, caracter: string, linea: number): string {
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
  return `este fichero está en Latin-1 y «${caracter}» (línea ${linea}) no cabe en esa codificación: no se ha escrito nada. Usa solo caracteres Latin-1, o ${alternativa}`;
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
