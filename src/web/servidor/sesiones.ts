/**
 * Las sesiones de un proyecto, en su `.xonecode/sesiones/`.
 *
 * Ahí y no en global porque la sesión es del proyecto, ya hay precedente
 * (`conversation_history/` en `agent/memoriaDeProyecto.ts`), la carpeta está denegada
 * entera al agente (`permisosDe`) y **no sube nunca** a CloudStudio — el mismo trato que
 * `.xonecode/` recibe en todas partes de este repo.
 *
 * Se guardan **actos** (`core/actos.ts`), no `DomainEvent`. La distinción no es cosmética:
 * ningún evento lleva el texto que escribió el usuario — `tool.detalle` es la única
 * excepción, y es una lista blanca de campo de ruta, nunca prosa —, así que un fichero de
 * eventos daría una sesión reabierta con respuestas y sin preguntas. Y por construcción no
 * hay filtrado que hacer para cumplir «nada de diffs ni contenido de fichero»: el tipo
 * `Acto` no tiene ningún campo que pueda llevarlos. El único sitio del sistema donde el
 * contenido de un fichero viaja es el mensaje de aprobación
 * (`consolaWeb.ts#aprobacionesTui`), que no es un acto y se suelta en cuanto hay decisión
 * — nunca llega aquí.
 *
 * Reabrir es RELEER, no seguir hablando: el hilo del agente vive en un `MemorySaver`
 * (`agent/turnoReal.ts`, `agent/xoneAgent.ts`) que muere con el proceso. Un checkpointer
 * persistente es una fase posterior, deliberadamente fuera de alcance aquí. La sesión
 * reabierta se marca `historica` y la interfaz lo dice, porque fingir que la conversación
 * continúa cuando el modelo no recuerda nada sería justo la clase de mentira muda que este
 * repo evita (`bitacora.ts` es el mismo principio aplicado a los avisos de honestidad).
 * `historica` no se escribe a disco — no es un campo de `EntradaIndice` ni del `.jsonl` —
 * porque es un hecho del MOMENTO de reabrir, no del estado de la sesión: quien reabre
 * decide en memoria cuándo el primer turno nuevo la desactiva, y persistir la marca
 * obligaría a un segundo sitio a mantenerla sincronizada con ese momento.
 *
 * `indice.json` se reescribe entero (es pequeño, una entrada por sesión) con el mismo
 * cuidado atómico que `agent/settingsEnDisco.ts#escribirAtomico` — temporal + `renameSync`,
 * porque un `writeFileSync` a medias tras un crash dejaría corrompido el índice de TODAS
 * las sesiones, no solo la que se estaba anotando. El `.jsonl` de una sesión, en cambio, se
 * **anexa** (`appendFileSync`): reescribirlo entero en cada acto lo haría cuadrático en el
 * número de actos de la sesión, y arriesgaría perder la sesión completa a un crash a mitad
 * de escritura en vez de, como mucho, la última línea — que `reabrirSesion` ya tolera.
 */

import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Acto } from "../../core/actos.js";
import { segmentoSeguro } from "../../core/settings.js";

/** Cuántos caracteres de la primera prosa del usuario se guardan como título. */
const LARGO_TITULO = 80;

export interface EntradaIndice {
  id: string;
  titulo: string;
  creada: string;
  ultimoTurno: string;
}

export interface SesionReabierta {
  id: string;
  actos: Acto[];
  /** Siempre `true`: `reabrirSesion` solo se llama para releer una sesión ya cerrada. */
  historica: boolean;
}

function carpetaSesiones(raiz: string): string {
  return join(raiz, ".xonecode", "sesiones");
}

function rutaIndice(raiz: string): string {
  return join(carpetaSesiones(raiz), "indice.json");
}

/** `crearSesion` genera el id con `randomUUID()`, pero `anotarActo` y `reabrirSesion` lo
 * reciben tal cual llega del cliente por HTTP: sin esta guarda un id como `"../../.env"`
 * compondría una ruta fuera de `sesiones/`. Misma función que usa `rutaDeWorkspace` en
 * `core/settings.ts`, no una copia — dos copias es cómo diverge la guarda el día que una
 * se corrija y la otra no.
 */
function rutaJsonl(raiz: string, id: string): string {
  return join(carpetaSesiones(raiz), `${segmentoSeguro(id, "id de sesión")}.jsonl`);
}

/** Una entrada que no es un objeto reconocible no cuenta: sin este filtro, un índice con
 * basura colada (`[null]`, `[42]`) hace que `entradas.find` reviente en cuanto alguien lea
 * `.id` de un elemento que no lo tiene.
 */
function esEntrada(v: unknown): v is EntradaIndice {
  return typeof v === "object" && v !== null && typeof (v as { id?: unknown }).id === "string";
}

/** Lee el índice para MOSTRARLO (`listarSesiones`); sin fichero o con JSON roto, una lista
 * vacía — un índice no se puede reconstruir solo leyéndolo, así que fallar aquí no puede
 * tumbar la reapertura de ninguna sesión (mismo principio que la línea corrupta del
 * `.jsonl`, aplicado al índice). Nunca la uses como base de una ESCRITURA: ver
 * `leerIndiceOAbortar`.
 */
function leerIndice(raiz: string): EntradaIndice[] {
  const ruta = rutaIndice(raiz);
  if (!existsSync(ruta)) return [];
  try {
    const bruto: unknown = JSON.parse(readFileSync(ruta, "utf8"));
    return Array.isArray(bruto) ? bruto.filter(esEntrada) : [];
  } catch {
    return [];
  }
}

