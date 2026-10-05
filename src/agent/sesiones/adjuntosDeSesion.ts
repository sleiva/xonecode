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
import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { unzipSync } from "fflate";
import { carpetaDeAdjuntosDeSesion, mimeDeAdjunto, nombreDeAdjuntoAceptable, type AdjuntoNombrable } from "../../core/adjuntos.js";
import { carpetaDeExtraccion, esZip, planDeExtraccion } from "../../core/zipDeAdjunto.js";

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
 * Cuántos sufijos `-2`, `-3`… se prueban antes de rendirse (Ronda de arreglo 1/5, IXCODE-7).
 * Un valor razonable, no una promesa de «siempre hay hueco»: una sesión con más de cien
 * adjuntos del MISMO nombre es un caso patológico, no uno que este harness tenga que servir.
 */
const TOPE_DE_SUFIJOS_DE_NOMBRE = 100;

/**
 * El nombre con el que ESTE fichero se escribe de verdad, dentro de `carpeta`.
 *
 * **La carpeta de adjuntos es por SESIÓN, no por mensaje**, y las fichas del compositor se
 * vacían al enviar (`Compositor.tsx#enviar`): sin esto, un `pegado-1.png` de un turno
 * pisaba en SILENCIO el de un turno anterior de la misma conversación —`writeFileSync` no
 * avisa—, y la imagen que el agente leía ya no era la que la persona acababa de mandar.
 *
 * **El nombre final lo decide el SERVIDOR**, no el cliente: es quien de verdad conoce lo
 * que ya hay en la carpeta en el instante de escribir (dos subidas casi simultáneas del
 * mismo nombre solo se sirven UNA detrás de otra, nunca en paralelo — la ruta HTTP no
 * paraleliza dos peticiones del mismo `fetch` secuencial del compositor, y aun si lo
 * hiciera, cada `writeFileSync` sería atómico por fichero). `existsSync` y no un `readdir`
 * cacheado: la comprobación tiene que ser la ÚLTIMA cosa antes de escribir.
 */
function nombreLibreEn(carpeta: string, nombre: string): string | undefined {
  if (!existsSync(join(carpeta, nombre))) return nombre;
  const punto = nombre.lastIndexOf(".");
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const extension = punto > 0 ? nombre.slice(punto) : "";
  for (let n = 2; n <= TOPE_DE_SUFIJOS_DE_NOMBRE + 1; n += 1) {
    const candidato = `${base}-${n}${extension}`;
    if (!existsSync(join(carpeta, candidato))) return candidato;
  }
  return undefined;
}

/**
 * El código de un error, nunca su mensaje: el mensaje de Node lleva la ruta absoluta (`ENOENT:
 * … open '/Users/…/adjuntos/x'`) y el motivo se devuelve al cliente por HTTP. Mismo apaño que
 * `codigoDe` en `arranque.ts`/`corredorDeTareas.ts`, copiado y no importado porque los tres son
 * privados de su módulo.
 */
function codigoDe(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return error instanceof Error ? error.name : "error";
}

/**
 * Lo que ocupan los adjuntos de la sesión, contando lo DESCOMPRIMIDO de un zip. Sin seguir enlaces
 * (`lstat`): uno que alguien plantara no suma lo de fuera.
 */
function ocupado(carpeta: string): number {
  let suma = 0;
  for (const nombre of readdirSync(carpeta)) {
    const ruta = join(carpeta, nombre);
    const info = lstatSync(ruta);
    if (info.isDirectory()) suma += ocupado(ruta);
    else if (info.isFile()) suma += info.size;
  }
  return suma;
}

/**
 * Descomprime `nombreDelZip` (ya escrito en `carpeta`) en `carpeta/<nombre sin .zip>/`. Devuelve los
 * ficheros extraídos, relativos a `carpeta`, o el motivo de no hacerlo. **Nunca lanza, y nunca hace
 * fallar el guardado**: el zip ya está en disco y se queda; lo que no se extrae se dice.
 *
 * Dos pasadas por `fflate`: la primera solo LEE las cabeceras (el `filter` contesta que no a todo), y
 * con los tamaños que declaran decide la regla pura (`core/zipDeAdjunto.ts`) ANTES de inflar nada —un
 * zip bomba no llega a ocupar memoria—; la segunda infla solo lo aprobado, y se comprueba que cada
 * entrada ocupa lo que declaraba.
 */
