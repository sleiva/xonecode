import { normalizar } from "./normalizar.js";
import { Mensajes } from "./mensajes.js";
import { detalleDe, parametrosDe, type ParametrosSeguros } from "./resumenDeTool.js";
import type { DomainEvent, PendienteDeAprobacion } from "../core/events.js";

/** El texto de un mensaje, venga como venga. */
export function textoDe(msg: unknown): string {
  if (!msg || typeof msg !== "object") return "";
  const m = msg as Record<string, unknown>;
  if (typeof m.text === "string") return m.text;
  const c = m.content;
  if (typeof c === "string") return c;
  // Contenido en BLOQUES (Gemini con thinking): concatenar solo los de texto. Un
  // `String(content)` daría el `repr` de la lista, razonamiento incluido, y el usuario
  // vería basura donde esperaba una frase.
  if (Array.isArray(c)) {
    return c
      .map((b) => {
        if (!b || typeof b !== "object") return "";
        const bloque = b as Record<string, unknown>;
        // Un bloque de PENSAMIENTO también trae `text` en algunos adaptadores
        // (`{ text, thought: true }`), así que mirar solo `typeof text === "string"` metía
        // el razonamiento dentro de la respuesta. Sale por `razonamientoDe`, no por aquí.
        if (bloque.thought === true || bloque.type === "thinking") return "";
        return typeof bloque.text === "string" ? bloque.text : "";
      })
      .join("");
  }
  return "";
}

/**
 * El RAZONAMIENTO de un mensaje, cuando el proveedor lo publica en bloques.
 *
 * Gemini lo manda como `{ type: "thinking", thinking: "…" }` dentro de `content`
 * (`@langchain/google-genai`, `common.js`), o sea que `textoDe` —que solo mira `b.text`— lo
 * dejaba fuera. Estaba bien dejarlo fuera de la RESPUESTA; lo que faltaba era tener por
 * dónde enseñarlo aparte.
 *
 * Se aceptan las dos formas que hay sueltas por el ecosistema: el bloque `thinking` con su
 * campo homónimo y el `{ text, thought: true }` que usan otros adaptadores.
 */
export function razonamientoDe(msg: unknown): string {
  if (!msg || typeof msg !== "object") return "";
  const c = (msg as Record<string, unknown>).content;
  if (!Array.isArray(c)) return "";
  return c
    .map((b) => {
      if (!b || typeof b !== "object") return "";
      const bloque = b as Record<string, unknown>;
      if (bloque.type === "thinking" && typeof bloque.thinking === "string") return bloque.thinking;
      if (bloque.thought === true && typeof bloque.text === "string") return bloque.text;
      return "";
    })
    .join("");
}

/** Los nombres de tool de un chunk de `updates`, con su detalle de la lista blanca. */
export function toolsDe(dato: unknown): Array<{ nombre: string; detalle?: string; parametros?: ParametrosSeguros }> {
  if (!dato || typeof dato !== "object") return [];
  const salida: Array<{ nombre: string; detalle?: string }> = [];
  for (const nodo of Object.values(dato as Record<string, unknown>)) {
    const msgs = (nodo as Record<string, unknown> | null)?.messages;
    if (!Array.isArray(msgs)) continue;
    for (const m of msgs) {
      const llamadas = (m as Record<string, unknown>)?.tool_calls;
      if (Array.isArray(llamadas)) {
        for (const l of llamadas) {
          const n = (l as Record<string, unknown>)?.name;
          if (typeof n === "string") {
            const args = (l as Record<string, unknown>).args;
            const detalle = detalleDe(n, args);
            const parametros = parametrosDe(n, args);
            salida.push({ nombre: n, ...(detalle === undefined ? {} : { detalle }), ...(parametros === undefined ? {} : { parametros }) });
          }
        }
      }
    }
  }
  return salida;
}

/**
 * ¿Este chunk lo emite el grafo PADRE, o un especialista?
 *
 * **Medido el 2026-08-30**, sobre un turno real con delegación. Los namespaces que
 * llegan con `subgraphs: true` son exactamente tres formas:
 *
 * | namespace                              | quién         | chunks |
 * |----------------------------------------|---------------|-------:|
 * | `["model_request:…"]`                   | el padre      |    148 |
 * | `["tools:…", "model_request:…"]`        | un especialista |  745 |
 * | `["tools:…", "tools:…"]`                | tools de un especialista | 12 |
 *
 * Un especialista SIEMPRE lleva el segmento `tools:` delante, porque se le invoca con la
 * tool `task`. Así que la frontera es la LONGITUD.
 *
 * **El fallo que esto cierra era mudo y caro.** Antes se descartaba todo `ns` no vacío,
 * dando por hecho que el padre venía con `ns: []` — cierto para `updates`, FALSO para
 * `messages`, que llegan con `["model_request:<uuid>"]`. Consecuencia: se descartaban
 * TODOS los tokens, respuesta incluida. El turno corría entero, enseñaba sus tools,
 * decía «sin cambios en el proyecto»… y no contestaba nada. Sin excepción y sin aviso.
 *
 * Y los números explican por qué el filtro tiene que existir: 745 chunks de especialista
 * frente a 148 del padre. Emitirlos todos sería volcar el razonamiento interno de los
 * especialistas encima de la respuesta.
 */
