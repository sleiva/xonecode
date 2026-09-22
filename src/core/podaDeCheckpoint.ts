/**
 * Cuándo adelgazar el `checkpoint.sqlite` de un proyecto, y qué se queda dentro.
 *
 * **El problema, medido**: un fichero de un proyecto real llegó a 918 MB con UNA sesión
 * dentro. No es basura acumulada — es que un checkpoint guarda la lista de mensajes ENTERA y
 * se escribe uno por paso del grafo, así que el coste crece con el CUADRADO de la
 * conversación: el primer checkpoint de esa sesión ocupaba 3 KB y el mayor 3.885 KB, con
 * 2.794 pasos. Y el 70 % no era del hilo: eran los 21 espacios `tools:*` de los subagentes,
 * cada delegación con su propia cadena.
 *
 * **Y no hay nada oficial que adoptar.** Comprobado contra el paquete instalado, no contra un
 * blog: `BaseCheckpointSaver` declara cinco métodos —`getTuple`, `list`, `put`, `putWrites`,
 * `deleteThread`— y ninguno poda; no existe `prune()` en JavaScript, y el único `ttl` del
 * paquete es el de `InMemoryCache`, que es la caché de un NODO y otra cosa. La doc de
 * persistencia reconoce el problema («prune old checkpoints periodically») sin dar una sola
 * API ni decir qué filas hacen falta para reanudar, y el issue de langgraph.js que pregunta
 * exactamente esto sigue abierto y sin contestar. Como el `SqliteSaver` es NUESTRO
 * (`vendor/sqliteSaver.ts`), el SQL lo escribimos aquí y no se espera a nadie.
 *
 * Este módulo es la REGLA y no toca disco: decide SI se poda. El SQL vive en
 * `agent/sesiones/checkpointer.ts`, que es quien ya tiene la conexión.
 */

/**
 * A partir de cuánto estorba, en bytes.
 *
 * **Dimensionada con lo medido, no elegida**: una sesión de 2.794 pasos YA PODADA ocupa
 * ~21 MB, así que 256 MB deja un orden de magnitud de margen y esto no puede cortar por lo
 * sano en un proyecto que se porta bien. Es un TECHO, no un objetivo: un proyecto que nunca
 * lo alcance no ejecuta la poda jamás.
 *
 * **Y la histéresis sale gratis de aquí**: podar deja el fichero en decenas de MB, o sea muy
 * por debajo de la cota, así que no puede reengancharse turno tras turno. El propio tamaño es
 * el estado, y por eso esto no necesita un fichero de marca ni recordar cuándo se podó — que
 * es justo el trasto que se acumula en este repo.
 */
export const COTA_DE_PODA_BYTES = 256 * 1024 * 1024;

export interface SituacionDeLaBase {
  /** Lo que ocupa el fichero AHORA. */
  bytes: number;
  /**
   * Si hay algo del grafo a medias: un subagente parado en una aprobación, una tarea
   * pendiente. Ausente es «no se pudo mirar».
   */
  hayPendientes?: boolean;
}

/**
 * ¿Toca podar?
 *
 * Dos condiciones, y la segunda es la que hace esto seguro:
 *
 * - **Pasa de la cota.** Si no, no hay nada que arreglar y mirar el tamaño cuesta un
 *   `statSync`, o sea nada.
 * - **No hay NADA pendiente.** Un subagente parado en una aprobación vive en su espacio
 *   `tools:*`, y podarlo a media aprobación se lleva la reanudación por delante. Es un
 *   predicado sobre datos que la base ya tiene, no una heurística.
 *
 * **Fail-closed: lo que no se sabe NO se poda** (`hayPendientes` ausente). La dirección
 * segura aquí es la que no borra: un fichero grande es un incordio, y una sesión que no
 * reanuda es trabajo perdido. La misma regla que «un verificador que no corrió no es verde».
 */
export function debePodar(situacion: SituacionDeLaBase): boolean {
  if (situacion.hayPendientes !== false) return false;
  return situacion.bytes > COTA_DE_PODA_BYTES;
}

export interface ResultadoDePoda {
  antes: number;
  despues: number;
  checkpointsBorrados: number;
  writesBorrados: number;
}

/**
 * Lo que se cuenta de una poda, y **solo cuando cambió algo de verdad**.
 *
 * Un mantenimiento que anuncia su propia rutina es un aviso que enseña a ignorar los avisos,
 * que es lo que la bitácora existe para evitar: si no se recuperó nada, esto se calla. Y no
 * lleva la RUTA del fichero, porque esta línea puede viajar por el cable (`sinRutas`).
 */
export function resumenDePoda(r: ResultadoDePoda): string | undefined {
  const liberado = r.antes - r.despues;
  if (liberado <= 0) return undefined;
  return (
    `memoria del agente compactada: ${enMb(r.antes)} → ${enMb(r.despues)} ` +
    `(${r.checkpointsBorrados} checkpoints y ${r.writesBorrados} escrituras que ya no hacían falta)`
  );
}

function enMb(bytes: number): string {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}