function extraerZip(carpeta: string, nombreDelZip: string, datos: Buffer, disponible: number): { extraidos: string[] } | { motivo: string } {
  const destino = join(carpeta, carpetaDeExtraccion(nombreDelZip));
  if (existsSync(destino)) return { motivo: "ya hay algo con el nombre de la carpeta donde iría" };
  const cabeceras: { ruta: string; bytes: number }[] = [];
  try {
    unzipSync(datos, {
      filter: (f) => {
        if (!f.name.endsWith("/")) cabeceras.push({ ruta: f.name, bytes: f.originalSize });
        return false;
      },
    });
  } catch {
    return { motivo: "no se pudo abrir: ¿es un .zip de verdad?" };
  }
  const plan = planDeExtraccion(cabeceras, disponible);
  if ("error" in plan) return { motivo: plan.error };
  const aprobadas = new Map(plan.ficheros.map((f) => [f.enElZip, f.destino]));
  const declarado = new Map(cabeceras.map((c) => [c.ruta, c.bytes]));
  try {
    const inflado = unzipSync(datos, { filter: (f) => aprobadas.has(f.name) });
    for (const [enElZip, contenido] of Object.entries(inflado)) {
      if (contenido.length !== declarado.get(enElZip)) throw new Error("el tamaño no es el que declaraba");
    }
    mkdirSync(destino, { mode: 0o700 });
    for (const [enElZip, contenido] of Object.entries(inflado)) {
      const salida = join(destino, ...aprobadas.get(enElZip)!.split("/"));
      mkdirSync(dirname(salida), { recursive: true, mode: 0o700 });
      writeFileSync(salida, contenido, { mode: 0o600 });
    }
    return { extraidos: plan.ficheros.map((f) => `${carpetaDeExtraccion(nombreDelZip)}/${f.destino}`).sort() };
  } catch {
    // A medias es peor que nada: lo escrito se retira y queda solo el zip.
    try {
      rmSync(destino, { recursive: true, force: true });
    } catch {
      // Si ni eso se puede, queda lo que haya: el listado solo enseña ficheros con nombre aceptable.
    }
    return { motivo: "no se pudo descomprimir entero" };
  }
}

/**
 * Guarda un adjunto anexado en el chat de la sesión `id`, dentro del proyecto `raiz`.
 *
 * Mismo orden que `tareasEnDisco.ts#guardarAdjunto`: primero lo que se sabe SIN tocar disco (el
 * nombre, el tamaño del propio fichero), luego la carpeta —comprobada, no creada— y solo con
 * ella en la mano el tope por sesión (que necesita leer lo que ya hay) y la escritura.
 *
 * **NUNCA sobrescribe** (Ronda de arreglo 1/5, IXCODE-7): la carpeta es por SESIÓN y sobrevive
 * a que el compositor vacíe sus fichas al enviar, así que dos turnos que suban el mismo nombre
 * —un `pegado-1.png` es el caso típico— pisarían en silencio el fichero del turno anterior sin
 * este paso. `nombreLibreEn` decide el nombre FINAL, que puede llevar sufijo; se devuelve en
 * `{ok:true, nombre}` para que quien llama (la ruta HTTP, y con ella la ficha del compositor)
 * sepa con qué nombre quedó de verdad.
 *
 * **Las cuatro llamadas de disco van en un `try`**: `mkdirSync` (un `EACCES` de permisos),
 * `readdirSync`/`statSync` al sumar lo que ya hay (un `ENOSPC`, o un enlace COLGANTE dentro de
 * `adjuntos/` — `statSync` lo sigue y `ENOENT` si el destino no existe) y `writeFileSync`. Un
 * rechazo de guarda se DEVUELVE, nunca se lanza: sin este `try`, cualquiera de esos errores se
 * llevaba por delante al llamador (`POST /adjunto`), que no los esperaba.
 */
