/**
 * Descargar un `.zip` y descomprimirlo en el sitio que toca — el paso «descarga» de una
 * receta de instalación, hermano del paso «proceso» que ya existía
 * (`instalacionEnMaquina.ts#PASOS_EJECUTABLES`).
 *
 * Nació con la receta de Android en Windows: Homebrew instala el JDK, las herramientas del
 * SDK y `adb` con un solo `install`, y en Windows no hay un gestor equivalente para esto —
 * así que cada pieza se baja de una URL fijada (`core/dispositivos.ts`) y se descomprime a
 * mano. Mismo contrato que un paso de PROCESO: nunca lanza, informa cada línea de progreso
 * por `alSalirLinea` en cuanto la hay, y su resultado final es el MISMO
 * `"ok" | "fallo" | "cancelada" | "colgada"` — así `Receta.tsx` y el mensaje `{clase:"receta"}`
 * no necesitan saber que detrás hay un `fetch` y no un `spawn`.
 *
 * **La validación de zip-slip es la MISMA que la instalación de skills**
 * (`core/zipDeSkill.ts#rutaDeZipAceptable`): un zip que se descarga de internet, aunque sea
 * de un host de confianza (Google, Adoptium, por HTTPS), es exactamente la clase de entrada
 * que esa regla ya cubre — reescribirla aquí sería un segundo sitio donde decidir lo mismo, y
 * el que ha demostrado divergir en silencio en este repo.
 *
 * **Cancelar es el `AbortController` de `fetch`.** No hay proceso hijo que matar —a
 * diferencia de un paso de proceso, que mata el GRUPO—, así que no pasa por
 * `procesosEnMaquina.ts#matarGrupo`. Y el silencio se vigila igual que allí: el mismo
 * `TOPE_SIN_SALIDA_MS` (5 min), pero medido entre TROZOS del cuerpo de la respuesta y no
 * entre líneas de un proceso — una descarga de 150 MB que sigue hablando no está colgada
 * aunque tarde minutos; lo que la delata es que deje de llegar ni un byte.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { unzipSync } from "fflate";
import { carpetaComun, rutaDeZipAceptable } from "../../core/zipDeSkill.js";
import { TOPE_SIN_SALIDA_MS } from "./procesosEnMaquina.js";

/** Lo que puede ocupar el `.zip` descargado. Las cmdline-tools de hoy pesan 156 MB, el JDK
 *  ronda los 190 MB: deja margen sin abrir la puerta a un zip bomba servido por un host que
 *  dejó de ser de confianza (una URL fijada a mano, ver `core/dispositivos.ts`). */
export const TOPE_DE_LA_DESCARGA = 300 * 1024 * 1024;

/** Lo que puede ocupar DESCOMPRIMIDO. El de arriba no lo ve: un zip pequeño puede
 *  descomprimirse en gigabytes. */
export const TOPE_DESCOMPRIMIDO = 700 * 1024 * 1024;

/** Cuántas entradas puede traer. Las cmdline-tools traen unos pocos miles de ficheros. */
export const TOPE_DE_ENTRADAS = 8000;

export interface ResultadoDeDescarga {
  estado: "ok" | "fallo" | "cancelada" | "colgada";
  /** Una línea, nunca la salida entera. Ausente si fue bien. */
  motivo?: string;
  ms: number;
}

export interface Descarga {
  cancelar: () => void;
  terminado: Promise<ResultadoDeDescarga>;
}

export interface OpcionesDeDescarga {
  /**
   * Si el zip trae EXACTAMENTE una carpeta de primer nivel, se renombra a esta al escribir
   * —sin un paso de renombrado aparte, se descomprime YA con el nombre fijo—. Se usa para el
   * JDK (`jdk-17.0.20.1+1` → `jdk17`) y las cmdline-tools (`cmdline-tools` → `latest`), cuyo
   * nombre de carpeta trae la versión o no es el que Google exige. `platform-tools` no la
   * necesita: su zip ya trae `platform-tools/` con el nombre correcto.
   */
  renombrarCarpetaUnicaA?: string;
}

