/**
 * La pestaña SOPORTE del panel del proyecto, en el servidor: el listado de chats y tareas con
 * su análisis previo, y los PAQUETES que se descargan (el de un chat, el de una tarea y el del
 * proyecto entero). Las reglas de qué entra son puras (`core/paqueteDeSoporte.ts`), las del
 * análisis también (`core/analisisDeSesion.ts`); aquí solo se lee el disco y se escribe el zip.
 *
 * ## El zip se ESCRIBE MIENTRAS se lee, no se monta en memoria
 *
 * El servidor web es UN proceso que sirve todos los turnos y todos los SSE a la vez. Montar
 * un proyecto entero con `zipSync` —el molde de `paqueteDelProyecto.ts`, que está bien para
 * un hotswap delante de una persona— dejaría congelados los turnos en vuelo mientras
 * comprime. Aquí cada fichero se lee a trozos y se comprime a trozos (`Zip`/`ZipDeflate` de
 * fflate), cediendo el bucle de eventos entre trozos y esperando al `drain` de la respuesta.
 *
 * ## El checkpoint se copia EN CALIENTE
 *
 * `checkpoint.sqlite` está abierto por la consola del proyecto (una conexión por proyecto para
 * toda la vida del proceso, `checkpointer.ts`) y en modo WAL. Copiar sus bytes daría una base
 * a medio escribir; se copia con el backup online de SQLite desde una conexión de SOLO
 * LECTURA, que da una foto coherente sin parar a nadie. El de un chat se RECORTA a su hilo
 * —todas sus `checkpoint_ns`, las de los especialistas incluidas— y se VACÍA de lo demás.
 *
 * ## Con un turno en vuelo se exporta igual
 *
 * Es justo cuando más falta hace: un turno colgado o una tarea atascada `en-proceso`. Se
 * exporta la foto de ese instante y el manifiesto lo dice (`AVISO_EN_VUELO`).
 */
import { createReadStream, existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Writable } from "node:stream";
import Database from "better-sqlite3";
import { Zip, ZipDeflate } from "fflate";
import type { Acto } from "../../core/actos.js";
import { analizarSesion, type AnalisisDeSesion } from "../../core/analisisDeSesion.js";
import type { RegistroDeFallo } from "../../core/fallos.js";
import {
  AVISO_DE_RUTAS,
  AVISO_DE_TRAZA_SIN_CHAT,
  AVISO_EN_VUELO,
  lineasDelChat,
  lineasSinChat,
  repartirPorTope,
  TOPE_DEL_PAQUETE_DE_SOPORTE,
  viajaEnSoporte,
  type ManifiestoDeSoporte,
  type Omitido,
  type TipoDePaquete,
} from "../../core/paqueteDeSoporte.js";
import type { Tarea } from "../../core/tareas.js";
import { rutaDelCheckpointer } from "../../agent/sesiones/checkpointer.js";
import { parcheDeSesion } from "../../agent/sesiones/sesionGit.js";
import { rutaTrazaDeTools } from "../../agent/turno/diagnosticoDeTools.js";
import { rutaDeFallos } from "../../agent/turno/registroDeFallos.js";
import { rutaTrazaDeErrores } from "../../agent/trazaDeErroresEnDisco.js";
import { SqliteSaver } from "../../vendor/sqliteSaver.js";
import { datosDeCierre } from "./datosDeCierre.js";
import { carpetaDeLaSesion, listarSesiones, reabrirSesion, rutaDeActosDeSesion, type EntradaIndice } from "./sesiones.js";

/** El fichero de la foto de TrueForge en la carpeta de la sesión (`memoriaTrueforge.ts#rutaDeMemoria`). */
const NOMBRE_DE_MEMORIA_TRUEFORGE = "memoria-trueforge.json";

/** Cuántas sesiones, las más recientes, se analizan y se listan en la pestaña. */
export const SESIONES_EN_SOPORTE = 50;

