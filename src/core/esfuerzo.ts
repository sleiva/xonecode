/**
 * Cuánto tiene que PENSAR un modelo antes de contestar, y qué modelos admiten que se les
 * pida.
 *
 * Es la tercera tabla de esta familia, detrás de `contextos.ts#TOPES` y de
 * `modelos.ts#pideThinkingAdaptativo`, y existe por el mismo motivo que ellas: el
 * parámetro no significa lo mismo en todos, lo que no se reconoce hay que OMITIRLO, y
 * pedirlo a ciegas no da una respuesta peor — da un 400.
 *
 * **La unidad es el MODELO, nunca el proveedor**, y eso está medido: dentro de NVIDIA,
 * `nvidia/nemotron-3-super-120b-a12b` acepta siete niveles y `openai/gpt-oss-20b` acepta
 * tres, contra el mismo host y con la misma clave. Una tabla por proveedor habría sido
 * falsa el primer día.
 *
 * **Y los niveles son una LISTA por modelo, no tres fijos.** Anthropic tiene cinco desde
 * Opus 4.7 y cuatro en la 4.6; Gemini tres; `nvidia/nemotron-3` cinco y `openai/gpt-oss`
 * tres. Pintar siempre los mismos tres daría, según el modelo, o un control recortado o
 * dos opciones que hacen lo mismo sin decirlo — la misma clase de mentira que un contador
 * a cero que nadie ha medido.
 *
 * **Lo desconocido devuelve `undefined`**: ni se ofrece control ni se manda parámetro. Es
 * el mismo lado conservador de `pideThinkingAdaptativo`, y aquí es literal — un nivel
 * mandado a quien no lo admite se contesta con un error duro, comprobado en los tres
 * proveedores que se pudieron medir.
 */

import type { Proveedor } from "./modelos.js";

/**
 * Los niveles que este harness sabe nombrar.
 *
 * `none` NO está, y es deliberado: en DeepSeek significa «no pienses», o sea que es un
 * INTERRUPTOR y no un nivel. Mezclar «cuánto» con «si» en el mismo desplegable haría que
 * un control que se lee como una intensidad apagara una capacidad.
 */
export type Esfuerzo = "low" | "medium" | "high" | "xhigh" | "max";

export const ESFUERZOS: readonly Esfuerzo[] = ["low", "medium", "high", "xhigh", "max"] as const;

export function esEsfuerzo(valor: string): valor is Esfuerzo {
  return (ESFUERZOS as readonly string[]).includes(valor);
}

/** Los tres de siempre, que es lo que admite la mayoría. */
const TRES: readonly Esfuerzo[] = ["low", "medium", "high"];
/** Los cinco de Anthropic desde Opus 4.7. */
const CINCO: readonly Esfuerzo[] = ["low", "medium", "high", "xhigh", "max"];

/**
 * Qué acepta cada familia, emparejado por PREFIJO del id, y el primero que casa gana —
 * igual que en `contextos.ts`, así que lo específico va antes que lo general.
 *
 * De dónde sale cada fila, porque en este repo la procedencia es un dato:
 *
 * - **anthropic**: LEÍDO de la documentación de la casa (no hubo clave con la que medir).
 *   `output_config.effort` es GA y su omisión ya es `high`. Los cinco niveles existen desde
 *   Opus 4.7; Opus 4.6 y Sonnet 4.6 no tienen `xhigh`; Opus 4.5 solo tiene tres; y **Haiku
 *   4.5, Sonnet 4.5 y todo lo anterior dan ERROR**, así que no tienen fila. Esa frontera es
 *   la hermana de la de `pideThinkingAdaptativo`: ahí la pregunta era qué acepta `thinking`
 *   y aquí qué acepta `effort`, y las dos parten la misma generación.
 * - **gemini**: MEDIDO contra la API real. `thinkingLevel` solo existe de la generación 3 en
 *   adelante: `gemini-2.5-flash` contesta «Thinking level is not supported for this model» y
 *   `gemma-4-31b-it` lo mismo. Los tres alias `*-latest` van ENUMERADOS porque apuntan a 3.x
 *   y el prefijo `gemini-3` no los casaría — se comprobó uno a uno que los tres lo aceptan.
 *   Y el catálogo vivo NO sirve para decidir esto: `GET /v1beta/models/<id>` devuelve
 *   `"thinking": true` también para `gemini-2.5-flash`, que es justo el que falla; ese campo
 *   dice «sabe pensar», no «acepta niveles».
 * - **nvidia**: MEDIDO con el truco del valor inválido, que devuelve el enum en el propio
 *   error. Son dos filas y no una porque los dos modelos probados no coinciden.
 *
 * **Lo que NO tiene fila, y por qué**: `openai`, `groq` y `xai` no se pudieron medir —no
 * había credencial— y sus reglas por modelo no se parecen entre sí, así que se quedan
 * fuera hasta que alguien las mida. Un proveedor PERSONALIZADO tampoco puede tenerla: su
 * modelo lo elige quien dio de alta el endpoint. En los tres casos el resultado es el
 * mismo y es el correcto: sin control y sin parámetro.
 */
