/**
 * Las TAREAS en background: qué son, qué transiciones valen y cuáles pueden arrancar.
 *
 * `core/`, o sea datos y reglas: ni disco ni procesos. La planificación vive aquí y no en el
 * corredor a propósito — dentro de un lazo con procesos no se puede probar, y es la parte
 * donde una equivocación se paga con dos turnos a la vez sobre el mismo proyecto.
 */
import { tituloDesde } from "./textos.js";
import type { VeredictoDeTarea } from "./entrega.js";

/**
 * Los cuatro estados, y ninguno más.
 *
 * **No hay «fallida»**: un error del turno, un proyecto que ya no está, una escritura que
 * nadie aprobó y una pregunta sin contestar acaban todos en `requiere-atencion`, porque la
 * acción que piden es la misma —que alguien mire— y lo que los distingue es el `motivo`. Un
 * estado «fallida» aparte obligaría a decidir en el código qué fallos son recuperables, y
 * esa es justo la decisión que se le devuelve a la persona.
 *
 * **Tampoco hay «cancelada»**: descartar una tarea la BORRA. Un estado terminal de basura
 * sería un archivo que nadie mira, la misma razón por la que «archivar» no está en el menú
 * de una sesión.
 */
export type EstadoDeTarea = "nuevo" | "en-proceso" | "requiere-atencion" | "terminada";

/** A dónde se puede ir desde cada estado. Lo que no esté aquí se rechaza al escribirlo. */
export const TRANSICIONES: Readonly<Record<EstadoDeTarea, readonly EstadoDeTarea[]>> = {
  /**
   * De `nuevo` se sale corriendo… o aparcando, y esa segunda salida es MEDIDA y no
   * teórica: si el proyecto ya no está donde la tarea dice, la consola no se puede ni
   * abrir, así que la tarea nunca pasa por `en-proceso`. Sin esta transición `conEstado`
   * lanza, la tarea se queda en `nuevo` y el corredor la vuelve a elegir en la pasada que
   * él mismo dispara al terminar con ella — un lazo caliente que se come una CPU y no dice
   * nada, en vez de una tarjeta que explica que la carpeta se movió.
   */
  nuevo: ["en-proceso", "requiere-atencion"],
  "en-proceso": ["terminada", "requiere-atencion"],
  // Las dos salidas de una tarea aparcada: reintentar, o darla por buena a mano.
  "requiere-atencion": ["nuevo", "terminada"],
  terminada: [],
};

/** Lo que se sabe de un adjunto. Nunca su contenido ni su ruta en la máquina. */
export interface AdjuntoDeTarea {
  nombre: string;
  bytes: number;
  /** Por extensión, o ausente si no se sabe. Nunca se adivina. */
  mime?: string;
}

/**
 * Un feedback del desarrollador sobre una tarea que estaba `requiere-atencion`.
 *
 * §0 del diseño, textual: «esperando por feedback, se edita la tarea y se agrega el
 * feedback del usuario». Es el mismo patrón que los hallazgos del verificador
 * (`agent/turnoReal.ts#conVerificacion`): entra al hilo que ya existe como un mensaje de
 * USUARIO, nunca como un encargo nuevo que le haría perder a la tarea todo lo que ya sabe.
 */
export interface FeedbackDeTarea {
  texto: string;
  creado: string;
  /**
   * Si ya se le mandó al agente. Se pone al REANUDAR el turno con este feedback —no al
   * añadirlo—, o la vuelta siguiente del corredor se lo mandaría otra vez: el mismo
   * argumento que separa «autorizó» de «aplicado» en `Tarea.autorizadas`, aquí dentro de
   * cada entrada en vez de en el campo entero.
   */
  consumido: boolean;
}