/** El trozo en que se lee un fichero para comprimirlo sin retener el bucle de eventos. */
const TROZO_DE_LECTURA = 1024 * 1024;
/** Deflate 6, como `paqueteDelProyecto.ts`: lo que más pesa ya viene comprimido. */
const NIVEL_DE_COMPRESION = 6;
/** La fecha más antigua que sabe escribir el formato ZIP (`fflate` lanza por debajo). */
const FECHA_MINIMA_DEL_ZIP = Date.UTC(1980, 0, 1);

/** Todo lo que el servidor sabe de un proyecto y el empaquetador necesita. */
export interface FuenteDeSoporte {
  raiz: string;
  /** El nombre del proyecto, del listado del SERVIDOR. */
  proyecto: string;
  /** Las tareas de ESTE proyecto (decididas por la raíz). */
  tareas: readonly Tarea[];
  /** Dónde viven los adjuntos de una tarea; ausente = no se exportan. */
  carpetaDeAdjuntosDeTarea?: (id: string) => string | undefined;
  /** Los ids de sesión con un turno en marcha ahora mismo. */
  sesionesEnVuelo: ReadonlySet<string>;
  /** La raíz tiene un turno en marcha (aunque su sesión aún no tenga entrada). */
  raizEnVuelo: boolean;
  /** La versión de xonecode en marcha, si se sabe. */
  version?: string;
  /** El tope de contexto de un modelo («proveedor/modelo»), si se sabe. */
  topeDeContexto?: (modelo: string) => number | undefined;
}

export interface FilaDeSoporte {
  id: string;
  titulo: string;
  creada?: string;
  ultimoTurno?: string;
  /** Solo en una tarea. */
  estado?: Tarea["estado"];
  /** Solo en una tarea: la sesión donde corrió. */
  sesion?: string;
  enVuelo?: true;
  analisis: AnalisisDeSesion;
}

export interface ListadoDeSoporte {
  chats: FilaDeSoporte[];
  tareas: FilaDeSoporte[];
}

// ---------------------------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------------------------

/** Un `.jsonl` leído de una vez y en asíncrono; las líneas rotas se saltan y se cuentan. */
async function leerJsonl(ruta: string): Promise<Record<string, unknown>[]> {
  let texto: string;
  try {
    texto = await readFile(ruta, "utf8");
  } catch {
    return [];
  }
  const lineas: Record<string, unknown>[] = [];
  for (const linea of texto.split("\n")) {
    if (linea.trim() === "") continue;
    try {
      const valor: unknown = JSON.parse(linea);
      if (typeof valor === "object" && valor !== null && !Array.isArray(valor)) lineas.push(valor as Record<string, unknown>);
    } catch {
      // Una línea a medio escribir (el proceso murió) no invalida las demás.
    }
  }
  return lineas;
}

/** Las trazas del proyecto, leídas UNA vez y repartidas por chat. */
interface TrazasDelProyecto {
  tools: Record<string, unknown>[];
  fallos: Record<string, unknown>[];
  porChat(chat: string): { tools: Record<string, unknown>[]; fallos: RegistroDeFallo[] };
}

async function leerTrazas(raiz: string): Promise<TrazasDelProyecto> {
  const [tools, fallos] = await Promise.all([leerJsonl(rutaTrazaDeTools(raiz)), leerJsonl(rutaDeFallos(raiz))]);
  const agrupar = (lineas: Record<string, unknown>[]): Map<string, Record<string, unknown>[]> => {
    const mapa = new Map<string, Record<string, unknown>[]>();
    for (const l of lineas) {
      if (typeof l.chat !== "string") continue;
      const lista = mapa.get(l.chat) ?? [];
      lista.push(l);
      mapa.set(l.chat, lista);
    }
    return mapa;
  };
  const toolsPorChat = agrupar(tools);
  const fallosPorChat = agrupar(fallos);
  return {
    tools,
    fallos,
    porChat: (chat) => ({
      tools: toolsPorChat.get(chat) ?? [],
      fallos: (fallosPorChat.get(chat) ?? []).filter(
        (f): f is Record<string, unknown> & RegistroDeFallo => Array.isArray(f.causas) && typeof f.at === "string",
      ) as RegistroDeFallo[],
    }),
  };
}

