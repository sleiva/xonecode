/**
 * Los tipos del transcript y del transporte, re-declarados — no importados de
 * `src/core/actos.ts` ni de `src/web/servidor/transporte.ts`. `src/web/frontera.test.ts`
 * prohíbe que `apps/web/` y `src/` compartan un módulo de EJECUCIÓN, y una importación de
 * tipos con `import type` desaparece en tiempo de ejecución pero igual ata el build del
 * cliente a la resolución de módulos de `src/` (su `tsconfig`, sus paths) — exactamente lo
 * que la frontera evita. Los dos ficheros pueden divergir en silencio; `tipos.test.ts`
 * compara los literales de `tipo:` de este fichero con los de `core/actos.ts`, Y los
 * literales de `clase:` de las dos uniones de mensaje con los de
 * `web/servidor/transporte.ts`, para que divergir dé un test en rojo y no un bug mudo en
 * producción. La comparación de `clase:` es la que faltó en la primera versión de este
 * fichero: a `MensajeDelCliente` le faltaba el miembro de clase «secreto» —la respuesta a
 * `leerSecreto`, con un campo `valor`— que `transporte.ts:46` sí declara, y nada lo delató
 * hasta que se amplió el test. (Este párrafo describe ese miembro EN PROSA a propósito: la
 * forma `{ clase: "…" }` en un comentario de este fichero contaría como un literal más
 * para el propio detector de divergencia que unas líneas más abajo se prueba contra
 * `[a-z0-9_-]+` — medido, dio un falso positivo hasta que se reescribió así.)
 *
 * Los campos de `aprobacion` van como `unknown[]`/`Record<string, unknown[]>` en vez de
 * traer aquí `PendienteDeAprobacion` y `LineaDeDiff`: esos dos tipos no llevan `tipo:` como
 * discriminante de unión (uno no tiene `tipo` en absoluto, el otro lo usa para OTRA cosa) y
 * duplicarlos no lo exige ningún test de esta tarea — quien pinte el modal de aprobación
 * los necesitará con forma, no aquí.
 */

/**
 * Un subagente tal y como viaja. Redeclarado aquí como todo lo del cable: `tipos.test.ts`
 * compara los literales contra los del host, así que divergir da un test en rojo y no un
 * bug mudo.
 *
 * `origen` lo pone el SERVIDOR al leer y es de solo lectura: dice si el agente viene del
 * global o del proyecto, que es lo que explica por qué editarlo aquí no afecta a los demás
 * proyectos. Ausente en el que se está creando y todavía no se ha guardado.
 */
export interface AgenteDelCable {
  nombre: string;
  descripcion: string;
  motor: string;
  modelo?: string;
  soloLectura: boolean;
  skills: string[];
  instrucciones: string;
  origen?: string;
}

export type Acto =
  | { tipo: "usuario"; texto: string }
  | { tipo: "asistente"; texto: string }
  /** Lo que el modelo PENSÓ, cuando lo publica. Aparte de `asistente` porque no es la
   *  respuesta: se pinta apagado y plegado. */
  | { tipo: "razonamiento"; texto: string }
  /**
   * `detalles` corre EN PARALELO a `lineas`: misma longitud, mismo orden. Dice de qué tool
   * es cada línea y si falló — el evento ya lo traía y el acto lo tiraba al componer el
   * texto. No expone nada nuevo: la ruta sigue sin viajar aquí, y el nombre de la tool ya
   * iba dentro de la propia línea.
   *
   * Es OPCIONAL, y su ausencia significa algo: las sesiones guardadas antes de que esto
   * existiera no lo traen. Ausente es «esta sesión es anterior», que NO es «ninguna línea
   * vino de una tool» — por eso no se rellena con vacíos al releer del disco, y quien pinte
   * puede distinguir las dos cosas.
   *
   * Un elemento VACÍO sí quiere decir «esta línea no es de una tool»: por el mismo canal
   * pasan las líneas de plan, de tarea y de verificación.
   */
  | { tipo: "herramientas"; lineas: string[]; detalles?: { nombre?: string; error?: string }[] }
  | { tipo: "sistema"; texto: string }
  /** Un artefacto que dejó el agente: diagrama, panel, captura. No es un fichero del
   *  proyecto (vive en la carpeta de la sesión) y por eso se escribió SIN aprobación — que
   *  se vea es la contrapartida. Metadatos y nunca el contenido. */
  | { tipo: "artefacto"; ruta: string; nombre: string; bytes: number; mime?: string }
  /** `fase` es la CATEGORÍA (el enum de `core/events.ts`), aparte de su texto en español:
   *  filtrar por la prosa se rompería el día que alguien la reescriba. Opcional por lo
   *  mismo que `detalles` — las sesiones viejas no lo traen. */
  | { tipo: "fase"; texto: string; ms: number; fase?: string }
  | { tipo: "fin"; ms: number; modelo?: string }
  | { tipo: "error"; texto: string };

