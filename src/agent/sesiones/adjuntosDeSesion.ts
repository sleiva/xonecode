/**
 * Guardado y listado en DISCO de los adjuntos que una persona anexa en el CHAT de una sesión
 * (IXCODE-7, tarea 2 de 7): `.xonecode/sesiones/<id>/adjuntos/`.
 *
 * **Mismas barreras que los adjuntos de una TAREA** (`agent/tareas/tareasEnDisco.ts`): nombre en
 * lista blanca (`nombreDeAdjuntoAceptable`, `core/adjuntos.ts`), tope por fichero y por sesión,
 * sin enlaces simbólicos, `0600` para el fichero y `0700` para la carpeta. La diferencia con ese
 * fichero es que aquí la carpeta la calcula `carpetaDeAdjuntosDeSesion` (tarea 1,
 * `core/adjuntos.ts`), que LANZA si el id no es un segmento seguro (`segmentoSeguro`) — un id
 * llega del CLIENTE, así que esa excepción se captura aquí y se convierte en el mismo rechazo que
 * cualquier otro nombre inválido: **un rechazo de guarda se devuelve, nunca se lanza**.
 *
 * La contención se comprueba ANTES de crear ninguna carpeta: `carpetaComprobada` solo hace
 * `lstatSync` (que no necesita que exista nada) y, si la carpeta YA existe, compara su camino
 * REAL contra el de `.xonecode/sesiones`. Solo si esa comprobación pasa se llama a `mkdirSync`.
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { carpetaDeAdjuntosDeSesion, mimeDeAdjunto, nombreDeAdjuntoAceptable, type AdjuntoNombrable } from "../../core/adjuntos.js";

/** Bytes que se aceptan por adjunto y por sesión. Mismos valores que `TOPE_DE_ADJUNTO` /
 *  `TOPE_DE_ADJUNTOS_POR_TAREA` de `tareasEnDisco.ts`: es la misma regla, aplicada a otra cola. */
export const TOPE_DE_ADJUNTO_DE_SESION = 20_000_000;
export const TOPE_DE_ADJUNTOS_POR_SESION = 50_000_000;

/**
 * ¿Es esa ruta un enlace simbólico? `ENOENT` es «no hay nada ahí», que no es un enlace.
 *
 * `lstatSync` y no `statSync`: `stat` sigue el enlace y contestaría por el destino, que es
 * justo lo que hay que detectar. Misma función que `tareasEnDisco.ts#esEnlace`, copiada y no
 * importada porque esa es privada de su módulo.
 */