export interface Tarea {
  id: string;
  /**
   * El proyecto, con las TRES cosas y no dos: el `id` es lo que viaja por el cable y con lo
   * que la interfaz filtra («las tareas de este proyecto»), el `nombre` es para leer, y la
   * `raiz` es ABSOLUTA y solo se usa aquí dentro para abrirlo.
   *
   * Mover o renombrar la carpeta deja la tarea huérfana, y entonces NO se ejecuta — falla
   * cerrado, igual que `seAplicaSinAprobacion`, que también se indexa por ruta absoluta.
   */
  proyecto: { id: string; raiz: string; nombre: string };
  /** La primera frase de la petición. Para leer en el kanban. */
  titulo: string;
  /** Lo que escribió el usuario, tal cual. Se conserva aunque el encargo se edite. */
  peticion: string;
  /** El encargo augmentado y revisado: es lo que se le manda al agente. */
  encargo: string;
  adjuntos: AdjuntoDeTarea[];
  estado: EstadoDeTarea;
  /** Por qué está aparcada. Obligatorio con `requiere-atencion` y solo con él. */
  motivo?: string;
  /** La sesión donde corre, en cuanto existe: es lo que hace que atenderla sea abrirla. */
  sesion?: string;
  creada: string;
  empezada?: string;
  acabada?: string;
  /** El proceso que la tiene. Se usa para reconciliar al arrancar; se va al parar. */
  pid?: number;
  /**
   * Las escrituras que la tarea AUTORIZÓ sin que ninguna persona las aprobara, con la ruta
   * RELATIVA a la raíz del proyecto.
   *
   * **Se llama `autorizadas` y no `aplicados`, y el nombre es la mitad del contrato.** Se
   * apunta cuando se toma la decisión, que es ANTES de que el backend escriba: una ruta que
   * las guardas de ruta rechazan —`/artifacts/`, una vista aplanada, `/.env`— sale aquí y
   * NO aparece en el disco. Un campo llamado «aplicados» prometería un hecho sobre el disco
   * que este dato no puede sostener, y de aquí sale lo que el kanban le cuenta a una
   * persona: en este repo un campo mal nombrado es la misma clase de fallo que un control
   * sin dato detrás. **La verdad sobre lo que cambió la tiene Revisión**, que es un diff de
   * git contra la ref de la sesión; esto es una PISTA, y su nombre no puede prometer más.
   *
   * **Se guarda porque nadie lo aprobó.** La autorización de una tarea es el acto de
   * crearla, así que el diff dejó de ser el momento en que alguien ve lo que se va a
   * escribir; lo único que queda es el registro. Con los NOMBRES y no un contador, que es
   * el mismo criterio del aviso de honestidad de `seAplicaSinAprobacion` — un contador a
   * secas es el aviso que enseña a ignorar los avisos.
   *
   * **Ausente y vacío no son lo mismo**, y aquí la diferencia es la de siempre: ausente es
   * «no consta» —una tarea de antes de que esto existiera, o una que nunca llegó a correr
   * un turno porque su proyecto no estaba— y `[]` es «corrió y no autorizó ninguna
   * escritura», que es un dato distinto y el que el juez de la entrega necesita.
   */
  autorizadas?: string[];
  /**
   * El historial de lo que el desarrollador contestó mientras la tarea esperaba feedback.
   *
   * **Es una LISTA y no un campo**, porque puede haber varias vueltas —una tarea aparcada
   * dos veces— y la segunda no puede borrar la primera: la misma regla que `autorizadas`.
   * `conFeedback` solo AÑADE.
   *
   * **Ausente y vacío no son lo mismo, otra vez la misma regla.** Ausente es «nunca se le
   * pidió nada a esta tarea»; `conFeedback` nunca produce `[]` porque solo se llama para
   * AÑADIR un feedback, así que un array presente siempre tiene al menos uno.
   */
  feedback?: FeedbackDeTarea[];
  /**
   * El veredicto del juez de QA sobre lo que hizo la tarea: resumen y hallazgos, **nunca
   * contenido de ficheros** (`core/entrega.ts#VeredictoDeTarea` lo acota).
   *
   * Se guarda porque es la mitad de la decisión de «terminada» —la otra son las condiciones
   * que comprueba el código— y porque cuando el veredicto es el motivo de que la tarea NO
   * se entregue, sus palabras son lo único que dice qué falta. Se guarda **siempre que haya
   * uno**, también en verde: si no, una tarea terminada no podría distinguir «el juez la
   * aprobó» de «se entregó sin que nadie la juzgara», que es la duda que este campo existe
   * para cerrar. Y la cierra en la PANTALLA, no solo en disco: viaja entero por el cable
   * (`web/servidor/transporte.ts#filaDeTarea`) y lo pinta `EntregaDeTarea.tsx`. La cuarta
   * forma de llegar a «terminada» —que la dé por buena una persona— no la puede distinguir
   * este campo, porque el veredicto que hubiera se conserva: la distingue
   * `terminadaAMano`.
   *
   * **Y este SUSTITUYE, al contrario que `autorizadas`.** Aquello acumula porque un
   * fichero escrito en el primer intento sigue escrito; un veredicto, en cambio, es una
   * opinión sobre el estado ACTUAL del trabajo, y conservar el del intento anterior al lado
   * del nuevo enseñaría dos respuestas a una sola pregunta.
   */
  veredicto?: VeredictoDeTarea;
  /**
   * La dio por buena una PERSONA, con el botón «Dar por bueno», en vez de la puerta de
   * entrega (`core/entrega.ts#decisionDeEntrega`).
   *
   * **Existe porque el veredicto no basta para distinguirlo, y eso está razonado sobre el
   * código y no supuesto.** Una tarea aparcada puede llegar a ese botón con un veredicto
   * ROJO (el juez dijo que no y la persona lo pisa), con NINGUNO (se cortó a mitad, el turno
   * falló, el proyecto ya no estaba: el juez no llegó a hablar) y también con uno VERDE —el
   * camino es estrecho pero existe: la puerta la aprueba y la escritura del estado final
   * revienta, así que se aparca «el corredor no pudo cerrarla» con el verde ya guardado
   * (`corredorDeTareas.ts`)—. En ese último caso, sin esta marca, la tarjeta resultante
   * sería byte a byte la de una entrega por la puerta completa.
   *
   * **Solo la pone `darPorBuenaAMano`**, nunca `conEstado`: marcar ahí una entrega del
   * corredor sería la mentira simétrica. Y `undefined` es «no consta» —una tarea de antes
   * de que esto existiera—, que no es lo mismo que `false`.
   */
  terminadaAMano?: boolean;
}