const TABLA: Partial<Record<Proveedor, Array<[prefijo: string, niveles: readonly Esfuerzo[]]>>> = {
  anthropic: [
    ["claude-fable", CINCO],
    ["claude-mythos", CINCO],
    ["claude-opus-5", CINCO],
    ["claude-sonnet-5", CINCO],
    ["claude-opus-4-8", CINCO],
    ["claude-opus-4-7", CINCO],
    // 4.6 es la generación donde `effort` ya existe pero `xhigh` todavía no.
    ["claude-opus-4-6", ["low", "medium", "high", "max"]],
    ["claude-sonnet-4-6", ["low", "medium", "high", "max"]],
    ["claude-opus-4-5", TRES],
    // Y nada más: Haiku 4.5, Sonnet 4.5 y lo anterior devuelven error si se les pide.
  ],
  gemini: [
    ["gemini-3", TRES],
    ["gemini-flash-latest", TRES],
    ["gemini-flash-lite-latest", TRES],
    ["gemini-pro-latest", TRES],
  ],
  /**
   * **DeepSeek NO tiene fila, y no es porque no sepa: es porque no puede aquí.**
   *
   * La tenía (`low`/`high`/`max`, que son sus tres niveles distintos tras el colapso de
   * `medium` sobre `high`), y se retira con la causa medida delante. Su documentación es
   * explícita: «for requests carrying the `tools` parameter, the `reasoning_content` must
   * be fully passed back to the API in all subsequent requests — even for turns where the
   * model did not perform a tool call. If your code does not correctly pass back
   * `reasoning_content`, the API will return a 400 error».
   *
   * Y `@langchain/openai` 1.5.5 **no lo devuelve nunca**: lo captura al entrar
   * (`additional_kwargs.reasoning_content`) y lo tira al salir, por los DOS conversores
   * —`convertMessagesToCompletionsMessageParams` y el de `output_version: "v1"`—, que
   * montan `role`, `content`, `name`, `function_call`, `tool_calls`, `tool_call_id` y
   * `audio`, y nada más. Comprobado leyendo la dependencia.
   *
   * Un agente manda SIEMPRE `tools`, así que pensar + agente = 400 en cuanto la
   * conversación avanza. Visto en un turno real: `MiddlewareError: 400 The
   * reasoning_content in the thinking mode must be passed back to the API`, y el
   * `MiddlewareError` lo puso `wrapToolCall` — o sea que reventó DENTRO de un subagente.
   *
   * Por eso el pensamiento se apaga al construir el cliente
   * (`agent/config/modelos.ts`), y sin pensamiento un nivel de esfuerzo no significa nada:
   * ofrecerlo sería un control que no hace nada. El día que langchain devuelva el eco,
   * esta fila vuelve — con su medida.
   */
  nvidia: [
    ["openai/gpt-oss", TRES],
    ["nvidia/nemotron-3", CINCO],
  ],
};

