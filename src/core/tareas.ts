/**
 * Las TAREAS en background: qué son, qué transiciones valen y cuáles pueden arrancar.
 *
 * `core/`, o sea datos y reglas: ni disco ni procesos. La planificación vive aquí y no en el
 * corredor a propósito — dentro de un lazo con procesos no se puede probar, y es la parte
 * donde una equivocación se paga con dos turnos a la vez sobre el mismo proyecto.
 */
import { tituloDesde } from "./textos.js";
import type { CierreDeTarea, VeredictoDeTarea } from "./entrega.js";
import type { MapeoDeEstados } from "./gestorDeTareas.js";

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
 * (`agent/turno/turnoReal.ts#conVerificacion`): entra al hilo que ya existe como un mensaje de
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
   * cerrado, igual que el índice de tareas, que también se indexa por ruta absoluta.
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
  /**
   * La tarea ANTERIOR de su cadena: esta no arranca hasta que aquella esté `terminada`. Existe porque un encargo grande
   * se reparte en tareas que van EN ORDEN (`docs/superpowers/plans/2026-10-06-tareas-encadenadas.md`), y la regla de
   * «nunca dos del mismo proyecto» no basta: deja de bloquear cuando la anterior queda en `requiere-atencion`, y la
   * siguiente arrancaría sobre un trabajo a medias. Si la anterior ya no existe (la persona la borró), esta queda libre.
   */
  tras?: string;
  creada: string;
  empezada?: string;
  acabada?: string;
  /** El proceso que la tiene. Se usa para reconciliar al arrancar; se va al parar. */
  pid?: number;
  /**
   * Cuántas veces el harness la REANUDÓ solo tras cortarse el proceso a mitad (`reanudadaTrasCorte`). Ausente = ninguna.
   * Es lo que frena el bucle de una tarea que tumba el proceso cada vez. No viaja: en la pantalla no sirve de nada.
   */
  reanudaciones?: number;
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
   * el mismo criterio del aviso de honestidad del modo autónomo — un contador a
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
   * Con qué se CERRÓ, cuando la entrega no salió limpia (`core/entrega.ts#cierreDeLaEntrega`): lo crítico y las
   * observaciones, que van al comentario de cierre del ticket. Ausente = se entregó sin nada que decir.
   */
  cierre?: CierreDeTarea;
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
  /**
   * El ticket del GESTOR de tareas en el que vive esta tarea (Jira, Notion…), si su proyecto tenía uno vinculado al
   * crearla. Se COPIA al crear y no se recalcula nunca desde el vínculo de ahora —la regla de `TicketDeSesion`—: si la
   * persona revincula el proyecto, lo que se escribe sigue yendo a ESTE ticket. Ausente = tarea solo local.
   */
  ticket?: TicketDeTarea;
  /**
   * Las pantallas de Stitch ELEGIDAS para la tarea, en el orden en que se eligieron, del proyecto de Stitch vinculado: de
   * 1 a `core/stitch.ts#TOPE_DE_PANTALLAS_ELEGIDAS`, cada una una PANTALLA distinta a construir (IXCODE-63; era una sola).
   * El corredor las trae antes del primer turno (la primera a `/artefactos/diseno/`, las demás a `diseno/2/`…) y el
   * encargo lo dice: no se busca por nombre (decisión suya; medido en Maset, «Menu Listado Entregas» no era el título de
   * ninguna y la tarea construyó con otra maqueta). Nunca vacía: sin ninguna, ausente. Una tarea guardada antes, con
   * `pantallaDeStitch` (una), se lee como una lista de una (`tareasEnDisco.ts`).
   */
  pantallasDeStitch?: PantallaElegida[];
  /**
   * La finalizada de la que es CONTINUACIÓN (`tareaReencolada`). Es lo que impide reencolar dos veces la misma mientras
   * la primera no acaba —también sin hilo, donde la `sesion` compartida no la delata—. No viaja.
   */
  continuaDe?: string;
}