/**
 * La ruta de un fichero tal como se apunta y se dice en una tarea: relativa a la raíz.
 *
 * Las rutas que llegan de un interrupt vienen del backend virtual del agente (`/app.xne`),
 * así que nunca son de la máquina — pero la barra de delante las hace parecerlo, y estas
 * cadenas acaban en el índice de tareas y en el registro que una persona lee. Vive aquí, y
 * no en quien las escribe, porque la usan los dos extremos: el texto que se pinta en el
 * transcript y la lista que se guarda. Dos copias de esto son dos reglas que divergen.
 */
export const rutaRelativaDeTarea = (ruta: string): string => ruta.replace(/^\/+/, "");

/** El título de una tarea: la primera frase de su petición, como el de una sesión. */
export const tituloDeTarea = (peticion: string): string => tituloDesde(peticion);

/** Tope de concurrencia por omisión. Dos: una corriendo y otra avanzando sin que la máquina
 *  se quede sin aire para lo que esté haciendo la persona delante. */
export const CONCURRENCIA_POR_OMISION = 2;

/**
 * Cuántas RONDAS de aprobación admite el turno de una tarea. **Su propio tope, y no el de
 * la persona.**
 *
 * `MAX_APPROVAL_ROUNDS` son cinco y se dimensionaron para alguien pulsando: «te lo he
 * preguntado cinco veces, para». En una tarea autónoma una ronda no es una pregunta, es una
 * TANDA de escrituras que se autorizan solas — y cinco tandas se agotan en un encargo
 * mediano: medido, un turno de tarea acabó con cuatro ficheros escritos, una escritura
 * abandonada y el verificador sin correr, porque cada tanda gastaba ronda.
 *
 * **Y no es infinito**, por el mismo argumento que el tope propio de los artefactos: cada
 * pasada es una llamada al modelo y aquí no hay ningún humano que frene el bucle.
 *
 * **De dónde sale el 20, dicho como lo que es: una observación por cuatro, no un encargo
 * grande medido.** Lo único medido es el turno que se cortó, que necesitaba cinco tandas;
 * veinte deja sitio a un encargo bastante mayor y sigue cortando un bucle en un tiempo
 * finito. No hay medida de un encargo de verdad grande detrás, y por eso es un número
 * provisional que se puede afinar. Lo que lo hace aceptable mientras tanto es su MODO DE
 * FALLO: al agotarse se dice, quedan escrituras sin aplicar, y `core/entrega.ts` no entrega
 * — o sea que un tope corto aparca con un motivo VERDADERO en vez de dar por bueno un
 * trabajo a medias. Un número provisional con un fallo honesto se afina luego; lo que no se
 * puede es que al agotarse mienta.
 */
