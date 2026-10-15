/**
 * El REFLEJO de una tarea en background en su gestor (Jira, Notion…): cuando cambia de estado, el harness escribe en
 * su ticket —EN CURSO al empezar; comentario de cierre y PROBAR al terminar—. Ver
 * `docs/superpowers/specs/2026-10-15-tareas-desde-el-gestor-design.md`.
 *
 * **Un solo punto de entrada: el `guardar` del almacén.** Hay al menos cinco escritores de estado (el corredor al
 * empezar y al aparcar, la reconciliación del arranque, terminar a mano, parar): engancharse a cada uno se olvida en el
 * sexto. `conReflejoAlGuardar` envuelve el almacén, compara la cola de antes y la de después, y la regla PURA de
 * `core/tareasEnElGestor.ts` dice qué escribir.
 *
 * **Fire-and-forget, con su propio `try`**: quien guarda (el corredor, una ruta) no espera a Jira ni se entera de un
 * fallo. Lo que falla se APUNTA en el ticket de la tarea (`ticket.aviso`) y se pinta en su fila; lo que sale bien
 * borra el aviso anterior. Los reflejos de un MISMO ticket van en cola: «empezar» y «cerrar» no se adelantan.
 */
import type { DatosDeCierre, GestorDeTareasPort } from "../../core/gestorDeTareas.js";
import { comentarioDeCierre } from "../../core/gestorDeTareas.js";
import type { Tarea } from "../../core/tareas.js";
import {
  cerrarTicket, esEstado, hayQueTransicionar, reflejosPendientes, transicionHacia, vinculoDelTicket, type ReflejoPendiente,
} from "../../core/tareasEnElGestor.js";
import type { TareasEnDisco } from "./tareasEnDisco.js";

/** El almacén con el `guardar` vigilado: lo demás pasa tal cual. */
export function conReflejoAlGuardar(disco: TareasEnDisco, reflejar: (pendientes: ReflejoPendiente[]) => void): TareasEnDisco {
  return {
    ...disco,
    guardar(tareas) {
      const antes = disco.listar();
      disco.guardar(tareas);
      const pendientes = reflejosPendientes(antes, tareas);
      if (pendientes.length > 0) reflejar(pendientes);
    },
  };
}

export interface OpcionesDelReflejo {
  /** El gestor de un conector (la misma fábrica memoizada que usa el panel). */
  gestorDe: (conector: string) => GestorDeTareasPort | undefined;
  /** Lo que lleva el comentario de cierre de ESA tarea (ficheros, commits, verificador, última respuesta). */
  datosDeCierre: (tarea: Tarea) => Promise<DatosDeCierre>;
  /** Apunta (o borra, con `undefined`) el aviso del ticket de una tarea, sin tocar nada más. */
  anotarAviso: (id: string, aviso: string | undefined) => void;
  /** Un error del gestor como texto que puede cruzar el cable (sin correos, sin rutas, recortado). */
  motivoDe: (error: unknown) => string;
  informar?: (texto: string) => void;
}

