/**
 * Un acto del transcript: lo que ya no cambia y se pinta por su tipo.
 *
 * Vivía en `cli/tui/store.ts` porque solo lo usaba la TUI. Ahora lo usan DOS pieles —la
 * TUI y la web—, y el servidor web no puede importar de `cli/tui/` sin romper la frontera
 * de Ink. Así que baja a `core/`, que es donde vive lo que comparten las pieles.
 *
 * Ningún acto lleva argumentos de tool: `herramientas.lineas` son líneas YA resumidas por
 * `agent/turno/resumenDeTool.ts`, con la lista blanca de campos por nombre de tool. Lo que se
 * añadió después (`detalles`) tampoco los lleva: es el NOMBRE de la tool y su error, que
 * el evento ya traía y el acto tiraba al componer la línea.
 */

import type { AccionDeSincronizacion } from "./cloudstudio.js";
import type { OrigenDeLaTool } from "./events.js";

/**
 * Lo que se sabe de la línea i-ésima de un acto de herramientas.
 *
 * Existe porque el evento `tool` lleva `{nombre, detalle, error}` y hasta ahora llegaba al
 * cliente como UNA cadena ya compuesta: la piel podía pintarla, pero no distinguir una
 * lectura de una escritura ni una llamada que falló de una que fue bien. No expone nada
 * nuevo — `detalle` sigue sin viajar aquí, y el nombre de la tool ya iba dentro del texto.
 *
 * `nombre` es OPCIONAL y su ausencia significa algo: por `Piel.linea` no llegan solo tools.
 * También pasan por ahí las líneas de plan, de tarea y de verificación (`core/turno.ts` las
 * escribe con el mismo `escribirLinea`), y esas no son una llamada a nada. Marcarlas como
 * tool sería la misma mentira que un contador inventado; sin nombre, quien pinte sabe que
 * es un paso del motor y no una herramienta.
 */
