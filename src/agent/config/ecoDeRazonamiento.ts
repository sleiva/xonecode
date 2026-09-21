/**
 * Devolverle a DeepSeek el `reasoning_content` que su API exige y el cliente tira.
 *
 * ## El problema, con las dos citas
 *
 * DeepSeek: «for requests carrying the `tools` parameter, the `reasoning_content` must be
 * fully passed back to the API in all subsequent requests — even for turns where the model
 * did not perform a tool call. If your code does not correctly pass back
 * `reasoning_content`, the API will return a 400 error».
 *
 * Y `@langchain/openai` 1.5.5 no lo devuelve NUNCA: lo captura al entrar
 * (`additional_kwargs.reasoning_content`) y lo tira al salir, por los dos conversores.
 * Un agente manda siempre `tools`, así que pensar + agente = 400 en cuanto la conversación
 * avanza. Visto en un turno real reventando dentro de un subagente.
 *
 * ## Por qué a nivel HTTP y no envolviendo el cliente
 *
 * Porque la conversión de mensajes es INTERNA a `ChatOpenAI`: no hay método que
 * sobrescribir ni middleware que la alcance —un middleware ve los mensajes de LangChain,
 * no el cuerpo que sale—. Lo que sí es una costura declarada es `configuration.fetch`, que
 * el SDK de OpenAI acepta y documenta.
 *
 * Y tiene una ventaja sobre parchear la dependencia: **el contrato HTTP es lo más estable
 * que hay**. Este repo ya ha visto a langchain mover un gancho (`beforeAgent` →
 * `beforeModel`) y a deepagents cambiar una lista de claves en el mismo día; el cuerpo de
 * `/chat/completions` no se mueve.
 *
 * ## Cómo se empareja
 *
 * Por el **id de la tool call**, que es único y lo genera el servidor. Cuando una respuesta
 * trae razonamiento y tool calls, se guarda `id → reasoning_content`; cuando una petición
 * posterior reenvía ese mismo mensaje de asistente, se le vuelve a pegar. No hace falta
 * entender la conversación: el id es la identidad.
 *
 * **Límite declarado**: un mensaje de asistente SIN tool calls no tiene con qué
 * emparejarse y no se le devuelve el eco. En un bucle de agente ése es el mensaje FINAL
 * —después no hay más peticiones de ese hilo—, así que en la práctica no se reenvía. Si
 * algún día se reenviara, el síntoma sería el mismo 400 de antes y no algo peor.
 */

/** Cuántos razonamientos se recuerdan. Una sesión larga no puede crecer sin tope. */
export const TOPE_DE_ECOS = 400;

export interface MemoriaDeEco {
  /** Apunta lo que trajo una respuesta. */
  recordar(id: string, razonamiento: string): void;
  /** Lo que se guardó para ese id, si consta. */
  buscar(id: string): string | undefined;
  readonly tamaño: number;
}

/** Un mapa con tope, que descarta lo más viejo. Un `Map` de JS conserva el orden de alta. */
export function crearMemoriaDeEco(tope: number = TOPE_DE_ECOS): MemoriaDeEco {
  const mapa = new Map<string, string>();
  return {
    recordar: (id, razonamiento) => {
      if (id === "" || razonamiento === "") return;
      // Re-insertar lo mueve al final: lo que se usa sobrevive a lo que no.
      mapa.delete(id);
      mapa.set(id, razonamiento);
      while (mapa.size > tope) {
        const primero = mapa.keys().next();
        if (primero.done === true) break;
        mapa.delete(primero.value);
      }
    },
    buscar: (id) => mapa.get(id),
    get tamaño() {
      return mapa.size;
    },
  };
}

interface MensajeDeSalida {
  role?: string;
  reasoning_content?: string;
  tool_calls?: Array<{ id?: string }>;
}

/**
 * Le vuelve a pegar el razonamiento a los mensajes de asistente de una petición.
 *
 * Puro y sobre el objeto ya parseado: así se prueba sin red y sin SDK. No toca nada que no
 * sea un asistente con tool calls, y **no pisa un `reasoning_content` que ya venga** — si
 * algún día el cliente empieza a mandarlo, esto deja de hacer falta solo.
 */
export function conEcoDeRazonamiento(
  cuerpo: { messages?: MensajeDeSalida[] },
  memoria: MemoriaDeEco,
): { messages?: MensajeDeSalida[] } {
  if (!Array.isArray(cuerpo.messages)) return cuerpo;
  let tocado = false;
  const messages = cuerpo.messages.map((m) => {
    if (m.role !== "assistant" || typeof m.reasoning_content === "string") return m;
    const id = m.tool_calls?.[0]?.id;
    if (typeof id !== "string") return m;
    const razonamiento = memoria.buscar(id);
    if (razonamiento === undefined) return m;
    tocado = true;
    return { ...m, reasoning_content: razonamiento };
  });
  return tocado ? { ...cuerpo, messages } : cuerpo;
}

/**
 * Saca de una respuesta NO streameada lo que haya que recordar.
 *
 * Devuelve los pares en vez de escribirlos: así la función es pura y el test no necesita
 * una memoria de pega para comprobar qué se extrajo.
 */