export interface DependenciasDeDescarga {
  fetch?: typeof fetch;
  crearCarpeta?: (ruta: string) => void;
  escribir?: (ruta: string, datos: Uint8Array) => void;
  ahora?: () => number;
  /** Cada línea de progreso, en cuanto sale: es lo que hace usable una descarga de minutos. */
  alSalirLinea?: (linea: string) => void;
}

/**
 * Descarga `url` y la descomprime bajo `destino`. Nunca lanza: todo lo que puede ir mal
 * —una URL caducada, un zip corrupto, una ruta de zip-slip, el tope de tamaño— vuelve como
 * un `ResultadoDeDescarga` con su motivo de UNA línea, igual que
 * `instalacionEnMaquina.ts#correrPasoDeReceta`.
 */
export function descargarYDescomprimir(
  url: string,
  destino: string,
  opciones: OpcionesDeDescarga = {},
  deps: DependenciasDeDescarga = {}
): Descarga {
  const fetchDeVerdad = deps.fetch ?? fetch;
  const crearCarpeta = deps.crearCarpeta ?? ((ruta: string) => mkdirSync(ruta, { recursive: true }));
  const escribir = deps.escribir ?? ((ruta: string, datos: Uint8Array) => writeFileSync(ruta, datos));
  const ahora = deps.ahora ?? (() => Date.now());
  const t0 = ahora();
  const decir = (linea: string): void => deps.alSalirLinea?.(linea);

  const abortador = new AbortController();
  let canceladaPorFuera = false;
  let colgadaPorSilencio = false;

  const terminado = (async (): Promise<ResultadoDeDescarga> => {
    // El vigilante del silencio: se REARMA en cada trozo que llega, igual que
    // `procesosEnMaquina.ts#rearmar`. Si nadie lo rearma en `TOPE_SIN_SALIDA_MS`, aborta —
    // una descarga que deja de hablar es un servidor que se calló, no una que va lenta.
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const rearmar = (): void => {
      if (temporizador !== undefined) clearTimeout(temporizador);
      temporizador = setTimeout(() => {
        colgadaPorSilencio = true;
        abortador.abort();
      }, TOPE_SIN_SALIDA_MS);
    };
    const desarmar = (): void => {
      if (temporizador !== undefined) clearTimeout(temporizador);
    };

    try {
      rearmar();
      let respuesta: Response;
      try {
        respuesta = await fetchDeVerdad(url, { signal: abortador.signal });
      } finally {
        desarmar();
      }
      if (!respuesta.ok) {
        return { estado: "fallo", motivo: `no se pudo descargar (HTTP ${respuesta.status})`, ms: ahora() - t0 };
      }

      const bytes = await leerConProgreso(respuesta, decir, rearmar, desarmar);
      if (bytes.length > TOPE_DE_LA_DESCARGA) {
        return { estado: "fallo", motivo: "la descarga pesa más de lo esperado: se para por si acaso", ms: ahora() - t0 };
      }

      decir("descomprimiendo…");
      let entradas: Record<string, Uint8Array>;
      try {
        entradas = unzipSync(bytes);
      } catch {
        return { estado: "fallo", motivo: "no se pudo abrir el .zip: ¿la descarga se cortó?", ms: ahora() - t0 };
      }

      // fflate también devuelve las carpetas, como entradas vacías acabadas en `/`: no son
      // ficheros que escribir.
      const ficheros = Object.entries(entradas).filter(([ruta]) => !ruta.endsWith("/"));
      if (ficheros.length === 0) return { estado: "fallo", motivo: "el .zip está vacío", ms: ahora() - t0 };
      if (ficheros.length > TOPE_DE_ENTRADAS) {
        return { estado: "fallo", motivo: `el .zip trae más de ${TOPE_DE_ENTRADAS} ficheros`, ms: ahora() - t0 };
      }
      const totalDescomprimido = ficheros.reduce((suma, [, datos]) => suma + datos.length, 0);
      if (totalDescomprimido > TOPE_DESCOMPRIMIDO) {
        return { estado: "fallo", motivo: "el .zip ocupa demasiado descomprimido", ms: ahora() - t0 };
      }
      const malo = ficheros.find(([ruta]) => !rutaDeZipAceptable(ruta));
      if (malo !== undefined) {
        // El nombre de la entrada no se devuelve: es de un zip ajeno, aunque venga de un
        // host de confianza. Se dice QUÉ pasa, que es lo accionable.
        return { estado: "fallo", motivo: "el .zip trae una ruta que se sale de su carpeta", ms: ahora() - t0 };
      }

      const prefijo = opciones.renombrarCarpetaUnicaA === undefined ? undefined : carpetaComun(ficheros.map(([ruta]) => ruta));
      for (const [ruta, datos] of ficheros) {
        const rutaFinal =
          prefijo !== undefined && opciones.renombrarCarpetaUnicaA !== undefined
            ? join(destino, opciones.renombrarCarpetaUnicaA, ruta.slice(prefijo.length + 1))
            : join(destino, ruta);
        crearCarpeta(dirname(rutaFinal));
        escribir(rutaFinal, datos);
      }
      decir(`listo: ${ficheros.length} ficheros`);
      return { estado: "ok", ms: ahora() - t0 };
    } catch (error) {
      if (colgadaPorSilencio) {
        return { estado: "colgada", motivo: `no llegó nada en ${Math.round(TOPE_SIN_SALIDA_MS / 60_000)} min`, ms: ahora() - t0 };
      }
      if (canceladaPorFuera) return { estado: "cancelada", ms: ahora() - t0 };
      return { estado: "fallo", motivo: unaLinea(error), ms: ahora() - t0 };
    }
  })();

  return {
    cancelar: () => {
      canceladaPorFuera = true;
      abortador.abort();
    },
    terminado,
  };
}

