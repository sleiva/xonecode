import { ES_DOBLE } from "../core/ports.js";
import type { DomainEvent } from "../core/events.js";

/**
 * Un turno completo de pega, para ver el motor correr sin API ni red.
 *
 * Lleva la marca de doble: `xonecode describe` (fase 5) tiene que poder decir que lo que
 * está montado no es el agente de verdad. Un mock que no se declara hace creer que el
 * sistema funciona.
 *
 * El guion recorre a propósito las cosas que cuestan de pintar: una racha de tools, una
 * verificación en rojo, una reparación, y una respuesta troceada en varios mensajes.
 */
export class AgenteGuionizado {
  readonly [ES_DOBLE] = true;

  constructor(private readonly retardoMs = 0) {}

  async *turno(peticion: string): AsyncIterable<DomainEvent> {
    const pausa = async (): Promise<void> => {
      if (this.retardoMs > 0) await new Promise((r) => setTimeout(r, this.retardoMs));
    };

    yield { tipo: "fase", fase: "entendiendo" };
    await pausa();

    yield { tipo: "fase", fase: "planificando" };
    yield {
      tipo: "plan",
      tareas: [
        { id: "T1", descripcion: `[GUION] ${peticion}`, aceptacion: [] },
      ],
    };
    await pausa();

    yield { tipo: "tarea", id: "T1", indice: 1, total: 1, estado: "en-curso" };
    yield { tipo: "fase", fase: "ejecutando" };
    for (let i = 0; i < 3; i++) {
      yield { tipo: "tool", nombre: "read_file" };
      await pausa();
    }
    yield { tipo: "tool", nombre: "grep" };

    yield { tipo: "fase", fase: "verificando" };
    yield { tipo: "verificacion", verde: false, errores: 2, avisos: 1 };
    yield { tipo: "reparacion", intento: 1, tope: 3 };
    yield { tipo: "tool", nombre: "edit_file" };
    yield { tipo: "verificacion", verde: true, errores: 0, avisos: 0 };
    yield { tipo: "tarea", id: "T1", indice: 1, total: 1, estado: "hecha" };

    yield { tipo: "fase", fase: "respondiendo" };
    for (const trozo of ["Listo. ", "He recorrido ", "el turno entero ", "sin llamar a ningún modelo."]) {
      yield { tipo: "token", texto: trozo, msgId: "guion-1" };
      await pausa();
    }
  }
}