export const TOPE_DE_RONDAS_DE_TAREA = 20;

/**
 * Qué tareas pueden arrancar AHORA.
 *
 * Cuatro reglas, y las dos últimas son las que importan:
 *  - **FIFO por fecha de creación**, global: predecible y explicable. Una prioridad es un
 *    campo más que nadie ha pedido.
 *  - **Tope de concurrencia**, contando las que ya corren.
 *  - **Nunca dos del mismo proyecto**, ni con las que corren ni entre las elegidas en esta
 *    misma pasada: comparten disco, índice de git, checkpointer y `sync`, y dos turnos a la
 *    vez sobre eso es una carrera con escrituras de por medio.
 *  - **Y GANA LA PERSONA**: ver `bloqueados`.
 */
export function siguientesAEjecutar(
  tareas: readonly Tarea[],
  opciones: {
    concurrencia: number;
    /**
     * Raíces en las que NO se puede arrancar nada, aunque haya hueco.
     *
     * Existe por el hueco que el cerrojo del corredor no cubre: ese arbitra dos
     * CORREDORES, y esto es una tarea y una PERSONA sobre el mismo árbol, que no tienen
     * aislamiento de ninguna clase — se pisan las ediciones, y la foto por turno de
     * `instantanea.ts` metería las escrituras de la tarea en el diff de la persona,
     * atribuyéndoselas. Gana la persona: la tarea espera.
     *
     * La condición que se le pasa es «la consola está ABIERTA» y no «hay un turno en
     * vuelo», porque solo la primera es estable en el instante de despachar: con la
     * segunda, una tarea arrancaría y chocaría después, que es justo el fallo que se
     * quiere evitar.
     *
     * **No gasta hueco de concurrencia** —no está corriendo nada— y **no para la cola**:
     * el hueco se lo lleva la siguiente de otro proyecto. Ausente y vacía significan lo
     * mismo aquí (nada que bloquear), al contrario que en `Entorno.proyectos`: no hay
     * ninguna omisión que una lista vacía pudiera estar contradiciendo.
     */
    bloqueados?: readonly string[];
  }
): Tarea[] {
  const corriendo = tareas.filter((t) => t.estado === "en-proceso");
  const huecos = opciones.concurrencia - corriendo.length;
  if (huecos <= 0) return [];
  const ocupados = new Set([...corriendo.map((t) => t.proyecto.raiz), ...(opciones.bloqueados ?? [])]);
  const elegidas: Tarea[] = [];
  const candidatas = tareas
    .filter((t) => t.estado === "nuevo")
    .slice()
    .sort((a, b) => (a.creada < b.creada ? -1 : a.creada > b.creada ? 1 : 0));
  for (const t of candidatas) {
    if (elegidas.length >= huecos) break;
    if (ocupados.has(t.proyecto.raiz)) continue;
    ocupados.add(t.proyecto.raiz);
    elegidas.push(t);
  }
  return elegidas;
}