/**
 * Los tres valores, redeclarados igual que todo lo demás de este fichero: son los de
 * `web/servidor/vestibulo.ts#PasoDelVestibulo`. Vive AQUÍ y no en `Wizard.tsx` porque el
 * mensaje del cable lo necesita, y un tipo del cable que colgara de un componente ataría
 * `tipos.ts` a un `.tsx` con React dentro.
 *
 * Solo DOS son pasos PENDIENTES de verdad hoy: «proyecto» salió del alta (cambio de
 * rumbo del usuario — se elige en la barra lateral) y `pasosPendientes()` nunca lo
 * devuelve, pero el valor sigue siendo válido porque el mismo tipo nombra también la
 * ACCIÓN de `MensajeDelCliente` para abrir un proyecto desde la barra.
 */
export type PasoDelWizard = "cuenta" | "entorno" | "proyecto";

export interface SelectorDeConsola {
  titulo: string;
  opciones: readonly { id: string; etiqueta: string; detalle?: string }[];
  /**
   * Por qué se pregunta esto, o por qué se vuelve a preguntar. Redeclarado igual que todo
   * lo demás de este fichero (`cli/consola.ts#SelectorDeConsola` es el original). Existe
   * por ESTA piel: durante el alta la web no pinta el transcript (`App.tsx`, rama
   * `enAlta`), así que el motivo tiene que viajar dentro del propio selector o no se ve.
   */
  aviso?: string;
}

