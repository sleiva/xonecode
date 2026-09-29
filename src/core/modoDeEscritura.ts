/**
 * # El modo de escritura de una sesión
 *
 * Dos modos y nada más: **supervisado**, donde cada escritura para con su diff delante, y
 * **autónomo**, donde el agente escribe los ficheros del proyecto sin preguntar.
 *
 * **Vive en la SESIÓN, no en el disco.** Antes esto era `settings.sinAprobacion`, un ajuste
 * por RUTA en `settings.json` que se ponía una vez y se quedaba puesto para siempre, en
 * todas las sesiones y todos los procesos. Se retiró entero: un mando que está dentro de la
 * caja del chat se lee como «esta conversación», y una bandera global encendida sobre la app
 * de un cliente que nadie recuerda haber dejado encendida es el peor final posible. Es la
 * misma decisión que el esfuerzo de razonamiento (`core/esfuerzo.ts`), que también se elige
 * por sesión, se anota en el índice y vuelve al reabrirla — y que tampoco tiene defecto
 * global, porque un tercer valor «para todas las nuevas» decide en nombre de conversaciones
 * que todavía no existen.
 *
 * **Lo que el modo gobierna son las escrituras LOCALES, y solo eso.** No toca la subida:
 * `/sync subir` conserva su plan delante y su aprobación fail-closed por TIPO en los dos
 * modos, porque subir es llevar el trabajo a la app de otras personas y eso no es lo que
 * esta palanca decide. Y no toca las guardas de RUTA: `/.env`, `/.git`, `/.xonecode`, las
 * vistas aplanadas y un artefacto fuera de sitio se siguen denegando igual en autónomo. El
 * modo quita la PREGUNTA, nunca la BARRERA.
 *
 * **Y por eso se levantó la condición de CloudStudio**, que era la que prohibía todo esto en
 * un proyecto conectado. El argumento medido: escribir no sube; el commit por turno es git,
 * o sea recuperable; y la subida sigue teniendo su propia aprobación. La incoherencia que lo
 * hizo insostenible: sobre ese MISMO proyecto conectado, una tarea de fondo ya escribía sin
 * preguntar y la consola no podía.
 */

/** Supervisado: cada escritura con su diff. Autónomo: se aplican solas. */
export type ModoDeEscritura = "supervisado" | "autonomo";

/**
 * Una sesión que no ha dicho nada PREGUNTA.
 *
 * Ausente no es «no consta» aquí, y esa es la diferencia con el esfuerzo o el dispositivo:
 * de esto hay que decidir algo en cada escritura, así que el hueco tiene que resolverse, y
 * la única dirección segura para resolverlo es la que enseña el diff.
 */
export const MODO_POR_OMISION: ModoDeEscritura = "supervisado";

/**
 * Cuántas rondas de aprobación admite un turno de la CONSOLA, en los dos modos.
 *
 * El `MAX_APPROVAL_ROUNDS` de `vendor/hitl.ts` son cinco y se dimensionaron para un modelo
 * que insiste tras cada rechazo — «te lo he preguntado cinco veces, para». Medido después,
 * eso no es lo que corta: lo que corta son trabajos legítimos a la mitad, porque una ronda
 * no es una insistencia, es una TANDA de escrituras. Ya lo pagaron las tareas de fondo
 * —`core/tareas.ts#TOPE_DE_RONDAS_DE_TAREA`, con un turno que acabó con cuatro ficheros
 * escritos, una escritura abandonada y el verificador sin correr— y lo paga igual una
 * sesión en modo autónomo, que es la misma forma de trabajar con alguien delante.
 *
 * **Es el MISMO 20 que la tarea, y sale de la misma medida**, no de una segunda
 * observación: lo único medido es el turno que se cortó necesitando cinco tandas, y veinte
 * deja sitio a un encargo bastante mayor. Sigue siendo un número provisional, y lo que lo
 * hace aceptable es su MODO DE FALLO: al agotarse se DICE, quedan escrituras sin aplicar y
 * el turno sale con `cortadoPorTope`. Un tope corto que para con un motivo verdadero se
 * afina luego; lo que no se puede es que al agotarse mienta.
 *
 * **Vive aparte del de la tarea aunque hoy valgan lo mismo**: son dos situaciones y no una
 * —aquí hay alguien que puede rechazar o pulsar parar, allí no hay nadie mirando—, así que
 * fundirlos ataría dos decisiones que se van a afinar por separado.
 */
export const TOPE_DE_RONDAS_DE_CONSOLA = 20;

/**
 * El tope de rondas de `xonecode run --real` que se puede subir por ENTORNO, para medir.
 *
 * `run` no tiene a nadie delante, así que su tope es el corto (`MAX_APPROVAL_ROUNDS`, cinco). Medido
 * sobre una calculadora hecha por los agentes, **las cinco pasadas se cortaron con él**, y siempre en
 * el mismo punto: justo antes de la última vuelta del bucle de calidad, la que compara la captura
 * final con la maqueta. El tope era un artefacto de medir con `run`, no del agente: en la consola
 * son veinte. Con esto una prueba puede pedir el de la consola sin tocar el código.
 *
 * **Solo lo lee `run`**, nunca la consola ni las tareas, que ya tienen el suyo. Un valor que no sea un
 * entero entre 1 y `TOPE_MAXIMO_DE_RONDAS_DE_ENTORNO` no se aplica y `run` lo DICE: el tope existe para
 * cortar un bucle que nadie puede parar, y un `999999` por un descuido lo dejaría sin freno.
 */