/** La función que recibe `conReflejoAlGuardar`: lanza cada reflejo y devuelve el control en el acto. */
export function crearReflejoEnElGestor(o: OpcionesDelReflejo): ((pendientes: ReflejoPendiente[]) => void) & { enCurso: () => Promise<void> } {
  /** La cola de cada ticket: un reflejo espera al anterior del mismo ticket. */
  const colas = new Map<string, Promise<void>>();

  const aplicar = async ({ tarea, escritura }: ReflejoPendiente): Promise<void> => {
    const { ticket } = tarea;
    const g = o.gestorDe(ticket.conector);
    if (g === undefined) {
      o.anotarAviso(tarea.id, `no se pudo escribir en ${ticket.clave}: el conector «${ticket.conector}» no es un gestor de tareas`);
      return;
    }
    const v = vinculoDelTicket(ticket);
    try {
      if (escritura === "empezar") {
        const ficha = await g.ficha(v, ticket.clave);
        // Ya está donde tiene que estar: la movió la persona (es lo que la LANZA, en la puerta 2) o es una reanudación.
        if (esEstado(ficha.estado, ticket.estados?.lanzar) || !hayQueTransicionar("empezar", ficha.categoria)) return limpiar(tarea);
        const t = transicionHacia(await g.transiciones(v, ticket.clave), "empezar", ticket.estados);
        if (t === undefined) {
          o.anotarAviso(tarea.id, `no se pudo pasar ${ticket.clave} a ${ticket.estados?.lanzar ?? "EN CURSO"}: su flujo no ofrece esa transición ahora`);
          return;
        }
        await g.transicionar(v, ticket.clave, t.id);
        return limpiar(tarea);
      }
      const comentario = comentarioDeCierre(await o.datosDeCierre(tarea));
      const t = transicionHacia(await g.transiciones(v, ticket.clave), "cerrar", ticket.estados);
      const { falloDeTransicion } = await cerrarTicket(g, v, ticket.clave, comentario, t?.id, o.motivoDe);
      if (falloDeTransicion !== undefined) {
        o.anotarAviso(tarea.id, `se comentó el cierre en ${ticket.clave}, pero no se pudo pasar a ${t?.destino ?? "su estado final"}: ${falloDeTransicion}`);
      } else if (t === undefined) {
        o.anotarAviso(tarea.id, `se comentó el cierre en ${ticket.clave}, pero su flujo no ofrece una transición a ${ticket.estados?.terminar ?? "un estado de terminada"}`);
      } else {
        limpiar(tarea);
      }
    } catch (error) {
      const que = escritura === "empezar" ? `pasar ${ticket.clave} a EN CURSO` : `cerrar ${ticket.clave}`;
      o.anotarAviso(tarea.id, `no se pudo ${que}: ${o.motivoDe(error)}`);
    }
  };

  /** Lo que salió bien borra el aviso de la vez anterior; sin aviso no se escribe nada. */
  const limpiar = (tarea: ReflejoPendiente["tarea"]): void => {
    if (tarea.ticket.aviso !== undefined) o.anotarAviso(tarea.id, undefined);
  };

  const reflejar = (pendientes: ReflejoPendiente[]): void => {
    for (const p of pendientes) {
      const clave = `${p.tarea.ticket.conector}/${p.tarea.ticket.sitio}/${p.tarea.ticket.clave}`;
      const siguiente = (colas.get(clave) ?? Promise.resolve())
        .then(() => aplicar(p))
        .catch((error) => o.informar?.(`el reflejo de una tarea en su gestor falló sin control (${o.motivoDe(error)})`));
      colas.set(clave, siguiente);
      void siguiente.finally(() => {
        if (colas.get(clave) === siguiente) colas.delete(clave);
      });
    }
  };
  /** Para los tests y para un cierre ordenado: espera a lo que esté en marcha. */
  const enCurso = async (): Promise<void> => {
    await Promise.all([...colas.values()]);
  };
  return Object.assign(reflejar, { enCurso });
}

/** `anotarAviso` sobre el almacén: relee la cola y cambia SOLO `ticket.aviso` de esa tarea (el estado no se toca, así
 *  que no vuelve a disparar ningún reflejo). Una tarea que ya no está (descartada) no se resucita. */
export function anotarAvisoEnElDisco(disco: Pick<TareasEnDisco, "listar" | "guardar">): (id: string, aviso: string | undefined) => void {
  return (id, aviso) => {
    const lista = disco.listar();
    const t = lista.find((x) => x.id === id);
    if (t?.ticket === undefined) return;
    const { aviso: _anterior, ...ticket } = t.ticket;
    disco.guardar(lista.map((x) => (x.id === id ? { ...x, ticket: aviso === undefined ? ticket : { ...ticket, aviso } } : x)));
  };
}