export type MensajeAlCliente =
  | { clase: "acto"; acto: Acto }
  /** Sustituye el ÚLTIMO acto en vez de anexar: ver `store.ts#aplicar` para el porqué. */
  | { clase: "sustitucion"; acto: Acto }
  /** El transcript completo: lo que trae (re)conectar, y el arreglo de cualquier desajuste. */
  | { clase: "reemision"; actos: Acto[] }
  /**
   * El saludo, SUELTO del `alta` — llega al conectar, ANTES de que el paso de cuenta
   * resuelva (`web/servidor/arranque.ts` lo manda antes de `conducirCuenta()`), porque el
   * nombre no depende de ninguna cuenta: es local (`agent/persona.ts#nombreDePersona`).
   * `alta.nombre` sigue existiendo con el MISMO dato — no porque una conexión pueda ver
   * `alta` sin haber visto este mensaje antes (no puede: el SSE arranca de cero cada vez
   * y siempre manda éste primero), sino porque tocar ese campo cambiaría el contrato de
   * `alta` y su test, que no es parte de este arreglo.
   */
  | { clase: "bienvenida"; nombre?: string }
  | { clase: "pregunta"; texto: string }
  | { clase: "selector"; selector: SelectorDeConsola }
  /**
   * Los modelos: cuál está en vigor (`actual`, «proveedor/modelo») y qué se puede elegir.
   * Redeclarado como todo lo demás de este fichero; el original es
   * `web/servidor/transporte.ts`. `actual` ausente = no hay sesión abierta y por tanto no
   * hay modelo que afirmar — se enseña «Elige modelo», nunca una fila inventada.
   */
  | { clase: "modelos"; actual?: string; proveedores: ProveedorDeModelos[] }
  /** Los proyectos de UN entorno registrado, pedidos por su pestaña en Ajustes. `proyectos`
   *  ausente con `error` puesto es «no se pudo preguntar», que no es una lista vacía. */
  | {
      clase: "proyectosDeEntorno";
      entorno: string;
      proyectos?: { id: string; nombre: string; compartido?: boolean }[];
      error?: string;
    }
  /**
   * Cómo fue el último alta o baja de proveedor personalizado. El motivo viaja EN un
   * mensaje propio y no como acto de sistema: la ventana de ajustes no pinta el
   * transcript, así que ahí un fallo contado por el transcript sería mudo.
   */
  | { clase: "proveedor"; hecho: boolean; motivo?: string }
  /** Hay un turno EN VUELO, o dejó de haberlo: apaga el compositor y saca el botón de
   *  parar. No se deduce de los actos — un turno que revienta no siempre deja `fin`. */
  | { clase: "turno"; activo: boolean }
  | {
      clase: "consumo";
      modelo: { entrada: number; salida: number; cache: number };
      externo: { entrada: number; salida: number; cache: number };
      ventana: { usado: number; tope?: number };
    }
  /** Se está abriendo una sesión —o descargando un proyecto—, dicho por el servidor: es el
   *  único que sabe cuándo empieza y cuándo acaba. */
  | { clase: "abriendo"; activo: boolean; proyecto?: string; sesion?: string; descargando?: true }
  /**
   * Los subagentes dados de alta, para la ventana de ajustes. La lista va ENTERA cada vez
   * que cambia —son pocos y pequeños— en vez de mandar diferencias: un delta perdido
   * dejaría la ventana enseñando un agente que ya no existe.
   *
   * `problemas` son los `.md` que no se pudieron leer, con su motivo. Viajan porque quien
   * los tiene que arreglar está mirando esta ventana: un agente que no aparece y nadie dice
   * por qué se lee como que la aplicación lo perdió.
   */
  | { clase: "agentes"; agentes: AgenteDelCable[]; problemas: string[] }
  /**
   * La cola de tareas entera. Va a TODOS los clientes, como la foto de la máquina y por lo
   * mismo: la cola es de la máquina. `corriendoAqui` es falso en el segundo proceso, y es
   * lo que deja decir que este kanban no avanza.
   */
  | { clase: "tareas"; lista: TareaDelCable[]; concurrencia: number; corriendoAqui: boolean }
  /**
   * Cómo fue la última augmentación pedida (`{clase:"tarea", accion:"augmentar"}`): el
   * encargo que propone el modelo, o por qué no se pudo. Nunca los dos a la vez.
   */
  | { clase: "tarea"; accion: "augmentado"; encargo: string }
  | { clase: "tarea"; accion: "augmentado"; error: string }
  /**
   * Un trozo del transcript de la sesión de una TAREA que se está mirando en vivo.
   *
   * No es un segundo registro: son los MISMOS actos que se guardan en el `.jsonl` de esa
   * sesión, los mismos que se leen al abrirla cuando la tarea acabe. Y llega etiquetado con
   * el id de la tarea porque por este mismo cable llega el transcript de la sesión PROPIA:
   * sin la etiqueta, los actos de una tarea de fondo se mezclarían con la conversación.
   *
   * `todos` es la reemisión entera (al empezar a mirar), `alta` un acto nuevo al final y
   * `sustitucion` el último que cambió. `actos` es siempre una lista: con las dos últimas,
   * de un solo elemento. Redeclarado de `web/servidor/transporte.ts`.
   */
  | { clase: "mirada"; tarea: string; via: "todos" | "alta" | "sustitucion"; actos: Acto[] }
  /**
   * Qué hay en la máquina para probar la app: sistema, herramientas de Android e iOS con su
   * estado, y los dispositivos y simuladores a los que se llega. Es una foto con hora
   * (`medido`), no un estado en vivo. Redeclarado de `core/dispositivos.ts`.
   */
  | { clase: "dispositivos"; informe: InformeDeDispositivos; ajustes: AjustesDeDispositivos }
  /**
   * Los ficheros que la sesión ha tocado, y el parche de uno. Los tres `via` son tres cosas
   * distintas: «git» es «comparado»; «sin-empezar», que la sesión no ha volcado ningún acto
   * todavía y por eso no ha tocado nada; «sin-marca», que NO se sabe —sin git, o sesión
   * abierta antes de que esto existiera—. Ninguna de las dos últimas es una lista vacía a
   * secas: «no has hecho nada» y «no se puede saber» no se pueden leer igual.
   */
  | {
      clase: "revision";
      /** `git` = atribuido por COMMIT (lo que hizo esta sesión). `desde-apertura` = todo lo
       *  que ha cambiado en la copia desde que se abrió, de quien sea: es lo único medible
       *  en una sesión sin sello, y NO es atribución. */
      via: "git" | "desde-apertura" | "sin-marca" | "sin-empezar";
      ficheros: FicheroTocado[];
      mezclados?: number;
    }
  | { clase: "parche"; ruta: string; texto: string; recortado: boolean }
  /** El árbol del proyecto abierto y el contenido de uno de sus ficheros (pestaña Ficheros). */
  | { clase: "arbol"; rutas: string[]; recortado: boolean; error?: string }
  | ({ clase: "fichero" } & FicheroDelProyecto)
  /** El contenido de un ARTEFACTO de la sesión, con la misma forma que un fichero del
   *  proyecto: así los visores son los mismos. La `ruta` es la VIRTUAL, `/artefactos/<n>`. */
  | ({ clase: "artefacto" } & FicheroDelProyecto)
  /** Cómo va el paso que se está ejecutando. `lineas` es la COLA del log, no todo. */
  | {
      clase: "instalacion";
      receta: string;
      paso: number;
      titulo: string;
      estado: "corriendo" | "ok" | "fallo" | "cancelada" | "colgada";
      lineas: string[];
      ms: number;
      motivo?: string;
    }
  /** Lo que ofrece un motor externo, o por qué no se pudo saber. */
  | { clase: "modelosDeMotor"; motor: string; modelos: { id: string; nombre: string }[]; error?: string }
  | { clase: "secreto"; pregunta: string }
  /**
   * El registro de comandos de barra (`COMANDOS` en `cli/consola.ts`), para que el
   * compositor sugiera sin llevar una copia — `nombre` con la «/» delante, tal cual se
   * teclea.
   */
  | { clase: "comandos"; comandos: { nombre: string; descripcion: string }[] }
  /**
   * El alta que falta, para el wizard (`vestibulo.ts#pasosPendientes` del lado servidor).
   * `pasos` vacío = no hay wizard que pintar — pero puede seguir sin haber proyecto
   * abierto (`proyectoAbierto`, más abajo): el paso de proyecto salió del alta, y con él
   * la implicación de que `pasos: []` significaba «hay proyecto abierto». `proyectos` y
   * `ramas` vienen vacíos mientras no haya entorno (y proyecto) elegidos: son dos
   * consultas a CloudStudio y una lista de relleno sería un dato inventado.
   *
   * La clave de API NO llega por aquí: el paso de cuenta lo conduce el servidor sobre los
   * mensajes de clase «selector» y «secreto».
   */
  | {
      clase: "alta";
      pasos: PasoDelWizard[];
      proveedores: { id: string; nombre: string }[];
      entornos: { id: string; nombre: string; url: string }[];
      /**
       * Los REGISTRADOS de verdad (`settings.json`), que no son los ofrecidos de arriba.
       * `proyectos` es la elección de qué proyectos suyos se enseñan; AUSENTE significa que
       * nadie lo ha dicho —y manda la omisión de la barra—, mientras que una lista vacía es
       * una elección: ninguno.
       */
      registrados: { id: string; nombre: string; url: string; proyectos?: string[] }[];
      /** De qué entorno son los `proyectos` de este mensaje. Ausente = de ninguno todavía. */
      entornoActivo?: string;
      /**
       * CUÁL está abierto, y cuál es su sesión. `proyectoAbierto` (booleano) dice SI hay
       * uno; esto dice cuál, que es lo que la barra necesita para marcarlo. `sesionActiva`
       * puede faltar con proyecto abierto: el id no existe hasta el primer acto volcado.
       */
      proyectoActivo?: string;
      sesionActiva?: string;
      /** Con qué dispositivo trabaja la sesión. La FOTO, no solo el id: los ids no son
       *  estables y al reabrir hay que poder decir «no está ahora» en vez de un serial. */
      dispositivoActivo?: DispositivoElegido;
      /** La sesión abierta es una relectura y el agente no la recuerda. Ausente = no. */
      historica?: boolean;
      /**
       * Las escrituras de este proyecto se aplican SIN pedir aprobación
       * (`core/settings.ts#seAplicaSinAprobacion`). Ausente = se pide, que es lo normal.
       * Viaja en el alta y no solo en el aviso del turno porque quien se sienta hoy tiene
       * que saberlo ANTES de pedir nada, no después con los ficheros ya cambiados.
       */
      sinAprobacion?: boolean;
      /** Lo que YA estaba sin commitear cuando se abrió esta consola. Ausente = nada que
       *  decir: limpio, sin git con qué mirar, o no se pudo medir. `ficheros` viene
       *  acotada y `total` es la cifra entera. */
      trabajoAlAbrir?: { ficheros: string[]; total: number };
      proyectos: {
        id: string;
        nombre: string;
        /** Compartido CONTIGO por otra persona. Ausente = el servidor no lo dijo, que NO es
         *  lo mismo que «es tuyo»: entonces no se pinta etiqueta. Booleano y no el correo
         *  del propietario, que el host descarta a propósito. */
        compartido?: boolean;
        sesiones?: {
          id: string;
          titulo: string;
          /** Cuándo se tocó por última vez, ISO. Ordena la lista y se pinta a la derecha.
           *  Ausente = el índice no lo dice; sin sello y la última. */
          ultimoTurno?: string;
          /** La abrió una TAREA de fondo, no una persona. **Ausente es «no consta»**: no la
           *  llevan las sesiones anteriores a la marca, y se pintan lisas porque liso es lo
           *  conservador, no porque conste que sean de alguien. */
          deTarea?: true;
          /** Turno en marcha en esa conversación ahora mismo, esté o no delante. Ausente =
           *  no consta. Ver `transporte.ts`. */
          trabajando?: true;
        }[];
        /** La copia local ya existe: abrirlo no baja nada ni pregunta rama. */
        local?: boolean;
        /** Alguna sesión de este proyecto trabaja AHORA. No se deriva de las filas: una
         *  sesión nueva no tiene fila hasta su primer volcado. Ver `transporte.ts`. */
        trabajando?: true;
      }[];
      ramas: string[];
      /** Qué falló en el paso anterior; ausente si no falló nada. Lo pinta el propio paso:
       *  un acto de sistema se va a las Trazas, que no es la pestaña que se está viendo. */
      aviso?: string;
      /** El saludo (`agent/persona.ts#nombreDePersona`, servidor). Nunca en un acto ni en
       *  una sesión guardada: solo lo pinta `Bienvenida.tsx`. Ausente = sin nombre. */
      nombre?: string;
      /** Si hay un proyecto abierto en ESTA conexión — hace falta desde que `pasos: []`
       *  dejó de implicarlo (ver arriba). */
      proyectoAbierto: boolean;
      /**
       * El `modo` del `.xonecode/config.json` del proyecto abierto, para la pastilla de
       * la cabecera. **Ausente cuando no se sabe**, y eso incluye tres casos que no se
       * distinguen desde aquí: no hay proyecto abierto, el fichero no se pudo leer, o
       * lleva un valor que no es ninguno de los dos. Ausente NO significa «offline»:
       * pintar «offline» sobre un fichero que no se pudo leer sería afirmar lo que no se
       * sabe, que es la misma clase de mentira que un alias de color inventado. Es lo
       * único que se le extrae al config: ni la URL del entorno, ni el proyecto, ni la
       * rama, que son datos del despliegue y no tienen por qué acabar en el transcript.
       */
      modo?: "offline" | "cloud";
    }
  | {
      clase: "aprobacion";
      pendientes: unknown[];
      ficheros: Record<string, string>;
      diffs: Record<string, unknown[]>;
    };

