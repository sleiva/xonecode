/**
 * Eventos que nacen FUERA del flujo del grafo, entrelazados con él.
 *
 * Existe por un silencio medido: un agente EXTERNO (Claude Code) corre en otro proceso, así
 * que ni una de sus tools cruza el stream de langgraph — entre la línea de delegación y su
 * respuesta final hay minutos sin nada que mirar, y una pantalla quieta se lee como que se
 * ha colgado. Lo que hace falta no es una piel nueva: es que su actividad entre por el
 * MISMO sitio que la de todos, para que el colapsador la agrupe igual (`core/notify.ts`),
 * la bitácora la cuente igual y las tres pieles no se enteren de que hay dos orígenes.
 *
 * Es la misma forma que `conVerificacion`: un generador que envuelve a `aEventos`. La
 * diferencia es que aquél añade AL FINAL y este tiene que intercalar MIENTRAS, que es lo
 * único delicado de este fichero.
 */

import type { DomainEvent } from "./events.js";

/**
 * El buzón por el que se empujan esos eventos. Quien lo llena no sabe nada del flujo, y
 * quien lo vacía no sabe nada de quién lo llena — que es lo que permite que el adaptador
 * del agente externo viva en `agent/` sin conocer el turno.
 */
export class ColaDeEventos {
  private cola: DomainEvent[] = [];
  private avisar: (() => void) | undefined;

  /** Encola y despierta a quien esté esperando. Nunca bloquea a quien lo llama. */
  empujar(evento: DomainEvent): void {
    this.cola.push(evento);
    const avisar = this.avisar;
    this.avisar = undefined;
    avisar?.();
  }

  /** Se lleva lo que haya, de una vez. Vacío es una respuesta válida. */
  vaciar(): DomainEvent[] {
    const salida = this.cola;
    this.cola = [];
    return salida;
  }

  /**
   * Una promesa que se resuelve cuando hay algo. Se guarda UN solo resolutor: si hubiera una
   * cola de esperas, la de una vuelta anterior seguiría viva y despertaría de más.
   */
  esperar(): Promise<void> {
    if (this.cola.length > 0) return Promise.resolve();
    return new Promise<void>((resuelto) => {
      this.avisar = resuelto;
    });
  }
}

/**
 * El flujo del grafo más lo que se vaya encolando, en el orden en que ocurre.
 *
 * **La trampa de este fichero, y la razón de que `siguiente` sea una variable:** un
 * `AsyncIterator` no admite dos `next()` vivos a la vez —el segundo se comería un valor o
 * reventaría según la implementación—, así que se pide UNA vez, se guarda la promesa y se
 * vuelve a esperar la MISMA en cada vuelta de la carrera. Solo cuando esa promesa se ha
 * consumido de verdad se pide la siguiente. Volver a llamar a `it.next()` en cada vuelta
 * sería el bug clásico de este patrón: se pierden eventos justo cuando hay actividad en los
 * dos lados, que es cuando esto se usa.
 *
 * Y lo que quede encolado cuando el flujo se agota se dice IGUAL, antes de terminar: un
 * evento que llegó tarde no es un evento que no ocurrió.
 */
export async function* entrelazar(
  fuente: AsyncIterable<DomainEvent>,
  cola: ColaDeEventos
): AsyncIterable<DomainEvent> {
  const it = fuente[Symbol.asyncIterator]();
  let siguiente = it.next();
  try {
    for (;;) {
      const cual = await Promise.race([
        siguiente.then((r) => ({ de: "fuente" as const, r })),
        cola.esperar().then(() => ({ de: "cola" as const })),
      ]);
      if (cual.de === "cola") {
        for (const ev of cola.vaciar()) yield ev;
        continue;
      }
      if (cual.r.done === true) break;
      yield cual.r.value;
      siguiente = it.next();
    }
  } finally {
    // También si quien consume se va por un `break` o una excepción: el generador de dentro
    // tiene que cerrarse, o el stream de langgraph se queda abierto.
    await it.return?.();
  }
  for (const ev of cola.vaciar()) yield ev;
}