function actosDe(raiz: string, id: string): Acto[] {
  try {
    return reabrirSesion(raiz, id).actos;
  } catch {
    return [];
  }
}

/** El tope del modelo del ÚLTIMO turno que lo dijo. */
function topeDe(actos: readonly Acto[], fuente: FuenteDeSoporte): number | undefined {
  if (fuente.topeDeContexto === undefined) return undefined;
  for (let i = actos.length - 1; i >= 0; i--) {
    const a = actos[i]!;
    if (a.tipo === "fin" && a.modelo !== undefined) return fuente.topeDeContexto(a.modelo);
  }
  return undefined;
}

function analisisDeChat(fuente: FuenteDeSoporte, trazas: TrazasDelProyecto, id: string, tarea?: Tarea): AnalisisDeSesion {
  const actos = actosDe(fuente.raiz, id);
  const { tools, fallos } = trazas.porChat(id);
  const tope = topeDe(actos, fuente);
  return analizarSesion({
    actos,
    trazas: tools,
    fallos,
    ...(tarea === undefined ? {} : { tarea }),
    ...(fuente.sesionesEnVuelo.has(id) || tarea?.estado === "en-proceso" ? { enVuelo: true } : {}),
    ...(tope === undefined ? {} : { topeDeContexto: tope }),
  });
}

function recientes(raiz: string, limite: number): EntradaIndice[] {
  return [...listarSesiones(raiz)]
    .sort((a, b) => (b.ultimoTurno ?? b.creada ?? "").localeCompare(a.ultimoTurno ?? a.creada ?? ""))
    .slice(0, limite);
}

/** Lo que pinta la pestaña: las sesiones más recientes y las tareas, cada una con su análisis. */
export async function listarSoporte(fuente: FuenteDeSoporte, limite: number = SESIONES_EN_SOPORTE): Promise<ListadoDeSoporte> {
  const trazas = await leerTrazas(fuente.raiz);
  const indice = new Set(listarSesiones(fuente.raiz).map((e) => e.id));
  const chats = recientes(fuente.raiz, limite).map((e): FilaDeSoporte => ({
    id: e.id,
    titulo: e.titulo,
    creada: e.creada,
    ...(e.ultimoTurno === undefined ? {} : { ultimoTurno: e.ultimoTurno }),
    ...(fuente.sesionesEnVuelo.has(e.id) ? { enVuelo: true as const } : {}),
    analisis: analisisDeChat(fuente, trazas, e.id),
  }));
  const tareas = [...fuente.tareas]
    .sort((a, b) => b.creada.localeCompare(a.creada))
    .map((t): FilaDeSoporte => {
      const sesion = t.sesion !== undefined && indice.has(t.sesion) ? t.sesion : undefined;
      const analisis = sesion === undefined ? analizarSesion({ actos: [], tarea: t }) : analisisDeChat(fuente, trazas, sesion, t);
      return {
        id: t.id,
        titulo: t.titulo,
        creada: t.creada,
        estado: t.estado,
        ...(sesion === undefined ? {} : { sesion }),
        ...(t.estado === "en-proceso" ? { enVuelo: true as const } : {}),
        analisis,
      };
    });
  return { chats, tareas };
}

// ---------------------------------------------------------------------------------------------
// El zip, en streaming
// ---------------------------------------------------------------------------------------------

const ceder = (): Promise<void> => new Promise((r) => setImmediate(r));

/** Quien pedía la descarga se fue a medias: no es un fallo del paquete. */
export class ErrorDeDescargaCortada extends Error {
  constructor() {
    super("la descarga se cortó antes de terminar");
    this.name = "ErrorDeDescargaCortada";
  }
}

/** Un zip que se escribe en un `Writable` según se van añadiendo entradas. */
class ZipEnStreaming {
  private readonly zip: Zip;
  private error: Error | undefined;
  readonly incluidos: string[] = [];
  private terminado: Promise<void>;

