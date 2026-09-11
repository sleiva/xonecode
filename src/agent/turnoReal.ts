import { readdirSync, lstatSync, statSync, existsSync, readFileSync, realpathSync } from "node:fs";
import { join, sep, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { HumanMessage, ToolMessage, type AIMessage, type BaseMessage } from "@langchain/core/messages";
import { Command, MemorySaver } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { collectPending, type Decision, MAX_APPROVAL_ROUNDS } from "../vendor/hitl.js";
import { esRutaDeArtefacto, type Artefacto } from "../core/artefactos.js";

/**
 * Cuántas veces se le devuelven los hallazgos al agente para que los corrija. Dos: tres
 * verificaciones en total. Un modelo que no arregla algo en dos intentos con el error
 * delante no lo arregla al quinto, y cada intento son escrituras que pasan por aprobación
 * humana — o sea, tiempo de una persona. La guarda de «no progresa» (misma huella dos
 * veces) corta antes de llegar aquí cuando el modelo repite el mismo cambio.
 */
export const TOPE_REPARACIONES = 2;
import { aPendiente, ficheroDe, cambioDe, buildResume } from "./interrupts.js";
import { cargarAgentes } from "./agentesEnDisco.js";
import { crearSubagenteExterno } from "./subagenteExterno.js";
import { opcionesDeSubagenteExterno } from "./escrituraExterna.js";
import { ColaDeEventos, entrelazar } from "../core/entrelazar.js";
import { sumarConsumo, SIN_CONSUMO } from "./consumoExterno.js";
import type { ConsumoDeSesion, ConsumoDeSesionPorCuenta } from "../core/ports.js";


import type { PendienteDeAprobacion } from "../core/events.js";
import type { LineaDeDiff } from "../core/diff.js";
import { rutaRealDeVirtual } from "../core/rutaVirtual.js";
import type { Piel } from "../core/turno.js";
import { Bitacora } from "../core/bitacora.js";
import { correrTurno } from "../core/turno.js";
import type { ModelosPort, SkillsPort, VerifierPort } from "../core/ports.js";
import type { EstadoDeVerificador, ResultadoDeTurno } from "../core/entrega.js";
import type { DomainEvent, HallazgoDelTurno } from "../core/events.js";
import { relative, resolve as resolverRuta } from "node:path";
import type { Entorno } from "./entorno.js";
import { tomarInstantanea, type Instantanea, type Cambio } from "./instantanea.js";
import { construirAgente } from "./xoneAgent.js";
import { asegurarMemoriaDeProyecto } from "./memoriaDeProyecto.js";
import { aEventos } from "./puente.js";
import { createTokenTracker, type TokenTracker } from "../vendor/tokenTracking.js";
import { crearDiagnosticoDeTools } from "./diagnosticoDeTools.js";

/**
 * Una sesión de turno real: varios turnos sobre el MISMO agente y el MISMO hilo.
 *
 * Es la extracción de `correrReal` (`cli/run.ts`), reescrita de disparo único a reutilizable:
 * el agente, el checkpointer, el tracker y el `thread_id` viven en el cierre de
 * `abrirSesionReal` y se conservan entre llamadas. Lo que cada `turno()` renueva es la foto
 * del ANTES, porque el diff es del TURNO y no de la sesión: si la foto fuese una por sesión,
 * el turno 3 reportaría también lo que escribió el turno 1.
 */
export interface SesionReal {
  /**
   * Un turno. Devuelve la bitácora, los cambios que dejó en el proyecto y **lo que hay que
   * saber para decidir si el trabajo se puede dar por bueno** (`ResultadoDeTurno`).
   *
   * Esas tres últimas cosas —cómo acabó el verificador, cuántas escrituras quedaron sin
   * aplicar y los hallazgos— no estaban, y su ausencia era una deuda MEDIDA: con las
   * tareas de fondo aplicando escrituras solas, un turno se cortó por el tope de rondas
   * con cuatro ficheros escritos, una escritura abandonada, el verificador sin correr ni
   * una vez… y el kanban diciendo «terminada». La bitácora no sirve para esto: `corrio`
   * responde si un nodo pasó, no con qué veredicto.
   */
  turno(
    peticion: string,
    piel: Piel
  ): Promise<
    ResultadoDeTurno & {
      bitacora: Bitacora;
      cambios: Cambio[];
      /** Se agotó el tope de rondas con aprobaciones sin resolver. */
      cortadoPorTope: boolean;
    }
  >;
  /** Rehace el agente con modelos nuevos, CONSERVANDO el hilo. Para `/modelo`. */
  cambiarModelos(modelos: ModelosPort): Promise<void>;
  /** Abre un hilo nuevo. Para `/nuevo`. */
  /**
   * Abre un hilo nuevo. **Acepta el id** porque quien lo pide puede ya tener uno.
   *
   * Sin el parámetro había DOS ids para un mismo hilo: la consola generaba el suyo en su
   * `/nuevo` y la sesión otro aquí, así que `/hilo` enseñaba un `thread_id` que no era el
   * que usaba el grafo. Un identificador que no identifica es peor que no darlo.
   */
  nuevoHilo(id?: string): void;
  /** Aborta de inmediato la llamada al modelo que está en curso, si la hay. */
  cancelar(): void;
  /** Lo que lleva consumido la sesión, en sus DOS cuentas (ver `ConsumoDeSesionPorCuenta`). */
  consumo(): ConsumoDeSesionPorCuenta;
  /** Se avisa en cada cambio de cualquiera de las dos. Devuelve cómo dejar de escuchar. */
  alCambiarConsumo(oyente: () => void): () => void;
  /**
   * Termina la sesión: aborta lo que esté en curso y la deja inservible.
   *
   * Hace falta para CAMBIAR de proyecto (`web/servidor/vestibulo.ts`): la consola web abre
   * una consola de proyecto a la vez, y cerrar la anterior es agotar sus `lineas` para que
   * `correrConsola` retorne. Sin esto, un turno en vuelo mantendría el lazo dentro del
   * `await` durante minutos y la apertura del proyecto siguiente se quedaría esperando.
   *
   * Qué libera y qué no, dicho entero porque una fuga callada es peor que una declarada:
   * el `MemorySaver`, el agente construido y el tracker viven en el CIERRE de
   * `abrirSesionReal` y no exponen ningún `close()` —no hay sockets ni descriptores, el
   * cliente del modelo es por llamada—, así que se recogen con la referencia a la sesión
   * en cuanto quien la abrió la suelta. Lo único que hay que soltar activamente es la
   * llamada en curso, y eso es exactamente `cancelar()`. La bandera de cerrada existe para
   * que un `turno()` tardío falle en vez de revivir un hilo que ya nadie mira.
   */
  cerrar(): void;
  readonly tracker: TokenTracker;
  /** El `thread_id` ACTUAL: tras `nuevoHilo()` cambia, y hay que leerlo, no cachearlo. */
  readonly hilo: string;
}

/**
 * Recorre la raíz y devuelve las rutas en el ESPACIO VIRTUAL del backend.
 *
 * Exportada porque la consola la usa para el completado de «@ficheros» (cli puede
 * importar de agent; al revés no). El recorrido se hace EN CADA llamada a propósito:
 * la lista no se cachea porque los ficheros cambian durante la sesión.
 */
/** Hasta dónde baja el completado del Tab. El árbol de la consola web pide más (`arbolDeProyecto.ts`). */
export const PROFUNDIDAD_DEL_TAB = 4;

export function ficherosDelProyecto(raiz: string, prof = 0, tope = PROFUNDIDAD_DEL_TAB): ReadonlySet<string> {
  if (prof > tope || !existsSync(raiz)) return new Set();
  const salida = new Set<string>();
  for (const entrada of readdirSync(raiz)) {
    if (entrada === "node_modules" || entrada === ".git") continue;
    const ruta = join(raiz, entrada);
    try {
      // `lstatSync` y no `statSync`: una CARPETA detrás de un enlace simbólico no se
      // recorre. Medido en la pestaña Ficheros de la consola web: «carpeta-enlazada» →
      // «.xonecode» listaba la carpeta denegada bajo otro nombre, y «dir-fuera» →
      // «/algo/de/fuera» listaba nombres de ficheros que no son del proyecto (un
      // «dir-fuera/id_rsa»). Tampoco se lista el enlace en sí: la carpeta a la que apunta
      // o ya está en el árbol por su nombre real, o está fuera del proyecto y no debe
      // salir — y una hoja que al abrirse dice «no se enseña» es un botón muerto.
      // Un enlace a FICHERO sí se queda como hoja: quién decide si se puede leer es la
      // barrera del lector (`arbolDeProyecto.ts`), que recomprueba sobre el `realpath`.
      // Esta función alimenta a TRES consumidores y el cambio es correcto para los tres:
      // el completado de «@ficheros» del Tab (no completa a carpetas ajenas), el universo
      // que consulta `esVistaAplanada` (una vista aplanada de fuera del proyecto no es
      // asunto nuestro) y el árbol de la consola web.
      const info = lstatSync(ruta);
      if (info.isSymbolicLink() && statSync(ruta).isDirectory()) continue;
      if (info.isDirectory()) {
        // La recursión devuelve rutas relativas al SUBDIRECTORIO: sin recoserle el
        // nombre, «app/Clientes.xne» saldría como «/Clientes.xne» y el Set dejaría de
        // responder por las vistas aplanadas ANIDADAS (este universo es el que consulta
        // `esVistaAplanada`).
        for (const f of ficherosDelProyecto(ruta, prof + 1, tope)) salida.add(`/${entrada}${f}`);
      } else {
        salida.add("/" + ruta.slice(raiz.length + 1).split(sep).join("/"));
      }
    } catch {
      // Un enlace roto o un permiso no tumba el arranque; el agente vivirá sin ese fichero.
    }
  }
  return salida;
}

/**
 * El nodo de tools del grafo de `createAgent`, comprobado en el paquete instalado
 * (`langchain/dist/agents/nodes/ToolNode.js`: `TOOLS_NODE_NAME = "tools"`). Hace falta para
 * decirle a `updateState` de qué nodo viene lo que se añade; si el nombre cambiara, el
 * remedio de abajo cae al `updateState` sin nodo, que es peor pero no rompe nada.
 */
const NODO_DE_TOOLS = "tools";

/**
 * Cierra las aprobaciones que se quedaron sin contestar cuando murió el proceso anterior.
 *
 * Solo existe desde que el hilo se guarda en disco (`agent/checkpointer.ts`), y arregla un
 * fallo MEDIDO —y medido dos veces, porque la primera medida estaba mal—. La forma del
 * grafo importa: un grafo de un solo nodo donde `START` va al nodo interrumpido reejecuta
 * ese nodo con el mensaje nuevo y vuelve a preguntar, que es inofensivo. El grafo del
 * agente NO tiene esa forma: `START` va al MODELO, y el nodo parado es el de tools. Así que
 * al reabrir una sesión que se cerró con una aprobación delante, lo que le llega al modelo
 * es `human → ai(tool_calls) → human`: un `AIMessage` con llamadas a tool y ningún
 * `ToolMessage` detrás. Gemini y OpenAI rechazan exactamente eso, así que el primer mensaje
 * tras reabrir se iba en un 400 — y nada lo explicaba.
 *
 * El remedio es una respuesta SINTÉTICA por cada llamada colgada, diciendo la verdad: no se
 * aplicó, porque la sesión se cerró antes de que nadie decidiera. Con eso el historial es
 * válido y además honesto — el modelo se entera de que aquella escritura no llegó a pasar,
 * en vez de dar por hecho que sí. Y es cierto: el `interrupt` pausa ANTES de escribir, o
 * sea que el disco no se tocó.
 *
 * Se hace al ABRIR y no al empezar el turno porque es un arreglo del pasado, no del turno:
 * dentro de una sesión viva las aprobaciones se resuelven por su camino normal. Un fallo
 * aquí no puede impedir abrir la sesión, así que se traga — lo que se pierde entonces es
 * este arreglo, no la conversación.
 *
 * Se exporta para poder probarla sin montar un grafo de verdad, igual que `decisionDeTool`.
 */
export async function saldarAprobacionesHuerfanas(agente: unknown, hilo: string): Promise<void> {
  const cfg = { configurable: { thread_id: hilo } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const grafo = agente as any;
  try {
    const estado = await grafo.getState(cfg);
    const mensajes: BaseMessage[] = estado?.values?.messages ?? [];
    if (mensajes.length === 0) return;
    const contestadas = new Set(
      mensajes.filter((m) => m.getType() === "tool").map((m) => (m as ToolMessage).tool_call_id)
    );
    const colgadas = mensajes
      .filter((m) => m.getType() === "ai")
      .flatMap((m) => (m as AIMessage).tool_calls ?? [])
      .filter((c) => c.id !== undefined && !contestadas.has(c.id));
    if (colgadas.length === 0) return;

    const respuestas = colgadas.map(
      (c) =>
        new ToolMessage({
          content:
            "No se aplicó: la sesión se cerró antes de que nadie decidiera sobre esta escritura, " +
            "así que el fichero no se tocó. Si sigue haciendo falta, vuelve a proponerlo.",
          tool_call_id: c.id!,
          name: c.name,
          status: "error",
        })
    );
    try {
      await grafo.updateState(cfg, { messages: respuestas }, NODO_DE_TOOLS);
    } catch {
      await grafo.updateState(cfg, { messages: respuestas });
    }
  } catch {
    // Abrir la sesión manda sobre arreglarla.
  }
}

/**
 * Abre una sesión real: agente, checkpointer, hilo y tracker se construyen UNA vez aquí, y
 * viven en el cierre. Todo lo que sobreviva al primer turno tiene que salir de este cierre:
 * reconstruir el agente fuera (o un `MemorySaver` nuevo por llamada) tiraría la conversación.
 */
export async function abrirSesionReal(opciones: {
  raiz: string;
  modelos: ModelosPort;
  skills: SkillsPort;
  entorno: Entorno;
  /** Para las aprobaciones. Sin él, una escritura pendiente termina el turno diciéndolo. */
  pedirAprobacion?: (
    pendientes: PendienteDeAprobacion[],
    ficheros: Map<string, string>,
    diffs: Map<string, LineaDeDiff[]>
  ) => Promise<Map<string, Decision>>;
  /**
   * El simulador, para verificar lo que el turno escribió. OPCIONAL, y su ausencia no se
   * disimula: sin él, un turno que escribió termina con el aviso de que no se verificó y el
   * motivo. Es un puerto por lo de siempre —`npm test` no puede necesitar el binario— y
   * porque quien construye el turno no tiene por qué saber cómo se verifica.
   */
  verifier?: VerifierPort;
  /**
   * El `thread_id` del grafo. Entra por parámetro porque quien lo conoce es quien tiene
   * IDENTIDAD para reanudar: en la web es el id de la sesión, y esa igualdad es lo que
   * hace que reabrirla continúe el hilo en vez de releerlo. Sin él se genera uno, que es
   * lo que hacía siempre.
   *
   * Antes había DOS ids para un mismo hilo —el de `EstadoDeSesion.hilo`, que es el que
   * `/hilo` enseña, y el que se generaba aquí—, y solo coincidían después de un `/nuevo`.
   */
  hilo?: string;
  /**
   * Dónde se guarda la memoria del agente. Ausente = en memoria (`MemorySaver`), que es lo
   * que hacía siempre y lo que sigue usando la consola de terminal: persistir un hilo que
   * nadie puede volver a abrir solo engorda un fichero.
   */
  checkpointer?: BaseCheckpointSaver;
  /**
   * La carpeta donde caen los artefactos de esta sesión — lo que el agente ve como
   * `/artefactos/`. Entra por parámetro porque quien sabe si hay sesión con identidad es
   * quien la abrió: en la web es `.xonecode/sesiones/<id>/artefactos`, y sin sesión (la
   * consola de terminal) se cae a `.xonecode/artefactos` del proyecto, que existe igual y
   * no ensucia el índice con carpetas de hilos que nadie puede reabrir.
   */
  artefactos?: string;
  /**
   * La carpeta de los ADJUNTOS de la tarea — lo que el agente ve como `/adjuntos/`, de solo
   * lectura (`core/adjuntos.ts`).
   *
   * Entra por parámetro y no se deduce, por lo mismo que `artefactos`: quien sabe si hay
   * adjuntos es quien abrió la consola, y aquí solo hay una raíz de proyecto. Ausente en
   * toda sesión de persona y en toda tarea sin adjuntos — y entonces **el campo no se pone**,
   * porque una cadena vacía montaría el cwd del proceso como si fueran los adjuntos de
   * alguien.
   */
  adjuntos?: string;
  /**
   * ¿Las escrituras de ESTE proyecto se aplican sin pedir aprobación?
   *
   * Es una FUNCIÓN y no un booleano porque se pregunta en cada ronda: el ajuste se cambia
   * con `/aprobacion` sin cerrar la sesión, y un booleano capturado al abrir dejaría el
   * cambio sin efecto hasta reabrir — justo en la dirección peligrosa la mitad de las veces.
   *
   * Quien decide es `core/settings.ts#seAplicaSinAprobacion`, y no este fichero: la regla
   * tiene tres condiciones (lo dijo el dueño de la máquina para esta raíz, el proyecto no
   * está conectado a CloudStudio, y hay alguien delante) y ninguna se puede comprobar aquí.
   */
  sinAprobacion?: () => boolean;
  /**
   * Cuántas RONDAS de aprobación admite un turno. Ausente = `MAX_APPROVAL_ROUNDS`, el de
   * siempre.
   *
   * Existe porque el de la persona no vale para una tarea de fondo, y las dos mitades del
   * argumento importan. `MAX_APPROVAL_ROUNDS` se dimensionó para alguien pulsando —«te lo
   * he preguntado cinco veces, para»—; en una tarea autónoma una ronda no es una pregunta,
   * es una TANDA de escrituras que se autorizan solas, y cinco tandas se agotan en un
   * encargo mediano: medido, un turno se cortó con cuatro ficheros escritos y una escritura
   * abandonada. Y quitarlo no vale, por el mismo argumento que el tope propio de los
   * artefactos: cada pasada es una llamada al modelo y aquí no hay humano que frene el
   * bucle.
   *
   * Gobierna los TRES sitios que miraban esa constante —el corte por rondas, el corte por
   * tandas automáticas y la PREDICCIÓN de si la pasada cierra el turno—, y tiene que
   * gobernar los tres: si la predicción divergiera del corte, un turno se quedaría sin
   * `fin` o cerraría dos veces.
   */
  topeDeRondas?: number;
}): Promise<SesionReal> {
  const { raiz, entorno } = opciones;

  // Persiste fuera del checkpointer (que es solo de la sesión), pero no sobrescribe nunca
  // una memoria ya creada por el usuario o por otra sesión.
  asegurarMemoriaDeProyecto(raiz);

  /**
   * El tope de rondas de ESTA sesión, resuelto una vez. Ver `OpcionesDeSesion.topeDeRondas`:
   * gobierna los tres sitios que antes miraban `MAX_APPROVAL_ROUNDS` a pelo, y ninguno de
   * los tres puede quedarse fuera — la predicción de cierre tiene que usar exactamente el
   * mismo número que el corte, o un turno se queda sin `fin` o cierra dos veces.
   */
  const topeDeRondas = opciones.topeDeRondas ?? MAX_APPROVAL_ROUNDS;

  /**
   * Quién autoriza las escrituras de un agente EXTERNO en esta sesión. Se resuelve una vez
   * porque `pedirAprobacion` no cambia dentro de una sesión; la composición vive extraída
   * (`escrituraExterna.ts#politicaExternaDeSesion`) y con test propio.
   */
  /**
   * El buzón por el que la actividad de un agente EXTERNO entra al flujo de eventos.
   *
   * Vive en el cierre de la SESIÓN y no del turno porque el puerto se construye con el
   * agente, que también es de la sesión. No hay riesgo de mezclar turnos: un agente externo
   * solo corre dentro de uno, y lo que quedara encolado al agotarse un flujo se dice antes
   * de cerrarlo (`entrelazar`).
   */
  const eventosExternos = new ColaDeEventos();

  /**
   * Lo que lleva consumido ESTA sesión, en dos cuentas que no se mezclan.
   *
   * No se mezclan porque no son el mismo dinero: los del grafo van contra la clave de API
   * del usuario y los del hijo externo contra su suscripción del producto. Sumar TOKENS es
   * legítimo —un token es un token— y sumar el COSTE sería la cifra que miente, así que
   * aquí solo se cuentan tokens y las dos cuentas viajan separadas para que quien las pinte
   * pueda decir la verdad sin tener que elegir una.
   */
  let consumoExterno: ConsumoDeSesion = SIN_CONSUMO;
  const oyentesDeConsumo: Array<() => void> = [];
  const avisarDeConsumo = (): void => {
    for (const o of oyentesDeConsumo) {
      // Envuelto: un oyente que reviente no puede llevarse por delante un turno. Es la
      // misma razón que el `try` alrededor de `alCambiar` del corredor de tareas, que sin
      // él paraba el corredor entero.
      try {
        o();
      } catch {
        // Un contador que no se pinta no es motivo para tumbar nada.
      }
    }
  };

  const checkpointer = opciones.checkpointer ?? new MemorySaver();
  const tracker = createTokenTracker();
  const diagnostico = crearDiagnosticoDeTools(raiz);
  let modelos = opciones.modelos;
  let hilo = opciones.hilo ?? `xonecode-${randomUUID()}`;
  let cancelarEnCurso: (() => void) | undefined;
  let cerrada = false;

  /**
   * Los artefactos escritos en la pasada en curso. Los apunta el backend (es el único que
   * sabe que la escritura ocurrió) y los VACÍA quien los anuncia, para que un artefacto se
   * diga una vez y no en cada pasada de una reparación.
   */
  const artefactosDeLaPasada: Artefacto[] = [];
  const carpetaDeArtefactos = opciones.artefactos ?? join(raiz, ".xonecode", "artefactos");

  const construir = async (): Promise<unknown> =>
    construirAgente({
      raiz,
      ficheros: ficherosDelProyecto(raiz),
      // Se releen en CADA construcción del agente y no una vez al abrir la sesión: el
      // usuario puede tocar un `.md` —o guardarlo desde Ajustes— con la consola abierta, y
      // una lista congelada al arrancar le haría creer que su cambio no se aplicó.
      agentes: cargarAgentes(raiz).agentes,
      // Cada llamada al modelo mueve el tracker, y hay que DECIRLO: sin esto el único aviso
      // lo daba el consumo de un agente externo, así que una sesión normal subía sus tokens
      // en silencio y el contador de la web no aparecía nunca.
      alContarTokens: avisarDeConsumo,
      /**
       * El adaptador real. Su import del SDK es dinámico, así que traerlo aquí no carga
       * nada hasta que un agente externo esté dado de alta Y disponible.
       *
       * **La política de escritura sale del MISMO `pedirAprobacion` del HITL del grafo**, y
       * eso es la mitad del diseño: sus implementaciones ya son las dos que hacen falta —la
       * interactiva de las tres pieles, que enseña el diff y espera con plazo naciendo
       * rechazada, y la autónoma de una tarea de fondo, que concede porque la autorización
       * fue crear la tarea, lo ANUNCIA con los nombres y lo apunta en `Tarea.autorizadas`—.
       * Un segundo hueco de política habría sido un segundo sitio donde el fail-closed
       * puede dejar de estarlo. Sin `pedirAprobacion` no hay política, y sin política el
       * hijo no escribe.
       */
      subagenteExterno: crearSubagenteExterno(
        opcionesDeSubagenteExterno({
          ...(opciones.pedirAprobacion === undefined
            ? {}
            : { pedirAprobacion: opciones.pedirAprobacion }),
          // Una FUNCIÓN y no la lista: el hijo escribe durante el turno, así que una foto
          // congelada al abrir la sesión no vería el `.xne` que se acaba de crear — y su
          // `.xml` aplanado dejaría de reconocerse como tal.
          ficherosDelProyecto: () => ficherosDelProyecto(raiz),
          eventos: eventosExternos,
          alConsumir: (c) => {
            consumoExterno = sumarConsumo(consumoExterno, c);
            avisarDeConsumo();
          },
        })
      ),
      modelos,
      skills: opciones.skills,
      checkpointer: checkpointer,
      tracker,
      diagnostico,
      artefactos: {
        carpeta: carpetaDeArtefactos,
        alEscribir: (a) => artefactosDeLaPasada.push(a),
      },
      // Ausente es «no hay», no una carpeta vacía: ver `OpcionesDeSesion.adjuntos`.
      ...(opciones.adjuntos === undefined ? {} : { adjuntos: opciones.adjuntos }),
    });

  let agente = await construir();
  await saldarAprobacionesHuerfanas(agente, hilo);

  /**
   * Los pendientes de aprobación, del ESTADO y no del resultado del stream.
   *
   * Se leen los crudos (`collectPending`) y no solo los traducidos, porque de ellos sale la
   * RUTA del fichero que se va a tocar (`ficheroDe`). Los argumentos NO se publican
   * —`write_file` lleva el contenido entero—, pero aprobar a ciegas es peor que no aprobar,
   * así que la ruta sí. Una sola llamada a `getState` para las dos cosas.
   */
  /**
   * El ANTES del diff de una aprobación, leído del disco con las dos barreras: la lexical de
   * `rutaRealDeVirtual` y la recomprobación sobre el camino REAL. Un fichero que no existe
   * —el caso normal de un fichero nuevo— y uno cuyo destino se sale del proyecto dan lo
   * mismo: cadena vacía, que es el lado conservador. No se distinguen a propósito: por aquí
   * no se informa de nada, y decir «ese enlace apunta fuera» exigiría un canal que este
   * lector no tiene.
   */
  const leerElAntes = (ruta: string): string => {
    const real = rutaRealDeVirtual(raiz, ruta);
    if (real === undefined) return "";
    try {
      const raizReal = realpathSync(raiz);
      const destino = realpathSync(real);
      if (destino !== raizReal && !destino.startsWith(raizReal + sep)) return "";
      return readFileSync(destino, "utf8");
    } catch {
      return "";
    }
  };

  const leerPendientes = async (): Promise<{
    lista: PendienteDeAprobacion[];
    ficheros: Map<string, string>;
    diffs: Map<string, LineaDeDiff[]>;
  }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const crudos = collectPending(await (agente as any).getState({
      configurable: { thread_id: hilo },
    }));
    const ficheros = new Map<string, string>();
    const diffs = new Map<string, LineaDeDiff[]>();
    for (const c of crudos) {
      const f = ficheroDe(c);
      if (f) ficheros.set(c.id, f);
      // El ANTES es el disco: el interrupt pausa ANTES de escribir. Y si no está en el
      // disco, el fichero es nuevo y su «antes» es la cadena vacía, no un error.
      //
      // La ruta viene del backend del agente, que va con `virtualMode: true`, así que llega
      // ROOTEADA en el proyecto (`/app.xne`) — y esto decía «es relativa a la raíz» y
      // resolvía con `resolve(raiz, ruta)`, que con una absoluta DESCARTA la base. Medido:
      // con la forma rooteada el ANTES salía siempre vacío, así que un fichero EXISTENTE se
      // enseñaba como nuevo y sus líneas quitadas no se veían — en el único momento en que
      // una persona ve lo que el agente va a escribir antes de que exista. Pasó desapercibido
      // porque el test que lo cubría usaba `"app.xne"` sin barra, que es la otra forma que
      // también puede llegar. `rutaRealDeVirtual` acepta las dos y además contiene el `..`,
      // que por aquí traía al diff el contenido de un fichero de FUERA del proyecto.
      //
      // Y la contención lexical NO basta sola: un enlace simbólico DENTRO del proyecto que
      // apunte fuera la pasa —su sitio sí está dentro— y `readFileSync` lo sigue, así que el
      // contenido de fuera acabaría igual en la pantalla de la aprobación. Lo que falla no es
      // el sitio, es el DESTINO: la misma lección que `arbolDeProyecto.ts` ya pagó, y por eso
      // se recomprueba sobre el camino REAL. `realpath` canonicaliza además las mayúsculas,
      // que en APFS y en NTFS es la otra mitad del mismo agujero.
      const vista = cambioDe(c, (ruta) => leerElAntes(ruta));
      if (vista) diffs.set(c.id, vista.lineas);
    }
    return { lista: crudos.map(aPendiente), ficheros, diffs };
  };

  /**
   * Un turno: foto del ANTES → stream con bucle de aprobación → diff contra esa foto.
   *
   * La foto es POR TURNO, no por sesión: con una sola, el diff del turno 3 incluiría lo que
   * escribió el turno 1.
   */
  const turno = async (
    peticion: string,
    piel: Piel
  ): Promise<
    ResultadoDeTurno & { bitacora: Bitacora; cambios: Cambio[]; cortadoPorTope: boolean }
  > => {
    // Un turno sobre una sesión ya cerrada reviviría un hilo que su dueño soltó al cambiar
    // de proyecto. Falla en vez de trabajar en silencio sobre la raíz equivocada.
    if (cerrada) throw new Error("la sesión ya está cerrada");
    // El reloj del turno ENTERO. Se le pasa a cada pasada de `correrTurno` como `desde`:
    // solo la última cierra, y su `fin` tiene que contar desde aquí y no desde que empezó
    // ella — si no, un turno largo con aprobación por medio diría solo lo que tardó la
    // reanudación.
    const t0 = Date.now();
    const instantanea: Instantanea = await tomarInstantanea(raiz, entorno.git);

    let payload: unknown = { messages: [new HumanMessage(peticion)] };
    let bitacora = null as Awaited<ReturnType<typeof correrTurno>> | null;
    let ronda = 0;

    // El bucle de aprobación, tal como está en `correrReal` (`cli/run.ts`): una pausa
    // TERMINA la ronda, el interrupt queda en el estado, y se reanuda con un `Command`
    // con las decisiones — también con rejects, que si no se resumen dejan el interrupt
    // colgado para siempre y el modelo nunca llega a saber que se rechazó.
    let cortadoPorTope = false;
    /** Tandas seguidas aprobadas SOLAS —artefactos, o todo si el proyecto está en
     *  «sin aprobación»—. Tope propio: ver dónde se usa. */
    let tandasAutomaticas = 0;
    /** Los ficheros del PROYECTO que este turno aplicó sin preguntar. Solo se llena en un
     *  proyecto con «sin aprobación»; los artefactos no cuentan aquí, porque un artefacto
     *  no es del proyecto y su constancia es su propio acto. */
    const aplicadasSinPreguntar: string[] = [];

    /**
     * El estado del lazo, compartido entre el generador y el bucle de rondas.
     *
     * Lo escribe `conVerificacion` mientras la pasada corre, y lo leen el aviso determinista
     * y la decisión de cierre de ESA misma pasada, más el bucle de fuera para saber si hay
     * que reparar. Es la única forma de que quien cierra el turno sepa algo que solo se
     * conoce al agotarse el flujo: si detrás viene otra ronda, otro intento, o nada.
     */
    let rondaEscribio = false;
    let motivoSinVerificar: string | undefined;
    /**
     * Cómo acabó el verificador en la pasada, y sus hallazgos.
     *
     * Viven aquí y no en la bitácora porque la bitácora responde a otra pregunta: `corrio`
     * dice si un nodo pasó, no con qué veredicto —y de esto depende que una tarea se dé
     * por terminada—. Se reinician en CADA ronda, como `rondaEscribio`: lo que vale es lo
     * que dijo la última pasada, que es la que dejó el proyecto como está.
     */
    let veredicto: EstadoDeVerificador = "no-corrio";
    let hallazgosDelTurno: HallazgoDelTurno[] = [];
    /**
     * Cuántos hallazgos quedaron FUERA del reparto. `undefined` mientras el verificador no
     * haya corrido: ausente es «no se midió» y `0` es «no había ningún otro»
     * (`core/entrega.ts#ResultadoDeTurno.preexistentes`). De aquí sale lo que le permite al
     * juez de QA leer `hallazgos` por lo que es: una lista YA filtrada.
     */
    let preexistentesDelTurno: number | undefined;
    /** Si esta pasada cierra el turno. `false` = detrás viene otra ronda o un intento. */
    let cerrarRonda = true;
    /** Si tras esta pasada hay que lanzar un intento de reparación. */
    let reparar = false;
    /** Intentos de reparación ya lanzados en este turno. */
    let intento = 0;
    /** Los hallazgos del último veredicto rojo, para redactar la petición de reparación. */
    let ultimosHallazgos: HallazgoDelTurno[] = [];
    /** La huella del veredicto anterior, para detectar que reparar no avanza. */
    let huellaPrevia: string | undefined;

    /**
     * El lazo de verificación, cosido al FINAL del flujo de eventos y no después del turno.
     *
     * Tiene que ir dentro del flujo porque `correrTurno` cierra el turno en su `finally`
     * —el aviso «no ha corrido», y `piel.fin()`— en cuanto el flujo se agota. Verificar
     * después de eso pintaría el veredicto detrás del fin del turno, y en la web el
     * compositor ya se habría encendido con el turno «terminado».
     *
     * Solo verifica la ronda FINAL: la que termina sin escrituras pendientes. En una ronda
     * con aprobaciones por resolver las escrituras no se han aplicado todavía, así que no
     * hay nada que medir — se medirá en la ronda que las aplique.
     *
     * Y solo si el turno tocó ficheros del PROYECTO. Los de `.xonecode/` no cuentan: ahí
     * escribe el propio harness (la memoria, los resúmenes de contexto) y contarlos haría
     * que un turno de pura conversación pasara por el simulador — y que el aviso de «no se
     * verificó» saltara en un «cuéntame un chiste», que es exactamente lo que la bitácora
     * de turno existe para evitar.
     */
    async function* conVerificacion(eventos: AsyncIterable<DomainEvent>): AsyncIterable<DomainEvent> {
      // Un intento de reparación se anuncia al EMPEZAR su pasada, no al final de la anterior:
      // así el «🔁 reparando» abre el tramo de trabajo que viene, en vez de cerrar el que
      // acaba. Es el orden que `guionizado.ts` ya recorre.
      if (intento > 0) yield { tipo: "reparacion", intento, tope: TOPE_REPARACIONES };
      reparar = false;

      yield* eventos;

      // Lo primero al agotarse la pasada: lo que el agente dejó escrito sin preguntar. Va
      // ANTES de la decisión de cierre y antes del veredicto porque es trabajo TERMINADO de
      // esta pasada — anunciarlo después del `fin` lo pintaría fuera del turno, que es el
      // mismo motivo por el que el verificador está cosido aquí dentro.
      for (const artefacto of artefactosDeLaPasada.splice(0)) yield { tipo: "artefacto", artefacto };

      if ((await leerPendientes()).lista.length > 0) {
        // Quedan escrituras por aprobar. Si el bucle va a seguir —hay quien apruebe y no se
        // ha agotado el tope de rondas— esta pasada NO es el final del turno y no cierra.
        // Son las mismas dos condiciones del `break` del bucle, y tienen que serlo: si
        // divergen, un turno se queda sin `fin` o cierra dos veces.
        cerrarRonda = !(ronda < topeDeRondas && opciones.pedirAprobacion !== undefined);
        return;
      }
      cerrarRonda = true;

      const cambios = (await instantanea.cambios()).filter(
        (c) => c.clase !== "borrado" && !c.ruta.startsWith(".xonecode/") && c.ruta !== ".xonecode"
      );
      rondaEscribio = cambios.length > 0;
      if (!rondaEscribio) {
        // No hay nada que verificar, y eso NO es un verde. Se DICE, porque este motivo
        // acaba en la tarjeta de una tarea aparcada y «no se sabe» tiene que distinguirse
        // de «el simulador no está» y de «el turno se cortó antes de llegar».
        motivoSinVerificar = "el turno no escribió ningún fichero del proyecto";
        return;
      }

      if (opciones.verifier === undefined) {
        motivoSinVerificar = "esta ejecución no tiene verificador";
        return;
      }

      yield { tipo: "fase", fase: "verificando" };
      let informe;
      try {
        informe = await opciones.verifier.verificar(raiz);
      } catch (e) {
        // Que no esté el binario NO es un fallo del proyecto, y se dice como tal. El aviso
        // determinista del final saldrá igualmente: «no ha corrido» sigue siendo verdad.
        motivoSinVerificar = e instanceof Error ? e.message : String(e);
        yield { tipo: "aviso", texto: `⚠ no se pudo verificar: ${motivoSinVerificar}`, severidad: "aviso" };
        return;
      }

      // Los hallazgos se reparten entre los ficheros que ESTE turno tocó y los demás. El
      // simulador mira el proyecto entero —es su API—, y un error que ya estaba en un
      // fichero que el agente no abrió no es del agente. Un hallazgo sin fichero no se
      // puede atribuir: se enseña con los del turno, que es el lado conservador.
      const tocados = new Set(cambios.map((c) => resolverRuta(raiz, c.ruta)));
      const delTurno = informe.hallazgos.filter(
        (h) => h.fichero === undefined || tocados.has(resolverRuta(h.fichero))
      );
      const preexistentes = informe.hallazgos.length - delTurno.length;
      const errores = delTurno.filter((h) => h.severidad === "error").length;

      const hallazgos: HallazgoDelTurno[] = delTurno.map((h) => ({
        code: h.code,
        severidad: h.severidad,
        mensaje: h.mensaje,
        ...(h.fichero === undefined ? {} : { fichero: relative(raiz, h.fichero) }),
        ...(h.linea === undefined ? {} : { linea: h.linea }),
      }));

      // Lo mismo que va al evento, apuntado para el retorno: NO se recalcula ni se
      // re-parsea de la bitácora, que es cómo dos copias de una cuenta acaban discrepando.
      veredicto = errores === 0 ? "verde" : "rojo";
      hallazgosDelTurno = hallazgos;
      // El reparto entero, no solo su mitad. Aquí sí se apunta el cero: el evento lo omite
      // porque una línea de consola que dice «y 0 más» no dice nada, pero quien recibe
      // `hallazgos` necesita saber que la lista está filtrada — y con cero también.
      preexistentesDelTurno = preexistentes;
      yield {
        tipo: "verificacion",
        verde: errores === 0,
        errores,
        avisos: delTurno.length - errores,
        hallazgos,
        ...(preexistentes > 0 ? { preexistentes } : {}),
      };
      if (errores === 0) return;

      // Rojo. Tres salidas, y solo una de ellas es «inténtalo otra vez».
      //
      // La huella son los ERRORES, no todos los hallazgos: un aviso que va y viene no dice
      // nada de si el error se está arreglando. Y se compara con la del veredicto anterior
      // y no con «¿bajó el número?»: dos errores distintos en vez de dos iguales también es
      // avance, y un modelo que arregla uno y rompe otro no debe quedarse bloqueado como si
      // no hubiera hecho nada.
      const huella = hallazgos
        .filter((h) => h.severidad === "error")
        .map((h) => `${h.code}|${h.fichero ?? ""}|${h.linea ?? ""}`)
        .sort()
        .join("\n");

      if (huella === huellaPrevia) {
        // Corregir no cambió nada: el mismo error, en el mismo sitio. Seguir sería gastar
        // el tope —y aprobaciones humanas— en repetir el mismo cambio.
        yield {
          tipo: "bloqueado",
          motivo: "no-progreso",
          explicacion: `el intento ${intento} dejó los mismos ${errores} error(es) en los mismos sitios`,
        };
        return;
      }
      if (intento >= TOPE_REPARACIONES) {
        yield {
          tipo: "bloqueado",
          motivo: "tope-reparaciones",
          explicacion: `tras ${intento} intento(s) siguen ${errores} error(es); se deja como está para que lo mires`,
        };
        return;
      }

      // Se intenta otra vez. Esta pasada NO cierra el turno: el `fin` y los avisos van al
      // final del intento que viene, o del que corte.
      huellaPrevia = huella;
      ultimosHallazgos = hallazgos;
      intento += 1;
      reparar = true;
      cerrarRonda = false;
    }

    /**
     * La petición de reparación: los hallazgos tal cual, sin más interpretación.
     *
     * Va como un mensaje de USUARIO en el mismo hilo, no como un prompt de sistema nuevo:
     * es la única forma de que el especialista vea lo que acaba de escribir y el error
     * juntos. Y no se le dice CÓMO arreglarlo —eso lo sabe él o no lo sabe—, se le recuerda
     * lo único que importa aquí: que no se invente nada para que el error desaparezca, que
     * es justo lo que XOne no le va a reprochar y el simulador sí.
     */
    const peticionDeReparacion = (): string =>
      [
        `El simulador de XOne ha revisado lo que acabas de escribir y ha encontrado ${ultimosHallazgos.filter((h) => h.severidad === "error").length} error(es):`,
        ...ultimosHallazgos.map(
          (h) =>
            `- ${h.severidad === "error" ? "ERROR" : "aviso"} ${h.code}${h.fichero === undefined ? "" : ` en ${h.fichero}${h.linea === undefined ? "" : `:${h.linea}`}`}: ${h.mensaje}`
        ),
        "",
        "Corrige los errores. No inventes atributos, funciones ni propiedades para que",
        "desaparezcan: XOne ignora lo desconocido en silencio y el simulador lo detecta.",
        "Si algún error no sabes cómo corregirlo, dilo en vez de intentar otra cosa.",
      ].join("\n");

    // Dos bucles anidados y a propósito: el de dentro son las RONDAS de aprobación de una
    // petición (una pausa termina la ronda, se reanuda con las decisiones); el de fuera son
    // los INTENTOS de reparación, cada uno una petición nueva en el mismo hilo. Quién
    // decide si hay intento es el generador, que es quien ve el veredicto.
    do {
    if (intento > 0) payload = { messages: [new HumanMessage(peticionDeReparacion())] };
    ronda = 0;
    while (true) {
      ronda += 1;
      rondaEscribio = false;
      motivoSinVerificar = undefined;
      veredicto = "no-corrio";
      hallazgosDelTurno = [];
      preexistentesDelTurno = undefined;
      cerrarRonda = true;
      const aborto = new AbortController();
      cancelarEnCurso = () => aborto.abort(new Error("turno cancelado por el usuario"));
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stream = await (agente as any).stream(payload, {
          configurable: { thread_id: hilo },
          signal: aborto.signal,
          streamMode: ["updates", "messages"],
          subgraphs: true,
        });

        bitacora = await correrTurno(
          conVerificacion(
            // El flujo del grafo MÁS lo que el agente externo vaya haciendo en su propio
            // proceso: sin esto, ni una de sus tools cruza y son minutos de pantalla quieta.
            entrelazar(
              aEventos(
                stream,
                async () => (await leerPendientes()).lista,
                ({ nombre, detalle, parametros }) =>
                  diagnostico?.herramienta(nombre, detalle, parametros, tracker)
              ),
              eventosExternos
            )
          ),
          piel,
          {
            // El aviso solo si el turno ESCRIBIÓ y aun así no se verificó. Antes saltaba en
            // todos los turnos, incluido «cuéntame un chiste» — y un aviso que salta cuando
            // no ha pasado nada enseña a ignorarlo, que es lo contrario de lo que se compra
            // con él. Con el motivo, porque «no ha corrido» sin más manda a adivinar.
            avisos: (b) => [
              ...(b.corrio("verify") || !rondaEscribio
                ? []
                : [
                    `⚠ el verificador no ha corrido en este turno${motivoSinVerificar === undefined ? "" : ` (${motivoSinVerificar})`}`,
                  ]),
              // Lo que se aplicó sin que nadie lo mirara, CON LOS NOMBRES. La decisión se
              // tomó una vez, quizá hace meses, en `settings.json`; el turno que la ejerce
              // es el único momento en que se puede recordar. Solo si hubo alguna: un aviso
              // que salta cuando no ha pasado nada enseña a ignorarlo.
              ...(aplicadasSinPreguntar.length === 0
                ? []
                : [
                    `⚠ ${aplicadasSinPreguntar.length} escritura(s) aplicadas SIN aprobación: ${aplicadasSinPreguntar.join(", ")}` +
                      " — este proyecto está en «sin aprobación» (/aprobacion humana lo deshace)",
                  ]),
            ],
            // Solo la ÚLTIMA pasada cierra el turno. Lo decide el generador al agotar el
            // flujo: si quedan rondas o viene un intento, no hay `fin` todavía.
            cerrar: () => cerrarRonda,
            desde: t0,
          }
        );
      } finally {
        cancelarEnCurso = undefined;
      }

      const { lista, ficheros, diffs } = await leerPendientes();
      if (lista.length === 0) break;

      /**
       * Los artefactos se aprueban SOLOS, y el resto sigue pidiendo permiso.
       *
       * La aprobación existe para proteger el proyecto del usuario, y un artefacto ya no lo
       * toca: vive en la carpeta de la sesión, no entra en git y no sube a CloudStudio. Que
       * dibujar un diagrama costara tres clics enseñaría a aprobar sin mirar, que es como se
       * rompe la aprobación justo cuando importa. A cambio se ANUNCIA (evento `artefacto`):
       * una escritura que nadie aprueba no puede ser además muda.
       *
       * `esRutaDeArtefacto` es una lista blanca de forma y no un `startsWith`, porque de
       * ella depende que esto no sea un camino para escribir en el proyecto sin permiso.
       */
      const todoAutomatico = opciones.sinAprobacion?.() === true;
      const automaticas = new Map<string, Decision>();
      const humanos: PendienteDeAprobacion[] = [];
      for (const p of lista) {
        const ruta = ficheros.get(p.id);
        if (esRutaDeArtefacto(ruta)) {
          automaticas.set(p.id, { type: "approve" } as Decision);
        } else if (todoAutomatico) {
          // El proyecto está en «sin aprobación». Se apunta la RUTA, que es lo que después
          // dice el aviso de honestidad: un contador sin nombres es el aviso que enseña a
          // ignorar los avisos, que es justo lo que la bitácora existe para evitar.
          automaticas.set(p.id, { type: "approve" } as Decision);
          aplicadasSinPreguntar.push(ruta ?? p.descripcion);
        } else {
          humanos.push(p);
        }
      }
      if (humanos.length === 0) {
        // Ronda que no gastó a nadie: no cuenta para el tope de APROBACIÓN. Contarla haría
        // que cinco diagramas cortaran el turno con `cortadoPorTope`, cuyo significado
        // —«quedaron escrituras esperando aprobación»— sería falso. La predicción de cierre
        // de la pasada usó el mismo `ronda`, y sigue siendo correcta: viene otra pasada.
        //
        // Pero tiene su PROPIO tope, y por el mismo motivo que el otro: cada pasada es una
        // llamada al modelo, y un agente que escribe un artefacto por pasada sería un bucle
        // que nadie corta —aquí no hay humano al que preguntar, que es justo lo que frena
        // al otro—. Al agotarse se para y se dice, con `cortadoPorTope` puesto: quedaron
        // escrituras sin aplicar, que es lo que ese código de salida significa.
        tandasAutomaticas += 1;
        if (tandasAutomaticas > topeDeRondas) {
          // El texto dice de QUÉ tandas habla: con «sin aprobación» puesto, por aquí pasan
          // también las escrituras del proyecto, y llamarlas «artefactos» sería mentir en
          // el único mensaje que explica por qué el turno se cortó.
          const que = todoAutomatico ? "escrituras sin aprobación" : "artefactos";
          piel.linea(`\n⚠ tope de ${topeDeRondas} tandas de ${que} agotado en este turno.`);
          piel.linea(`  quedaban ${lista.length} sin escribir, y NO se han aplicado.`);
          cortadoPorTope = true;
          break;
        }
        ronda -= 1;
        payload = new Command({ resume: buildResume(automaticas) });
        continue;
      }

      // El tope existe porque un modelo que insiste tras cada rechazo convierte esto en un
      // ciclo automático de ~200k tokens por ronda (medido en da04). Sin resumir: nada se
      // aplica, pero el interrupt queda en el estado.
      if (ronda >= topeDeRondas) {
        piel.linea(`\n⚠ tope de ${topeDeRondas} rondas de aprobación agotado.`);
        piel.linea(`  quedaban ${humanos.length} sin resolver, y NO se han aplicado.`);
        cortadoPorTope = true;
        break;
      }

      if (!opciones.pedirAprobacion) {
        piel.linea(`\n⏸  ${humanos.length} escritura(s) piden aprobación, y no hay quién apruebe.`);
        piel.linea("   Nada se ha aprobado y nada se ha aplicado.");
        break;
      }

      let decisiones: Map<string, Decision>;
      try {
        decisiones = await opciones.pedirAprobacion(humanos, ficheros, diffs);
      } catch (e) {
        // La ronda que acaba de pasar no cerró el turno —predijo que habría reanudación— y
        // la aprobación ha reventado en vez de contestar (el «sin humano» de `run.ts`, que
        // corta desde dentro). Sin esto, ese turno se quedaba sin `fin`: sin línea de tiempo
        // en stdio y sin plegar en la web. Los avisos no se pierden: con escrituras
        // pendientes ninguno aplica. Se cierra y se propaga, que sigue siendo un fallo.
        if (!cerrarRonda) piel.fin(Date.now() - t0);
        throw e;
      }
      // Las dos mitades vuelven en UN solo resume: un interrupt que no se resume se queda
      // colgado para siempre, así que los artefactos aprobados solos tienen que viajar con
      // las decisiones humanas y no en una reanudación aparte.
      payload = new Command({ resume: buildResume(new Map([...automaticas, ...decisiones])) });
    }
    } while (reparar);

    // El diff contra la foto de ESTE turno. Un turno que no tocó nada TIENE que verse igual.
    const cambios = await instantanea.cambios();
    /**
     * Las escrituras que quedaron esperando aprobación, MEDIDAS y no recordadas.
     *
     * Se le pregunta al estado del grafo una vez, aquí, en vez de apuntarlas en cada
     * `break`: hay CUATRO salidas del bucle y tres de ellas usan variables distintas
     * (`lista.length` en el tope de tandas, `humanos.length` en el de rondas y en el «no
     * hay quién apruebe»), así que una contabilidad repartida es una contabilidad que
     * deriva. Y no se deduce de `cortadoPorTope`: por «no hay quién apruebe» se sale sin
     * ponerlo y también quedan escrituras colgando.
     */
    const pendientes = (await leerPendientes()).lista.length;
    // `cortadoPorTope` viaja en el retorno y no en la bitácora porque es lo que decide el
    // CÓDIGO DE SALIDA de quien invoca: un turno que se quedó con escrituras sin resolver
    // no es un éxito, y CI no puede leerlo como tal. Y con él viaja ahora lo que decide si
    // una TAREA se puede dar por terminada (`core/entrega.ts`), que hasta ahora se tiraba.
    return {
      bitacora: bitacora!,
      cambios,
      cortadoPorTope,
      verificador: veredicto,
      pendientes,
      // Ausente y vacío: sin hallazgos el campo no se pone, para que quien lo lea no
      // confunda «no hubo» con «no se sabe».
      ...(hallazgosDelTurno.length === 0 ? {} : { hallazgos: hallazgosDelTurno }),
      ...(preexistentesDelTurno === undefined ? {} : { preexistentes: preexistentesDelTurno }),
      ...(motivoSinVerificar === undefined ? {} : { motivoSinVerificar }),
    };
  };

  return {
    turno,
    cancelar: () => cancelarEnCurso?.(),
    cerrar: () => {
      cerrada = true;
      cancelarEnCurso?.();
    },
    /** Para `/modelo`: agente nuevo con los mismos hilo, checkpointer y tracker. */
    async cambiarModelos(nuevos: ModelosPort): Promise<void> {
      modelos = nuevos;
      agente = await construir();
    },
    /** Para `/nuevo`: solo cambia el hilo. El agente no se reconstruye. */
    nuevoHilo(id?: string): void {
      hilo = id ?? `xonecode-${randomUUID()}`;
    },
    tracker,
    /**
     * Lo consumido por la SESIÓN, en sus dos cuentas. Se lee, no se guarda: el tracker y el
     * acumulador viven en este cierre y son la única fuente.
     */
    consumo: (): ConsumoDeSesionPorCuenta => ({
      modelo: { entrada: tracker.input, salida: tracker.output, cache: tracker.cache },
      externo: consumoExterno,
      // La entrada de la ÚLTIMA llamada, que es otra pregunta: ver el campo en su tipo.
      contexto: tracker.contexto,
    }),
    /** Avisa cuando cualquiera de las dos cuentas cambia. Devuelve cómo dejar de escuchar. */
    alCambiarConsumo: (oyente: () => void): (() => void) => {
      oyentesDeConsumo.push(oyente);
      return () => {
        const i = oyentesDeConsumo.indexOf(oyente);
        if (i >= 0) oyentesDeConsumo.splice(i, 1);
      };
    },
    get hilo(): string {
      return hilo;
    },
  };
}