function esEnlace(ruta: string): boolean {
  try {
    return lstatSync(ruta).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * La carpeta de adjuntos de una sesión, **si ningún tramo del camino hasta ella es un enlace**.
 *
 * `undefined` = no se toca: el id no es un segmento seguro (lo dice `carpetaDeAdjuntosDeSesion`
 * LANZANDO, capturado aquí), o algún segmento del camino —`.xonecode`, `sesiones`,
 * `sesiones/<id>`, `sesiones/<id>/adjuntos`— es un enlace simbólico.
 *
 * **No basta con mirar los dos últimos segmentos ni con comparar un `realpath` final.** Una
 * primera versión de esto solo hacía `lstat` de `sesiones/<id>` y de `adjuntos`, y comparaba el
 * `realpath` de `adjuntos` contra el de `<raiz>/.xonecode/sesiones` — y las dos cosas se colaban
 * si el enlace estaba en `sesiones` MISMO: `lstat("sesiones/<id>")` sigue el enlace del padre
 * (`lstat` solo evita seguir el ÚLTIMO componente de la ruta), y `realpathSync(baseSesiones)`
 * sigue exactamente el mismo enlace que se buscaba detectar, así que las dos rutas comparadas
 * salían iguales. Medido: con `.xonecode/sesiones` enlazado a una carpeta fuera del proyecto,
 * `guardarAdjuntoDeSesion` contestaba `{ok:true}` y escribía fuera.
 *
 * El arreglo recorre cada segmento DESDE la raíz YA resuelta (`realpathSync(raiz)`) con `lstat`
 * —que no sigue enlaces y no necesita que exista nada—: en cuanto un segmento no existe, el
 * resto lo va a crear `mkdirSync` de verdad y no hay nada más que comprobar; si alguno YA
 * existe y es un enlace, se rechaza ahí, sea cual sea el segmento.
 */
function carpetaComprobada(raiz: string, id: string): string | undefined {
  let carpeta: string;
  try {
    carpeta = carpetaDeAdjuntosDeSesion(raiz, id);
  } catch {
    return undefined;
  }
  let raizReal: string;
  try {
    raizReal = realpathSync(raiz);
  } catch {
    // `raiz` no se pudo resolver: no se afirma que valga. Falla cerrado.
    return undefined;
  }
  let actual = raizReal;
  for (const segmento of relative(raiz, carpeta).split(sep)) {
    if (segmento.length === 0) continue;
    actual = join(actual, segmento);
    if (esEnlace(actual)) return undefined;
    if (!existsSync(actual)) break;
  }
  return carpeta;
}

/** Los topes de `guardarAdjuntoDeSesion`, inyectables para probarlos sin escribir megabytes. */
export interface TopesDeAdjuntosDeSesion {
  porFichero: number;
  porSesion: number;
}

/**
 * Guarda un adjunto anexado en el chat de la sesión `id`, dentro del proyecto `raiz`.
 *
 * Mismo orden que `tareasEnDisco.ts#guardarAdjunto`: primero lo que se sabe SIN tocar disco (el
 * nombre, el tamaño del propio fichero), luego la carpeta —comprobada, no creada— y solo con
 * ella en la mano el tope por sesión (que necesita leer lo que ya hay) y la escritura.
 */
export function guardarAdjuntoDeSesion(
  raiz: string,
  id: string,
  nombre: string,
  datos: Buffer,
  topes: TopesDeAdjuntosDeSesion = { porFichero: TOPE_DE_ADJUNTO_DE_SESION, porSesion: TOPE_DE_ADJUNTOS_POR_SESION }
): { ok: true } | { ok: false; motivo: string } {
  if (!nombreDeAdjuntoAceptable(nombre)) {
    return { ok: false, motivo: "ese nombre no vale para un adjunto" };
  }
  if (datos.length > topes.porFichero) {
    return { ok: false, motivo: `el fichero es demasiado grande (tope ${Math.round(topes.porFichero / 1_000_000)} MB)` };
  }
  // La carpeta y no `join` a pelo: `carpetaComprobada` es quien comprueba el id y quien
  // recomprueba el camino real. Sin ella, un enlace simbólico plantado en `sesiones/` haría
  // que esto escribiera fuera del proyecto.
  const carpeta = carpetaComprobada(raiz, id);
  if (carpeta === undefined) return { ok: false, motivo: "ese nombre no vale para un adjunto" };
  mkdirSync(carpeta, { recursive: true, mode: 0o700 });
  const ya = readdirSync(carpeta).reduce((suma, f) => suma + statSync(join(carpeta, f)).size, 0);
  if (ya + datos.length > topes.porSesion) {
    return { ok: false, motivo: `esta sesión ya no admite más adjuntos (tope ${Math.round(topes.porSesion / 1_000_000)} MB)` };
  }
  // Un adjunto es un documento de la persona, no un dato de sistema: mismo 0600 que los
  // adjuntos de tarea y que el índice de sesiones.
  writeFileSync(join(carpeta, nombre), datos, { mode: 0o600 });
  return { ok: true };
}

/**
 * Lo que hay en la carpeta de adjuntos de la sesión `id`, medido del DISCO.
 *
 * Ordenado por nombre, y solo ficheros LLANOS con nombre aceptable: una carpeta o un enlace ahí
 * no es un adjunto, y `readdirSync` los daría igual. Con `nombres`, filtra a esa lista — en su
 * mismo ORDEN, omitiendo los que no estén — para poder pedir «los adjuntos DE ESTE MENSAJE» sin
 * enseñar los de mensajes anteriores de la misma sesión.
 */
export function listarAdjuntosDeSesion(raiz: string, id: string, nombres?: readonly string[]): AdjuntoNombrable[] {
  const carpeta = carpetaComprobada(raiz, id);
  if (carpeta === undefined || !existsSync(carpeta)) return [];

  const todos: AdjuntoNombrable[] = [];
  for (const nombre of readdirSync(carpeta).sort()) {
    if (!nombreDeAdjuntoAceptable(nombre)) continue;
    let bytes: number;
    try {
      const info = lstatSync(join(carpeta, nombre));
      if (!info.isFile()) continue;
      bytes = info.size;
    } catch {
      continue;
    }
    const mime = mimeDeAdjunto(nombre);
    todos.push({ nombre, bytes, ...(mime === undefined ? {} : { mime }) });
  }

  if (nombres === undefined) return todos;
  const porNombre = new Map(todos.map((a) => [a.nombre, a]));
  return nombres.reduce<AdjuntoNombrable[]>((salida, n) => {
    const a = porNombre.get(n);
    if (a !== undefined) salida.push(a);
    return salida;
  }, []);
}
