/**
 * Una nota escrita mientras el agente trabaja (IXCODE-4): se entrega la PRIMERA vez que un hilo
 * con `capacidadDeNotas` (`capacidades.ts`) hace una llamada al modelo después de que exista, y
 * se marca entregada A ESE HILO — nunca se repite para él. No distingue "estaba trabajando
 * cuando escribiste" de "se creó justo después": cualquier hilo cuya primera llamada ocurra
 * mientras la nota sigue sin entregarle se la lleva. Es la lectura simple de "a todos los
 * activos" (hasta 5 especialistas en paralelo, `MAX_PARALLEL_SUB_AGENTS`): no hace falta saber
 * qué hilos existían en el instante exacto en que se escribió.
 */
export interface Nota {
  texto: string;
  /** `thread_id` de cada hilo que YA la recibió. */
  entregadaA: Set<string>;
}

export function crearNota(texto: string): Nota {
  return { texto, entregadaA: new Set() };
}

export function pendientesPara(notas: readonly Nota[], threadId: string): Nota[] {
  return notas.filter((n) => !n.entregadaA.has(threadId));
}

export function marcarEntregada(nota: Nota, threadId: string): void {
  nota.entregadaA.add(threadId);
}

/** Para un hijo, "la persona" es ambigua —su interlocutor normal es quien le delegó—, así que el
 *  texto deja claro que es alguien fuera de esa conversación. */
export function textoDeNota(texto: string): string {
  return `[la persona escribió mientras trabajabas: «${texto}»]`;
}

/** Lo que NADIE llegó a recibir, para mandarlo como el turno siguiente. `undefined` si no queda
 *  ninguna — así el llamador no confunde "sin sobrantes" con una cadena vacía. */
export function sobrantes(notas: readonly Nota[]): string | undefined {
  const sinEntregar = notas.filter((n) => n.entregadaA.size === 0).map((n) => n.texto);
  return sinEntregar.length === 0 ? undefined : sinEntregar.join("\n\n");
}