/**
 * Lo que el servidor ha dicho de ESTE modelo, cuando se le puede preguntar.
 *
 * Hoy solo Ollama, y por eso el campo es uno solo: su `POST /api/show` devuelve
 * `capabilities`, y ahí está `"thinking"` o no está. Medido: `granite4.2:3b`,
 * `glm-5.3-flash:cloud` y `qwen3.8:27b-mlx` la tienen; `ministral-3:3b` no, y pedirle que
 * piense contesta `"ministral-3:3b" does not support thinking`.
 *
 * Entra por PARÁMETRO en vez de consultarse aquí porque son dos cadencias distintas y este
 * módulo es puro: preguntar es asíncrono, toca la red y vive en `agent/`. Es el mismo
 * reparto que ya declara `contextos.ts` sobre el `max_input_tokens` del catálogo vivo, solo
 * que aquí el dato sí llega — quien lo rellena es `agent/config/catalogoModelos.ts`.
 */
export interface CapacidadesVivas {
  /** ¿El servidor dice que este modelo piensa? Ausente = no se ha preguntado. */
  piensa?: boolean;
}

/**
 * Los niveles de esfuerzo que admite un modelo, o `undefined` si no admite ninguno —que es
 * también lo que se devuelve cuando no se sabe, porque no saberlo y no poder son lo mismo
 * para quien tiene que decidir si manda el parámetro.
 *
 * **Ollama va por las capacidades vivas y no por la tabla**, y esa asimetría es el hallazgo
 * que la justifica: sus modelos los elige el usuario y no hay prefijo que los describa, pero
 * el servidor contesta por cada uno. Sin capacidades —porque aún no se preguntó— no se
 * afirma nada, que es distinto de afirmar que no puede.
 */
export function nivelesDeEsfuerzo(
  proveedor: Proveedor,
  modelo: string,
  vivas?: CapacidadesVivas,
): readonly Esfuerzo[] | undefined {
  if (proveedor === "ollama" || proveedor === "ollama-cloud") {
    return vivas?.piensa === true ? NIVELES_DE_OLLAMA : undefined;
  }
  return TABLA[proveedor]?.find(([prefijo]) => modelo.startsWith(prefijo))?.[1];
}

/**
 * Lo que el servidor de Ollama valida, y está medido en su propio mensaje de error: un
 * `think: "banana"` contesta `must be "high", "medium", "low", "max", true, or false`.
 *
 * O sea que Ollama SÍ tiene niveles; que el tipo de `@langchain/ollama` los declare como un
 * `boolean` es una limitación del cliente y no del servidor, y el cliente pasa el valor tal
 * cual al request.
 *
 * **Y aquí hay un límite declarado que no se puede cerrar desde esta tabla**: que el
 * servidor acepte el nivel no significa que el modelo lo honre. Medido: en `granite4.2:3b`
 * solo `low` cambia algo y `medium`/`high`/`max` son idénticos entre sí; en
 * `glm-5.3-flash:cloud` —que es el modelo POR OMISIÓN de este repo— `high` se comporta como
 * apagado y solo `medium` piensa. No es monótono y no lo podemos arreglar: lo pone el
 * template de cada modelo. Quien pinte esto tiene que DECIRLO.
 */
export const NIVELES_DE_OLLAMA: readonly Esfuerzo[] = ["low", "medium", "high", "max"];

/**
 * El nivel que se va a usar de verdad, dado lo que el usuario eligió y lo que el modelo
 * admite.
 *
 * Existe porque elegir y aplicar están separados en el tiempo: el esfuerzo se fija una vez
 * y el modelo se cambia después, así que un `xhigh` elegido con Opus 5 sigue puesto cuando
 * alguien se pasa a Gemini, que no lo tiene. Ahí NO se manda el parámetro y NO se sustituye
 * por el más parecido: bajar `xhigh` a `high` por nuestra cuenta sería decidir en nombre de
 * alguien, y en este harness eso se paga en tokens que no pidió.
 */
export function esfuerzoAplicable(
  elegido: Esfuerzo | undefined,
  proveedor: Proveedor,
  modelo: string,
  vivas?: CapacidadesVivas,
): Esfuerzo | undefined {
  if (elegido === undefined) return undefined;
  return nivelesDeEsfuerzo(proveedor, modelo, vivas)?.includes(elegido) === true ? elegido : undefined;
}
