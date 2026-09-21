/**
 * Política de contexto del harness.
 *
 * DeepAgents usa 170k tokens cuando el proveedor no publica su ventana de contexto. Con
 * Ollama eso retrasa demasiado la compresión y cada llamada reenvía lecturas ya resueltas.
 * Este umbral es independiente del proveedor: limita el coste sin borrar el trabajo reciente.
 */
import { createSummarizationMiddleware, type FilesystemBackend } from "deepagents";
import { createMiddleware, toolCallLimitMiddleware } from "langchain";
import { z } from "zod";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { mensajeDeTopeAgotado } from "../../core/topeAgotado.js";
import { RUTA_HISTORIAL_RESUMIDO } from "../grafo/memoriaDeProyecto.js";

export const UMBRAL_RESUMEN_TOKENS = 32_000;
export const CONTEXTO_RECIENTE_TOKENS = 8_000;

export function resumenDeContexto(backend: FilesystemBackend) {
  return createSummarizationMiddleware({
    backend,
    trigger: { type: "tokens", value: UMBRAL_RESUMEN_TOKENS },
    keep: { type: "tokens", value: CONTEXTO_RECIENTE_TOKENS },
    // Las tools de fichero pueden llevar contenido grande. Los argumentos antiguos ya
    // están representados por el resumen, no deben volver a inflar las siguientes llamadas.
    truncateArgsSettings: {
      trigger: { type: "tokens", value: UMBRAL_RESUMEN_TOKENS },
      keep: { type: "tokens", value: CONTEXTO_RECIENTE_TOKENS },
      maxLength: 1_000,
    },
    trimTokensToSummarize: 12_000,
    // El backend lo escribe directamente; no debe aparecer en el árbol ni en las tools del
    // agente. Así el estado de sesión permanece junto al proyecto y fuera de la app XOne.
    historyPathPrefix: RUTA_HISTORIAL_RESUMIDO,
  });
}

/**
 * Devuelve el ENCARGO a la conversación después de que el resumen se lo lleve.
 *
 * ## El fallo que cierra, medido offline el 17-09-2026
 *
 * Un turno real del usuario: el orquestador delegó una pregunta sobre si XOne servía para un
 * CRM, el especialista dio 57 pasos y volvió con la respuesta de la pregunta **anterior** —«la
 * ventana de inicio de mi app»—. El orquestador lo detectó y relanzó dos veces: 1,5M de tokens
 * para una pregunta. El propio modelo dijo que «parece que trae una sesión antigua pegada», y
 * esa hipótesis era falsa: los subagentes van en `handoff`, así que arrancan con el encargo y
 * nada más, y aunque HEREDAN nuestro checkpointer, el namespace de cada `task` lleva el paso y
 * el id del checkpoint dentro, así que no puede reanudar nada.
 *
 * Lo que pasa de verdad está en el middleware de resumen: al cruzar el umbral, los mensajes
 * `[0, corte)` se sustituyen por UN resumen, y el mensaje 0 es justamente el encargo. `keep`
 * solo conserva la COLA —no hay opción para el primero— y el prompt de resumen por omisión
 * pide «temas, decisiones y contexto para continuar», no el encargo. O sea que a partir de los
 * 32k el especialista sigue trabajando **sin la pregunta que le hicieron**, y contesta a lo que
 * el resumen le deje entender. Medido en `resumenDeContexto.test.ts`.
 *
 * ## Por qué por CÓDIGO y no por `summaryPrompt`
 *
 * Se podría pedir en el prompt del resumen que conserve el encargo, y a veces lo haría. Un
 * agente que pierde su encargo no contesta peor: contesta a otra cosa, y el coste de eso ya
 * está medido en millones de tokens. Es la misma regla que hace que los avisos de honestidad
 * sean código y no prompt (`core/bitacora.ts`).
 *
 * El encargo se saca del ESTADO, que el resumen no reescribe (guarda un `_summarizationEvent`
 * y reconstruye la lista efectiva), así que ahí sigue intacto el mensaje 0. Y se reinserta solo
 * si NO está: por debajo del umbral no hay nada que devolver y duplicarlo sería peor.
 */
