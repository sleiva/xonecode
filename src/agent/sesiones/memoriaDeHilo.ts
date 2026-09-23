/**
 * La memoria del agente de UNA sesión, sea cual sea el motor que la escribió.
 *
 * deepagents la guarda en el checkpointer de SQLite del proyecto (`checkpointer.ts`), y TrueForge
 * en la foto de su hilo raíz (`motores/trueforge/memoriaTrueforge.ts`). Quien pregunta —la web al
 * reabrir una sesión, el borrado de una sesión, una tarea que olvida su hilo— no sabe ni tiene por
 * qué saber cuál corrió, así que aquí se miran las dos.
 *
 * Vive aquí, exportado y con test, y no como dos lambdas en `arranque.ts`: compuesto en un cierre
 * que los tests doblan, «la web sabe de la memoria de TrueForge» sería una regla escrita y no
 * probada — el patrón de fallo de este repo.
 */
import { crearCheckpointerDeProyecto, hayCheckpoint, olvidarHilo } from "./checkpointer.js";
import { hayMemoria as hayMemoriaTrueforge, olvidarMemoria as olvidarMemoriaTrueforge } from "../motores/trueforge/memoriaTrueforge.js";

/** ¿Queda memoria de esta sesión que continuar? La de cualquiera de los dos motores. */
export async function hayMemoriaDeHilo(raiz: string, hilo: string): Promise<boolean> {
  return hayMemoriaTrueforge(raiz, hilo) || (await hayCheckpoint(crearCheckpointerDeProyecto(raiz), hilo));
}

/** Olvida la memoria de esta sesión en los DOS sitios: una sesión borrada no deja conversación en disco. */
export async function olvidarMemoriaDeHilo(raiz: string, hilo: string): Promise<void> {
  olvidarMemoriaTrueforge(raiz, hilo);
  await olvidarHilo(crearCheckpointerDeProyecto(raiz), hilo);
}
