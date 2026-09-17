/**
 * De la forma cruda del stream de langgraph a una sola forma.
 *
 * La forma depende de `subgraphs` (medido contra langgraph 1.4.8, ver
 * `formaDelChunk.test.ts`), y el fallo de leerla mal es MUDO: no lanza, simplemente deja
 * de casar y no se pinta nada. Por eso se normaliza aquí y nadie más arriba ve la
 * diferencia — activar o desactivar la bandera deja de ser un cambio con radio.
 */
export interface ChunkNormalizado {
  /** Namespace del subgrafo. Vacío = el grafo padre. */
  ns: string[];
  modo: string;
  dato: unknown;
}

export function normalizar(chunk: unknown): ChunkNormalizado | null {
  if (!Array.isArray(chunk)) return null;

  // [namespace, modo, dato] — con subgraphs: true
  if (chunk.length === 3) {
    const [ns, modo, dato] = chunk as [unknown, unknown, unknown];
    if (!Array.isArray(ns) || typeof modo !== "string") return null;
    return { ns: ns.map(String), modo, dato };
  }

  // [modo, dato] — sin subgraphs
  if (chunk.length === 2) {
    const [modo, dato] = chunk as [unknown, unknown];
    if (typeof modo !== "string") return null;
    return { ns: [], modo, dato };
  }

  return null;
}