  constructor(private readonly destino: Writable) {
    let resolver!: () => void;
    let rechazar!: (e: Error) => void;
    this.terminado = new Promise<void>((ok, ko) => {
      resolver = ok;
      rechazar = ko;
    });
    // Nadie la espera hasta `cerrar()`: si fflate falla ANTES, o `drenar` lanza primero, esta
    // promesa rechazaría sin manejador — y un rechazo sin manejar TUMBA el proceso entero, con
    // todas las consolas vivas dentro. Se la marca como atendida aquí; `cerrar()` la sigue
    // esperando y ahí sí se ve el error.
    this.terminado.catch(() => {});
    this.zip = new Zip((error, trozo, final) => {
      if (error) {
        this.error = error;
        rechazar(error);
        return;
      }
      if (this.destino.destroyed) {
        this.error ??= new ErrorDeDescargaCortada();
        rechazar(this.error);
        return;
      }
      this.destino.write(trozo);
      if (final) resolver();
    });
  }

  /**
   * Espera a que la respuesta vacíe lo que lleva: fflate no sabe de contrapresión. **Y a que no
   * se haya ido nadie**: si la persona cancela la descarga (o el «Guardar como» de Chrome, con la
   * respuesta en pausa), el `drain` no llega nunca; sin mirar `close`/`error` el manejador se
   * quedaría colgado para siempre y el `finally` no borraría el temporal, que en un paquete de
   * proyecto lleva una copia entera del checkpoint.
   */
  private async drenar(): Promise<void> {
    if (this.error !== undefined) throw this.error;
    if (this.destino.destroyed) throw (this.error = new ErrorDeDescargaCortada());
    if (this.destino.writableNeedDrain) {
      await new Promise<void>((ok, ko) => {
        const limpiar = (): void => {
          this.destino.off("drain", alDrenar);
          this.destino.off("close", alCerrar);
          this.destino.off("error", alCerrar);
        };
        const alDrenar = (): void => {
          limpiar();
          ok();
        };
        const alCerrar = (): void => {
          limpiar();
          ko((this.error = new ErrorDeDescargaCortada()));
        };
        this.destino.once("drain", alDrenar);
        this.destino.once("close", alCerrar);
        this.destino.once("error", alCerrar);
      });
    }
    await ceder();
  }

  async bytes(ruta: string, datos: Uint8Array | string, mtime: number = Date.now()): Promise<void> {
    const entrada = new ZipDeflate(ruta, { level: NIVEL_DE_COMPRESION });
    // Sin fecha, fflate estampa la de ahora (ver `fechaDelZip` en `paqueteDelProyecto.ts`).
    entrada.mtime = Math.max(mtime, FECHA_MINIMA_DEL_ZIP);
    this.zip.add(entrada);
    entrada.push(typeof datos === "string" ? Buffer.from(datos, "utf8") : datos, true);
    this.incluidos.push(ruta);
    await this.drenar();
  }

  async json(ruta: string, valor: unknown): Promise<void> {
    await this.bytes(ruta, `${JSON.stringify(valor, null, 2)}\n`);
  }

  /** Un fichero del disco, leído a trozos. */
  async fichero(ruta: string, absoluta: string, mtime: number): Promise<void> {
    const entrada = new ZipDeflate(ruta, { level: NIVEL_DE_COMPRESION });
    // Sin fecha, fflate estampa la de ahora (ver `fechaDelZip` en `paqueteDelProyecto.ts`).
    entrada.mtime = Math.max(mtime, FECHA_MINIMA_DEL_ZIP);
    this.zip.add(entrada);
    let previo: Buffer | undefined;
    for await (const trozo of createReadStream(absoluta, { highWaterMark: TROZO_DE_LECTURA })) {
      if (previo !== undefined) {
        entrada.push(previo, false);
        await this.drenar();
      }
      previo = trozo as Buffer;
    }
    entrada.push(previo ?? new Uint8Array(0), true);
    this.incluidos.push(ruta);
    await this.drenar();
  }

  async cerrar(): Promise<void> {
    this.zip.end();
    await this.terminado;
  }
}

interface CandidatoDeDisco {
  ruta: string;
  absoluta: string;
  bytes: number;
  mtime: number;
}