export interface DetalleDeLinea {
  /** La tool que produjo la línea. Ausente = la línea no vino de una tool. */
  nombre?: string;
  /** El motivo, si la llamada falló. Un error nunca se colapsa con la racha. */
  error?: string;
  /**
   * Quién la pidió: el orquestador o un especialista, y cuál si se sabe
   * (`core/events.ts#OrigenDeLaTool`). Ausente = no consta, que es el caso de una sesión
   * guardada antes de que existiera y de una línea que no es de ninguna tool.
   */
  origen?: OrigenDeLaTool;
}
export type Acto =
  | { tipo: "usuario"; texto: string }
  | { tipo: "asistente"; texto: string }
  /**
   * El razonamiento del modelo, si lo publica. Es un acto APARTE de `asistente` porque no
   * es la respuesta: se pinta distinto (apagado, plegable) y quien lea el transcript tiene
   * que poder distinguir lo que el modelo pensó de lo que dijo.
   */
  | { tipo: "razonamiento"; texto: string }
  /**
   * Las líneas de tool CONSECUTIVAS de un turno, en un solo acto: son paisaje, y el
   * transcript enseña solo las últimas. Una línea del asistente (o de sistema) cierra el
   * grupo; la siguiente tool abre otro.
   */
  /**
   * `detalles` corre EN PARALELO a `lineas`, misma longitud y mismo orden. Es opcional
   * porque las sesiones guardadas antes de que existiera no lo traen: ausente significa
   * «esta sesión es anterior», no «ninguna línea vino de una tool», y quien pinte tiene que
   * poder distinguirlo — por eso no se rellena con un array de vacíos al leer del disco.
   */
  | { tipo: "herramientas"; lineas: string[]; detalles?: DetalleDeLinea[] }
  /**
   * Una línea del harness, no de la conversación: la respuesta a un comando, un aviso de
   * honestidad, lo que se autorizó sin preguntar.
   *
   * **`clase` dice DE QUÉ es, y viaja con el acto en vez de deducirse del texto.** Es la
   * misma regla que la FORMA de una pregunta (`DecisionDeConsola`): mirar el enunciado para
   * decidir cómo se pinta es leer la sintaxis que la propia piel acaba de escribir, y aquí
   * se rompería en las dos direcciones — un «hecho: …» que empieza igual que un aviso, y un
   * aviso que mañana cambie de redacción.
   *
   * Solo dos clases, y las dos son lo que el HARNESS dice SOBRE el turno: `aviso` (la
   * bitácora de honestidad, el juez, el crítico de pantalla) y `permiso` (una escritura que
   * se aplicó sin preguntar porque la sesión está en autónomo). Esas se agrupan y se pliegan.
   *
   * **Ausente es lo de siempre, y eso es la decisión**: una respuesta a un comando —«hecho:
   * cada escritura vuelve a pedir aprobación»— es el acuse de un botón que la persona acaba
   * de pulsar, y plegarlo sería no contestarle. Sigue suelta y a la vista, como las sesiones
   * guardadas antes de que este campo existiera.
   */
  | { tipo: "sistema"; texto: string; clase?: "aviso" | "permiso" | "resumen" }
  /**
   * Un artefacto que el agente dejó escrito: un diagrama, un panel, una captura
   * (`core/artefactos.ts`). Es un acto propio y no una línea de `herramientas` porque es lo
   * único del turno que se escribió SIN pasar por la aprobación humana —no es del proyecto—
   * y eso hay que poder decirlo, y porque desde él se abre el fichero.
   *
   * Lleva metadatos y NUNCA el contenido: por aquí pasa lo que se guarda en el `.jsonl` y
   * viaja por el cable, y un panel de `artifacts-builder` son cientos de kilobytes.
   */
  | { tipo: "artefacto"; ruta: string; nombre: string; bytes: number; mime?: string }
  /**
   * Una PREGUNTA del agente con opciones (`events.ts#consulta`). Se guarda en el `.jsonl`
   * como cualquier acto, y eso es lo que hace que la tarjeta VUELVA al reabrir una sesión
   * que se quedó esperando respuesta: sigue pendiente mientras no haya un acto de usuario
   * detrás. El texto de la pregunta no se repite aquí como mensaje: ya está en el del
   * asistente.
   */
  | { tipo: "consulta"; pregunta: string; opciones: string[] }
  /**
   * `fase` es el valor del enum (`core/events.ts#Fase`), que el acto tiraba al quedarse
   * solo con su texto en español. Opcional por lo mismo que `detalles`: las sesiones
   * viejas no lo traen. Sirve para filtrar y agrupar sin re-parsear la prosa, que es lo
   * que habría que hacer si solo estuviera el texto — y una prosa que alguien reescriba
   * rompería el filtro sin que nada avisara.
   */
  | { tipo: "fase"; texto: string; ms: number; fase?: string }
  /**
   * El cierre del turno: duración, el modelo que lo corrió y lo que COSTÓ.
   *
   * `consumo` es el gasto de ESTE turno y va como **delta**, no como el acumulado de la
   * sesión. Es la diferencia que hace que sobreviva a un cierre: el tracker vive en el
   * cierre de `abrirSesionReal` y arranca de cero en cada proceso, así que un acumulado
   * estampado aquí sería un absoluto de una escala que cada arranque reinicia — y sumar
   * dos de esos no da nada. Los deltas, en cambio, suman lo mismo dentro de un proceso que
   * repartidos en tres: reabrir y seguir trabajando da el mismo total que no haber cerrado.
   *
   * Se suman los TOKENS de las dos cuentas y nunca su coste, igual que en la pantalla
   * (`componentes/ContadorDeTokens.tsx`): los del grafo van contra la clave de API del
   * usuario y los del agente externo contra su suscripción del producto.
   *
   * `ventana` es lo que ocupaba el historial al cerrar el turno. Es un NIVEL y no un flujo
   * —por eso no se suma—, y va aquí para que una sesión reabierta pueda decir cuánto
   * margen quedaba antes de resumir, que es la única cifra de la que no hay otra fuente.
   *
   * Opcional por lo mismo que `detalles` y `fase`: las sesiones guardadas antes de que
   * existiera no lo traen, y ausente significa «anterior» o «esta piel no lo sabe» —nunca
   * cero—. Quien lo lea tiene que poder distinguirlo, que es lo que hace `consumoDeLosActos`.
   */
  | { tipo: "fin"; ms: number; modelo?: string; consumo?: ConsumoDeTurno }
  | { tipo: "error"; texto: string }
  /**
   * UNA operación de sincronización con CloudStudio —subir o bajar—, contada entera y de una
   * pieza: las líneas que el terminal habría impreso, su hora y cuál de las tres acciones fue.
   *
   * **No es una conversación, y por eso no es una línea de `sistema`.** El hilo es lo que se
   * habla con el agente; una subida es un suceso del PROYECTO, que pasó porque alguien pulsó un
   * botón y no porque se preguntara nada. Metido en el chat eran nueve renglones de consola
   * cruda —el plan con su sangría, el `→ APROBADO`, el recuento— entre dos mensajes, y la
   * conversación había que buscarla alrededor; y como acto `sistema` suelto, además, cada línea
   * era un acto MÁS que se persistía y reaparecía al reabrir. Agrupadas aquí, la pestaña
   * Revisión las lee como lo que son: operaciones, una detrás de otra, cada una con su hora.
   *
   * **Las líneas van TAL CUAL las escribió la operación**, sin recomponer ni resumir: es lo
   * mismo que se habría visto en el terminal, y recomponerlas aquí sería una segunda versión de
   * algo que ya se cuenta en `agent/cloudstudio/subida.ts`, `agent/cloudstudio/descarga.ts` y `cli/main.ts` — dos
   * copias de la misma frase divergen, y la que nadie vuelve a leer es la que se queda vieja.
   *
   * `cuando` es ISO y es la hora de EMPEZAR, no la de acabar: es el instante que se recuerda
   * («subí aquello a las 14:32»), y así una subida larga no se fecha por su último segundo.
   *
   * No lleva lo que no es de la operación: ni el enunciado de la pregunta —eso es la tarjeta de
   * `preguntar`, y el `→ APROBADO` ya dice cómo se resolvió— ni los errores de uso del comando.
   */
  | {
      tipo: "sincronizacion";
      accion: AccionDeSincronizacion;
      cuando: string;
      lineas: string[];
    };

