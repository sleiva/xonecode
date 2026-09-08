/**
 * Las TAREAS en background: qué son, qué transiciones valen y cuáles pueden arrancar.
 *
 * `core/`, o sea datos y reglas: ni disco ni procesos. La planificación vive aquí y no en el
 * corredor a propósito — dentro de un lazo con procesos no se puede probar, y es la parte
 * donde una equivocación se paga con dos turnos a la vez sobre el mismo proyecto.
 */
import { tituloDesde } from "./textos.js";

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
}

/** El título de una tarea: la primera frase de su petición, como el de una sesión. */
export const tituloDeTarea = (peticion: string): string => tituloDesde(peticion);

/** Tope de concurrencia por omisión. Dos: una corriendo y otra avanzando sin que la máquina
 *  se quede sin aire para lo que esté haciendo la persona delante. */
export const CONCURRENCIA_POR_OMISION = 2;

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