/**
 * Un proveedor visto por el selector de modelos. `credencial` tiene TRES valores porque hay
 * tres cosas distintas que decir: confirmada, confirmada ausente, y «no necesita ninguna»
 * (Ollama local) — a ese no se le pinta punto, ni verde ni rojo, porque no hay nada que
 * afirmar. `modelos` ausente = su catálogo aún no se ha pedido.
 */
/** Un fichero de la sesión. `mas`/`menos` faltan en un binario: git no cuenta líneas ahí. */
export interface FicheroTocado {
  ruta: string;
  clase: "nuevo" | "modificado" | "borrado";
  mas?: number;
  menos?: number;
  /** Nadie ha commiteado esto todavía, así que no consta de quién es. */
  sinCommitear?: true;
}

/** Un fichero del proyecto tal como viaja. Redeclarado de `web/servidor/transporte.ts`. */
export interface FicheroDelProyecto {
  ruta: string;
  texto?: string;
  recortado: boolean;
  binario: boolean;
  bytes: number;
  codificacion?: "utf-8" | "latin1";
  /**
   * El MIME, solo si la ruta es una imagen que el visor sabe pintar. Viaja aunque los bytes
   * NO vengan: es lo que distingue «una imagen demasiado grande» de «un binario cualquiera».
   */
  mime?: string;
  /** La imagen entera, si cupo en el tope. Nunca recortada: media imagen no se abre. */
  base64?: string;
  error?: string;
}