export function conservarElEncargo() {
  return createMiddleware({
    name: "ConservarElEncargoMiddleware",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wrapModelCall: (request: any, handler: any) => {
      const mensajes = request?.messages;
      const historial = request?.state?.messages;
      if (!Array.isArray(mensajes) || !Array.isArray(historial) || mensajes.length === 0) return handler(request);

      // **El ÚLTIMO humano, no el primero**, y la diferencia es el defecto entero: en la
      // conversación de un ESPECIALISTA solo hay uno —el encargo— y los dos coinciden, pero la
      // del ORQUESTADOR es multiturno, y ahí el primero es la pregunta de hace tres turnos.
      // Reinyectar esa sería reintroducir a mano justo el fallo que esto arregla.
      const encargo = [...historial].reverse().find((m: unknown) => esDeHumano(m));
      if (encargo === undefined || mensajes.includes(encargo)) return handler(request);

      // Por CONTENIDO además de por identidad: la lista efectiva se reconstruye, así que el
      // mensaje puede ser otro objeto con el mismo texto. Sin esto se duplicaría el encargo en
      // cada llamada posterior al resumen.
      const texto = textoPlano(encargo);
      if (texto !== "" && mensajes.some((m: unknown) => esDeHumano(m) && textoPlano(m) === texto)) return handler(request);

      return handler({ ...request, messages: [encargo, ...mensajes] });
    },
  });
}

function esDeHumano(msg: unknown): boolean {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  return m.type === "human" || m.role === "user" || m instanceof HumanMessage;
}

function textoPlano(msg: unknown): string {
  const c = (msg as { content?: unknown } | null)?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((b) => (typeof b === "object" && b !== null && "text" in b ? String((b as { text: unknown }).text) : "")).join("");
  return "";
}

/**
 * El resumen y la devolución del encargo, SIEMPRE juntos y en este orden.
 *
 * Van en una sola función porque separarlos es el fallo: el primero de la lista envuelve al
 * siguiente, así que `conservarElEncargo` tiene que ver los mensajes YA resumidos — delante no
 * habría nada que devolver. Montarlos a mano en dos sitios (el orquestador y cada especialista)
 * es el patrón que en este repo ha fallado nueve veces: una composición de producción que vive
 * en un cierre que los tests doblan, y que puede dejar de estar montada con todo en verde.
 */
export function resumenConEncargo(backend: FilesystemBackend): ReturnType<typeof createMiddleware>[] {
  return [resumenDeContexto(backend), conservarElEncargo()] as ReturnType<typeof createMiddleware>[];
}

/**
 * Cuántas llamadas al modelo puede gastar UN especialista en un encargo.
 *
 * Medido el 17-09-2026 con el banco: una pregunta de estructura se resuelve en 3-7 llamadas en
 * TODO el turno, y la de capacidad —la clase cara— la terminó bien un modelo en 10. El que se
 * descarriló llevaba 32 y subiendo cuando el reloj lo mató, y 57 en el turno que lo destapó.
 *
 * **No es un ahorro, es una frontera.** Un especialista hace una tarea específica con un
 * encargo bien descrito; si necesita cuarenta llamadas, lo que falla es la delegación, y seguir
 * dándole cuerda solo hace más cara la misma respuesta mala.
 *
 * ## Por qué ya no es 15: aquella medida era de PREGUNTAS, y no todos contestan preguntas
 *
 * Las cifras de arriba salieron del banco, que pregunta. Y a un especialista que además
 * ESCRIBE no le valen: medido el 21-09-2026 sobre MyAllXOne con un encargo de desarrollo de
 * varios pasos, `analyst-xone` se delegó dos veces, **agotó las 15 las dos veces y no escribió
 * ni un fichero**. No se descarriló ni entendió mal el encargo —en sus llamadas 2 y 3 abrió
 * `xone-spec-builder` y `xone-plan-builder`, o sea que sabía que tenía que dejar un plan—:
 * se le fue el presupuesto ORIENTÁNDOSE, y la fase de escribir, que es el entregable, no
 * llegó a empezar. `developer-xone` se quedó cortado en el mismo turno.
 *
 * Un tope calibrado sobre «leer y contestar» aplicado a «leer y ENTREGAR» corta el trabajo
 * justo antes de que produzca algo, y encima en silencio: el síntoma es un plan que no
 * existe, no un error. El número cubre una pasada entera de reconocimiento (~15, medido) más
 * las lecturas de sus skills y los tres ficheros que deja, y se queda POR DEBAJO del
 * conductor: es un freno por encima de una entrega y no por debajo.
 *
 * ## Y SUBIRLO NO BASTA — se probó el mismo día y hay que decirlo aquí
 *
 * Con 15 el analista gastaba 15 y no escribía; con 30 gastó **30 y tampoco escribió**, dos
 * pasadas otra vez, y el turno costó un 30 % más (~950k → ~1,24M efectivos) para el mismo
 * resultado: cero `write_file`, cero `/planes/`. **Expande el reconocimiento hasta llenar lo
 * que le des** — con 30 llamadas se fue a `LoginColl`, `ContentTareas`, `ClientesCoord` y
 * `basico.css` para un conversor de divisas.
 *
 * O sea que el presupuesto **no era la restricción que ataba**, y este número no es el
 * arreglo de nada: lo que ata es que escribir está planteado como el ÚLTIMO paso, y eso se
 * arregla donde vive esa instrucción (`agentesEnDisco.ts#PLAN_DE_DESARROLLO`), no aquí. Esto
 * se queda porque una entrega no cabía en 15 y sigue sin caber; no porque cure el síntoma.
 */