/** Un índice roto (JSON que no parsea, o que no es una lista) no se puede persistir como
 * base: usar aquí la lista vacía que devuelve `leerIndice` para un JSON roto BORRARÍA del
 * disco todas las sesiones que el índice roto todavía nombraba — el `.jsonl` de cada
 * sesión sigue intacto, pero sin su entrada es irrecuperable. Misma disciplina que
 * `settingsEnDisco.ts#leerCrudoOAbortar`: la lectura que alimenta una escritura PARA sin
 * escribir ante JSON roto, en vez de recuperar el fichero por su cuenta.
 */
export class IndiceDeSesionesRoto extends Error {}

function leerIndiceOAbortar(raiz: string): EntradaIndice[] {
  const ruta = rutaIndice(raiz);
  if (!existsSync(ruta)) return [];
  let bruto: unknown;
  try {
    bruto = JSON.parse(readFileSync(ruta, "utf8"));
  } catch {
    throw new IndiceDeSesionesRoto(`«${ruta}»: el JSON es inválido; no se sobrescribe. Edita el fichero a mano.`);
  }
  if (!Array.isArray(bruto)) {
    throw new IndiceDeSesionesRoto(`«${ruta}»: el JSON raíz debe ser una lista; no se sobrescribe.`);
  }
  return bruto.filter(esEntrada);
}

/** Temporal + `renameSync`, igual que `settingsEnDisco.ts#escribirAtomico`: un rename es
 * atómico y un `writeFileSync` directo no lo es, así que un crash a mitad de escritura
 * dejaría el índice de TODAS las sesiones truncado en vez de solo la última entrada.
 */
function escribirIndice(raiz: string, entradas: EntradaIndice[]): void {
  const carpeta = carpetaSesiones(raiz);
  mkdirSync(carpeta, { recursive: true });
  const ruta = rutaIndice(raiz);
  const temporal = join(carpeta, `.indice.json.${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporal, "w");
    writeFileSync(descriptor, JSON.stringify(entradas, null, 2) + "\n", "utf8");
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporal, ruta);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Un fallo al cerrar durante la recuperación no puede impedir borrar el temporal.
      }
    }
    try {
      unlinkSync(temporal);
    } catch {
      // Si no llegó a crearse, no hay nada que limpiar.
    }
    throw error;
  }
}

/** Crea una sesión nueva y devuelve su id. El id es `randomUUID()`: no compone rutas por
 * construcción, pero pasa igualmente por `rutaJsonl` (vía `segmentoSeguro`) en cuanto se
 * anota o se reabre — la guarda no distingue de dónde vino el id.
 */
export function crearSesion(raiz: string): string {
  const id = randomUUID();
  const ahora = new Date().toISOString();
  const entradas = leerIndiceOAbortar(raiz);
  entradas.push({ id, titulo: "", creada: ahora, ultimoTurno: ahora });
  escribirIndice(raiz, entradas);
  return id;
}

/** Anexa un acto al `.jsonl` de la sesión y refresca su entrada en el índice: fija el
 * título en el PRIMER acto `usuario` (y no se vuelve a tocar) y actualiza `ultimoTurno`
 * en cada llamada, sea cual sea el tipo de acto.
 *
 * El anexado va ANTES de tocar el índice a propósito: si el índice está roto y
 * `leerIndiceOAbortar` lanza, el acto ya quedó escrito. Un turno completo no se pierde
 * solo porque el índice —que es prescindible, se puede reconstruir barriendo los
 * `.jsonl`— esté corrompido.
 */
export function anotarActo(raiz: string, id: string, acto: Acto): void {
  const ruta = rutaJsonl(raiz, id);
  mkdirSync(carpetaSesiones(raiz), { recursive: true });
  appendFileSync(ruta, JSON.stringify(acto) + "\n", "utf8");

  const ahora = new Date().toISOString();
  const entradas = leerIndiceOAbortar(raiz);
  const entrada = entradas.find((e) => e.id === id);
  if (entrada === undefined) {
    // Anotar sin haber pasado por `crearSesion` (no debería pasar por el flujo normal,
    // pero un índice perdido o corrupto no puede tumbar la escritura del acto, que ya
    // ocurrió arriba): se da de alta la entrada con lo que se sabe en este momento.
    entradas.push({
      id,
      titulo: acto.tipo === "usuario" ? acto.texto.slice(0, LARGO_TITULO) : "",
      creada: ahora,
      ultimoTurno: ahora,
    });
  } else {
    if (entrada.titulo === "" && acto.tipo === "usuario") entrada.titulo = acto.texto.slice(0, LARGO_TITULO);
    entrada.ultimoTurno = ahora;
  }
  escribirIndice(raiz, entradas);
}

/** El índice completo, tal cual lo enseña la lista de sesiones del proyecto. */
export function listarSesiones(raiz: string): EntradaIndice[] {
  return leerIndice(raiz);
}

/** Relee una sesión entera. Una línea que no parsea (fichero truncado a mitad de un
 * `appendFileSync`, por ejemplo por un crash) se SALTA en vez de tumbar la reapertura: una
 * sesión que no se puede reabrir porque una línea se truncó es peor que una que reabre con
 * una línea de menos.
 */
export function reabrirSesion(raiz: string, id: string): SesionReabierta {
  const ruta = rutaJsonl(raiz, id);
  const actos: Acto[] = [];
  if (existsSync(ruta)) {
    for (const linea of readFileSync(ruta, "utf8").split("\n")) {
      if (linea.trim() === "") continue;
      try {
        actos.push(JSON.parse(linea) as Acto);
      } catch {
        // Línea corrupta: se salta, no se tumba la reapertura (ver comentario de cabecera).
      }
    }
  }
  return { id, actos, historica: true };
}