/**
 * Una tarea tal como viaja. **Sin la raíz del proyecto**: viajan su id y su nombre, que es
 * lo que la interfaz necesita — la ruta se queda en el host. Redeclarado de
 * `web/servidor/transporte.ts`.
 */
export interface TareaDelCable {
  id: string;
  proyecto: string;
  proyectoNombre: string;
  titulo: string;
  peticion: string;
  encargo: string;
  adjuntos: { nombre: string; bytes: number; mime?: string }[];
  estado: "nuevo" | "en-proceso" | "requiere-atencion" | "terminada";
  motivo?: string;
  sesion?: string;
  creada: string;
  empezada?: string;
  acabada?: string;
  /**
   * Lo que la tarea AUTORIZÓ escribir sin que nadie lo aprobara, con ruta relativa al
   * proyecto. **No es lo mismo que lo que cambió en el disco** —una ruta que las guardas de
   * sitio rechazan sale aquí sin haberse escrito—: la verdad sobre el disco la tiene la
   * pestaña Revisión, con la ref de esta `sesion`. Ausente = no consta; `[]` = corrió y no
   * autorizó ninguna.
   */
  autorizadas?: string[];
  /**
   * El historial de lo que el desarrollador contestó mientras la tarea esperaba feedback.
   * Ausente = nunca se le pidió nada. `consumido` dice si ya se le mandó al agente.
   */
  feedback?: { texto: string; creado: string; consumido: boolean }[];
  /**
   * El veredicto del juez de QA, y con él la SALVEDAD: con qué condición de menos se
   * entregó. Redeclarado de `core/entrega.ts#VeredictoDeTarea`.
   *
   * **Es lo que hace que «Terminada» no signifique tres cosas a la vez**: el juez la aprobó
   * con el verificador en verde, se entregó sin NADA que verificar (una tarea de solo
   * lectura: eso es la salvedad), o —con `terminadaAMano`— la dio por buena una persona.
   * Ausente = a esta tarea no se le ha preguntado nunca al juez.
   *
   * Solo texto para leer: el juez no ve el contenido de ningún fichero (solo el encargo, las
   * rutas relativas de lo autorizado y los hallazgos del verificador), así que su prosa no
   * puede citarlo. `indeterminado` = no se entendió lo que contestó; no es verde.
   */
  veredicto?: {
    veredicto: "verde" | "rojo" | "indeterminado";
    resumen: string;
    hallazgos?: string[];
    salvedad?: string;
  };
  /**
   * La dio por buena una PERSONA con «Dar por bueno», no la puerta de entrega. Ausente = no
   * consta — que no es lo mismo que `false`.
   */
  terminadaAMano?: boolean;
}