export const TOPE_DE_LLAMADAS_DEL_ESPECIALISTA = 30;

/**
 * El de quien CONDUCE UN APARATO, que es otro trabajo y por eso otro número.
 *
 * El 15 de arriba se midió sobre especialistas que LEEN y contestan: ahí treinta llamadas
 * significan que la delegación estaba mal escrita. Conducir no es eso — es un bucle de
 * acto→observa donde cada paso (conectar, listar controles, pulsar, esperar, capturar,
 * leer el log) es una llamada al modelo POR CONSTRUCCIÓN, y no hay encargo, por bien
 * escrito que esté, que lo acorte.
 *
 * **Medido en un turno real** (MyAllXOne, «crear una opción nueva en el drawer»): el
 * conductor se delegó SIETE veces en el mismo turno, cada una agotando su tope, ~94
 * comandos en total. El tope no evitó el gasto: lo partió en siete arranques, y como los
 * especialistas no comparten transcript, cada uno volvió a conectar y a orientarse desde
 * cero. Un tope que se rodea re-delegando no acota nada, solo añade amnesia.
 *
 * Sigue habiendo tope, y por lo mismo de siempre: un bucle sin freno se come el turno. Lo
 * que cambia es dónde está el freno — por encima de UNA navegación completa y no por
 * debajo.
 */
export const TOPE_DE_LLAMADAS_DEL_CONDUCTOR = 60;

/**
 * El tope, con `exitBehavior: "end"` y no `"error"`.
 *
 * Con `"error"` la delegación entera se cae y el orquestador se queda sin nada, que es como
 * empieza el bucle de reintentos que ya costó 1,5M de tokens. Con `"end"` el especialista
 * devuelve lo que tenga y quien decide es el orquestador, que para eso lee la respuesta.
 *
 * Es de la librería (`langchain`), y deepagents lo contempla: **desde 1.14.0** sus cuatro
 * claves de conteo (`CALL_COUNT_STATE_KEYS`) están en `EXCLUDED_STATE_KEYS`, «each agent
 * counts its own calls, so they never cross the boundary». O sea que el tope de un
 * especialista no toca el del padre.
 *
 * **Ojo: eso no era verdad antes, y este comentario lo afirmaba igual.** En 1.13.2 la lista
 * no incluía los contadores, y como el `task` devuelve un `Command` que vuelca en el PADRE
 * todo el estado del subagente menos esa lista, dos `task` en el mismo paso escribían dos
 * veces el mismo canal — y `LastValue` solo admite un valor por paso. El síntoma era
 * `InvalidUpdateError: Invalid update for channel "threadToolCallCount" with values
 * [{"__all__":20},{"__all__":20}]`, con los DOS VALORES IGUALES, que es la firma de dos
 * subagentes y no de un contador avanzando. Visto con DeepSeek, que paraleliza las
 * delegaciones. Subir la dependencia es el arreglo.
 *
 * **Y `llamadasDelEspecialista` NO está cubierta**: es NUESTRA y la librería no la conoce,
 * así que sigue cruzando la frontera y puede chocar igual. No se ha visto todavía porque
 * hace falta que dos especialistas terminen en el mismo paso CON el mismo contador, pero el
 * agujero es el mismo. Está declarado y sin arreglar.
 */
