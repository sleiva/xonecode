import type { Acto } from "./tipos.js";

/**
 * La pregunta del agente que sigue SIN contestar, si la hay, y en qué posición del hilo.
 *
 * Pendiente es «la última `consulta` sin un acto de usuario detrás», y se lee del HILO a
 * propósito: el hilo es lo que se guarda en el `.jsonl` y vuelve al reabrir, así que la tarjeta
 * vuelve con él sin que nadie tenga que recordarla aparte. Mientras el turno está en vuelo no
 * hay nada pendiente: una pregunta cierra el turno, y un turno que corre es que ya se contestó.
 *
 * Las opciones se vuelven a cribar aquí: el store solo valida el `tipo` de un acto, y el acto
 * llega de otro proceso que puede tener otra versión. Una consulta sin opciones válidas no es
 * una tarjeta —no habría botón que pulsar—, y el texto del chat basta.
 */
export function consultaPendiente(
  actos: readonly Acto[],
  turnoEnVuelo: boolean
): { indice: number; pregunta: string; opciones: string[] } | undefined {
  if (turnoEnVuelo) return undefined;
  for (let i = actos.length - 1; i >= 0; i--) {
    const acto = actos[i]!;
    if (acto.tipo === "usuario") return undefined;
    if (acto.tipo !== "consulta") continue;
    const opciones = Array.isArray(acto.opciones) ? acto.opciones.filter((o): o is string => typeof o === "string" && o.trim() !== "") : [];
    if (opciones.length === 0 || typeof acto.pregunta !== "string") return undefined;
    return { indice: i, pregunta: acto.pregunta, opciones };
  }
  return undefined;
}