/**
 * Recorre una carpeta del disco SIN seguir enlaces (`lstat`): un enlace que apunte fuera metería
 * en el paquete un fichero que no es de aquí. La regla de qué viaja se mira sobre la ruta
 * RELATIVA a la raíz del recorrido, antes de bajar, así que `.git/` ni se recorre.
 */
function recorrer(directorio: string, relativo: string, prefijo: string, salida: CandidatoDeDisco[]): void {
  let nombres: string[];
  try {
    nombres = readdirSync(directorio);
  } catch {
    return;
  }
  for (const nombre of nombres.sort()) {
    const rel = relativo === "" ? nombre : `${relativo}/${nombre}`;
    if (!viajaEnSoporte(rel)) continue;
    const absoluta = join(directorio, nombre);
    let info;
    try {
      info = lstatSync(absoluta);
    } catch {
      continue;
    }
    if (info.isDirectory()) recorrer(absoluta, rel, prefijo, salida);
    else if (info.isFile()) salida.push({ ruta: `${prefijo}${rel}`, absoluta, bytes: info.size, mtime: info.mtimeMs });
  }
}

/** ¿Es una ruta relativa de segmentos llanos? Lo que git diga de una ruta no entra en el zip sin esto. */
function rutaLlana(ruta: string): boolean {
  return ruta !== "" && !ruta.includes("\\") && !ruta.includes("\0") && !ruta.startsWith("/") && ruta.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}

// ---------------------------------------------------------------------------------------------
// El checkpoint
// ---------------------------------------------------------------------------------------------

/** La copia en caliente de la base del proyecto en `destino`. `false` si no hay base. */
async function copiarCheckpoint(raiz: string, destino: string): Promise<boolean> {
  const ruta = rutaDelCheckpointer(raiz);
  if (!existsSync(ruta)) return false;
  const db = new Database(ruta, { readonly: true, fileMustExist: true });
  try {
    await db.backup(destino);
  } finally {
    db.close();
  }
  return true;
}

interface HiloExportado {
  /** Los bytes de la base recortada a este hilo. */
  base: Uint8Array;
  /** `checkpoint_ns` → mensajes del último checkpoint de ese espacio. */
  mensajes: Record<string, unknown>;
  espacios: string[];
}

/** Las dos tablas del saver (`vendor/sqliteSaver.ts`): lo único que se copia de un hilo. */
const TABLAS_DEL_CHECKPOINT = ["checkpoints", "writes"] as const;

/**
 * La base recortada a UN hilo, con sus mensajes legibles por espacio de nombres. `undefined`
 * si el hilo no tiene NINGUNA fila: es lo normal en una sesión de TrueForge, cuya memoria es
 * la foto de `memoria-trueforge.json` y no el checkpoint.
 *
 * **No copia la base entera para luego borrar**: `DELETE` + `VACUUM` son síncronos en
 * better-sqlite3 y el checkpoint no se poda, así que sobre cientos de megas congelarían el
 * proceso que sirve todos los turnos —justo lo que el streaming evita—. Se crea una base VACÍA
 * con las mismas tablas, se ADJUNTA la del proyecto y se copian solo las filas de este hilo
 * (por el prefijo de la clave primaria) dentro de UNA transacción, que es una foto coherente.
 */