export function ecosDeRespuesta(cuerpo: unknown): Array<[string, string]> {
  const choices = (cuerpo as { choices?: unknown })?.choices;
  if (!Array.isArray(choices)) return [];
  const pares: Array<[string, string]> = [];
  for (const choice of choices) {
    const m = (choice as { message?: MensajeDeSalida & { reasoning_content?: string } })?.message;
    const razonamiento = m?.reasoning_content;
    const id = m?.tool_calls?.[0]?.id;
    if (typeof razonamiento === "string" && razonamiento !== "" && typeof id === "string") {
      pares.push([id, razonamiento]);
    }
  }
  return pares;
}

/**
 * Lo mismo para un flujo SSE, que es el caso REAL: el turno streamea siempre —el
 * `_streamResponseChunks` de la dependencia mete `stream: true` en el payload sea cual sea
 * la bandera del constructor, y eso ya está medido en este repo—.
 *
 * Se va acumulando el `delta.reasoning_content` y el primer `tool_call.id` que aparezca;
 * al cerrar el flujo se tiene el par. **Los ids llegan en trozos**: en SSE un `tool_call`
 * se parte en varios deltas y solo el primero trae el `id`, así que se guarda el primero
 * que no venga vacío y no se sobrescribe.
 */
export function acumuladorDeEcoSse(): {
  linea(linea: string): void;
  ecos(): Array<[string, string]>;
} {
  const razonamiento = new Map<number, string>();
  const ids = new Map<number, string>();
  return {
    linea: (linea) => {
      if (!linea.startsWith("data:")) return;
      const datos = linea.slice(5).trim();
      if (datos === "" || datos === "[DONE]") return;
      let json: unknown;
      try {
        json = JSON.parse(datos);
      } catch {
        // Una línea a medias no puede tumbar el flujo: esto es contabilidad, no transporte.
        return;
      }
      const choices = (json as { choices?: unknown })?.choices;
      if (!Array.isArray(choices)) return;
      for (const choice of choices) {
        const indice = typeof (choice as { index?: unknown })?.index === "number" ? (choice as { index: number }).index : 0;
        const delta = (choice as { delta?: { reasoning_content?: unknown; tool_calls?: Array<{ id?: unknown }> } })?.delta;
        if (typeof delta?.reasoning_content === "string") {
          razonamiento.set(indice, (razonamiento.get(indice) ?? "") + delta.reasoning_content);
        }
        const id = delta?.tool_calls?.[0]?.id;
        if (typeof id === "string" && id !== "" && !ids.has(indice)) ids.set(indice, id);
      }
    },
    ecos: () => {
      const pares: Array<[string, string]> = [];
      for (const [indice, texto] of razonamiento) {
        const id = ids.get(indice);
        if (id !== undefined && texto !== "") pares.push([id, texto]);
      }
      return pares;
    },
  };
}

/**
 * El `fetch` que restaura el eco, para `configuration.fetch` del cliente de OpenAI.
 *
 * **No bloquea ni bufferiza el flujo.** La respuesta se parte en dos con `tee()`: una
 * copia sale intacta hacia el SDK y la otra se lee en segundo plano solo para apuntar el
 * razonamiento. Bufferizar aquí convertiría el streaming en no-streaming y se notaría en
 * pantalla; leer la misma copia dos veces no se puede.
 *
 * **Y nada de esto puede tumbar una petición**: cada parte va en su `try`. Si el cuerpo no
 * se deja parsear, se manda tal cual y el peor caso es el 400 que ya había — nunca uno
 * nuevo causado por esto.
 */
export function fetchConEcoDeRazonamiento(
  memoria: MemoriaDeEco,
  fetchBase: typeof fetch = fetch,
): typeof fetch {
  return async (entrada: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    let opciones = init;
    if (init?.body !== undefined && typeof init.body === "string") {
      try {
        const cuerpo = JSON.parse(init.body) as { messages?: MensajeDeSalida[] };
        const conEco = conEcoDeRazonamiento(cuerpo, memoria);
        if (conEco !== cuerpo) opciones = { ...init, body: JSON.stringify(conEco) };
      } catch {
        // Un cuerpo que no es JSON no es asunto nuestro: se manda tal cual.
      }
    }

    const respuesta = await fetchBase(entrada, opciones);
    if (respuesta.body === null || !respuesta.ok) return respuesta;

    const tipo = respuesta.headers.get("content-type") ?? "";
    try {
      const [paraElSdk, paraNosotros] = respuesta.body.tee();
      void leerYApuntar(paraNosotros, tipo, memoria);
      return new Response(paraElSdk, {
        status: respuesta.status,
        statusText: respuesta.statusText,
        headers: respuesta.headers,
      });
    } catch {
      // Sin `tee` (un `Response` de pega en un test, por ejemplo) se devuelve el original:
      // se pierde el eco, no la respuesta.
      return respuesta;
    }
  };
}

async function leerYApuntar(flujo: ReadableStream<Uint8Array>, tipo: string, memoria: MemoriaDeEco): Promise<void> {
  try {
    const texto = await new Response(flujo).text();
    if (tipo.includes("text/event-stream") || texto.startsWith("data:")) {
      const acumulador = acumuladorDeEcoSse();
      for (const linea of texto.split("\n")) acumulador.linea(linea);
      for (const [id, razonamiento] of acumulador.ecos()) memoria.recordar(id, razonamiento);
      return;
    }
    for (const [id, razonamiento] of ecosDeRespuesta(JSON.parse(texto))) memoria.recordar(id, razonamiento);
  } catch {
    // Apuntar el eco es una comodidad: que falle no puede afectar a la respuesta, que ya
    // va por su propia copia del flujo.
  }
}