/** Una pantalla de Stitch elegida: su `name` (`projects/<id>/screens/<id>`) y su título, para decirlo sin preguntar. */
export interface PantallaElegida {
  name: string;
  titulo: string;
  /** El nombre del proyecto de Stitch, del vínculo al crearla; su id sale del `name`. */
  proyecto?: string;
}

/** El ticket de una tarea en su gestor. `sitio` no sale del host; `aviso` es el último reflejo que FALLÓ. */
export interface TicketDeTarea {
  conector: string;
  sitio: string;
  /** El proyecto del gestor (clave de Jira, data source de Notion): lo que el adaptador necesita en el `Vinculo`. */
  proyecto: string;
  clave: string;
  url?: string;
  /** Lo que no se pudo escribir en el gestor la última vez («no se pudo pasar a PROBAR: …»). Ausente = nada pendiente. */
  aviso?: string;
  /** El mapeo de estados del vínculo AL CREARLA (copiado, como el resto): a qué estado pasa al empezar y al terminar. */
  estados?: MapeoDeEstados;
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
 *
 * **Subido a 50 por una medida**: una tarea que ajustaba una pantalla contra su maqueta (Maset, Entradas/Salidas) gastó
 * las 20 en un solo turno —editar, desplegar, capturar, criticar, volver a editar, una edición por fichero y ronda— y se
 * cortó con tres ediciones sin aplicar y el simulador sin correr, con la ventana casi lista. Ese ciclo de diseño es el
 * trabajo normal de una tarea, no un bucle; a petición de la persona, el mismo 50 que el chat.
 */
export const TOPE_DE_RONDAS_DE_TAREA = 50;

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
 *  - **Y las ENCADENADAS esperan a su anterior** (`Tarea.tras`) hasta que esté `terminada`, también si quedó en
 *    `requiere-atencion`. Igual que un bloqueado: no gasta hueco ni para la cola.
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
     * Qué raíces son las decide `esperasPorPersonas`: una consola OCUPADA o con la
     * conversación de una tarea abierta, no una consola abierta a secas (IXCODE-61).
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
    if (t.tras !== undefined) {
      const anterior = tareas.find((x) => x.id === t.tras);
      if (anterior !== undefined && anterior.estado !== "terminada") continue;
    }
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
 * ¿Se puede cambiar su encargo? (IXCODE-52). Solo una que NUNCA ha arrancado: `nuevo` y sin
 * `empezada`. Una reintentada o con feedback también vuelve a `nuevo`, pero lo que se le manda
 * entonces es su hilo y el feedback, no el encargo: dejar editarlo sería cambiar un texto que el
 * agente no va a volver a leer.
 */
export function puedeEditarEncargo(tarea: Pick<Tarea, "estado" | "empezada" | "feedback">): boolean {
  // Con un feedback (una REENCOLADA nace con uno) lo que se le manda es el feedback, no el encargo.
  return tarea.estado === "nuevo" && tarea.empezada === undefined && tarea.feedback === undefined;
}

/**
 * La tarea con otro encargo, o una excepción con el motivo. Sin `peticion`, la petición y el título
 * no se tocan; con ella (IXCODE-53: se edita lo que escribió la persona y se vuelve a preparar el
 * encargo) se cambia, y el título sale de ella como al crear.
 */
export function conEncargo(
  tarea: Tarea,
  encargo: string,
  peticion?: string,
  /** Las pantallas de Stitch: una lista las sustituye, `null` (o vacía) las QUITA, ausente no las toca. Ya comprobadas. */
  pantallas?: PantallaElegida[] | null
): Tarea {
  const editada = conEncargoYPeticion(tarea, encargo, peticion);
  if (pantallas === undefined) return editada;
  if (pantallas === null || pantallas.length === 0) {
    const { pantallasDeStitch: _quitadas, ...sinPantallas } = editada;
    return sinPantallas;
  }
  return { ...editada, pantallasDeStitch: pantallas };
}

function conEncargoYPeticion(tarea: Tarea, encargo: string, peticion?: string): Tarea {
  if (!puedeEditarEncargo(tarea)) {
    throw new Error(
      tarea.estado === "nuevo" ? "esa tarea ya arrancó alguna vez: lo que se le manda ahora es su conversación" : "esa tarea ya no está esperando a arrancar"
    );
  }
  const limpio = encargo.trim();
  if (limpio === "") throw new Error("un encargo vacío dejaría la tarea sin nada que hacer");
  if (peticion === undefined) return { ...tarea, encargo: limpio };
  // Con la PETICIÓN también (IXCODE-53): el texto que escribió la persona, del que sale el título.
  const pedido = peticion.trim();
  if (pedido === "") throw new Error("una petición vacía dejaría la tarea sin título ni de dónde volver a preparar el encargo");
  return { ...tarea, encargo: limpio, peticion: pedido, titulo: tituloDeTarea(pedido) };
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

/**
 * Cuántas veces se reanuda SOLA una tarea cortada a mitad. Una: si vuelve a cortarse, puede ser ella la que tumba el
 * proceso, y reanudarla siempre sería un bucle; entonces se aparca y espera a una persona.
 */
export const TOPE_DE_REANUDACIONES = 1;

/**
 * Lo que recibe el agente al reanudar, como un mensaje más en SU hilo. El trabajo de antes del corte está en el disco
 * (las tareas escriben sin aprobación) y en su memoria hasta el último paso guardado, pero la llamada en curso se perdió:
 * por eso manda MIRAR antes de rehacer.
 */
export const TEXTO_DE_REANUDACION =
  "[harness] El proceso se cortó a mitad de tu turno anterior y se ha vuelto a arrancar. Sigue el encargo donde lo " +
  "dejaste: lo que ya escribiste está en el disco, así que mira el estado de los ficheros (y del plan, si lo hay) antes " +
  "de rehacer nada, y no repitas lo que ya está hecho.";

/**
 * Una tarea que el proceso dejó «en proceso» al morir, REANUDADA: vuelve a la cola con `TEXTO_DE_REANUDACION` como
 * feedback pendiente, que el corredor manda en su MISMO hilo (`peticionDeFeedback` con `reanudando`). Pasa por las
 * transiciones de siempre —aparcada con su motivo y devuelta con un feedback—, así que no hay un atajo nuevo que vigilar.
 *
 * `undefined` = NO se reanuda y se aparca como hasta ahora: sin hilo que reabrir (empezar de cero sin decírselo a nadie
 * podría rehacer o pisar lo escrito) o con el tope gastado.
 */
export function reanudadaTrasCorte(tarea: Tarea, motivo: string, ahora?: string): Tarea | undefined {
  if (tarea.estado !== "en-proceso" || tarea.sesion === undefined) return undefined;
  const hechas = tarea.reanudaciones ?? 0;
  if (hechas >= TOPE_DE_REANUDACIONES) return undefined;
  const aparcada = conEstado(tarea, "requiere-atencion", motivo, ahora === undefined ? {} : { ahora });
  return conFeedback({ ...aparcada, reanudaciones: hechas + 1 }, TEXTO_DE_REANUDACION, ahora);
}

/** El motivo de aparcar una cortada que YA se reanudó sola: lo de siempre, más por qué esta vez no sigue. */
export const motivoTrasReanudar = (motivo: string): string =>
  `${motivo}; ya se reanudó sola una vez y volvió a cortarse, así que espera a que la mires`;

/**
 * «Continuar» en una tarea aparcada sin escribir nada: lo que entra en SU hilo como feedback. Sin esto, seguir sin
 * añadir nada era «Reintentar», que vuelve a mandar el encargo entero.
 */
export const TEXTO_DE_CONTINUAR = "Continúa donde lo dejaste.";

/**
 * ¿Se puede REENCOLAR esta finalizada para acabar lo que no hizo? Cualquier terminada, salvo
 * las que viven en un GESTOR (decisión suya): desde el ticket ya se relanza, y una segunda
 * puerta aquí abriría otra tarea que el gestor no conoce.
 */
export function puedeReencolar(tarea: Pick<Tarea, "estado" | "ticket">): boolean {
  return tarea.estado === "terminada" && tarea.ticket === undefined;
}

/**
 * Lo que se le propone mandar a la tarea REENCOLADA, editable antes de encolar: lo que su
 * cierre dejó sin hacer. Sin cierre (una de antes de que existiera), lo que dijo el juez si
 * no fue verde; sin nada de eso, pedirle que lo repase contra el encargo.
 */
export function textoParaReencolar(tarea: Pick<Tarea, "cierre" | "veredicto">): string {
  const criticos = tarea.cierre?.criticos ?? [];
  const observaciones =
    tarea.cierre?.observaciones ??
    (tarea.veredicto !== undefined && tarea.veredicto.veredicto !== "verde"
      ? [tarea.veredicto.resumen, ...(tarea.veredicto.hallazgos ?? [])]
      : []);
  const lista = (titulo: string, cosas: readonly string[]): string[] =>
    cosas.length === 0 ? [] : [`${titulo}\n${cosas.map((c) => `- ${c}`).join("\n")}`];
  const partes = [...lista("## CRITICAL", criticos), ...lista("## Observaciones", observaciones)];
  /**
   * Que HAGA, no que resuma: medido en Maset, con solo la lista del cierre (dos omisiones decididas) el agente volvió a
   * escribir su resumen en 33 s y paró — y lo que él mismo había dejado «pendiente» en ese resumen no se lo pedía nadie.
   */
  const pedir =
    "Sigue con esta tarea y HAZ lo que falta: lo que dejaste pendiente en tu último resumen" +
    (partes.length === 0 ? "" : " y lo que anotó su cierre") +
    ". No te limites a resumir otra vez: cambia el proyecto y compruébalo; si algo no se puede hacer, di por qué. " +
    "No rehagas lo que ya está en el disco.";
  return [pedir, ...partes].join("\n\n");
}

/**
 * La continuación de esta finalizada que todavía NO ha acabado, si la hay: reencolarla otra vez pondría dos tareas a
 * escribir en el mismo hilo una detrás de otra. Por `continuaDe`, o por compartir su hilo (`sesion`).
 */
export function continuacionEnCurso(original: Pick<Tarea, "id" | "sesion">, lista: readonly Tarea[]): Tarea | undefined {
  return lista.find(
    (t) =>
      t.id !== original.id &&
      t.estado !== "terminada" &&
      (t.continuaDe === original.id || (original.sesion !== undefined && t.sesion === original.sesion))
  );
}

/**
 * La tarea NUEVA que acaba lo que dejó una finalizada. **No reabre la original**: `terminada`
 * no tiene salida, y la original se queda en el histórico tal cual.
 *
 * Sigue en el HILO de la original (`sesion`), así el agente recuerda lo que hizo, y el texto
 * le entra como un FEEDBACK pendiente: el mismo camino que «Continuar» —`peticionDeFeedback`
 * en el corredor—, que sin hilo manda el encargo original delante y lo dice. Sin ticket, y
 * sin veredicto ni cierre: son del trabajo de antes.
 */
export function tareaReencolada(
  original: Tarea,
  nueva: { id: string; texto: string; adjuntos: AdjuntoDeTarea[]; ahora?: string }
): Tarea {
  if (!puedeReencolar(original)) {
    throw new Error(
      original.ticket === undefined
        ? "solo se reencola una tarea terminada"
        : `vive en ${original.ticket.clave}: se relanza desde el gestor`
    );
  }
  const ahora = nueva.ahora ?? new Date().toISOString();
  const base: Tarea = {
    id: nueva.id,
    proyecto: original.proyecto,
    // Sin apilar: reencolar una continuación no da «X (continuación) (continuación)».
    titulo: `${original.titulo.replace(/ \(continuación\)$/, "")} (continuación)`,
    peticion: original.peticion,
    encargo: original.encargo,
    adjuntos: nueva.adjuntos,
    estado: "nuevo",
    creada: ahora,
    continuaDe: original.id,
    ...(original.sesion === undefined ? {} : { sesion: original.sesion }),
    ...(original.pantallasDeStitch === undefined ? {} : { pantallasDeStitch: original.pantallasDeStitch }),
  };
  const limpio = nueva.texto.trim();
  if (limpio === "") throw new Error("dile qué tiene que acabar: el texto está vacío");
  return { ...base, feedback: [{ texto: limpio, creado: ahora, consumido: false }] };
}

/**
 * ¿Se puede «Arrancar ahora»? Una tarea `nuevo` que no espera a ninguna anterior (`tras`): las encadenadas esperan a
 * que la suya termine, y saltárselo sería arrancar sobre trabajo sin aceptar. La MISMA regla que `siguientesAEjecutar`.
 */
export function puedeArrancarYa(tarea: Pick<Tarea, "estado" | "tras">, lista: readonly Pick<Tarea, "id" | "estado">[]): boolean {
  if (tarea.estado !== "nuevo") return false;
  if (tarea.tras === undefined) return true;
  const anterior = lista.find((x) => x.id === tarea.tras);
  return anterior === undefined || anterior.estado === "terminada";
}

/** Lo que de una consola de PERSONA decide si una tarea puede arrancar en su proyecto. */
export interface ConsolaDePersona {
  raiz: string;
  /** Turno en vuelo, o su cierre (volcado y commit) sin terminar. */
  ocupada: boolean;
  sesion?: string;
  idDeHilo: string;
}

/** Por qué una tarea espera a una persona, y si «Arrancar ahora» (ceder el proyecto) lo resuelve. */
export interface EsperaPorPersona {
  motivo: string;
  ceder: boolean;
}

export const MOTIVO_ESPERA_AL_TURNO = "tu conversación en este proyecto está trabajando; arranca cuando termine";
export const MOTIVO_ESPERA_A_SU_CONVERSACION = "tienes abierta su conversación; arranca cuando la cierres";
export const MOTIVO_ESPERA_A_LA_SINCRONIZACION = "se está sincronizando este proyecto con CloudStudio; arranca cuando termine";

/**
 * GANA LA PERSONA (IXCODE-61): las raíces donde ninguna tarea puede arrancar ahora, con el porqué.
 *
 * Dos causas, y abrir el proyecto ya NO es una. Antes bastaba con tener la consola abierta,
 * aunque estuviera quieta, porque «abierta» era lo único estable al despachar. Desde IXCODE-36
 * el servidor niega a la persona enviar nada mientras una tarea escribe en su proyecto, así
 * que una consola quieta no puede chocar después: lo que queda por proteger es
 * - una consola OCUPADA: su turno escribe, y su commit (`add -A`) se llevaría lo de la tarea;
 * - la conversación de una tarea `nuevo` ABIERTA por la persona: serían dos consolas sobre el
 *   mismo hilo. Esta sí se cede con «Arrancar ahora», que la cierra;
 * - una OBRA en curso fuera de turno (`obras`: `/sync subir|bajar`, la descarga del Resumen), que
 *   escribe en la copia sin pasar por ningún turno.
 * `sesion` Y `idDeHilo` porque son dos momentos de la misma conversación (ver `esDeUnaTareaEnCurso`).
 */
export function esperasPorPersonas(
  consolas: readonly ConsolaDePersona[],
  tareas: readonly Pick<Tarea, "estado" | "sesion" | "proyecto">[],
  obras: readonly string[] = []
): Map<string, EsperaPorPersona> {
  const esperas = new Map<string, EsperaPorPersona>();
  for (const raiz of obras) esperas.set(raiz, { motivo: MOTIVO_ESPERA_A_LA_SINCRONIZACION, ceder: false });
  for (const c of consolas) {
    if (esperas.has(c.raiz)) continue;
    if (c.ocupada) {
      esperas.set(c.raiz, { motivo: MOTIVO_ESPERA_AL_TURNO, ceder: false });
      continue;
    }
    const suya = tareas.some(
      (t) =>
        t.estado === "nuevo" &&
        t.sesion !== undefined &&
        t.proyecto.raiz === c.raiz &&
        (t.sesion === c.sesion || t.sesion === c.idDeHilo)
    );
    if (suya && !esperas.has(c.raiz)) esperas.set(c.raiz, { motivo: MOTIVO_ESPERA_A_SU_CONVERSACION, ceder: true });
  }
  return esperas;
}