/**
 * Lee el cuerpo de la respuesta a trozos, informando el `%` de progreso por
 * `alSalirLinea` — a saltos de 10 puntos, para no inundar el log de una descarga de minutos.
 * `rearmar`/`desarmar` son el mismo vigilante de silencio que el resto de la descarga: cada
 * trozo que llega es la prueba de que el servidor sigue hablando.
 *
 * Si el `fetch` inyectado no da un cuerpo en streaming (algunos dobles de test, o un
 * `fetch` sin soporte de `ReadableStream`), se cae a `arrayBuffer()` sin progreso intermedio
 * — sigue siendo correcto, solo menos hablador.
 */
async function leerConProgreso(
  respuesta: Response,
  decir: (linea: string) => void,
  rearmar: () => void,
  desarmar: () => void
): Promise<Uint8Array> {
  const total = Number(respuesta.headers.get("content-length") ?? "0");
  const cuerpo = respuesta.body;
  if (cuerpo === null || typeof cuerpo.getReader !== "function") {
    decir("descargando…");
    return new Uint8Array(await respuesta.arrayBuffer());
  }
  const lector = cuerpo.getReader();
  const trozos: Uint8Array[] = [];
  let recibido = 0;
  let ultimoPorcentaje = -10;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      rearmar();
      trozos.push(value);
      recibido += value.length;
      if (total > 0) {
        const porcentaje = Math.floor((recibido / total) * 100);
        if (porcentaje >= ultimoPorcentaje + 10) {
          decir(`descargando… ${porcentaje}%`);
          ultimoPorcentaje = porcentaje;
        }
      }
    }
  } finally {
    desarmar();
  }
  const bytes = new Uint8Array(recibido);
  let offset = 0;
  for (const trozo of trozos) {
    bytes.set(trozo, offset);
    offset += trozo.length;
  }
  return bytes;
}

/** Una línea sobre por qué falló la descarga, sin la traza entera. */
function unaLinea(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") return "la descarga se abortó";
    return error.message.split(/\r?\n/)[0] ?? "fallo desconocido";
  }
  return String(error).split(/\r?\n/)[0] ?? "fallo desconocido";
}