/**
 * A dónde se puede ir desde cada estado de una tarea. Redeclarado de
 * `src/core/tareas.ts#TRANSICIONES` — la frontera del cliente (`src/web/frontera.test.ts`)
 * no deja importar de `src/`, así que esto se compara por TEXTO contra el host
 * (`tipos.test.ts`), igual que los literales `tipo:`/`clase:` de más abajo.
 *
 * Es lo que `AccionesDeTarea.tsx` usa para decidir qué botón ofrecer: sin esto, esa pieza
 * tendría que adivinar la regla o copiarla a mano, que es exactamente la clase de
 * divergencia que esta tarea existe para cerrar.
 */
export const TRANSICIONES: Readonly<Record<TareaDelCable["estado"], readonly TareaDelCable["estado"][]>> = {
  nuevo: ["en-proceso", "requiere-atencion"],
  "en-proceso": ["terminada", "requiere-atencion"],
  "requiere-atencion": ["nuevo", "terminada"],
  terminada: [],
};

export interface ProveedorDeModelos {
  id: string;
  /** Cómo se escribe. Lo pone el servidor: capitalizar el id aquí daría «Xai». */
  nombre: string;
  /** Lo declaró el usuario (`custom:<slug>`), no viene de serie. */
  personalizado?: boolean;
  /** Su URL base, solo en los personalizados. */
  baseUrl?: string;
  credencial: "puesta" | "falta" | "nativa";
  /** La credencial está en `auth.json` y por tanto se puede borrar desde aquí. Una que solo
   *  viene del entorno no lo lleva: desexportar la shell de nadie no está a nuestro alcance. */
  enFichero?: boolean;
  modelos?: { id: string; nombre?: string }[];
  error?: string;
}