const ESTADO_DEL_TOPE = z.object({ llamadasDelEspecialista: z.number().default(0) });

/**
 * El tope, NUESTRO y no el de la librería.
 *
 * `modelCallLimitMiddleware` cuenta bien y corta bien, pero lo que deja como respuesta es un
 * `AIMessage` con su frase en inglés —«Model call limits exceeded: …»—, y el `task` de
 * deepagents devuelve SOLO el último mensaje (`extractLastMessage`). O sea que quien delegó
 * recibe esa frase y **las quince llamadas de trabajo se pierden**: medido el 19-09-2026,
 * 100-160k de entrada por especialista devolviendo menos de 900 tokens. Esa es la razón de que
 * el orquestador encadene al siguiente — no enruta mal, es que no recibe nada con lo que seguir.
 *
 * No se pudo arreglar por fuera: su `jumpTo: "end"` **cortocircuita todos los middlewares
 * posteriores**, incluidos `afterAgent` y su propio reset del contador (medido contra la
 * librería real con `FakeToolCallingModel` y `runLimit: 0`, ver el test). No hay dónde
 * engancharse. Así que el contador, la decisión y el mensaje son de aquí: uno de cada, y el
 * mensaje se compone en `core/` donde se puede probar sin librería.
 *
 * `exitBehavior` sigue siendo «terminar» y no «lanzar», por el argumento de siempre: con un
 * error la delegación entera se cae y el orquestador se queda sin nada, que es como empieza el
 * bucle de reintentos que costó 1,5M de tokens.
 */