export const VARIABLE_DEL_TOPE_DE_RONDAS = "XONECODE_TOPE_DE_RONDAS";
export const TOPE_MAXIMO_DE_RONDAS_DE_ENTORNO = 50;

export function topeDeRondasDeEntorno(valor: string | undefined): number | undefined {
  const v = valor?.trim();
  if (v === undefined || !/^[1-9][0-9]{0,2}$/.test(v)) return undefined;
  const n = Number(v);
  return n <= TOPE_MAXIMO_DE_RONDAS_DE_ENTORNO ? n : undefined;
}

/** ¿Es uno de los dos nombres EXACTOS del modo? Nada de tildes ni sinónimos: eso es `modoDeTexto`. */
export function esModoDeEscritura(candidato: unknown): candidato is ModoDeEscritura {
  return candidato === "supervisado" || candidato === "autonomo";
}

/**
 * Lo que alguien TECLEA, traducido a un modo.
 *
 * Acepta las dos parejas de palabras: la nueva —la que se lee en la pastilla y viaja por el
 * cable— y la vieja de `/aprobacion [humana|automatica]`, que lleva meses en la ayuda y en
 * los dedos de quien la usa. Un comando que deja de entender lo que siempre entendió es una
 * regresión aunque el concepto sea el mismo.
 *
 * Las tildes se aceptan al ENTRAR y nunca se guardan: el valor que viaja y se persiste es
 * siempre `autonomo` a secas, que es el que compara `esModoDeEscritura`.
 *
 * **Lo que no reconoce es `undefined`, jamás un modo por omisión**: quien llame decide qué
 * hacer con un «no lo entiendo», y aquí adivinar sería adivinar en la dirección peligrosa la
 * mitad de las veces.
 */
export function modoDeTexto(texto: string): ModoDeEscritura | undefined {
  const limpio = texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (limpio === "supervisado" || limpio === "humana") return "supervisado";
  if (limpio === "autonomo" || limpio === "automatica") return "autonomo";
  return undefined;
}

/**
 * ¿Las escrituras de esta sesión se aplican SIN preguntar, ahora mismo?
 *
 * Las dos condiciones son AND y ninguna sobra:
 *
 * - **El modo de la sesión es autónomo.** Lo eligió quien está en esta conversación.
 * - **Hay alguien delante.** Auto-aprobar significa «el humano que está aquí ha decidido no
 *   pulsar», no «no hace falta humano». Es la única condición que sobrevivió al rediseño, y
 *   no es celo: `consolaWeb` declara `interactivo` a fuego, así que quien llama pasa la
 *   misma cuenta que `pedirDecisiones` (`interactivo && !eof()`). Con ella, una pestaña que
 *   se cierra a mitad de turno devuelve la escritura al camino de aprobación, donde el eof
 *   la rechaza — y `xonecode run` en CI y las tuberías siguen sin aplicar nada, que es lo
 *   que hacen hoy y lo que el código de salida 2 del contrato significa.
 *
 * Se pregunta en CADA RONDA, nunca se captura al abrir: el modo se cambia con la sesión en
 * marcha, y un booleano capturado dejaría el cambio sin efecto hasta reabrir — la mitad de
 * las veces en la dirección peligrosa.
 */
export function seEscribeSinPreguntar(opciones: {
  modo: ModoDeEscritura | undefined;
  interactivo: boolean;
}): boolean {
  if (opciones.modo !== "autonomo") return false;
  return opciones.interactivo;
}

/**
 * Cuántas preguntas de UN turno se contestan solas en modo autónomo. Un modelo que encadena
 * preguntas no puede dejar el turno dando vueltas: pasado el tope, la siguiente le llega a la persona.
 */
export const TOPE_DE_PREGUNTAS_CONTESTADAS_SOLAS = 8;

const MARCA_DE_RECOMENDADA = /\((?:recommended|recomendad[ao])\)/i;

/**
 * La opción que el agente MARCÓ como recomendada, o `undefined`. Solo cuenta lo que el modelo
 * escribió: sin marca no se elige por él, y la pregunta llega a la persona.
 *
 * **El modo autónomo quitaba la pregunta de las ESCRITURAS y no la del agente**, y una sesión
 * autónoma se paraba igual a pedir «alcance» y «tipografías», cada una con su recomendada.
 * Contestarla sola es decidir por la persona, así que se DICE en el chat, con la opción elegida.
 */
export function opcionRecomendada(opciones: readonly string[]): string | undefined {
  const marcadas = opciones.filter((o) => MARCA_DE_RECOMENDADA.test(o));
  return marcadas.length === 1 ? marcadas[0] : undefined;
}