export type MensajeDelCliente =
  | { clase: "prosa"; texto: string }
  /**
   * «Ponme este modelo», dicho por un control: `proveedor/modelo` y nada más. El cliente no
   * manda comandos — ni se apunta actos de usuario que nadie tecleó, ni habla en la
   * sintaxis de otra piel. Cómo se aplica es cosa del servidor.
   */
  | { clase: "modelo"; id: string }
  /** Abrir una sesión de un proyecto: la nombrada, o una NUEVA si no se nombra ninguna. */
  | { clase: "sesion"; proyecto: string; sesion?: string }
  /** Borrar una sesión guardada, o ponerle nombre, desde el menú de su fila en la barra.
   *  Verbo aparte de abrir: estos dos ESCRIBEN, y borrar puede cerrar la consola abierta. */
  | { clase: "sesionAccion"; accion: "borrar"; proyecto: string; sesion: string }
  | { clase: "sesionAccion"; accion: "renombrar"; proyecto: string; sesion: string; titulo: string }
  /** Qué proyectos de un entorno se enseñan en la barra. Vacío = ninguno, que es elección. */
  | { clase: "entorno"; accion: "visibles"; entorno: string; proyectos: string[] }
  /** Cambiar de entorno activo: el de cuyos proyectos se habla. */
  | { clase: "entorno"; accion: "activo"; entorno: string }
  /** «Dime los proyectos de este entorno», sin hacerlo activo: las casillas de su pestaña
   *  en Ajustes. Mudar el activo le cambiaría la barra a quien trabaja en otro servidor. */
  | { clase: "entorno"; accion: "proyectos"; entorno: string }
  | { clase: "respuesta"; texto: string }
  /**
   * La respuesta a `seleccionar`. **Sin `id` (o con `id: null`) es CANCELAR** — la misma
   * salida que en el terminal («número, Enter cancela»). El servidor lo traduce a
   * `undefined`; un id vacío o desconocido NO es cancelar, es un id que no existe. Ver
   * `web/servidor/transporte.ts` para el razonamiento entero: este fichero es su copia
   * declarada, y `tipos.test.ts` solo compara los literales `clase:`, no los CAMPOS de
   * dentro de una variante — o sea que esta pareja hay que cuidarla a mano.
   */
  | { clase: "eleccion"; id?: string | null }
  /** La respuesta a la pregunta secreta de `MensajeAlCliente` — otro mensaje, otra forma: aquel lleva `pregunta`, este `valor`. */
  | { clase: "secreto"; valor: string }
  /**
   * Un paso del alta, resuelto por el wizard. Con `paso` «proyecto» y sin `rama` no se
   * abre nada: pide las ramas del proyecto elegido, y el servidor contesta con otro
   * mensaje de alta. Sin campo para la clave de API, que va por «secreto».
   */
  | {
      clase: "alta";
      paso: PasoDelWizard;
      entorno?: { id: string; nombre: string; url: string };
      proyecto?: string;
      rama?: string;
    }
  /** «Dime qué modelos sirve este proveedor»: una llamada de red, y por eso bajo demanda. */
  | { clase: "catalogo"; proveedor: string }
  /**
   * Vuelve a mirar qué dispositivos hay; la respuesta llega por el SSE como `dispositivos`.
   * Con `ajustes`, además los guarda antes de medir.
   */
  | { clase: "dispositivos"; ajustes?: AjustesDeDispositivos; instalar?: NombreDeHerramienta }
  /** Con qué dispositivo trabaja la sesión. Viaja el ID; sin él, se quita la elección. */
  | { clase: "dispositivo"; id?: string }
  /**
   * «Habla con este dispositivo y dime si contesta.» Viaja el ID y nada más; el servidor lo
   * resuelve contra su última medida y decide qué comando lanzar. NO vuelve a medir: la
   * verificación vive dentro de la foto, y una medida nueva se llevaría la que se acaba de
   * hacer. La respuesta llega como un `dispositivos` con ese dispositivo ya verificado.
   */
  | { clase: "conexion"; id: string }
  /** Borrar la credencial de `auth.json`. Guardar no pasa por aquí: la clave viaja por
   *  «secreto», contestando al `leerSecreto` que abre `/provider`. */
  | { clase: "credencial"; accion: "pedir" | "borrar"; proveedor: string }
  /**
   * Dar de alta o retirar un proveedor de modelos PERSONALIZADO: un endpoint compatible
   * con OpenAI que declara el usuario.
   *
   * La clave NO viaja aquí. El alta escribe nombre y URL en el `config.json` global, y la
   * credencial se pone después con el mismo `{clase:"credencial", accion:"pedir"}` que los
   * de serie — o sea, por el único mensaje del cable que la lleva. Que sean dos pasos y no
   * un formulario de tres campos es deliberado: un tercer campo con la clave dentro sería
   * un segundo camino para lo mismo, y el que menos garantías da.
   *
   * El identificador no se teclea: lo deriva el servidor del nombre
   * (`core/modelos.ts#slugDesdeNombre`). La baja va por ese identificador, que es lo que
   * la fila conoce.
   */
  | { clase: "proveedor"; accion: "alta"; nombre: string; baseUrl: string }
  | { clase: "proveedor"; accion: "baja"; slug: string }
  /**
   * Dar de alta, cambiar o borrar un subagente.
   *
   * `ambito` viaja explícito en vez de deducirse de si hay proyecto abierto: con uno
   * abierto valen los dos, y adivinar cuál quiere el usuario es cómo un «revisor» pensado
   * para todos los proyectos acaba escondido en uno.
   */
  | {
      clase: "agente";
      accion: "guardar" | "borrar";
      ambito: "global" | "proyecto";
      agente: AgenteDelCable;
    }
  /** Parar el turno en vuelo, dejando la sesión viva. */
  | { clase: "cancelar" }
  /** Pide lo que la sesión abierta ha tocado, o el parche de un fichero concreto. */
  | { clase: "revision"; ruta?: string }
  | { clase: "arbol" }
  | { clase: "fichero"; ruta: string }
  /** El contenido de un artefacto de la sesión abierta, por su NOMBRE: la carpeta la compone
   *  el servidor con el id del hilo, y una ruta del cliente sería negociar la barrera. */
  | { clase: "artefacto"; nombre: string }
  /** Ejecuta o cancela un paso de receta. Viajan el nombre y el número, nunca un comando. */
  | { clase: "receta"; id: string; paso: number; accion: "ejecutar" | "cancelar" }
  /** Los modelos de un motor externo, bajo demanda: el de Codex arranca un proceso. */
  | { clase: "modelosDeMotor"; motor: string }
  /**
   * Las acciones sobre una tarea. Viaja el ID del proyecto y su nombre, NUNCA su raíz: es
   * una ruta de la máquina, y el cable puede ir por un túnel.
   */
  /**
   * `borrador` es el identificador bajo el que ya se subieron los adjuntos por
   * `POST /adjunto` — los bytes tienen que estar en disco ANTES de crear la tarea, porque
   * crear la encola y el corredor puede arrancarla en el acto. El servidor lo ADOPTA como
   * id de la tarea si es un segmento llano y no es ya una tarea; los adjuntos los lee del
   * disco, nunca de lo que diga el cliente.
   */
  | { clase: "tarea"; accion: "crear"; proyecto: string; peticion: string; encargo: string; borrador?: string }
  | { clase: "tarea"; accion: "augmentar"; proyecto: string; peticion: string; borrador?: string }
  /** «Se edita la tarea y se agrega el feedback del usuario»: la respuesta a una tarea
   *  «esperando feedback», que la devuelve al lazo en su MISMO hilo. */
  | { clase: "tarea"; accion: "feedback"; id: string; texto: string }
  | { clase: "tarea"; accion: "reintentar" | "descartar" | "terminar"; id: string }
  /** Cambia el tope de concurrencia de la cola de tareas. */
  | { clase: "tareas"; concurrencia: number }
  /**
   * Empezar (`ver: true`) o dejar de mirar en vivo lo que hace una tarea.
   *
   * `cliente` es el identificador de ESTA conexión del SSE, y lo pone `conexion.ts` y no
   * quien pulsa el botón: el SSE y el `POST /accion` son dos peticiones distintas, así que
   * sin él el servidor no sabría a qué pestaña engancharle la mirada — y tendría que
   * emitirle el transcript de la tarea a todo el mundo.
   */
  | { clase: "mirar"; tarea: string; ver: boolean; cliente: string }
  | { clase: "decision"; decisiones: Record<string, string> };

