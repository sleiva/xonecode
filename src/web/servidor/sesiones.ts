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
 * Reabrir ya NO es releer, y este fichero dejó de ser la única memoria. El hilo del agente
 * vive en el checkpointer de SQLite del proyecto (`agent/checkpointer.ts`), indexado por el
 * mismo id que titula estas entradas, así que una sesión reabierta continúa de verdad. Lo
 * que sigue viviendo aquí es el TRANSCRIPT —lo que se pinta—, y son dos cosas distintas a
 * propósito: un acto no puede llevar contenido de fichero ni argumentos de tool, y un
 * checkpoint los lleva todos. Por eso el `.jsonl` puede viajar y el `.sqlite` no.
 * `historica` deja de ser «se reabrió» y pasa a ser un hecho comprobado: se pregunta al
 * checkpointer, y solo se marca si de ese hilo no queda memoria —una sesión de antes de que
 * esto existiera, o una cuyo primer turno nunca corrió—. Fingir que la conversación continúa
 * cuando el modelo no recuerda nada sería justo la clase de mentira muda que este repo evita
 * (`bitacora.ts` es el mismo principio aplicado a los avisos de honestidad).
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
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { Acto } from "../../core/actos.js";
import { carpetaDeArtefactosDeSesion } from "../../core/artefactos.js";
import { segmentoSeguro } from "../../core/settings.js";
import { tituloDesde } from "../../core/textos.js";

/** Cuántos caracteres de la primera prosa del usuario se guardan como título. */
const LARGO_TITULO = 80;

/**
 * El título automático de una sesión, a partir de su primera petición.
 *
 * Se movió a `core/textos.ts` cuando las TAREAS necesitaron el mismo título: `core/` no
 * puede importar de `web/`, y una segunda copia habría divergido. Se reexporta con su
 * nombre de siempre porque `anotarActo`, en este mismo fichero, y sus tests lo usan desde
 * aquí.
 */
export { tituloDesde };

/**
 * El dispositivo preferido de una sesión: con cuál trabaja el agente.
 *
 * Se guarda la FOTO y no solo el id, y esa es la decisión que importa: los ids no son
 * estables. `emulator-5554` es un puerto, un AVD recién arrancado se queda con el serial que
 * haya libre, y el de un teléfono sobrevive pero el teléfono puede estar desenchufado. Con
 * solo el id, al reabrir una sesión el selector enseñaría un serial crudo o nada; con la
 * foto puede decir «iPhone 16 · no está ahora», que es lo que se sabe.
 *
 * Si está conectado AHORA no se guarda: eso se resuelve contra la última medida en el
 * momento de emitir. Un «conectado» escrito en disco es falso en cuanto se desenchufa.
 */
export interface DispositivoElegido {
  id: string;
  nombre: string;
  plataforma: "android" | "ios";
  clase: "emulador" | "simulador" | "fisico";
}

export interface EntradaIndice {
  id: string;
  titulo: string;
  creada: string;
  ultimoTurno: string;
  /** Con cuál trabaja el agente. Ausente = ninguno elegido. */
  dispositivo?: DispositivoElegido;
  /**
   * El id de la TAREA de fondo que abrió esta sesión, si la abrió una.
   *
   * Ausente es **«no consta»** y no «es una conversación»: no la lleva ninguna sesión
   * anterior a esta marca, ni la que se dé de alta por el camino defensivo de
   * `anotarActo` (índice perdido a mitad). Quien lo pinte tiene que tratarlo como el lado
   * conservador —liso—, no como una afirmación.
   *
   * Se guarda AQUÍ y no se deduce cruzando con la cola de tareas, que es lo que parecía
   * gratis: la cola es opcional en las dos capas —`OpcionesDeMontaje.colaDeTareas` y el
   * mensaje `tareas` del cable— y en un proceso que no las corre el cruce pintaría TODAS
   * las sesiones de tarea como conversaciones, en silencio y en la dirección equivocada.
   * Es el mismo camino que recorrió `historica`: de suposición a hecho comprobado.
   */
  tarea?: string;
}

export interface SesionReabierta {
  id: string;
  actos: Acto[];
  /** Siempre `true`: `reabrirSesion` solo se llama para releer una sesión ya cerrada. */
  historica: boolean;
  /** El dispositivo que tenía elegido. Ausente = ninguno, o la sesión es anterior a esto. */
  dispositivo?: DispositivoElegido;
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
/**
 * Da de alta una sesión en el índice.
 *
 * El id ENTRA por parámetro desde que es también el `thread_id` del grafo
 * (`agent/checkpointer.ts`): quien abre la consola lo decide al abrir, porque el hilo tiene
 * que existir antes del primer turno, y esto solo escribe la entrada. Sin id se genera uno,
 * que es lo que hacía siempre y lo que sigue valiendo para quien no tenga hilo.
 */
export function crearSesion(raiz: string, id: string = randomUUID(), tarea?: string): string {
  const ahora = new Date().toISOString();
  const entradas = leerIndiceOAbortar(raiz);
  // La marca se escribe SOLO aquí, que es el único sitio donde se da de alta la entrada por
  // el camino normal (`vestibulo.ts#volcar`, una vez por sesión) y donde se sabe por qué
  // puerta se abrió. Ponerla en `anotarActo` la haría viajar en cada acto para decidir
  // «solo si falta» en todos.
  entradas.push({ id, titulo: "", creada: ahora, ultimoTurno: ahora, ...(tarea === undefined ? {} : { tarea }) });
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
      titulo: acto.tipo === "usuario" ? tituloDesde(acto.texto) : "",
      creada: ahora,
      ultimoTurno: ahora,
    });
  } else {
    if (entrada.titulo === "" && acto.tipo === "usuario") entrada.titulo = tituloDesde(acto.texto);
    entrada.ultimoTurno = ahora;
  }
  escribirIndice(raiz, entradas);
}