export function topeDeLlamadas(
  limite: number = TOPE_DE_LLAMADAS_DEL_ESPECIALISTA,
  alCortar?: () => void,
): ReturnType<typeof createMiddleware> {
  return createMiddleware({
    name: "TopeDeLlamadasMiddleware",
    stateSchema: ESTADO_DEL_TOPE,
    beforeModel: {
      canJumpTo: ["end"],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hook: (state: any) => {
        if ((state?.llamadasDelEspecialista ?? 0) < limite) return undefined;
        // Que el corte se VEA. Sin esto el único sitio donde consta es el mensaje que recibe
        // quien delegó, y la traza sigue diciendo «15 llamadas» como si hubiera terminado.
        alCortar?.();
        const parcial = ultimoTextoSustancial(state?.messages);
        return {
          jumpTo: "end",
          messages: [
            new AIMessage(
              mensajeDeTopeAgotado({ limite, ...(parcial === undefined ? {} : { parcial }) }),
            ),
          ],
        };
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    afterModel: (state: any) => ({
      llamadasDelEspecialista: (state?.llamadasDelEspecialista ?? 0) + 1,
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any) as ReturnType<typeof createMiddleware>;
}

/** Lo último que el especialista dijo con contenido: el trabajo que el corte iba a tirar. */
function ultimoTextoSustancial(mensajes: unknown): string | undefined {
  if (!Array.isArray(mensajes)) return undefined;
  return [...mensajes]
    .reverse()
    .map((m) => textoPlano(m))
    .find((texto) => texto.trim() !== "");
}

/**
 * Cuántas TOOLS puede gastar un especialista en un encargo.
 *
 * El tope de llamadas al modelo acota los VIAJES; este acota **lo que se acumula**, que es lo
 * que multiplica. Medido el 17-09-2026 en una conversación de tres preguntas: en la tercera, el
 * consultor llegó a 43 resultados de tool metidos en su contexto, y como cada llamada al modelo
 * reenvía todo lo anterior, la primera costó 5.264 tokens y la última 39.888 — 406k en total. No
 * era un bucle: era la acumulación al cuadrado.
 *
 * ## Por qué ya no es 20, y qué NO cambia
 *
 * Aquel veinte era generoso contra la regla del CONSULTOR, que ya le pide «máximo tres
 * referencias por pregunta y un `grep` por hipótesis». Pero el consultor contesta, y hay
 * especialistas que ENTREGAN: medido el 21-09-2026, `analyst-xone` gastó su pasada entera
 * inventariando (`glob *.xne`, `mappings.xne` paginado, `regex_search create table`, greps de
 * `SqlManager`) y se quedó sin tools antes de escribir el plan — ver
 * `TOPE_DE_LLAMADAS_DEL_ESPECIALISTA`, donde está la medida entera.
 *
 * Lo que NO cambia es el motivo por el que este tope existe, que es la acumulación y no el
 * bucle: cada llamada reenvía todo lo anterior, así que esto sigue siendo cuadrático y sigue
 * habiendo techo. El número nuevo cubre un reconocimiento completo más la escritura del
 * entregable y se queda por debajo del orquestador; el 43 de aquel incidente sigue fuera.
 */
export const TOPE_DE_TOOLS_DEL_ESPECIALISTA = 35;

/**
 * **`continue`, y NO `end`: son incompatibles con pedir varias tools a la vez.**
 *
 * Medido el 17-09-2026 en el primer turno con el tope puesto: «Cannot end execution with other
 * tool calls pending. Found calls to: read_file, ls, grep». La documentación de langchain lo
 * dice igual —`end` «raises NotImplementedError if there are multiple tool calls»— y nosotros le
 * PEDIMOS al especialista que agrupe las lecturas independientes en un mismo mensaje, así que
 * llegar al tope con varias en vuelo es el caso normal, no el raro.
 *
 * `continue` bloquea las que sobran con un mensaje de error y deja que el modelo termine: se
 * queda sin más tools y contesta con lo que tiene, que es lo mismo que buscaba `end` pero sin
 * romperse. `error` tumbaría la delegación entera, que es como empieza el bucle de reintentos.
 *
 * Dos reglas nuestras que vivían sin hablarse —«agrupa las tools» y «corta al llegar al tope»—
 * y cuyo choque solo se ve corriendo. Por eso el test las ata juntas.
 */
export const SALIDA_DEL_TOPE_DE_TOOLS = "continue" as const;


/**
 * Cuántas TOOLS puede gastar el ORQUESTADOR, y **es un guarda, no una economía**.
 *
 * ## Por qué NO lleva tope de LLAMADAS, y esto sí
 *
 * El argumento contra caparle las llamadas sigue en pie y es bueno: **el que contesta al
 * usuario no puede quedarse a medias**. Pero ese argumento es sobre no cortarle la VOZ, y el
 * tope de tools con `exitBehavior: "continue"` no corta nada — se queda sin más tools y
 * contesta con lo que tenga. Le quita la pala, no la palabra.
 *
 * ## Por qué el número es ALTO, y qué NO es
 *
 * **No está puesto para ahorrar.** Medido el 19-09-2026 sobre turnos reales, el orquestador
 * gasta 41 tools en un encargo visual normal —18 lecturas, 15 `grep`, 5 de navegación y 3
 * delegaciones— y sus llamadas al modelo van de 14 a 49 según el turno. Esas lecturas SON el
 * trabajo: recortarlas no abarata el turno, empeora la respuesta. Lo que abarata es quitarle la
 * NECESIDAD de leer, que es lo que hacen `conHechosDelProyecto` y la operación `estilos` — y se
 * está moviendo: la navegación pasó de 1-2 usos por turno a 5.
 *
 * Así que esto se sitúa POR ENCIMA de lo observado a propósito: no muerde en ningún turno
 * medido y solo para uno desbocado. Es el mismo papel que `topeDeRondas` y el tope propio de
 * los artefactos — «aquí no hay humano que frene el bucle»—, y por eso vive aquí y no en una
 * medida de coste. Si algún día muerde en un turno normal, lo que hay que mirar es por qué ese
 * turno necesitó 60 tools, no subir el número.
 */
export const TOPE_DE_TOOLS_DEL_ORQUESTADOR = 60;

export function topeDeTools(limite: number = TOPE_DE_TOOLS_DEL_ESPECIALISTA) {
  return toolCallLimitMiddleware({ runLimit: limite, exitBehavior: SALIDA_DEL_TOPE_DE_TOOLS });
}