/**
 * El acto `sincronizacion` SIN su discriminante: lo que se le entrega a la piel para que lo
 * guarde.
 *
 * Existe para que el `tipo` se escriba UNA vez —donde vive el acto, que es `core/`— y quien lo
 * construye en `cli/` no tenga que repetirlo: dos sitios escribiendo el mismo literal es el que
 * se queda atrás el día que se renombre, y este repo ya sabe cómo acaba eso.
 */
export type NarracionDeSincronizacion = Omit<Extract<Acto, { tipo: "sincronizacion" }>, "tipo">;

/** Los tokens de UNA cuenta. La forma que ya usa `ConsumoDeSesionPorCuenta` (`core/ports.ts`). */
export interface ConsumoDeUnaCuenta {
  entrada: number;
  salida: number;
  /** Tokens leídos de caché. Va APARTE de la entrada, como en `vendor/tokenTracking.ts`:
   *  meterlo dentro inflaría la cifra que se enseña. */
  cache: number;
}

/**
 * Lo que costó un turno: las DOS cuentas por SEPARADO, más lo que ocupaba la ventana al
 * cerrarlo.
 *
 * Las dos cuentas viajan sin sumar hasta la pantalla, que es la regla que ya rige el
 * mensaje `consumo` (`web/servidor/transporte.ts`): los del grafo van contra la clave de
 * API del usuario y los del agente externo contra su suscripción del producto, así que
 * sumarlos aquí perdería el desglose para siempre — una sesión reabierta ya no podría decir
 * cuánto fue de un agente externo, porque de un total no se vuelve a las partes.
 *
 * `ventana` es lo que ocupaba el historial al cerrar el turno. Es un NIVEL y no un flujo
 * —por eso no se suma—, y va aquí para que una sesión reabierta pueda decir cuánto margen
 * quedaba antes de resumir, que es la única cifra de la que no hay otra fuente.
 */
export interface ConsumoDeTurno {
  modelo: ConsumoDeUnaCuenta;
  externo: ConsumoDeUnaCuenta;
  /** Ocupación del historial al cerrar el turno. Ausente = no consta. */
  ventana?: number;
}

/** Suma dos consumos, cuenta por cuenta. La ventana gana la del SEGUNDO: es la más reciente. */
export function sumarConsumo(a: ConsumoDeTurno, b: ConsumoDeTurno): ConsumoDeTurno {
  const suma = (x: ConsumoDeUnaCuenta, y: ConsumoDeUnaCuenta): ConsumoDeUnaCuenta => ({
    entrada: x.entrada + y.entrada,
    salida: x.salida + y.salida,
    cache: x.cache + y.cache,
  });
  const ventana = b.ventana ?? a.ventana;
  return {
    modelo: suma(a.modelo, b.modelo),
    externo: suma(a.externo, b.externo),
    ...(ventana === undefined ? {} : { ventana }),
  };
}

/**
 * Lo que costó una CONVERSACIÓN, leída de sus actos.
 *
 * Suma los deltas de los `fin` y se queda con la última ventana que CONSTA —la más
 * reciente que se midió, que es la mejor respuesta a «cuánto ocupa el historial ahora»
 * cuando el último turno no la midió—. Devuelve `undefined` cuando NINGÚN `fin` lo trae,
 * que es lo que distingue una sesión anterior a esto de una que gastó cero: pintar un cero
 * que nadie ha medido es la cifra inventada de siempre (`ContadorDeTokens`), y aquí se
 * puede caer en ella con una sesión vieja delante.
 *
 * Vive en `core/` y no en el servidor porque es una lectura de actos, no de disco: los
 * actos que le llegan pueden venir del `.jsonl` recién releído o de cualquier otra fuente.
 */