/**
 * SIEMBRA la marca de tarea en una sesión que ya estaba en el índice. Devuelve si la tocó.
 *
 * Existe por las sesiones de tarea anteriores a `EntradaIndice.tarea`: sin esto, la primera
 * que hubo en cada proyecto se queda para siempre pintada como una conversación. La corre el
 * corredor al arrancar, recorriendo su propia cola — o sea leyendo la autoridad sobre de
 * quién es cada sesión, la misma que escribió el dato.
 *
 * **Es MONOTÓNICA, y de ahí sale que sea segura**: solo añade. No pisa una marca puesta —la
 * del disco es la que escribió quien abrió la sesión— y no quita ninguna, así que no hay
 * forma de que convierta una sesión de tarea en una conversación, que es el único fallo
 * abierto posible por aquí. Correrla dos veces no hace nada la segunda.
 *
 * Y **no da de alta la entrada que falte**: la cola vive en `~/.xonecode/tareas` y el índice
 * en el proyecto, así que una tarea puede nombrar una sesión que alguien borró; crearla la
 * resucitaría en la barra apuntando a un `.jsonl` que ya no está.
 */
export function marcarTareaDeSesion(raiz: string, id: string, tarea: string): boolean {
  const entradas = leerIndiceOAbortar(raiz);
  const entrada = entradas.find((e) => e.id === id);
  if (entrada === undefined || entrada.tarea !== undefined) return false;
  entrada.tarea = tarea;
  escribirIndice(raiz, entradas);
  return true;
}

/**
 * Borra una sesión: su `.jsonl` y su entrada del índice. Devuelve si había algo que borrar.
 *
 * El fichero va PRIMERO y el índice después, al revés que en `anotarActo` y por el mismo
 * razonamiento invertido: aquí lo que no se puede quedar a medias es una entrada de índice
 * apuntando a un fichero que ya no está —la sesión saldría en la barra y reventaría al
 * abrirla—. Al revés, un `.jsonl` huérfano no lo ve nadie: la barra se pinta con el índice.
 *
 * Un id desconocido devuelve `false` en vez de lanzar: borrar dos veces la misma sesión —dos
 * pestañas abiertas, un doble clic— no es un error, y lo único que hay que saber es si
 * quedaba algo.
 */
export function borrarSesion(raiz: string, id: string): boolean {
  const ruta = rutaJsonl(raiz, id);
  const habia = existsSync(ruta);
  if (habia) unlinkSync(ruta);
  // Y sus artefactos, que son de esta sesión y de nadie más. Sin esto, borrar una
  // conversación dejaría en disco los diagramas que se dibujaron en ella, invisibles desde
  // la interfaz — el mismo agujero que dejaba su hilo del checkpointer antes de
  // `olvidarHilo`. `force` porque la carpeta solo existe si el agente escribió algo.
  rmSync(dirname(carpetaDeArtefactosDeSesion(raiz, id)), { recursive: true, force: true });
  const entradas = leerIndiceOAbortar(raiz);
  const quedan = entradas.filter((e) => e.id !== id);
  if (quedan.length === entradas.length) return habia;
  escribirIndice(raiz, quedan);
  return true;
}

/**
 * Le pone nombre a una sesión. Devuelve si existía.
 *
 * Un título vacío se RECHAZA, y no es una validación de formulario: `anotarActo` fija el
 * título en el primer acto de usuario y solo mientras esté vacío (`entrada.titulo === ""`).
 * Dejarlo vacío devolvería la sesión al régimen automático, así que el siguiente turno la
 * rebautizaría con la primera frase y el nombre que puso una persona desaparecería sin más.
 * Se acota a `LARGO_TITULO` como los automáticos: la barra tiene el ancho que tiene.
 */
export function renombrarSesion(raiz: string, id: string, titulo: string): boolean {
  const limpio = titulo.trim().slice(0, LARGO_TITULO);
  if (limpio === "") return false;
  const entradas = leerIndiceOAbortar(raiz);
  const entrada = entradas.find((e) => e.id === id);
  if (entrada === undefined) return false;
  entrada.titulo = limpio;
  escribirIndice(raiz, entradas);
  return true;
}

/**
 * Fija —o quita, con `undefined`— el dispositivo preferido de una sesión.
 *
 * Devuelve si había una entrada que tocar: una sesión cuyo id todavía no existe en el índice
 * (nace al volcar el primer acto) no se puede anotar aquí, y quien llama tiene que guardarlo
 * en memoria hasta entonces — decirlo con un `false` es mejor que crear una entrada a medias
 * que la barra enseñaría como una sesión vacía.
 */
export function elegirDispositivo(raiz: string, id: string, dispositivo: DispositivoElegido | undefined): boolean {
  const entradas = leerIndiceOAbortar(raiz);
  const entrada = entradas.find((e) => e.id === id);
  if (entrada === undefined) return false;
  if (dispositivo === undefined) delete entrada.dispositivo;
  else entrada.dispositivo = dispositivo;
  escribirIndice(raiz, entradas);
  return true;
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
  // El dispositivo preferido sale del ÍNDICE y no del `.jsonl`: es un dato de la sesión, no
  // uno de sus actos, y reabrir tiene que devolverlo o la elección se perdería al releer.
  const dispositivo = leerIndice(raiz).find((e) => e.id === id)?.dispositivo;
  return { id, actos, historica: true, ...(dispositivo === undefined ? {} : { dispositivo }) };
}
