import { normalizar } from "./normalizar.js";
import { Mensajes } from "./mensajes.js";
import { detalleDe, parametrosDe, type ParametrosSeguros } from "./resumenDeTool.js";
import { esMensajeDeTool } from "./textoDeTool.js";
import type { DomainEvent, PendienteDeAprobacion } from "../../core/events.js";

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

/**
 * Los nombres de tool de un chunk de `updates`, con su detalle de la lista blanca y su ID.
 *
 * **El `id` viaja porque el mismo chunk trae la historia ENTERA.** Un `updates` de un subgrafo
 * no llega con los mensajes nuevos: llega con los acumulados, así que sin distinguir cuáles ya
 * se contaron, cada paso reemite todas las tools anteriores. Medido sobre un turno real: 286
 * eventos `execute` para **10 comandos distintos**, con el primero repetido 43 veces — y eso
 * se ve en la PANTALLA, en tramos repetidos, además de inflar la traza y el contador de pasos.
 *
 * El `id` de un `tool_call` es identidad, no parecido: dos llamadas idénticas a la misma tool
 * con los mismos argumentos son dos llamadas, y colapsarlas por su contenido escondería trabajo
 * de verdad. Por eso se deduplica por ahí y no por el par nombre+argumentos.
 */
export function toolsDe(dato: unknown): Array<{ nombre: string; detalle?: string; parametros?: ParametrosSeguros; id?: string; respuesta?: string }> {
  if (!dato || typeof dato !== "object") return [];
  const salida: Array<{ nombre: string; detalle?: string; id?: string; respuesta?: string }> = [];
  for (const nodo of Object.values(dato as Record<string, unknown>)) {
    const msgs = (nodo as Record<string, unknown> | null)?.messages;
    if (!Array.isArray(msgs)) continue;
    for (const m of msgs) {
      const llamadas = (m as Record<string, unknown>)?.tool_calls;
      // El id del MENSAJE que trae estas llamadas: es lo que dice cuales se pidieron JUNTAS.
      const respuesta = (m as Record<string, unknown>)?.id;
      if (Array.isArray(llamadas)) {
        for (const l of llamadas) {
          const n = (l as Record<string, unknown>)?.name;
          if (typeof n === "string") {
            const args = (l as Record<string, unknown>).args;
            const detalle = detalleDe(n, args);
            const parametros = parametrosDe(n, args);
            const id = (l as Record<string, unknown>)?.id;
            salida.push({
              nombre: n,
              ...(detalle === undefined ? {} : { detalle }),
              ...(parametros === undefined ? {} : { parametros }),
              ...(typeof id === "string" && id !== "" ? { id } : {}),
              ...(typeof respuesta === "string" && respuesta !== "" ? { respuesta } : {}),
            });
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

/**
 * El `origen` es EXACTO, no una inferencia, y por eso solo distingue dos.
 *
 * Sale de `esDelPadre`, que está medido: un especialista SIEMPRE lleva un segmento `tools:`
 * delante en su namespace, porque se le invoca con la tool `task`. Lo que el namespace NO dice
 * es CUÁL especialista — sus segmentos son `tools:<uuid>` y `model_request:<uuid>`, ids opacos.
 *
 * **Y se queda así a propósito.** Antes de esto, la única forma de repartir tools por origen era
 * una heurística sobre el fichero de traza (imputarlas al siguiente registro de modelo), que se
 * veía que fallaba: daba 21 tools a un especialista cuyo tope son 20. Un número que parece un
 * dato y es una inferencia es peor que no tenerlo. Esto son dos cubos ciertos en vez de cinco
 * dudosos, y el que hacía falta —cuánto gasta el orquestador— es uno de los dos.
 */
export type OrigenDeTool = "orquestador" | "especialista";

/**
 * De quién es esta tool, por el namespace del chunk.
 *
 * **No usa `esDelPadre`, y equivocarme con eso costó una medida falsa.** Aquel predicado es la
 * LONGITUD del namespace y está medido para `messages`, donde el padre llega como
 * `["model_request:<uuid>"]` — longitud 1. En `updates`, que es el modo por el que llegan los
 * `tool_calls`, el padre llega con `[]` y un especialista con `["tools:<id>"]`, también
 * longitud 1. Aplicar allí la regla de la longitud imputaba al orquestador TODAS las tools:
 * el informe decía «orquestador 70 de 70» en un turno donde un especialista hizo 16 llamadas
 * y se comió su tope.
 *
 * La regla buena es la que el propio comentario de `esDelPadre` ya declaraba: **un
 * especialista SIEMPRE lleva un segmento `tools:` delante**, porque se le invoca con la tool
 * `task`. Eso vale en los dos modos y no depende de cuántos segmentos haya.
 */
export function origenDeTool(ns: readonly string[]): OrigenDeTool {
  return ns[0]?.startsWith("tools:") === true ? "especialista" : "orquestador";
}

export type AlLlamarTool = (tool: {
  nombre: string;
  detalle?: string;
  parametros?: ParametrosSeguros;
  origen: OrigenDeTool;
  /**
   * Id del MENSAJE del modelo que pidio esta tool. Dos tools con el mismo valor se
   * pidieron en la MISMA respuesta, que es lo unico que decide si van en paralelo.
   *
   * Existe porque sin el la traza no podia contestarlo y habia que adivinarlo. Medido
   * sobre un turno real de 69 tools: agrupar por el reloj exacto daba 18 en rafaga (el
   * milisegundo PARTE una rafaga) y agrupar por los contadores del tracker daba 38, con
   * dos grupos de 1.000 ms de span, o sea rezagados FUNDIDOS en una respuesta ajena. Dos
   * metodos, dos respuestas, y ninguno comprobable. Ademas `origen` solo tiene dos
   * valores, asi que dos especialistas a la vez son indistinguibles: el id del mensaje
   * tambien los separa.
   */
  respuesta?: string;
}) => void;

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
  alLlamarTool?: AlLlamarTool,
  vistasDelTurno?: Set<string>
): AsyncIterable<DomainEvent> {
  const mensajes = new Mensajes();
  /**
   * Los `tool_call` ya contados, por id: el stream reenvía los mensajes acumulados.
   *
   * **Y el conjunto tiene que vivir por TURNO, no por RONDA** — por eso entra por parámetro.
   * `turnoReal.ts` llama a `aEventos` DENTRO del bucle de rondas: una aprobación termina la
   * ronda, se reanuda con un `Command` y el stream vuelve a entregar la historia acumulada.
   * Con el conjunto local, cada ronda empezaba en blanco y volvía a contar todas las tools
   * de las rondas anteriores.
   *
   * Medido sobre una sesión real de MyAllXOne: la traza decía OCHO `edit_file` sobre
   * `/funciones.js` con seis "en la misma respuesta", y en la pantalla se había pedido UN
   * permiso y escrito UNA vez. Las reemisiones caían 15 ms despues de cada ronda y con el
   * MISMO id de mensaje — o sea que no eran del modelo, eran del stream. Eso mandó a
   * diagnosticar un problema de escrituras concurrentes que la traza se habia inventado.
   *
   * Sin el parametro se comporta como antes (un turno de una ronda), asi que ningun otro
   * llamador ni ningun doble de los tests cambia: la misma asimetria que los metodos
   * opcionales de `Piel`.
   */
  const vistas = vistasDelTurno ?? new Set<string>();
  try {
    for await (const bruto of stream) {
      const chunk = normalizar(bruto);
      if (!chunk) continue;

      if (chunk.modo === "updates") {
        for (const { nombre, detalle, parametros, id, respuesta } of toolsDe(chunk.dato)) {
          // Ya contada: este mismo chunk trae la historia acumulada del subgrafo (ver
          // `toolsDe`). Sin `id` no se puede afirmar que sea repetida, así que se emite —
          // la dirección segura es contar de más, no callar una llamada que ocurrió.
          if (id !== undefined) {
            if (vistas.has(id)) continue;
            vistas.add(id);
          }
          try {
            alLlamarTool?.({
              nombre,
              ...(detalle === undefined ? {} : { detalle }),
              ...(parametros === undefined ? {} : { parametros }),
              origen: origenDeTool(chunk.ns),
              ...(respuesta === undefined ? {} : { respuesta }),
            });
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
        /**
         * **El RESULTADO de una tool no es la respuesta del asistente**, y por este modo de
         * stream llega igual que un token. Sin esta línea se pintaba en el chat el fichero
         * entero que acababa de leer —con sus números de línea y el pie `[Read 12 lines…]`—,
         * que es justo lo que `core/events.ts` prohíbe: ningún evento lleva contenido de
         * tool, ni truncado. Lo que el usuario debe ver de una tool es su LÍNEA (`tipo:
         * "tool"`, con el detalle de la lista blanca), y eso ya se emite en la rama de
         * `updates`.
         *
         * Estuvo mudo hasta que el orquestador dejó de delegarlo todo: mientras su única
         * tool era `task`, lo que se colaba era la respuesta del especialista, que pasaba por
         * una respuesta. Desde que lee ficheros, se colaba cada fichero.
         */
        if (esMensajeDeTool(msg)) continue;
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
