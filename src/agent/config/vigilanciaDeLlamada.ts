/**
 * **Una llamada al modelo que no responde se CORTA, no se espera para siempre.**
 *
 * Medido el 03-11-2026 (experimento 3 de la calculadora): una llamada del orquestador a DeepSeek se quedó con la
 * conexión HTTPS abierta y sin un byte durante más de 12 minutos, y el turno entero con ella. Ni el SDK ni TrueForge
 * tenían con qué cortarla: el tope del SDK vale hasta las cabeceras, y con streaming lo que se para puede ser el cuerpo.
 *
 * Dos topes, en el `fetch` del cliente (la única costura que ve la respuesta entera):
 * - **Hasta el primer DATO** (`TOPE_HASTA_EL_PRIMER_DATO_MS`): la llamada no se da por empezada hasta que llega el
 *   primer trozo del cuerpo. Si no llega, se aborta y se LANZA: el SDK lo toma por un fallo de conexión y REINTENTA solo.
 * - **De SILENCIO** a mitad de la respuesta (`TOPE_DE_SILENCIO_DEL_MODELO_MS`): ya empezada no se puede reintentar sin
 *   duplicar lo leído, así que el flujo falla con un motivo claro y el turno acaba como fallo del motor (reanudable).
 *
 * Abortar por fuera (Detener, el tope del SDK) se respeta: la señal de quien llama aborta también esta petición.
 */

export const TOPE_HASTA_EL_PRIMER_DATO_MS = 120_000;
export const TOPE_DE_SILENCIO_DEL_MODELO_MS = 180_000;

const decodificador = new TextDecoder();
/** Un trozo que solo trae comentarios SSE (`: keep-alive`) o líneas en blanco: la conexión vive, pero no es respuesta. */
export function soloLatido(trozo: Uint8Array): boolean {
  return decodificador
    .decode(trozo, { stream: false })
    .split(/\r?\n/)
    .every((l) => l.trim() === "" || l.startsWith(":"));
}

/** El fallo de una llamada que no contestó a tiempo. Sin ruta ni cuerpo: solo cuánto se esperó. */
export class LlamadaSinRespuesta extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "LlamadaSinRespuesta";
  }
}

export function fetchConVigilancia(
  fetchBase: typeof fetch = fetch,
  topes: { primerDato: number; silencio: number } = { primerDato: TOPE_HASTA_EL_PRIMER_DATO_MS, silencio: TOPE_DE_SILENCIO_DEL_MODELO_MS }
): typeof fetch {
  return async (entrada: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const control = new AbortController();
    const externa = init?.signal ?? undefined;
    if (externa) {
      if (externa.aborted) control.abort(externa.reason);
      else externa.addEventListener("abort", () => control.abort(externa.reason), { once: true });
    }
    // Un reloj que, si vence, aborta la petición y rechaza con el motivo. `parar` lo desarma.
    const reloj = (ms: number, motivo: string) => {
      let id: ReturnType<typeof setTimeout> | undefined;
      const vence = new Promise<never>((_, rechazar) => {
        id = setTimeout(() => {
          control.abort();
          rechazar(new LlamadaSinRespuesta(motivo));
        }, ms);
      });
      vence.catch(() => undefined);
      return { vence, parar: () => clearTimeout(id) };
    };

    /**
     * **Un keep-alive no es un dato.** Medido en la pasada 7 de la calculadora (DeepSeek flash): con la petición en cola,
     * DeepSeek manda comentarios SSE (`: keep-alive`) para no cerrar la conexión, y cada uno reiniciaba el reloj; una llamada
     * del orquestador estuvo 27,5 minutos abierta y devolvió 218 tokens. Esos trozos pasan tal cual, pero no mueven el plazo.
     */
    const hastaElPrimero = reloj(topes.primerDato, `el modelo no empezó a responder en ${String(Math.round(topes.primerDato / 1000))} s`);
    try {
      const respuesta = await Promise.race([fetchBase(entrada, { ...init, signal: control.signal }), hastaElPrimero.vence]);
      if (respuesta.body === null) return respuesta;
      const lector = respuesta.body.getReader();
      // Hasta el primer trozo con CONTENIDO: los latidos de antes se guardan para pasarlos delante.
      const delante: Uint8Array[] = [];
      let primero = await Promise.race([lector.read(), hastaElPrimero.vence]);
      while (!primero.done && soloLatido(primero.value)) {
        delante.push(primero.value);
        primero = await Promise.race([lector.read(), hastaElPrimero.vence]);
      }
      hastaElPrimero.parar();
      const silencio = `el modelo dejó de responder a mitad (${String(Math.round(topes.silencio / 1000))} s sin datos)`;
      // El plazo de silencio cuenta desde el último DATO, no desde el último trozo: un latido no lo mueve.
      let plazo = Date.now() + topes.silencio;
      const flujo = new ReadableStream<Uint8Array>({
        start(c) {
          for (const latido of delante) c.enqueue(latido);
          if (primero.done) c.close();
          else c.enqueue(primero.value);
        },
        async pull(c) {
          const espera = reloj(Math.max(0, plazo - Date.now()), silencio);
          try {
            const { done, value } = await Promise.race([lector.read(), espera.vence]);
            if (done) c.close();
            else {
              if (!soloLatido(value)) plazo = Date.now() + topes.silencio;
              c.enqueue(value);
            }
          } catch (error) {
            c.error(error);
          } finally {
            espera.parar();
          }
        },
        cancel(motivo) {
          void lector.cancel(motivo);
        },
      });
      return new Response(flujo, { status: respuesta.status, statusText: respuesta.statusText, headers: respuesta.headers });
    } finally {
      hastaElPrimero.parar();
    }
  };
}
