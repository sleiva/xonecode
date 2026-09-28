/**
 * Una nota escrita mientras el agente trabaja (IXCODE-4), con UN dueño.
 *
 * Se entregaba a CADA hilo como encargo, y eso se midió con una prueba real (MyAllXOne): «y créame
 * un diagrama» llegó al analista, que lo dibujó, y al volver el orquestador la recibió igual de
 * nueva y se lo encargó otra vez a `designer-xone` — el diagrama, dos veces. La regla ahora:
 *
 * - **Si trabaja UN solo hijo, la nota es suya**: la incorpora si le cabe en el encargo, y si no, la
 *   devuelve como pendiente (`textoDeNotaParaHijo`).
 * - **Con VARIOS en paralelo no es de ninguno**: dársela a uno sería una carrera, y a todos es el
 *   bug de arriba. La decide el raíz al volver, como encargo.
 * - **Sin hijos trabajando, es del raíz**, que es quien planifica.
 * - **El raíz la ve SIEMPRE**, y si ya tenía dueño la ve como INFORMACIÓN: a quién se le pasó y que
 *   no la vuelva a encargar (`textoDeNotaYaEntregada`).
 * - Un hijo nacido cuando la nota ya tiene dueño —o ya la vio el raíz— no la recibe: el raíz la
 *   tiene en cuenta al delegar.
 *
 * «Trabajan a la vez» = los hijos nacidos de la última llamada del raíz: mientras un hijo vive, el
 * raíz espera su resultado y no llama al modelo (`detencion.ts#hijosVivos`). Un hijo EXTERNO no
 * pasa por los procesadores, así que nunca se la queda: la recoge el raíz.
 */
export interface Nota {
  texto: string;
  /** `thread_id` de quien se la quedó como encargo. Ausente: todavía de nadie. */
  duenio?: string;
  vistaPorElRaiz: boolean;
}

export function crearNota(texto: string): Nota {
  return { texto, vistaPorElRaiz: false };
}

/** Lo que hace falta saber del árbol en el momento de entregar. */
export interface ContextoDeEntrega {
  hiloRaiz: string;
  /** Cuántos hijos trabajan a la vez ahora mismo. */
  hijosVivos: number;
  /** El nombre con que el raíz conoce a un hilo hijo (su especialista). */
  nombreDe: (threadId: string) => string;
}

/** Para el raíz: lo que la persona le dijo. */
export function textoDeNota(texto: string): string {
  return `[la persona escribió mientras trabajabas: «${texto}»]`;
}

/** Para un hijo: su interlocutor normal es quien le delegó, así que se dice que viene de fuera, y
 *  se le da la salida si no es de su encargo. */
export function textoDeNotaParaHijo(texto: string): string {
  return (
    `[la persona escribió mientras trabajabas: «${texto}». Si encaja en tu encargo, incorpóralo. ` +
    "Si no, no lo hagas: termina tu respuesta con «PENDIENTE DE LA PERSONA: …» para que quien te delegó lo replanifique.]"
  );
}

/** Para el raíz, cuando la nota ya se la quedó un hijo. */
export function textoDeNotaYaEntregada(texto: string, quien: string): string {
  return (
    `[la persona escribió mientras trabajabas: «${texto}». Se le pasó a ${quien} mientras trabajaba, y su respuesta está arriba: ` +
    "NO la vuelvas a encargar. Actúa solo sobre lo que diga como PENDIENTE DE LA PERSONA o no cubierto.]"
  );
}

/** Los textos que se le meten a ESE hilo antes de su llamada, marcando lo entregado. */
export function entregarNotas(notas: readonly Nota[], threadId: string, ctx: ContextoDeEntrega): string[] {
  const textos: string[] = [];
  for (const n of notas) {
    if (threadId === ctx.hiloRaiz) {
      if (n.vistaPorElRaiz) continue;
      n.vistaPorElRaiz = true;
      if (n.duenio === undefined) {
        n.duenio = threadId;
        textos.push(textoDeNota(n.texto));
      } else {
        textos.push(textoDeNotaYaEntregada(n.texto, ctx.nombreDe(n.duenio)));
      }
      continue;
    }
    if (n.duenio !== undefined || n.vistaPorElRaiz || ctx.hijosVivos !== 1) continue;
    n.duenio = threadId;
    textos.push(textoDeNotaParaHijo(n.texto));
  }
  return textos;
}

/** Lo que NADIE se quedó, para mandarlo como el turno siguiente. `undefined` si no queda ninguna —
 *  así el llamador no confunde "sin sobrantes" con una cadena vacía. */
export function sobrantes(notas: readonly Nota[]): string | undefined {
  const sinEntregar = notas.filter((n) => n.duenio === undefined).map((n) => n.texto);
  return sinEntregar.length === 0 ? undefined : sinEntregar.join("\n\n");
}