export function consumoDeLosActos(actos: readonly Acto[]): ConsumoDeTurno | undefined {
  let total: ConsumoDeTurno | undefined;
  for (const acto of actos) {
    if (acto.tipo !== "fin" || acto.consumo === undefined) continue;
    total = total === undefined ? { ...acto.consumo } : sumarConsumo(total, acto.consumo);
  }
  return total;
}

/**
 * El ACUMULADO de una sesión: se suma un turno detrás de otro, y **la ventana NO viaja**.
 *
 * Es la diferencia con `sumarConsumo`, y es la razón de que esto exista con nombre propio en
 * vez de ser un `sumarConsumo` más en la llamada. `consumoDeLosActos` compone los actos de UNA
 * conversación que se está mirando AHORA, y ahí la ventana tiene sentido: «cuánto ocupa el
 * historial» es una pregunta del momento, y la del último turno que midió es la respuesta.
 * Un acumulado estampado en el índice es otra cosa —el gasto de una sesión ya cerrada—, y una
 * ventana dentro sería un «ahora» congelado hace tres días que alguien leería como el de hoy.
 * El dato no se pierde: sigue en cada `fin` del `.jsonl`, que es donde se mide.
 *
 * `a` ausente es el primer `fin` de la sesión: devuelve una copia del delta, no el delta —quien
 * lo llame lo va a guardar en el índice, y los actos del lazo no son de nadie para mutarlos.
 */
export function acumularTotales(a: ConsumoDeTurno | undefined, delta: ConsumoDeTurno): ConsumoDeTurno {
  const total = a === undefined ? delta : sumarConsumo(a, delta);
  return {
    modelo: { ...total.modelo },
    externo: { ...total.externo },
  };
}

/**
 * Una línea de cierre de racha del colapsador del motor (`core/notify.ts`): «→ lee ×3 — …».
 * Devuelve su prefijo icono+verbo («→ lee»), o undefined si no es un cierre.
 */
function prefijoDeCierre(linea: string): string | undefined {
  const m = /^(\S+ \S+) ×\d+/.exec(linea);
  return m?.[1];
}

/**
 * Añadir una línea de tool al grupo: si es el cierre de la racha cuya apertura es la
 * última línea, la SUSTITUYE. El colapsador escribe apertura y cierre porque stdio solo
 * añade; una piel que repinta (TUI, web) no puede permitirse dos líneas para la misma
 * racha. Pura, y vivía en `cli/tui/store.ts` hasta que la web empezó a necesitarla
 * también: dos copias de esta sutileza es cómo divergen.
 */
export function conLineaDeTool(lineas: readonly string[], linea: string): string[] {
  const prefijo = prefijoDeCierre(linea);
  const ultima = lineas.at(-1);
  if (prefijo !== undefined && ultima !== undefined && (ultima === prefijo || ultima.startsWith(`${prefijo} `))) {
    return [...lineas.slice(0, -1), linea];
  }
  return [...lineas, linea];
}

/**
 * La misma fusión, sobre las DOS listas a la vez.
 *
 * Los `detalles` van en paralelo a las `lineas`, así que aplicarles la regla por separado
 * es cómo se desincronizan: la sustitución del cierre de una racha quita un elemento de
 * una lista y no de la otra, y a partir de ahí cada línea lleva el detalle de su vecina.
 * Una sola función que devuelva las dos lo hace imposible por construcción.
 */
export function conLlamadaDeTool(
  grupo: { lineas: readonly string[]; detalles?: readonly DetalleDeLinea[] },
  linea: string,
  detalle: DetalleDeLinea
): { lineas: string[]; detalles: DetalleDeLinea[] } {
  const lineas = conLineaDeTool(grupo.lineas, linea);
  // Si `conLineaDeTool` sustituyó, la lista no creció: el detalle nuevo sustituye al
  // último igual que su línea. Si creció, se añade. Se compara por LONGITUD y no
  // repitiendo el `prefijoDeCierre`, para que solo haya una decisión y no dos que puedan
  // discrepar.
  const previos = grupo.detalles ?? grupo.lineas.map(() => ({}));
  const detalles =
    lineas.length === grupo.lineas.length
      ? [...previos.slice(0, -1), detalle]
      : [...previos, detalle];
  return { lineas, detalles };
}
