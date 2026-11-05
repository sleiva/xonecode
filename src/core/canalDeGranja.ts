/**
 * La parte PURA del canal hotswap compartido con una copia de la granja (`agent/dispositivos/releDeGranja.ts`).
 *
 * Medido en la granja real: conectarse a su puerta `/ws/hotswap` COGE la copia, una segunda conexión al mismo
 * canal ECHA a la primera, y cerrar no la libera. Por eso el harness abre UNA conexión por sesión durante el turno
 * y le pasa por ella los comandos de todos los scripts: ni se echan entre ellos, ni la copia se queda sin cliente
 * (que a los diez minutos la granja libera y BORRA). Aquí vive lo que eso decide sin sockets: qué copia pedir y a
 * qué script le toca cada respuesta.
 */

/** Una copia del framework en un teléfono de la granja: lo que hace falta para hablarle y para liberarla. */
export interface CopiaDeGranja {
  serial: string;
  numero: number;
  /** «Pixel 3», para decirlo; el serial no le dice nada a una persona. */
  telefono: string;
}

/**
 * Las copias que se pueden pedir, en el orden en que se prueban: de teléfonos `ready`, `running`, sin dueño y con su
 * canal sin marcar como caído (`hotswap.ok`). Primero
 * las del teléfono con MÁS libres —reparte la carga y deja a otros las de los teléfonos casi llenos—; dentro de un
 * teléfono, por número. Las ya `descartadas` (otro se la llevó entre medias) no vuelven a salir.
 */
export function copiasLibres(estado: unknown, descartadas: readonly CopiaDeGranja[] = []): CopiaDeGranja[] {
  if (typeof estado !== "object" || estado === null) return [];
  const dispositivos = (estado as { devices?: unknown }).devices;
  if (!Array.isArray(dispositivos)) return [];
  const porTelefono: CopiaDeGranja[][] = [];
  for (const d of dispositivos) {
    if (typeof d !== "object" || d === null) continue;
    const t = d as { serial?: unknown; state?: unknown; slots?: unknown; info?: { manufacturer?: unknown; model?: unknown } };
    if (t.state !== "ready" || typeof t.serial !== "string" || !Array.isArray(t.slots)) continue;
    const modelo = typeof t.info?.model === "string" ? t.info.model : t.serial;
    const libres: CopiaDeGranja[] = [];
    for (const s of t.slots) {
      if (typeof s !== "object" || s === null) continue;
      const c = s as { number?: unknown; owner?: unknown; state?: unknown; hotswap?: { ok?: unknown } };
      if (typeof c.number !== "number" || c.state !== "running" || (c.owner !== null && c.owner !== undefined)) continue;
      // Su canal no contestó en la última comprobación de la granja: pedirla sería coger una copia muda.
      if (c.hotswap?.ok === false) continue;
      const copia = { serial: t.serial, numero: c.number, telefono: modelo };
      if (!descartadas.some((x) => mismaCopia(x, copia))) libres.push(copia);
    }
    if (libres.length > 0) porTelefono.push(libres.sort((a, b) => a.numero - b.numero));
  }
  return porTelefono.sort((a, b) => b.length - a.length).flat();
}

/** Un teléfono al que se le puede pedir UNA copia más (`POST /api/devices/:serial/copies`): las que tiene, y dónde. */
export interface TelefonoParaCrearCopia {
  serial: string;
  telefono: string;
  /** Las copias que tiene ya (`copies`): la nueva será la `copias + 1`. */
  copias: number;
}

/**
 * **Sin copias libres, la granja puede CREAR una** (protocolo, §5: un usuario normal puede SUBIR `count`, y las nuevas
 * quedan a su nombre). Medido el 05-11-2026: tres teléfonos `ready` con 0 copias y los emuladores apagados daban «no hay
 * ninguna copia libre» en cada despliegue, y la tarea escribía la calculadora entera sin probarla. El teléfono: `ready`,
 * sin estar ya cambiando sus copias (`copiesBusy`), por debajo de `copiesMax` y con sitio en su RAM (`copiesFit`, si lo
 * dice); primero el que más admite. Un emulador apagado no está `ready`: no se arranca desde aquí.
 */
export function telefonoParaCrearCopia(estado: unknown): TelefonoParaCrearCopia | undefined {
  if (typeof estado !== "object" || estado === null) return undefined;
  const dispositivos = (estado as { devices?: unknown }).devices;
  if (!Array.isArray(dispositivos)) return undefined;
  const candidatos: (TelefonoParaCrearCopia & { caben: number })[] = [];
  for (const d of dispositivos) {
    if (typeof d !== "object" || d === null) continue;
    const t = d as { serial?: unknown; state?: unknown; copies?: unknown; copiesMax?: unknown; copiesBusy?: unknown; copiesFit?: unknown; info?: { model?: unknown } };
    if (t.state !== "ready" || typeof t.serial !== "string" || t.copiesBusy === true) continue;
    if (typeof t.copies !== "number" || typeof t.copiesMax !== "number" || t.copies >= t.copiesMax) continue;
    const caben = typeof t.copiesFit === "number" ? t.copiesFit : 1;
    if (caben <= 0) continue;
    candidatos.push({ serial: t.serial, telefono: typeof t.info?.model === "string" ? t.info.model : t.serial, copias: t.copies, caben });
  }
  const elegido = candidatos.sort((a, b) => b.caben - a.caben)[0];
  return elegido === undefined ? undefined : { serial: elegido.serial, telefono: elegido.telefono, copias: elegido.copias };
}