async function exportarHilo(raiz: string, id: string, temporal: string): Promise<HiloExportado | undefined> {
  const origen = rutaDelCheckpointer(raiz);
  if (!existsSync(origen)) return undefined;
  const destino = join(temporal, `hilo-${Date.now()}.sqlite`);
  const copia = new Database(destino);
  let espacios: string[];
  try {
    copia.prepare("ATTACH DATABASE ? AS origen").run(origen);
    const definiciones = copia
      .prepare(`SELECT name, sql FROM origen.sqlite_master WHERE type = 'table' AND name IN (${TABLAS_DEL_CHECKPOINT.map(() => "?").join(", ")})`)
      .all(...TABLAS_DEL_CHECKPOINT) as { name: string; sql: string }[];
    if (definiciones.length !== TABLAS_DEL_CHECKPOINT.length) return undefined;
    for (const d of definiciones) copia.exec(d.sql);
    copia.transaction(() => {
      for (const tabla of TABLAS_DEL_CHECKPOINT) {
        copia.prepare(`INSERT INTO main.${tabla} SELECT * FROM origen.${tabla} WHERE thread_id = ?`).run(id);
      }
    })();
    copia.exec("DETACH DATABASE origen");
    espacios = (copia.prepare("SELECT DISTINCT checkpoint_ns AS ns FROM checkpoints ORDER BY ns").all() as { ns: string }[]).map((f) => f.ns);
  } finally {
    copia.close();
  }
  if (espacios.length === 0) return undefined;
  const base = readFileSync(destino);
  const mensajes: Record<string, unknown> = {};
  const lector = new SqliteSaver(new Database(destino));
  try {
    for (const ns of espacios) {
      try {
        const tupla = await lector.getTuple({ configurable: { thread_id: id, checkpoint_ns: ns } });
        const valores = (tupla?.checkpoint.channel_values ?? {}) as Record<string, unknown>;
        mensajes[ns === "" ? "(raiz)" : ns] = valores.messages ?? null;
      } catch (error) {
        mensajes[ns === "" ? "(raiz)" : ns] = { error: error instanceof Error ? error.name : "ilegible" };
      }
    }
  } finally {
    lector.db.close();
  }
  return { base, mensajes, espacios };
}

// ---------------------------------------------------------------------------------------------
// Los tres paquetes
// ---------------------------------------------------------------------------------------------

export type PedidoDeSoporte = { tipo: "proyecto" } | { tipo: "chat"; id: string } | { tipo: "tarea"; id: string };

/** ¿Existe lo pedido? Lo decide el SERVIDOR con su propio índice: el id del cable no compone rutas sin esto. */
export function motivoParaNoExportar(fuente: FuenteDeSoporte, pedido: PedidoDeSoporte): string | undefined {
  if (pedido.tipo === "chat" && !listarSesiones(fuente.raiz).some((e) => e.id === pedido.id)) return "ese chat no está en el índice del proyecto";
  if (pedido.tipo === "tarea" && !fuente.tareas.some((t) => t.id === pedido.id)) return "esa tarea no es de este proyecto";
  return undefined;
}

interface Acumulado {
  omitidos: Omitido[];
  avisos: string[];
}

async function añadirCandidatos(zip: ZipEnStreaming, candidatos: CandidatoDeDisco[], acumulado: Acumulado, tope: number): Promise<void> {
  const { entran, omitidos } = repartirPorTope(candidatos, tope);
  acumulado.omitidos.push(...omitidos);
  for (const c of entran) {
    try {
      await zip.fichero(c.ruta, c.absoluta, c.mtime);
    } catch (error) {
      acumulado.omitidos.push({ ruta: c.ruta, motivo: `no se pudo leer (${(error as NodeJS.ErrnoException).code ?? "error"})` });
    }
  }
}