export function guardarAdjuntoDeSesion(
  raiz: string,
  id: string,
  nombre: string,
  datos: Buffer,
  topes: TopesDeAdjuntosDeSesion = { porFichero: TOPE_DE_ADJUNTO_DE_SESION, porSesion: TOPE_DE_ADJUNTOS_POR_SESION }
): { ok: true; nombre: string; extraidos?: string[]; sinExtraer?: string } | { ok: false; motivo: string } {
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
  try {
    mkdirSync(carpeta, { recursive: true, mode: 0o700 });
    const ya = ocupado(carpeta);
    if (ya + datos.length > topes.porSesion) {
      return { ok: false, motivo: `esta sesión ya no admite más adjuntos (tope ${Math.round(topes.porSesion / 1_000_000)} MB)` };
    }
    const nombreFinal = nombreLibreEn(carpeta, nombre);
    if (nombreFinal === undefined) {
      return { ok: false, motivo: "ya hay demasiados adjuntos con ese nombre en esta sesión" };
    }
    // Un adjunto es un documento de la persona, no un dato de sistema: mismo 0600 que los
    // adjuntos de tarea y que el índice de sesiones.
    writeFileSync(join(carpeta, nombreFinal), datos, { mode: 0o600 });
    // Un .zip se DESCOMPRIME al lado: el agente ve sus ficheros sueltos (MyAllXOne: nadie podía abrirlo).
    if (!esZip(nombreFinal)) return { ok: true, nombre: nombreFinal };
    const extraccion = extraerZip(carpeta, nombreFinal, datos, topes.porSesion - ya - datos.length);
    return "extraidos" in extraccion
      ? { ok: true, nombre: nombreFinal, extraidos: extraccion.extraidos }
      : { ok: true, nombre: nombreFinal, sinExtraer: extraccion.motivo };
  } catch (error) {
    return { ok: false, motivo: `no se pudo guardar el adjunto (${codigoDe(error)})` };
  }
}

/**
 * Lo descomprimido de un zip: los ficheros bajo `carpeta/<sub>/`, recursivo, con el nombre relativo a
 * `carpeta`. Con las mismas cribas que el listado: cada segmento con nombre aceptable y `lstat` (ni un
 * enlace ni lo que no sea fichero cuenta).
 */
function extraidoDe(carpeta: string, sub: string, profundidad = 0): AdjuntoNombrable[] {
  if (profundidad > 8 || !nombreDeAdjuntoAceptable(sub.split("/").at(-1) ?? "")) return [];
  const dentro = join(carpeta, ...sub.split("/"));
  let nombres: string[];
  try {
    if (!lstatSync(dentro).isDirectory()) return [];
    nombres = readdirSync(dentro).sort();
  } catch {
    return [];
  }
  const salida: AdjuntoNombrable[] = [];
  for (const n of nombres) {
    if (!nombreDeAdjuntoAceptable(n)) continue;
    const relativo = `${sub}/${n}`;
    try {
      const info = lstatSync(join(dentro, n));
      if (info.isDirectory()) salida.push(...extraidoDe(carpeta, relativo, profundidad + 1));
      else if (info.isFile()) {
        const mime = mimeDeAdjunto(n);
        salida.push({ nombre: relativo, bytes: info.size, ...(mime === undefined ? {} : { mime }) });
      }
    } catch {
      continue;
    }
  }
  return salida;
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

  // Listar puede fallar aunque la carpeta exista (EACCES, o ENOTDIR si es un fichero), y esto
  // corre dentro de `consolaWeb#recibir`: un `throw` aquí se llevaría el mensaje de la persona.
  // Sin poder mirar, no hay adjuntos que afirmar — la regla de «se afirma solo si está en disco».
  let entradas: string[];
  try {
    entradas = readdirSync(carpeta).sort();
  } catch {
    return [];
  }
  const todos: AdjuntoNombrable[] = [];
  for (const nombre of entradas) {
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
    const contenido = esZip(nombre) ? extraidoDe(carpeta, carpetaDeExtraccion(nombre)) : [];
    todos.push({ nombre, bytes, ...(mime === undefined ? {} : { mime }), ...(contenido.length === 0 ? {} : { contenido }) });
  }

  if (nombres === undefined) return todos;
  const porNombre = new Map(todos.map((a) => [a.nombre, a]));
  return nombres.reduce<AdjuntoNombrable[]>((salida, n) => {
    const a = porNombre.get(n);
    if (a !== undefined) salida.push(a);
    return salida;
  }, []);
}