/** La copia `numero` de ese teléfono ya ARRANCADA (`running`, canal sin marcar como caído), sea de quien sea: la recién creada es nuestra. */
export function copiaRecienCreada(estado: unknown, serial: string, numero: number, telefono: string): CopiaDeGranja | undefined {
  const dispositivos = (estado as { devices?: unknown } | null)?.devices;
  if (!Array.isArray(dispositivos)) return undefined;
  const t = dispositivos.find((d) => (d as { serial?: unknown } | null)?.serial === serial) as { slots?: unknown } | undefined;
  if (!Array.isArray(t?.slots)) return undefined;
  const c = t.slots.find((x) => (x as { number?: unknown } | null)?.number === numero) as { state?: unknown; hotswap?: { ok?: unknown } } | undefined;
  return c !== undefined && c.state === "running" && c.hotswap?.ok !== false ? { serial, numero, telefono } : undefined;
}

/** La resolución que se le pone a una copia `native`: la de un móvil, 9:16, como las maquetas de teléfono. */
export const RESOLUCION_DE_LA_COPIA = "1080p";

/**
 * ¿Hay que ponerle resolución a esa copia, y cuál? Solo si está en `native` —la pantalla física del teléfono— y la
 * granja tiene el preset. Medido el 05-11-2026: en un SM-F946B (plegable) `native` daba 1808×2176, casi cuadrada, y
 * la calculadora de una maqueta de móvil salía con el teclado cortado y el crítico en rojo dos vueltas. Un preset
 * elegido por alguien (no `native`) no se toca. `undefined` = no hay nada que cambiar.
 */
export function resolucionQuePoner(estado: unknown, config: unknown, copia: CopiaDeGranja, deseada = RESOLUCION_DE_LA_COPIA): string | undefined {
  const presets = (config as { resolutions?: unknown } | null)?.resolutions;
  if (!Array.isArray(presets) || !presets.some((p) => (p as { id?: unknown } | null)?.id === deseada)) return undefined;
  const dispositivos = (estado as { devices?: unknown } | null)?.devices;
  if (!Array.isArray(dispositivos)) return undefined;
  const t = dispositivos.find((d) => (d as { serial?: unknown } | null)?.serial === copia.serial) as { slots?: unknown } | undefined;
  const slot = Array.isArray(t?.slots) ? (t.slots.find((x) => (x as { number?: unknown } | null)?.number === copia.numero) as { settings?: { resolution?: unknown } } | undefined) : undefined;
  const actual = slot?.settings?.resolution;
  return actual === "native" ? deseada : undefined;
}

export function mismaCopia(a: CopiaDeGranja, b: CopiaDeGranja): boolean {
  return a.serial === b.serial && a.numero === b.numero;
}

/** Cómo se nombra una copia a una persona: «Pixel 3 · copia 2». */
export function nombreDeCopia(c: CopiaDeGranja): string {
  return `${c.telefono} · copia ${c.numero}`;
}

/**
 * A qué cliente local le toca cada respuesta del canal compartido.
 *
 * El protocolo hotswap contesta UNA respuesta por comando y EN ORDEN (`agent/dispositivos/hotswap.ts` empareja igual,
 * con su cola de pendientes), y el servidor saluda primero con `server_hello`. Así que basta una cola FIFO de quién
 * mandó cada comando: no hace falta serializar a los scripts, pueden mandar varios seguidos. El saludo no consume
 * turno —se guarda para dárselo a cada cliente que llega—, y una respuesta sin nadie esperándola no se le da a nadie
 * (dársela al siguiente sería contestar una pregunta con la respuesta de otra).
 */
export class EnrutadorDeCanal<Cliente> {
  #esperando: Cliente[] = [];
  #saludo: string | undefined;

  /** El saludo del canal, si ya llegó: se le repite a cada cliente local nuevo como si fuera suyo. */
  get saludo(): string | undefined {
    return this.#saludo;
  }

  /** Un cliente mandó un comando: la PRÓXIMA respuesta que no sea saludo es suya. */
  enviado(cliente: Cliente): void {
    this.#esperando.push(cliente);
  }

  /** Llegó algo del canal. Devuelve a quién dárselo, o `undefined` (saludo, o nadie esperaba). */
  recibido(texto: string): Cliente | undefined {
    if (esSaludo(texto)) {
      this.#saludo = texto;
      return undefined;
    }
    return this.#esperando.shift();
  }

  /**
   * Un cliente se fue. Sus respuestas pendientes siguen ocupando su sitio en la cola —el canal las va a mandar igual—,
   * pero ya no se entregan: se cambian por un hueco, para que la siguiente no se desplace a otro cliente.
   */
  olvidar(cliente: Cliente, hueco: Cliente): void {
    this.#esperando = this.#esperando.map((c) => (c === cliente ? hueco : c));
  }

  /** El canal se cerró: nada de lo pendiente va a llegar. Devuelve quiénes esperaban, para avisarlos. */
  vaciar(): Cliente[] {
    const quienes = this.#esperando;
    this.#esperando = [];
    this.#saludo = undefined;
    return quienes;
  }
}

function esSaludo(texto: string): boolean {
  try {
    return (JSON.parse(texto) as { command?: unknown }).command === "server_hello";
  } catch {
    return false;
  }
}