/** El contenido de un chat, bajo `prefijo` (vacío en su propio paquete, `chat/` en el de una tarea). */
async function añadirChat(
  zip: ZipEnStreaming,
  fuente: FuenteDeSoporte,
  id: string,
  prefijo: string,
  acumulado: Acumulado,
  temporal: string,
  tarea?: Tarea,
): Promise<void> {
  const entrada = listarSesiones(fuente.raiz).find((e) => e.id === id);
  if (entrada !== undefined) await zip.json(`${prefijo}sesion/entrada.json`, entrada);

  const candidatos: CandidatoDeDisco[] = [];
  const actos = rutaDeActosDeSesion(fuente.raiz, id);
  if (existsSync(actos)) {
    const info = lstatSync(actos);
    candidatos.push({ ruta: `${prefijo}sesion/actos.jsonl`, absoluta: actos, bytes: info.size, mtime: info.mtimeMs });
  }
  recorrer(carpetaDeLaSesion(fuente.raiz, id), "", `${prefijo}sesion/carpeta/`, candidatos);
  await añadirCandidatos(zip, candidatos, acumulado, TOPE_DEL_PAQUETE_DE_SOPORTE);

  try {
    const hilo = await exportarHilo(fuente.raiz, id, temporal);
    if (hilo === undefined) {
      // TrueForge (el motor por omisión) no deja filas en el checkpoint: su memoria es la foto
      // del raíz, que ya va en la carpeta de la sesión. Se dice DÓNDE, y no se mete una base
      // vacía ni un «solo el espacio raíz» que sería falso.
      const conMemoria = existsSync(join(carpetaDeLaSesion(fuente.raiz, id), NOMBRE_DE_MEMORIA_TRUEFORGE));
      acumulado.avisos.push(
        conMemoria
          ? `La memoria del hilo es de TrueForge: va en ${prefijo}sesion/carpeta/${NOMBRE_DE_MEMORIA_TRUEFORGE}.`
          : "No hay memoria guardada del hilo (nunca llegó a correr un turno, o se olvidó).",
      );
    } else {
      await zip.bytes(`${prefijo}sesion/checkpoint.sqlite`, hilo.base);
      await zip.json(`${prefijo}sesion/mensajes.json`, hilo.mensajes);
      if (hilo.espacios.length <= 1) acumulado.avisos.push("Del hilo solo consta el espacio raíz: el trabajo de los especialistas no dejó checkpoint propio.");
    }
  } catch (error) {
    acumulado.omitidos.push({ ruta: `${prefijo}sesion/checkpoint.sqlite`, motivo: `no se pudo copiar la base (${(error as NodeJS.ErrnoException).code ?? (error as Error).name})` });
  }

  const trazas = await leerTrazas(fuente.raiz);
  const toolsDelChat = lineasDelChat(trazas.tools, id);
  const fallosDelChat = lineasDelChat(trazas.fallos, id);
  if (toolsDelChat.length > 0) await zip.bytes(`${prefijo}trazas/tools.jsonl`, toolsDelChat.map((l) => JSON.stringify(l)).join("\n") + "\n");
  if (fallosDelChat.length > 0) await zip.bytes(`${prefijo}trazas/fallos.jsonl`, fallosDelChat.map((l) => JSON.stringify(l)).join("\n") + "\n");

  try {
    const cierre = await datosDeCierre(fuente.raiz, id);
    await zip.json(`${prefijo}cambios/cierre.json`, cierre);
    for (const f of cierre.ficheros) {
      if (!rutaLlana(f.ruta)) continue;
      try {
        const parche = await parcheDeSesion(fuente.raiz, id, f.ruta);
        if (parche !== undefined) await zip.bytes(`${prefijo}cambios/parches/${f.ruta}.patch`, parche.texto);
      } catch {
        acumulado.omitidos.push({ ruta: `${prefijo}cambios/parches/${f.ruta}.patch`, motivo: "git no dio el parche" });
      }
    }
  } catch {
    acumulado.avisos.push("No se pudieron leer los cambios de la sesión en git.");
  }

  await zip.json(`${prefijo}analisis.json`, analisisDeChat(fuente, trazas, id, tarea));
}

async function añadirTarea(zip: ZipEnStreaming, fuente: FuenteDeSoporte, tarea: Tarea, prefijo: string, acumulado: Acumulado): Promise<void> {
  // La raíz ABSOLUTA de la tarea se queda fuera: el proyecto ya va por nombre en el manifiesto.
  const { proyecto, ...resto } = tarea;
  await zip.json(`${prefijo}tarea.json`, { ...resto, proyecto: { id: proyecto.id, nombre: proyecto.nombre } });
  const carpeta = fuente.carpetaDeAdjuntosDeTarea?.(tarea.id);
  if (carpeta !== undefined) {
    const candidatos: CandidatoDeDisco[] = [];
    recorrer(carpeta, "", `${prefijo}adjuntos/`, candidatos);
    await añadirCandidatos(zip, candidatos, acumulado, TOPE_DEL_PAQUETE_DE_SOPORTE);
  }
}

/**
 * Escribe el paquete pedido en `destino`, entero, y devuelve su manifiesto (que va también
 * DENTRO, como última entrada). Quien llama pone antes las cabeceras y cierra `destino` después.
 */