/**
 * La tarea con otro estado, o una excepción.
 *
 * Lanza en vez de devolver la tarea sin tocar: un estado imposible escrito en disco es más
 * difícil de depurar que un error en el momento de escribirlo. Y `requiere-atencion` EXIGE
 * motivo, porque una tarea aparcada sin decir por qué no es accionable — es la misma razón
 * por la que el aviso de honestidad lleva los nombres de los ficheros y no un contador.
 */
export function conEstado(
  tarea: Tarea,
  estado: EstadoDeTarea,
  motivo?: string,
  sello: { pid?: number; ahora?: string } = {}
): Tarea {
  if (!TRANSICIONES[tarea.estado].includes(estado)) {
    throw new Error(`una tarea «${tarea.estado}» no puede pasar a «${estado}»`);
  }
  if (estado === "requiere-atencion" && (motivo ?? "").trim() === "") {
    throw new Error("aparcar una tarea exige un motivo: sin él no es accionable");
  }
  const ahora = sello.ahora ?? new Date().toISOString();
  const siguiente: Tarea = { ...tarea, estado };
  // El motivo vive SOLO en el estado que lo explica: pegado a una tarea reintentada
  // enseñaría un problema ya resuelto.
  if (estado === "requiere-atencion") siguiente.motivo = motivo;
  else delete siguiente.motivo;
  if (estado === "en-proceso") {
    siguiente.empezada = ahora;
    if (sello.pid !== undefined) siguiente.pid = sello.pid;
  } else {
    // Un pid pegado a una tarea que no corre haría creer que hay un proceso detrás.
    delete siguiente.pid;
  }
  if (estado === "terminada") siguiente.acabada = ahora;
  return siguiente;
}

/**
 * La tarea con lo que AUTORIZÓ, si es que se sabe.
 *
 * `undefined` significa «no se sabe» y entonces no se toca el campo: una tarea que ni
 * llegó a correr un turno —su proyecto se movió— no autorizó nada, pero afirmarlo con una
 * lista vacía sería contar como medido algo que nadie midió. Es la misma distinción que
 * `Entorno.proyectos` y la que `detalles` de un acto guardado conserva.
 *
 * **Se SUMA a lo que ya hubiera, no lo sustituye.** Una tarea aparcada se reintenta
 * (`requiere-atencion → nuevo`) y su segundo turno es otro turno: si esto reemplazara, el
 * fichero que autorizó el primer intento desaparecería del registro **cuando muy
 * probablemente siga escrito**, que es justo la clase de mentira que este campo evita. Y así `[]` sigue
 * queriendo decir lo que dice: «este turno no autorizó nada» — no borra lo que autorizó el
 * anterior. (`sesion` NO se pierde al reintentar: el corredor reabre la MISMA —Task 12,
 * `corredorDeTareas.ts#correr`—, así que el segundo turno cae en el mismo hilo y Revisión
 * sigue comparando contra el «antes» de la primera apertura, no contra uno a medias.)
 *
 * Normaliza en un solo sitio: rutas relativas (`rutaRelativaDeTarea`), sin huecos y sin
 * repetidos — el mismo fichero escrito en dos rondas del turno, o en dos intentos, es un
 * fichero tocado y no dos—, conservando el orden en que se aplicaron.
 */
export function conAutorizadas(tarea: Tarea, autorizadas: readonly string[] | undefined): Tarea {
  if (autorizadas === undefined) return tarea;
  const vistos = new Set<string>();
  const limpios: string[] = [];
  for (const cruda of [...(tarea.autorizadas ?? []), ...autorizadas]) {
    const ruta = rutaRelativaDeTarea(cruda).trim();
    if (ruta === "" || vistos.has(ruta)) continue;
    vistos.add(ruta);
    limpios.push(ruta);
  }
  return { ...tarea, autorizadas: limpios };
}

