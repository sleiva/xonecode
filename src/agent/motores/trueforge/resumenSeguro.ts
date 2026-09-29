/**
 * Un resumen de contexto VACÍO no puede sustituir a la conversación.
 *
 * La compactación de TrueForge (`ContextCompaction.mjs`) pide un resumen al modelo y **sustituye el
 * contexto ENTERO** por su respuesta, sin comprobar que no venga vacía. Con una vacía el raíz se
 * queda sin el encargo: en una sesión real el contexto acabó siendo `[{assistant: ""}, «resumen
 * hecho»]`, y el agente contestó «no tengo ningún encargo» con el encargo a tres mensajes de
 * distancia. Peor, la memoria del hilo quedó así, y reenviar el mensaje no lo arreglaba.
 *
 * Aquí se envuelve el modelo SOLO para esa llamada: una respuesta vacía se reintenta una vez, y si
 * sigue vacía se sustituye por los mensajes de la persona, tal como llegaron al resumen. No mejora
 * un resumen malo; evita que el encargo se pierda.
 *
 * **Límite declarado**: los mensajes se recuperan del texto que la librería le da al modelo
 * (`<n><user>:…`), un formato suyo. Si cambia, el rescate devuelve un aviso sin mensajes en vez de
 * lanzar, y el test de este fichero lo delata.
 */

export interface RespuestaDeResumen {
  output: { content?: unknown; [k: string]: unknown };
  [k: string]: unknown;
}

export interface ClienteDeResumen {
  createNonStream: (cuerpo: never) => Promise<never>;
  [k: string]: unknown;
}

const MENSAJE_DE_USUARIO = /<(\d+)><user>:([\s\S]*?)(?=<\d+><(?:user|assistant|tool-response)|$)/g;

/** Los mensajes de la persona del texto que la compactación le pasa al modelo, en orden. */
export function mensajesDeLaPersona(candidato: string): string[] {
  return [...candidato.matchAll(MENSAJE_DE_USUARIO)].map((m) => (m[2] ?? "").trim()).filter((t) => t !== "");
}

export function resumenDeRescate(candidato: string): string {
  const mensajes = mensajesDeLaPersona(candidato);
  return [
    "RESUMEN AUTOMÁTICO: el modelo devolvió un resumen vacío, así que se conservan los mensajes de la persona tal como llegaron.",
    "El último es el encargo en curso; no digas que no hay encargo.",
    ...(mensajes.length === 0 ? ["(no se pudieron recuperar los mensajes)"] : mensajes.map((t, i) => `Mensaje ${String(i + 1)} de la persona:\n${t}`)),
  ].join("\n\n");
}

const vacio = (r: RespuestaDeResumen): boolean => typeof r.output.content !== "string" || r.output.content.trim() === "";

/** El cliente con la compactación protegida. Todo lo demás del cliente pasa igual. */
export function conResumenSeguro<T extends ClienteDeResumen>(cliente: T, avisar?: (texto: string) => void): T {
  return {
    ...cliente,
    createNonStream: async (cuerpo: never) => {
      let r = (await cliente.createNonStream(cuerpo)) as unknown as RespuestaDeResumen;
      if (vacio(r)) {
        avisar?.("compactación: resumen vacío, se reintenta");
        r = (await cliente.createNonStream(cuerpo)) as unknown as RespuestaDeResumen;
      }
      if (vacio(r)) {
        avisar?.("compactación: resumen vacío otra vez, se conservan los mensajes de la persona");
        const mensajes = (cuerpo as { messages?: Array<{ content?: unknown }> }).messages ?? [];
        const candidato = typeof mensajes[0]?.content === "string" ? mensajes[0].content : "";
        r = { ...r, output: { ...r.output, content: resumenDeRescate(candidato) } };
      }
      return r as never;
    },
  } as T;
}