export async function escribirPaquete(
  fuente: FuenteDeSoporte,
  pedido: PedidoDeSoporte,
  destino: Writable,
  ahora: Date = new Date(),
): Promise<ManifiestoDeSoporte> {
  const zip = new ZipEnStreaming(destino);
  const acumulado: Acumulado = { omitidos: [], avisos: [AVISO_DE_RUTAS] };
  const temporal = mkdtempSync(join(tmpdir(), "xonecode-soporte-"));
  let enVuelo = false;
  let motor: string | undefined;
  try {
    if (pedido.tipo === "chat") {
      enVuelo = fuente.sesionesEnVuelo.has(pedido.id);
      motor = listarSesiones(fuente.raiz).find((e) => e.id === pedido.id)?.motor;
      await añadirChat(zip, fuente, pedido.id, "", acumulado, temporal);
    } else if (pedido.tipo === "tarea") {
      const tarea = fuente.tareas.find((t) => t.id === pedido.id)!;
      enVuelo = tarea.estado === "en-proceso" || (tarea.sesion !== undefined && fuente.sesionesEnVuelo.has(tarea.sesion));
      await añadirTarea(zip, fuente, tarea, "tarea/", acumulado);
      if (tarea.sesion !== undefined && listarSesiones(fuente.raiz).some((e) => e.id === tarea.sesion)) {
        await añadirChat(zip, fuente, tarea.sesion, "chat/", acumulado, temporal, tarea);
      } else {
        acumulado.avisos.push("La tarea no tiene una sesión abrible: va sin chat.");
        await zip.json("analisis.json", analizarSesion({ actos: [], tarea }));
      }
    } else {
      enVuelo = fuente.raizEnVuelo || fuente.tareas.some((t) => t.estado === "en-proceso");
      const candidatos: CandidatoDeDisco[] = [];
      recorrer(fuente.raiz, "", "proyecto/", candidatos);
      await añadirCandidatos(zip, candidatos, acumulado, TOPE_DEL_PAQUETE_DE_SOPORTE);
      try {
        const copia = join(temporal, "checkpoint.sqlite");
        if (await copiarCheckpoint(fuente.raiz, copia)) {
          await zip.fichero("proyecto/.xonecode/checkpoint.sqlite", copia, Date.now());
        }
      } catch (error) {
        acumulado.omitidos.push({ ruta: "proyecto/.xonecode/checkpoint.sqlite", motivo: `no se pudo copiar la base (${(error as NodeJS.ErrnoException).code ?? (error as Error).name})` });
      }
      for (const tarea of fuente.tareas) await añadirTarea(zip, fuente, tarea, `tareas/${tarea.id}/`, acumulado);
      const [tools, fallos, errores] = await Promise.all([
        leerJsonl(rutaTrazaDeTools(fuente.raiz)),
        leerJsonl(rutaDeFallos(fuente.raiz)),
        leerJsonl(rutaTrazaDeErrores(fuente.raiz)),
      ]);
      const sinChat = lineasSinChat(tools) + lineasSinChat(fallos) + errores.length;
      if (sinChat > 0) acumulado.avisos.push(`${AVISO_DE_TRAZA_SIN_CHAT} (${sinChat} línea(s)).`);
      await zip.json("analisis.json", await listarSoporte(fuente));
    }
    if (enVuelo) acumulado.avisos.push(AVISO_EN_VUELO);

    const manifiesto: ManifiestoDeSoporte = {
      v: 1,
      tipo: pedido.tipo as TipoDePaquete,
      ...(fuente.version === undefined ? {} : { version: fuente.version }),
      generado: ahora.toISOString(),
      proyecto: fuente.proyecto,
      ...(pedido.tipo === "proyecto" ? {} : { id: pedido.id }),
      ...(motor === undefined ? {} : { motor }),
      ...(enVuelo ? { enVuelo: true } : {}),
      incluidos: [...zip.incluidos, "manifiesto.json"],
      omitidos: acumulado.omitidos,
      avisos: acumulado.avisos,
    };
    await zip.json("manifiesto.json", manifiesto);
    await zip.cerrar();
    return manifiesto;
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
}