/**
 * La tarea con un feedback nuevo, sin consumir, y devuelta al lazo (`requiere-atencion →
 * nuevo`).
 *
 * **Rechaza el vacío, lanzando.** Un feedback en blanco devolvería la tarea al lazo sin
 * nada nuevo que decirle: la aparcaron por una decisión que hacía falta tomar, y «nada» no
 * es una decisión. Es el mismo argumento que rechaza un título vacío en
 * `sesiones.ts#renombrarSesion` — no es validación de formulario, es que aceptarlo dejaría
 * la tarea «resuelta» sin haberla resuelto, y el siguiente turno correría igual de
 * bloqueado que este.
 *
 * **Solo vale desde `requiere-atencion`, y eso lo decide `conEstado` y no una comprobación
 * aparte aquí.** Si la tarea no está aparcada, no hay pregunta que este feedback esté
 * contestando; `conEstado` ya lanza con un motivo legible (`«nuevo» no puede pasar a
 * «nuevo»`), y repetir esa regla en dos sitios es como acaban divergiendo.
 *
 * **Se SUMA a lo que ya hubiera, nunca lo sustituye** — la misma regla que
 * `conAutorizadas`: un segundo feedback no puede borrar el primero, porque el agente ya
 * actuó sobre lo que el primero dijo y perder el registro sería fingir que nunca se dijo.
 * `consumido` nace en `false`: se pone en `true` cuando el corredor de verdad lo manda al
 * turno (`corredorDeTareas.ts#correr`), no aquí — hasta entonces «no consta que se haya
 * mandado» es la verdad.
 */
export function conFeedback(tarea: Tarea, texto: string, ahora?: string): Tarea {
  const limpio = texto.trim();
  if (limpio === "") {
    throw new Error("un feedback vacío devolvería la tarea al lazo sin nada nuevo que decirle");
  }
  const nuevo: FeedbackDeTarea = { texto: limpio, creado: ahora ?? new Date().toISOString(), consumido: false };
  const feedback = [...(tarea.feedback ?? []), nuevo];
  return conEstado({ ...tarea, feedback }, "nuevo");
}

/**
 * La tarea con el veredicto del juez, si es que hay uno.
 *
 * `undefined` significa «no se le preguntó» y entonces no se toca el campo: se llega aquí
 * también por los caminos que aparcan antes de llegar al juez —el proyecto que ya no está,
 * el turno que revienta—, y escribir ahí una ausencia borraría el veredicto del intento
 * anterior, que sigue siendo lo último que se supo del trabajo.
 *
 * Cuando SÍ hay veredicto, sustituye: ver `Tarea.veredicto`.
 */
export function conVeredicto(tarea: Tarea, veredicto: VeredictoDeTarea | undefined): Tarea {
  if (veredicto === undefined) return tarea;
  return { ...tarea, veredicto };
}

/**
 * La tarea que una PERSONA da por buena, con la marca puesta.
 *
 * `conEstado` borra el `motivo` a propósito («el motivo vive SOLO en el estado que lo
 * explica»), así que después de esto no queda ni una palabra que diga que aquí no hubo ni
 * verificador ni juez: eso es lo que guarda `terminadaAMano`, y de ahí sale lo que la
 * tarjeta pinta. El `veredicto` que hubiera **no se toca** — la persona lo pisa, no lo
 * desmiente, y lo que el juez dijo sigue siendo lo que hay que poder leer al lado.
 *
 * La transición la decide `conEstado`, que LANZA si no vale: repetir esa regla aquí es como
 * acaban divergiendo (el mismo argumento de `conFeedback`).
 */
export function darPorBuenaAMano(tarea: Tarea, ahora?: string): Tarea {
  return { ...conEstado(tarea, "terminada", undefined, ahora === undefined ? {} : { ahora }), terminadaAMano: true };
}