/**
 * Las cuatro clases de destino en que se prueba una app, y qué se mira de cada una.
 * Redeclarado de `core/settings.ts`. **Ausente = no se ha elegido**, y entonces se miran
 * todos; distinguirlo de un `false` es lo que permite que apagar signifique algo.
 */
export const PLATAFORMAS_DE_DISPOSITIVO = ["android", "androidEmulador", "ios", "iosSimulador"] as const;

export type PlataformaDeDispositivo = (typeof PLATAFORMAS_DE_DISPOSITIVO)[number];

export type AjustesDeDispositivos = { [K in PlataformaDeDispositivo]?: boolean };

/** ¿Se mira este destino? Ausente = sí. La misma función que el host (`core/settings.ts`). */
export function seMira(ajustes: AjustesDeDispositivos | undefined, plataforma: PlataformaDeDispositivo): boolean {
  return ajustes?.[plataforma] !== false;
}

/** Redeclarado de `core/dispositivos.ts` (ver la cabecera de este fichero). */
export type SistemaOperativo = "mac" | "windows" | "linux" | "otro";

/** El dispositivo preferido de una sesión. Redeclarado de `web/servidor/sesiones.ts`. */
export interface DispositivoElegido {
  id: string;
  nombre: string;
  plataforma: "android" | "ios";
  clase: "emulador" | "simulador" | "fisico";
}

/** Redeclarado de `core/dispositivos.ts`. */
export type NombreDeHerramienta = "adb" | "emulator" | "xcrun" | "devicectl";

export interface Herramienta {
  nombre: NombreDeHerramienta;
  estado: "ok" | "no-encontrada" | "fallo" | "no-aplica" | "desactivada";
  /** Cómo se instala si falta. `automatico` = xonecode puede lanzarlo él. */
  instalar?: { comando: string; automatico: boolean };
  /** Sin `ruta`: se queda en el host, es una ruta del home del usuario. */
  detalle?: string;
}

export interface Dispositivo {
  id: string;
  nombre: string;
  plataforma: "android" | "ios";
  clase: "emulador" | "simulador" | "fisico";
  estado: "conectado" | "arrancado" | "apagado" | "sin-autorizar" | "offline" | "no-disponible";
  detalle?: string;
  /**
   * Lo que contestó al VERIFICAR la conexión. Ausente = nadie lo ha verificado en esta foto,
   * nunca «no responde». Vive con el informe, así que una medida nueva se lo lleva.
   */
  verificado?: { ok: boolean; detalle: string; medido: string };
}

/** Un paso de una receta, redeclarado como todo lo de este fichero. */
export interface PasoDeReceta {
  titulo: string;
  comandos: string[];
  nota?: string;
  /** Sale de la MEDIDA del servidor, no de recordar que se pulsó. */
  hecho: boolean;
  /** ¿Lo puede lanzar xonecode él? Solo lo que no puede pedir entrada. */
  ejecutable: boolean;
  porQueNo?: string;
  /** Lo que se acepta al pulsar. Aparte de `nota`: pulsar ES la aceptación. */
  acepta?: string;
}

export interface Receta {
  id: "android-emulador" | "ios-simulador";
  titulo: string;
  descripcion: string;
  pasos: PasoDeReceta[];
  completa: boolean;
  despues: string;
}

export interface InformeDeDispositivos {
  sistema: SistemaOperativo;
  herramientas: Herramienta[];
  dispositivos: Dispositivo[];
  avds: string[];
  /** Cómo conseguir lo que falta. Vacío si este sistema no tiene receta todavía. */
  recetas: Receta[];
  medido: string;
}