export function esDelPadre(ns: readonly string[]): boolean {
  return ns.length <= 1;
}

export type AlLlamarTool = (tool: { nombre: string; detalle?: string; parametros?: ParametrosSeguros }) => void;

/**
 * Convierte el stream del grafo en `DomainEvent`.
 *
 * **Se lee con `subgraphs: true`**, porque sin él lo que hacen los especialistas —que son
 * grafos compilados invocados dentro de un nodo— no llega al padre, y el fallo es MUDO. El
 * precio, medido: el chunk pasa de `[modo, dato]` a `[namespace, modo, dato]`, y de eso se
 * encarga `normalizar`.
 *
 * Los tokens que se emiten son SOLO los del grafo padre. Los de un
 * especialista son su razonamiento interno, no la respuesta: enseñarlos convierte la
 * consola en un volcado. Su trabajo se cuenta por `tool`, que es lo que el usuario
 * necesita ver mientras espera.
 */
export async function* aEventos(
  stream: AsyncIterable<unknown>,
  pendientes?: () => Promise<PendienteDeAprobacion[]>,
  alLlamarTool?: AlLlamarTool
): AsyncIterable<DomainEvent> {
  const mensajes = new Mensajes();
  try {
    for await (const bruto of stream) {
      const chunk = normalizar(bruto);
      if (!chunk) continue;

      if (chunk.modo === "updates") {
        for (const { nombre, detalle, parametros } of toolsDe(chunk.dato)) {
          try {
            alLlamarTool?.({ nombre, ...(detalle === undefined ? {} : { detalle }), ...(parametros === undefined ? {} : { parametros }) });
          } catch {
            // La observabilidad no puede tumbar ni silenciar el stream.
          }
          yield { tipo: "tool", nombre, ...(detalle !== undefined ? { detalle } : {}) };
        }
        continue;
      }

      if (chunk.modo === "messages") {
        if (!esDelPadre(chunk.ns)) continue; // de un especialista: no es la respuesta
        if (!Array.isArray(chunk.dato)) continue;
        const [msg] = chunk.dato as [unknown, unknown];
        const texto = textoDe(msg);
        const id = (msg as Record<string, unknown> | null)?.id;
        const idTexto = typeof id === "string" ? id : undefined;
        // El razonamiento sale por su propio evento y NO pasa por `Mensajes`: ese contador
        // decide qué trozos de la RESPUESTA se pintan (dedupe de reintentos), y contar el
        // pensamiento ahí desalinearía esa cuenta.
        const pensado = razonamientoDe(msg);
        if (pensado !== "") {
          yield { tipo: "razonamiento", texto: pensado, ...(idTexto === undefined ? {} : { msgId: idTexto }) };
        }
        if (mensajes.trozo(idTexto, texto).pintar) {
          yield { tipo: "token", texto, msgId: idTexto };
        }
      }
    }
  } finally {
    mensajes.fin();

    // La pausa se consulta AL AGOTARSE el stream, no dentro del bucle: una pausa
    // TERMINA el turno, así que el interrupt solo puede estar en el estado cuando el
    // stream ya se ha acabado. Y solo si alguien pasó `pendientes`: sin el parámetro,
    // el comportamiento es el de antes.
    if (pendientes !== undefined) {
      try {
        const lista = await pendientes();
        if (lista.length > 0) {
          // Una sola `pausa` aunque vengan varios: con dos `task` en un turno quedan
          // DOS interrupts a la vez, y dos eventos harían preguntar dos veces por lotes.
          yield { tipo: "pausa", pendientes: lista };
        }
      } catch (e) {
        // No se traga: callarlo haría creer que no había nada que aprobar cuando en
        // verdad no se pudo comprobar. Fallar entero tampoco: el turno ya acabó.
        yield {
          tipo: "aviso",
          texto: `⚠ No se pudo comprobar si había algo pendiente de aprobación: ${e instanceof Error ? e.message : String(e)}`,
          severidad: "grave",
        };
      }
    }
  }
}
