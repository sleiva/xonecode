/**
 * El estado de presentación del cliente, SIN React — mismo pacto que `cli/tui/store.ts`:
 * los componentes solo pintan y la semántica se prueba sin montar nada.
 *
 * Una `reemision` SUSTITUYE el transcript entero en vez de fusionarlo. Es lo que hace que
 * reconectar sea idempotente: el servidor es la única fuente de verdad del transcript, y
 * fusionar obligaría a deduplicar por identidad de acto —que no tenemos— y duplicaría
 * líneas en cuanto una reconexión pillara al servidor a mitad de turno.
 *
 * Una `sustitucion` reemplaza el ÚLTIMO acto en vez de anexarlo. Existe porque `pielWeb`
 * avisa también de ACTUALIZACIONES: el cierre de una racha de tools reemplaza a su
 * apertura dentro del mismo acto `herramientas` (`core/actos.ts#conLineaDeTool`,
 * `web/servidor/transporte.ts#MensajeAlCliente`). El colapsador del motor escribe apertura
 * Y cierre porque stdio solo puede añadir; un store que anexara a ciegas pintaría las dos
 * líneas —«→ lee src/app.xne» y luego «→ lee ×3 — …»— para una sola racha, que es
 * exactamente lo que la TUI ya evita en `cli/tui/store.ts` con la misma sustitución.
 */
import { leerPlanesDelCable } from "./planesDelCable.js";
import { leerCambiosDelModelo } from "./cambiosDelModelo.js";
import { leerFotoDeColecciones } from "./fotoDeColecciones.js";
import type {
  Receta,
  FotoDeColecciones,
  PlanDelCable,
  CambiosDeUnaColeccion,
  PasoDeReceta,
  Acto,
  MensajeAlCliente,
  PasoDelWizard,
  FicheroTocado,
  FicheroDelProyecto,
  EstadoDeSync,
  AgenteDelCable,
  SkillDelCable,
  ConectorDelCable,
  FilaDeCatalogo,
  ToolDeConector,
  PruebaDeConector,
  TareaDelCable,
  ProveedorDeModelos,
  SelectorDeConsola,
  DecisionDeConsola,
  Dispositivo,
  Herramienta,
  InformeDeDispositivos,
  AjustesDeDispositivos,
  DispositivoElegido,
  ConsumoDeTurno,
  SesionDelCable,
  FaseDelLanzamiento,
  EstadoDelLanzamiento,
  Esfuerzo,
  EsfuerzoDelCable,
  ModoDeEscritura,
} from "./tipos.js";
import { PLATAFORMAS_DE_DISPOSITIVO, FASES_DEL_LANZAMIENTO, ESTADOS_DEL_LANZAMIENTO, ESFUERZOS, esAutenticacionDeConector } from "./tipos.js";

export interface EstadoDelCliente {
  actos: Acto[];
  conectado: boolean;
  /**
   * La espera de humano. `decision` presente = la respuesta es sí o no y la tarjeta no
   * tiene campo: es la forma que manda el servidor (`DecisionDeConsola`), no algo que se
   * adivine del enunciado. Ausente = pregunta de texto libre, que es lo de siempre.
   */
  pregunta?: { texto: string; decision?: DecisionDeConsola };
  /**
   * Los modelos, tal y como los cuenta el servidor: cuál está en vigor y qué hay.
   * Ausente = todavía no ha llegado el mensaje. NUNCA se deriva de un acto del transcript
   * ni se recuerda entre conexiones: al caerse el SSE se tira (`marcarDesconectado`) y la
   * reconexión lo vuelve a traer entero.
   */
  modelos?: {
    actual?: string;
    porDefecto?: string;
    proveedores: ProveedorDeModelos[];
    /** Lo que admite el modelo EN VIGOR. Ausente = no se pinta la pastilla de esfuerzo. */
    esfuerzo?: EsfuerzoDelCable;
  };
  /**
   * Los proyectos de cada entorno registrado que alguien ha consultado, por su id: las
   * casillas de su pestaña en Ajustes. Solo están los PEDIDOS —el activo no hace falta,
   * su lista viene en el `alta`—, y las tres respuestas se distinguen: entrada ausente es
   * «no se ha preguntado», `proyectos` es la lista y `error` es «no se pudo preguntar».
   *
   * **Se tira al caerse el cable** (`marcarDesconectado`), como `modelos`.
   */
  /**
   * Cómo acabó el último «Arrancar» de un emulador. AUSENTE = no se ha pedido ninguno en esta
   * conexión, que no es «salió bien». Se tira con cada foto pedida a mano, porque un acuse
   * viejo junto a una medida nueva es una contradicción en pantalla.
   */
  arranqueDeEmulador?: { avd: string; ok: boolean; detalle: string };
  proyectosPorEntorno?: Record<
    string,
    { proyectos?: { id: string; nombre: string; compartido?: boolean }[]; error?: string }
  >;
  /**
   * Cómo fue el último alta o baja de proveedor personalizado. El motivo llega por el cable
   * y no como acto de sistema porque la ventana de ajustes no pinta el transcript — mismo
   * motivo que el `aviso` del selector durante el alta. Se tira al caerse el cable: es un
   * acuse de una operación, no un estado.
   */
  proveedor?: { hecho: boolean; motivo?: string };
  /** Los subagentes y los `.md` que no se pudieron leer. Ausente = todavía no ha llegado el
   *  mensaje, que NO es lo mismo que «no hay ninguno»: la ventana lo distingue. */
  agentes?: { lista: AgenteDelCable[]; problemas: string[] };
  /**
   * Las skills en vigor y las carpetas que no cargan. Ausente = todavía no ha llegado el
   * mensaje, que NO es «no hay ninguna»: la ventana lo distingue, y el editor de un
   * subagente no puede pintar una lista de casillas vacía sobre un catálogo que no consta.
   */
  skills?: { lista: SkillDelCable[]; problemas: string[] };
  /**
   * El cuerpo de las skills que alguien ha abierto, por nombre.
   *
   * Aparte de la lista porque llega aparte: las de serie no mandan su cuerpo en la ráfaga
   * —son ficheros grandes que nadie puede editar— y se pide uno a uno. Un nombre con
   * `undefined` es «se pidió y no se pudo leer», que se DICE; un nombre ausente del mapa es
   * «todavía no se ha pedido».
   */
  cuerposDeSkill?: Record<string, string | undefined>;
  /**
   * Los conectores MCP: el catálogo y los que esta consola tiene AÑADIDOS, para la sección
   * de Ajustes. Ausente = todavía no ha llegado el mensaje —que en este caso puede ser
   * también «esta consola no tiene la opción puesta»—, así que la sección de Ajustes no se
   * pinta en absoluto, ni siquiera con un «Consultando…»: un control sin dato detrás no se
   * pinta. `ilegible`/`error` son del fichero en disco, no del cable.
   */
  conectores?: {
    catalogo: FilaDeCatalogo[];
    conectores: ConectorDelCable[];
    desconocidos: string[];
    ilegible?: true;
    error?: string;
  };
  /**
   * La cola de tareas en background. Ausente = todavía no ha llegado el mensaje: el kanban
   * dice que no ha llegado en vez de afirmar que no hay tareas. NO se tira al caerse el
   * cable (`marcarDesconectado`), por la misma regla que la foto de la máquina y el paso
   * de instalación en marcha: las tareas siguen corriendo en la máquina aunque este
   * navegador se desconecte.
   */
  /**
   * `corriendoAqui` es si las ejecuta ESTE proceso; `ejecutaOtroProceso` es si las ejecuta
   * otro, con **ausente = no se sabe**. Los dos, porque «no soy yo» manda a esperar y «no
   * hay nadie» dice que no va a pasar nada: colapsarlos hacía que el aviso mandara a esperar
   * a un proceso que puede no existir.
   */
  tareas?: {
    lista: TareaDelCable[];
    concurrencia: number;
    corriendoAqui: boolean;
    ejecutaOtroProceso?: boolean;
  };
  /**
   * Dónde se bajan las copias locales, tal como lo dice el servidor (`~/…` o absoluta).
   *
   * **Ausente = esta ejecución no lo dice**, y entonces Ajustes no pinta el campo: un
   * control sin dato detrás no se pinta, y una caja de texto vacía se leería como «no hay
   * ninguna carpeta puesta».
   */
  workspace?: string;
  /** ¿Se puede abrir un selector de carpeta en la máquina donde corre la consola? Ausente =
   *  no, y entonces el botón no se pinta: solo queda el campo de texto. */
  puedeElegirCarpeta?: boolean;
  /**
   * La carpeta que acaba de elegir el diálogo del sistema, para que el campo la recoja.
   *
   * Es un ACUSE con contador y no una cadena, porque la misma carpeta elegida dos veces
   * seguidas no cambiaría el valor y el campo no se enteraría de la segunda. `ruta` ausente
   * = canceló, y entonces el campo se queda como estaba — pero el acuse llega igual, que es
   * lo que apaga el «abriendo…».
   */
  carpetaElegida?: { n: number; ruta?: string };
  /**
   * El ENCARGO que el aumentador propuso para la tarea que se está creando, o el motivo por
   * el que no pudo.
   *
   * Ausente = nadie ha pedido ninguno todavía. **Nunca las dos cosas a la vez**: un encargo
   * y un fallo del mismo intento se contradicen, y el mensaje del servidor ya llega con uno
   * o con otro.
   *
   * **Se puede LIMPIAR, y hace falta**: este mensaje va a TODOS los clientes (el cable habla
   * con todos, no con el último), así que un encargo que pidió otra pestaña se quedaría aquí
   * y prerrellenaría el campo de la ventana de esta. La ventana lo limpia al abrirse.
   */
  encargoPropuesto?: { encargo?: string; error?: string };
  /**
   * Qué hay en la máquina para probar la app (`core/dispositivos.ts`), tal como lo midió el
   * servidor. Ausente = todavía no llegó: el escritorio dice «consultando…». NO se tira al
   * caerse el cable como `modelos`: es una foto con hora de la máquina, no un estado que el
   * servidor pueda haber cambiado sin decirlo, y la reconexión la vuelve a mandar igual.
   */
  dispositivos?: InformeDeDispositivos;
  /**
   * Qué destinos se miran (`settings.json`), como los cuenta el servidor. Ausente = todavía
   * no llegó ninguna foto; `{}` = nadie ha elegido y se miran todos. No se tira al caerse
   * el cable, por lo mismo que el informe: es configuración del equipo, no un estado en
   * vuelo.
   */
  ajustesDeDispositivos?: AjustesDeDispositivos;
  /**
   * El transcript EN VIVO de la tarea de fondo que se está mirando, y de cuál.
   *
   * Ausente = no se está mirando ninguna. Nunca se mezcla con `actos`: los actos de una
   * tarea de fondo no pueden aparecer en el chat de nadie, que es la regla que sostiene todo
   * esto — y por eso van etiquetados con el id de la tarea por el cable.
   *
   * **No es un segundo registro**: son los MISMOS actos que se guardan en el `.jsonl` de esa
   * sesión, así que cuando la tarea acabe, abrir su conversación enseña esto mismo.
   *
   * **Se tira al caerse el cable** (`marcarDesconectado`), como `modelos` y al contrario que
   * `tareas`: el enganche vive en el SERVIDOR y se va con el SSE, así que guardarla dejaría
   * un transcript congelado presentado como si siguiera en vivo.
   */
  mirada?: { tarea: string; actos: Acto[] };
  /** Hay un turno corriendo AHORA. Lo dice el servidor; el cliente no lo deduce. */
  turnoEnVuelo?: boolean;
  /**
   * Lo que lleva consumido la SESIÓN, en sus dos cuentas. Lo dice el servidor.
   *
   * Ausente es «no consta» —no hay sesión abierta, o el ejecutor es el de pega— y entonces
   * el contador no se pinta: un cero que nadie ha medido es la cifra inventada de siempre.
   */
  consumo?: {
    modelo: { entrada: number; salida: number; cache: number };
    externo: { entrada: number; salida: number; cache: number };
    /** Cuánto ocupa la ventana ahora, y su tope si se sabe. Otra pregunta que los acumulados. */
    ventana: { usado: number; tope?: number };
  };
  /**
   * Qué se está abriendo ahora mismo, si algo. Lo dice el servidor (`clase: "abriendo"`) y
   * no se deduce: entre el clic y el estado nuevo pasan de cientos de milisegundos a los
   * minutos de una descarga, y sin esto la interfaz se queda quieta.
   *
   * `entorno` es el cuarto caso y no una apertura: mudar el entorno activo tampoco cambia
   * nada hasta el final, y su `<select>` va controlado por el `alta` — así que sin esto se
   * queda clavado en el valor viejo toda la espera.
   */
  abriendo?: { proyecto?: string; sesion?: string; entorno?: string; descargando?: true };
  /**
   * Lo que la sesión ha tocado (pestaña Revisión). Ausente = todavía no se ha pedido. Los
   * TRES `via` se guardan: «sin-empezar» se tiraba y la pestaña se quedaba consultando.
   * Los parches se guardan por ruta según se piden: uno grande no se vuelve a traer por
   * plegar y desplegar la fila.
   */
  revision?: {
    via: "git" | "desde-apertura" | "sin-marca" | "sin-empezar";
    lista: FicheroTocado[];
    mezclados?: number;
  };
  parches?: Record<string, { texto: string; recortado: boolean }>;
  /**
   * El diff SEMÁNTICO de cada `.xne` desplegado en Revisión, por ruta y ya validado
   * (`cambiosDelModelo.ts`). Se tira con los parches: son la misma foto contada de otra forma.
   */
  modelosDelCambio?: Record<string, { cambios?: CambiosDeUnaColeccion[]; error?: string }>;
  /**
   * El árbol del proyecto abierto y los contenidos ya traídos, por ruta (pestaña Ficheros).
   * Son una FOTO del disco: se tiran con la sesión y sin cable, como los parches.
   */
  arbol?: { rutas: string[]; recortado: boolean; error?: string };
  contenidos?: Record<string, FicheroDelProyecto>;
  /**
   * La foto del modelo XOne del proyecto abierto (pestaña Colecciones), ya VALIDADA
   * (`fotoDeColecciones.ts`). Una foto del disco como el árbol: se tira con la sesión y sin
   * cable. Ausente = no se ha pedido; con `error` y sin `foto`, no se pudo leer.
   */
  colecciones?: { foto?: FotoDeColecciones; error?: string };
  /**
   * Los planes del proyecto abierto (pestaña Planes), ya validados (`planesDelCable.ts`). Se tiran
   * con la sesión y sin cable. `lista` vacía es «no hay planes», y entonces no hay pestaña.
   */
  planes?: { lista?: PlanDelCable[]; error?: string };
  /**
   * El estado de sincronización del proyecto abierto (pestaña CloudStudio). Ausente = no se
   * ha pedido todavía, y eso se dice: la pestaña arranca en «consultando».
   *
   * `proyecto` y `rama` ausentes NO son «cero pendientes»: son «este proyecto no está dado
   * de alta en CloudStudio», que es otra frase. Es la misma distinción que el resto del
   * estado hace entre ausente y vacío — rellenarlos con cadenas vacías las confundiría, y
   * un contador a cero que nadie ha medido es la cifra inventada de siempre.
   */
  sync?: EstadoDeSync;
  /**
   * Los modelos que ofrece cada MOTOR externo, por motor. Ausente = no se ha preguntado;
   * con `error`, se preguntó y no se pudo saber — que es distinto de «no tiene ninguno».
   */
  modelosDeMotor?: Record<string, { modelos: { id: string; nombre: string }[]; error?: string }>;
  /**
   * El paso de receta que se está ejecutando, o cómo acabó el último.
   *
   * Lo dice el SERVIDOR: la máquina es una y el proceso corre allí, así que el cliente no
   * deduce nada de haber pulsado — es la misma regla que el turno en vuelo. Se conserva al
   * caerse el cable (como la foto de la máquina): un `sdkmanager` sigue descargando aunque
   * este navegador se desconecte, y borrarlo diría que no pasó nada.
   */
  instalacion?: {
    receta: string;
    paso: number;
    titulo: string;
    estado: "corriendo" | "ok" | "fallo" | "cancelada" | "colgada";
    lineas: string[];
    ms: number;
    motivo?: string;
  };
  /**
   * El veredicto de «¿se puede lanzar la app del proyecto abierto?», que se PIDE
   * (`revisarLanzamiento`) y contesta el servidor a quien lo pidió. Ausente = todavía no ha
   * llegado, y eso se dice en pantalla («midiendo»), que NO es lo mismo que un veredicto en
   * `listo: false`: este último trae sus `faltas`.
   *
   * `faltas` son FRASES ya escritas por el servidor (`core/puedeLanzarse.ts#motivoDeBloqueo`):
   * el cliente las pinta tal cual y no compone ninguna causa a mano — el texto de por qué no
   * se puede lanzar vive donde vive la regla, y aquí solo se recorre.
   *
   * `medido` es la fecha de la medida, y es OBLIGATORIA: un veredicto sin fecha es una
   * promesa sin fecha, así que un `lanzable` que no la traiga se descarta ENTERO, como
   * `proyecto`, `listo` y `faltas` — y por el mismo motivo que `case "dispositivos"` descarta
   * su informe sin `medido`. Rellenarla con una cadena vacía sería estampar una medición que
   * nadie hizo. Y el tipo importa además para el empalme: así el `lanzable` del store es
   * asignable al `lanzable` del cable (`tipos.ts`), que la declara `string` sin `?`.
   */
  lanzable?: {
    proyecto: string;
    listo: boolean;
    faltas: string[];
    app?: string;
    dispositivo?: DispositivoElegido;
    medido: string;
  };
  /**
   * El recorrido del lanzamiento, o cómo acabó el último.
   *
   * Lo dice el SERVIDOR fase a fase, como el paso de receta: la máquina es una y el proceso
   * corre allí, así que el cliente no deduce nada de haber pulsado. `estado: "corriendo"` es
   * lo que permite pintar en qué fase va en vez de un botón apagado sin explicación, y
   * `lineas` es la COLA del recorrido —lo que suelta `adb` son miles de líneas y el
   * servidor ya la recorta, así que aquí no se recorta otra vez—.
   *
   * **Se tira al caerse el cable** (`marcarDesconectado`), y no por simetría con las fotos:
   * un recorrido en `corriendo` para siempre apagaría el botón de una pestaña que ya no
   * recibe el «terminó».
   */
  lanzamiento?: {
    proyecto?: string;
    dispositivo?: DispositivoElegido;
    fase: FaseDelLanzamiento;
    estado: EstadoDelLanzamiento;
    lineas: string[];
    ms: number;
    motivo?: string;
  };
  /**
   * Los ARTEFACTOS ya traídos, por su ruta virtual (`/artefactos/<nombre>`).
   *
   * Aparte de `contenidos` porque son otra cosa: no son del proyecto, viven con la sesión y
   * su LISTA no sale de aquí —sale de los actos del transcript, que ya la traen y sobreviven
   * a reabrir—. Esto es solo el contenido que se ha pedido para verlo, y se tira con la
   * sesión y sin cable por lo mismo que los contenidos: son de la conversación de antes.
   */
  artefactos?: Record<string, FicheroDelProyecto>;
  selector?: {
    titulo: string;
    opciones: { id: string; etiqueta: string; detalle?: string }[];
    /** El motivo que manda el servidor (`SelectorDeConsola.aviso`). Ausente = no hay. */
    aviso?: string;
  };
  secreto?: { pregunta: string };
  aprobacion?: { pendientes: unknown[]; ficheros: Record<string, string>; diffs: Record<string, unknown[]> };
  /**
   * El saludo, de la clase «bienvenida» — llega ANTES que `alta`, porque el nombre no
   * depende de ninguna cuenta (ver `tipos.ts`). `Bienvenida.tsx` prefiere este campo y
   * cae a `alta?.nombre` si por lo que sea no ha llegado (`App.tsx`): los dos mensajes
   * llevan el mismo dato, y esto es solo el que llega primero.
   */
  nombre?: string;
  /**
   * El alta que falta, tal cual la manda el servidor al conectar y tras cada paso. Ausente
   * hasta que llega el mensaje: mientras no se sabe qué falta, el wizard no se pinta —
   * enseñar un formulario vacío «por si acaso» sería inventarse el estado del alta.
   */
  alta?: {
    pasos: PasoDelWizard[];
    /** Qué prepara el arranque. AUSENTE = listo: es lo que decide si se sale del lienzo. */
    preparando?: string;
    proveedores: { id: string; nombre: string }[];
    entornos: { id: string; nombre: string; url: string }[];
    /** Los REGISTRADOS (`settings.json`), no los ofrecidos: es lo que lista la ventana de
     *  ajustes y lo que la barra debe enseñar. Vacío mientras no haya ninguno. */
    registrados: { id: string; nombre: string; url: string; proyectos?: string[]; copias?: number }[];
    proyectos: {
      id: string;
      nombre: string;
      /** La fila de la barra, tal cual viaja en el alta (`SesionDelCable`). Se declara una vez
       *  y se usa aquí y en el prop de `Barra`: una segunda copia de la misma fila es un campo
       *  que un día se añade en un sitio y no en el otro, y el de la barra sale mudo. */
      sesiones?: SesionDelCable[];
      local?: boolean;
      /** Alguna sesión de este proyecto trabaja AHORA. Ausente = no consta. */
      trabajando?: true;
      /** Compartido CONTIGO. Ausente = el servidor no lo dijo, que no es «es tuyo». */
      compartido?: boolean;
    }[];
    ramas: string[];
    /** Lo que falló en el paso anterior, para que lo diga el paso y no solo las Trazas. */
    aviso?: string;
    /** De qué entorno son los `proyectos`. Ausente = de ninguno todavía; el cliente NO
     *  supone «el primero», que es lo que hacía y se rompía con dos entornos. */
    entornoActivo?: string;
    /** Cuál está abierto y cuál es su sesión, para marcarlos en la barra. Ausentes = no se
     *  sabe, y entonces no se marca nada en vez de marcar el primero. */
    proyectoActivo?: string;
    sesionActiva?: string;
    /** Con qué dispositivo trabaja la sesión. Ausente = ninguno elegido. */
    dispositivoActivo?: DispositivoElegido;
    /** La sesión abierta es una relectura que el agente no recuerda. Ausente = no. */
    historica?: boolean;
    /** El modo de escritura de la sesión abierta. Ausente = no hay sesión, y entonces la
     *  pastilla no se pinta: nunca significa «supervisado». */
    modoDeEscritura?: ModoDeEscritura;
    /** Lo que ya estaba sin commitear al abrir esta consola. Ausente = nada que decir
     *  (limpio, sin git, o no se pudo medir): el chat no pinta ningún aviso. */
    trabajoAlAbrir?: { ficheros: string[]; total: number };
    /** El saludo de la bienvenida. Ausente = sin nombre que saludar (`Bienvenida.tsx`). */
    nombre?: string;
    /** Si hay un proyecto abierto en esta conexión — `App.tsx` lo usa para decidir entre
     *  la maqueta completa y `SinProyectoAbierto`. */
    proyectoAbierto: boolean;
    /** El modo del proyecto abierto, para la pastilla de la cabecera. Ausente = el
     *  servidor no lo sabe, y entonces no se pinta pastilla (`Cabecera.tsx`). */
    modo?: "offline" | "cloud";
    /** La línea de versión ya formateada, para el pie de la barra. Ausente = no consta. */
    version?: string;
  };
}

/**
 * Los cuatro interruptores del cable, campo a campo y SOLO booleanos.
 *
 * Un `"false"` de cadena es verdadero en JavaScript, y esa trampa ya se pagó dos veces en
 * este repo (el `soloLectura` de un subagente y el `compartido` de CloudStudio). Lo que no
 * venga como booleano se queda ausente, que significa «se mira»: el lado que no esconde
 * nada.
 */
function ajustesDelCable(candidato: unknown): AjustesDeDispositivos {
  if (typeof candidato !== "object" || candidato === null) return {};
  const c = candidato as Record<string, unknown>;
  const salida: AjustesDeDispositivos = {};
  for (const plataforma of PLATAFORMAS_DE_DISPOSITIVO) {
    if (typeof c[plataforma] === "boolean") salida[plataforma] = c[plataforma] as boolean;
  }
  return salida;
}

/** La foto del dispositivo elegido: entera o nada. */
function esDispositivoElegido(v: unknown): v is DispositivoElegido {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d.id === "string" &&
    typeof d.nombre === "string" &&
    (d.plataforma === "android" || d.plataforma === "ios") &&
    (d.clase === "emulador" || d.clase === "simulador" || d.clase === "fisico")
  );
}

/**
 * ¿Es un aviso de trabajo sin commitear que se pueda PINTAR?
 *
 * Exige la lista y el total, y además que la lista traiga algo: sin nombres, el aviso
 * afirmaría que ya había cambios y no podría decir cuáles — que es exactamente el contador
 * a secas que este repo no admite como aviso.
 */
function esTrabajoAlAbrir(v: unknown): v is { ficheros: string[]; total: number } {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Record<string, unknown>;
  return (
    Array.isArray(t.ficheros) &&
    t.ficheros.length > 0 &&
    t.ficheros.every((f) => typeof f === "string") &&
    typeof t.total === "number"
  );
}

const ESTADO_INICIAL: EstadoDelCliente = { actos: [], conectado: false };

const PASOS: ReadonlySet<string> = new Set<PasoDelWizard>(["cuenta", "entorno", "proyecto"]);

// `satisfies Record<Acto["tipo"], true>` es lo que hace que añadir un tipo a `Acto` en
// `tipos.ts` sin añadirlo aquí falle en `tsc`, no en tiempo de ejecución con un mensaje
// bien formado silenciosamente descartado.
const TIPOS_DE_ACTO = {
  usuario: true,
  asistente: true,
  razonamiento: true,
  herramientas: true,
  sistema: true,
  artefacto: true,
  consulta: true,
  fase: true,
  fin: true,
  sincronizacion: true,
  error: true,
  verificacion: true,
} satisfies Record<Acto["tipo"], true>;

/**
 * Nada de lo que llega por el cable puede darse por bien formado: un `JSON.parse` de un
 * `EventSource` es responsabilidad de quien lo emite, y el emisor es OTRO proceso que
 * puede tener un bug, una versión distinta, o un proxy de por medio corrompiendo el
 * cuerpo. `aplicar` no puede lanzar nunca, así que cada rama valida su forma mínima antes
 * de mutar y descarta en silencio lo que no encaja — sin eso, un mensaje malformado
 * tumbaría el `onmessage` del `EventSource` y con él la conexión entera.
 */
function esActo(valor: unknown): valor is Acto {
  return (
    typeof valor === "object" &&
    valor !== null &&
    "tipo" in valor &&
    typeof (valor as { tipo: unknown }).tipo === "string" &&
    (valor as { tipo: string }).tipo in TIPOS_DE_ACTO
  );
}

function esSelector(valor: unknown): valor is SelectorDeConsola {
  if (typeof valor !== "object" || valor === null) return false;
  const s = valor as { titulo?: unknown; opciones?: unknown };
  return (
    typeof s.titulo === "string" &&
    Array.isArray(s.opciones) &&
    s.opciones.every(
      (o) => typeof o === "object" && o !== null && typeof (o as { id?: unknown }).id === "string" &&
        typeof (o as { etiqueta?: unknown }).etiqueta === "string"
    )
  );
}

/**
 * La FORMA de una pregunta de sí o no: `lineas` es una lista de cadenas, y lo que no sea
 * eso la descarta ENTERA. Descartarla deja la pregunta con su campo de texto, que sigue
 * siendo una salida honesta —lo que se teclee va a `interpretAnswer`, donde `"s"` autoriza
 * y todo lo demás rechaza—, mientras que pintar los botones sobre una lista a medias sería
 * decidir sobre un plan que no es el plan.
 */
/**
 * Lo que la comprobación garantiza de verdad: una línea con TEXTO. `cambio` puede ser
 * cualquier cosa —el tipo dice `unknown` a propósito, para que el guard no prometa más de lo
 * que ha mirado—, y quien lo convierte es `cambioDeLinea`.
 */
type DecisionCruda = { readonly lineas: readonly { texto: string; cambio?: unknown }[] };

function esDecision(valor: unknown): valor is DecisionCruda {
  if (typeof valor !== "object" || valor === null) return false;
  const lineas = (valor as { lineas?: unknown }).lineas;
  return Array.isArray(lineas) && lineas.every(esLineaConTexto);
}

/**
 * El TEXTO es lo que decide si una línea se entiende: sin él no se puede enseñar. Y no se
 * exige nada más — ver `esDecision`, un nivel más arriba, para por qué un `cambio` que no se
 * entiende NO tira ni la línea ni la decisión.
 */
function esLineaConTexto(valor: unknown): valor is { texto: string; cambio?: unknown } {
  if (typeof valor !== "object" || valor === null) return false;
  return typeof (valor as { texto?: unknown }).texto === "string";
}

/**
 * El `cambio` de una línea, si es uno de los tres; `undefined` si no se entiende o no venía.
 *
 * Que un valor raro acabe en `undefined` y no en un rechazo es deliberado: el color es un
 * adorno sobre un texto que ya se entiende, y tirar la línea entera escondería algo que se
 * está autorizando. Tirar la DECISIÓN —que es la otra mitad— devolvería el campo de texto,
 * donde teclear «s» autoriza igual: la mitad peligrosa del mismo fallo, y la que este repo
 * ya se ha comido otras veces por copiar campos a medias.
 */
function cambioDeLinea(valor: unknown): "nuevo" | "modificado" | "borrado" | undefined {
  return valor === "nuevo" || valor === "modificado" || valor === "borrado" ? valor : undefined;
}

/** Un proveedor del mensaje «modelos», comprobado campo a campo como todo lo que entra. *//** Un agente del cable, comprobado campo a campo: lo que llega por HTTP no se cree. */
function esAgenteDelCable(valor: unknown): valor is AgenteDelCable {
  const a = valor as Partial<AgenteDelCable> | null;
  return (
    typeof a === "object" &&
    a !== null &&
    typeof a.nombre === "string" &&
    typeof a.descripcion === "string" &&
    typeof a.motor === "string" &&
    typeof a.soloLectura === "boolean" &&
    Array.isArray(a.skills) &&
    typeof a.instrucciones === "string"
  );
}

/**
 * `origen` se comprueba por VALOR y no solo por tipo: es lo que separa las dos pestañas y lo
 * que decide si una skill lleva botón de borrar. Un tercer literal desconocido no puede
 * decidir eso, y con un `typeof === "string"` habría caído en «tuya» — todo en verde y una
 * papelera encima de un fichero del paquete.
 */
function esSkillDelCable(valor: unknown): valor is SkillDelCable {
  const s = valor as Partial<SkillDelCable> | null;
  return (
    typeof s === "object" &&
    s !== null &&
    typeof s.nombre === "string" &&
    typeof s.descripcion === "string" &&
    (s.origen === "serie" || s.origen === "global" || s.origen === "proyecto") &&
    typeof s.tokens === "number" &&
    Array.isArray(s.ficheros)
  );
}

/** Una entrada del catálogo de conectores, comprobada campo a campo. */
function esEntradaDeCatalogoDeConector(valor: unknown): valor is FilaDeCatalogo {
  const c = valor as Partial<{ id: unknown; nombre: unknown; descripcion: unknown; autenticacion: unknown }> | null;
  return (
    typeof c === "object" &&
    c !== null &&
    typeof c.id === "string" &&
    typeof c.nombre === "string" &&
    typeof c.descripcion === "string" &&
    esAutenticacionDeConector(c.autenticacion)
  );
}

/** Igual que `esSkillDelCable`: `estado` se comprueba por VALOR, no solo por tipo — un
 *  literal que no sea uno de los tres no puede decidir qué pastilla ni qué botones. */
function esConectorDelCable(valor: unknown): valor is ConectorDelCable {
  const c = valor as Partial<ConectorDelCable> | null;
  return (
    typeof c === "object" &&
    c !== null &&
    typeof c.id === "string" &&
    (c.estado === "sin-autorizacion" || c.estado === "falta-autorizar" || c.estado === "autorizado")
  );
}

function esToolDeConector(valor: unknown): valor is ToolDeConector {
  const t = valor as Partial<ToolDeConector> | null;
  return typeof t === "object" && t !== null && typeof t.nombre === "string";
}

/**
 * La prueba de un conector, campo a campo y hasta el fondo de `tools`: un campo de más en
 * la propia prueba, o en una tool suya, no se propaga — la misma disciplina que el resto de
 * esta lista blanca, un nivel más adentro.
 */
function pruebaDeConectorDelCable(valor: unknown): PruebaDeConector | undefined {
  const p = valor as Partial<{ cuando: unknown; ok: unknown; tools: unknown; motivo: unknown }> | null;
  if (typeof p !== "object" || p === null || typeof p.cuando !== "number") return undefined;
  if (p.ok === true && Array.isArray(p.tools)) {
    return {
      cuando: p.cuando,
      ok: true,
      tools: p.tools.filter(esToolDeConector).map((t) => ({
        nombre: t.nombre,
        ...(typeof t.descripcion === "string" ? { descripcion: t.descripcion } : {}),
        // `soloLectura` es `boolean | undefined`: ausente = «el servidor no lo anota», y
        // eso es distinto de `false` —«lo anotó y dice que escribe»—. `=== true ? … : {}`
        // fundía las dos, así que un `false` anotado se leía como si no constara nada.
        ...(typeof t.soloLectura === "boolean" ? { soloLectura: t.soloLectura } : {}),
      })),
    };
  }
  if (p.ok === false && typeof p.motivo === "string") {
    return { cuando: p.cuando, ok: false, motivo: p.motivo };
  }
  return undefined;
}

function esProveedorDeModelos(valor: unknown): valor is ProveedorDeModelos {
  if (typeof valor !== "object" || valor === null) return false;
  const p = valor as {
    id?: unknown; nombre?: unknown; credencial?: unknown; modelos?: unknown; error?: unknown;
    personalizado?: unknown; baseUrl?: unknown;
  };
  if (typeof p.id !== "string") return false;
  if (typeof p.nombre !== "string") return false;
  if (p.credencial !== "puesta" && p.credencial !== "falta" && p.credencial !== "nativa") return false;
  if (p.error !== undefined && typeof p.error !== "string") return false;
  if (p.personalizado !== undefined && typeof p.personalizado !== "boolean") return false;
  if (p.baseUrl !== undefined && typeof p.baseUrl !== "string") return false;
  if ((p as { enFichero?: unknown }).enFichero !== undefined && typeof (p as { enFichero?: unknown }).enFichero !== "boolean") {
    return false;
  }
  if (p.modelos !== undefined) {
    if (!Array.isArray(p.modelos)) return false;
    if (!p.modelos.every((m) => typeof m === "object" && m !== null && typeof (m as { id?: unknown }).id === "string")) {
      return false;
    }
  }
  return true;
}

/** Un fichero tocado, comprobado campo a campo como todo lo que entra por el cable. */
function esFicheroTocado(valor: unknown): valor is FicheroTocado {
  if (typeof valor !== "object" || valor === null) return false;
  const f = valor as {
    ruta?: unknown;
    clase?: unknown;
    mas?: unknown;
    menos?: unknown;
    sinCommitear?: unknown;
  };
  if (typeof f.ruta !== "string") return false;
  if (f.clase !== "nuevo" && f.clase !== "modificado" && f.clase !== "borrado") return false;
  if (f.mas !== undefined && typeof f.mas !== "number") return false;
  if (f.menos !== undefined && typeof f.menos !== "number") return false;
  // Solo el booleano `true`, la trampa de siempre: la cadena `"false"` es verdadera en
  // JavaScript, y aquí marcaría como «no commiteado» algo que sí lo está.
  if (f.sinCommitear !== undefined && f.sinCommitear !== true) return false;
  return true;
}

/**
 * El veredicto del juez de una tarea, campo a campo, o `{}` si no vino uno usable.
 *
 * Devuelve el TROZO a esparcir y no el objeto, para que «no vino» siga siendo AUSENTE: un
 * `veredicto: undefined` en el estado se leería igual al pintar, pero rompería la
 * comparación de campos que vigila esta lista blanca (F1 de la revisión final) y, sobre
 * todo, un `{veredicto: "verde"}` sintetizado a la mínima afirmaría que el juez aprobó
 * algo que nunca vio.
 *
 * Un veredicto que no es ninguno de los tres se descarta ENTERO: dejar el resumen sin el
 * veredicto pintaría las palabras del juez sin decir si aprobó o no.
 */
function veredictoDeTarea(valor: unknown): { veredicto?: TareaDelCable["veredicto"] } {
  if (typeof valor !== "object" || valor === null) return {};
  const v = valor as Record<string, unknown>;
  if (v["veredicto"] !== "verde" && v["veredicto"] !== "rojo" && v["veredicto"] !== "indeterminado") return {};
  if (typeof v["resumen"] !== "string") return {};
  return {
    veredicto: {
      veredicto: v["veredicto"],
      resumen: v["resumen"],
      ...(Array.isArray(v["hallazgos"])
        ? { hallazgos: (v["hallazgos"] as unknown[]).filter((h): h is string => typeof h === "string") }
        : {}),
      ...(typeof v["salvedad"] === "string" ? { salvedad: v["salvedad"] } : {}),
    },
  };
}

/** Un número del cable, o 0. Un `NaN` o un `Infinity` vienen de un `JSON.parse` de la red y
 *  dejarían la cifra ilegible en pantalla en vez de dar un error que alguien pueda ver. */
function numero(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Una cuenta de tokens `{entrada, salida, cache}` de lo que venga por el cable. */
function cuenta(v: unknown): { entrada: number; salida: number; cache: number } {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  return { entrada: numero(o["entrada"]), salida: numero(o["salida"]), cache: numero(o["cache"]) };
}

/**
 * El acumulado de una SESIÓN, tal como llega dentro de la fila del alta. `undefined` = «no
 * consta», que es lo que hay que distinguir de un `{0,0}`.
 *
 * Dos reglas, y las dos por el mismo motivo: esto viene de la red y de un `JSON.parse`.
 *
 * - Lo que no es un objeto se DESCARTA entero, y no se convierte en ceros. Unos ceros
 *   AFIRMAN una medida —`{0,0}` es lo que `hayCosteQueEnsenar` filtra—, y una cadena o un
 *   `null` colados aquí no son una sesión que no gastó: son un dato que no llegó. Una LISTA
 *   tampoco es un objeto de estos, y `typeof` la deja pasar; por eso se mira con
 *   `Array.isArray`, o un `[]` se convertiría en un `{0,0}` con toda la cara.
 * - Y la `ventana` se TIRA aunque venga. Es «cuánto ocupa el historial AHORA», y dentro del
 *   acumulado de una sesión cerrada sería un «ahora» congelado que alguien leería como el de
 *   hoy. El host ya no la escribe (`core/actos.ts#acumularTotales`); esto es la segunda
 *   aplicación de la misma regla, y la que decide qué se pinta es la que se queda corta.
 */
function consumoDeSesion(v: unknown): ConsumoDeTurno | undefined {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  return { modelo: cuenta(o["modelo"]), externo: cuenta(o["externo"]) };
}

/** `{id, titulo}`: una sesión guardada. NO vale `sonIdentidades` —una sesión no tiene
 *  `nombre`, tiene título— y usarla dejaba la lista siempre vacía sin decir por qué. */
function sonSesiones(
  valor: unknown
): valor is {
  id: string;
  titulo: string;
  ultimoTurno?: unknown;
  deTarea?: unknown;
  trabajando?: unknown;
  consumo?: unknown;
}[] {
  return (
    Array.isArray(valor) &&
    valor.every(
      (s) =>
        typeof s === "object" &&
        s !== null &&
        typeof (s as { id?: unknown }).id === "string" &&
        typeof (s as { titulo?: unknown }).titulo === "string"
    )
  );
}

/** `{id, nombre}` y nada más: lo que el mensaje promete. Lo demás se descarta entero. */
function sonIdentidades(valor: unknown): valor is { id: string; nombre: string }[] {
  return (
    Array.isArray(valor) &&
    valor.every(
      (o) =>
        typeof o === "object" &&
        o !== null &&
        typeof (o as { id?: unknown }).id === "string" &&
        typeof (o as { nombre?: unknown }).nombre === "string"
    )
  );
}

function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

export function crearStoreDelCliente(): {
  leer: () => EstadoDelCliente;
  aplicar: (mensaje: unknown) => void;
  marcarConectado: () => void;
  marcarDesconectado: () => void;
  contestarPregunta: () => void;
  contestarSecreto: () => void;
  /** Con el selector que se contestó, retira SOLO ese (ver la implementación: el paso de
   *  cuenta encadena selectores sin viaje de red entre ellos). Sin él, retira lo que haya. */
  contestarSelector: (contestado?: EstadoDelCliente["selector"]) => void;
  cerrarAprobacion: () => void;
  /** Tira el encargo propuesto. Ver `EstadoDelCliente.encargoPropuesto`. */
  limpiarEncargoPropuesto: () => void;
  /**
   * Cierra el panel de la mirada sin esperar al servidor.
   *
   * Hace falta por lo mismo que `contestarPregunta`: el servidor no manda ningún «ya no
   * mira» al desengancharse, así que nadie retiraría el transcript y el panel se quedaría
   * pintado y quieto — indistinguible de una tarea que se ha colgado.
   */
  dejarDeMirar: () => void;
  suscribir: (escucha: () => void) => () => void;
} {
  let estado: EstadoDelCliente = ESTADO_INICIAL;
  const suscriptores: (() => void)[] = [];

  // Objeto NUEVO en cada mutación (nunca `estado.x = y`): es lo que permite a
  // `useSyncExternalStore` (futuro consumidor de `suscribir`) detectar el cambio por
  // identidad de referencia sin que este fichero sepa que React existe.
  const mutar = (cambio: Partial<EstadoDelCliente>): void => {
    estado = { ...estado, ...cambio };
    for (const escucha of suscriptores) escucha();
  };

  return {
    leer: () => estado,

    aplicar(mensaje: unknown): void {
      if (typeof mensaje !== "object" || mensaje === null || !("clase" in mensaje)) return;
      const clase = (mensaje as { clase: unknown }).clase;

      switch (clase) {
        case "acto": {
          const acto = (mensaje as Partial<Extract<MensajeAlCliente, { clase: "acto" }>>).acto;
          if (!esActo(acto)) return;
          mutar({ actos: [...estado.actos, acto] });
          return;
        }
        case "sustitucion": {
          const acto = (mensaje as Partial<Extract<MensajeAlCliente, { clase: "sustitucion" }>>).acto;
          if (!esActo(acto)) return;
          // Transcript vacío: el servidor no manda `sustitucion` sin un último acto que
          // sustituir (`transporte.ts`), así que esto es solo la red bajo un cable que ya
          // no se fía de nada — cae a anexar en vez de perder el mensaje.
          mutar({ actos: estado.actos.length === 0 ? [acto] : [...estado.actos.slice(0, -1), acto] });
          return;
        }
        case "reemision": {
          const actos = (mensaje as Partial<Extract<MensajeAlCliente, { clase: "reemision" }>>).actos;
          if (!Array.isArray(actos) || !actos.every(esActo)) return;
          mutar({ actos: [...actos] });
          return;
        }
        /**
         * El transcript en vivo de una tarea de fondo, campo a campo como todo lo que entra
         * aquí. Los tres `via` son los tres mensajes del transcript de siempre con otro
         * nombre, y se aplican igual (`reemision`, `acto`, `sustitucion`) — pero sobre
         * `mirada` y nunca sobre `actos`.
         *
         * **Un trozo de OTRA tarea no se anexa.** El servidor solo manda lo que este cliente
         * pidió, pero mezclar dos transcripts sería la peor forma de fallar aquí: una
         * conversación contando lo que hizo otro agente. Un `todos` de otra tarea sí cambia
         * de tarea, porque eso es exactamente lo que hace «mirar esta otra».
         */
        case "mirada": {
          const m = mensaje as Partial<Extract<MensajeAlCliente, { clase: "mirada" }>>;
          const tarea = m.tarea;
          const via = m.via;
          const actos = m.actos;
          if (typeof tarea !== "string" || tarea === "") return;
          if (!Array.isArray(actos) || !actos.every(esActo)) return;
          if (via === "todos") {
            mutar({ mirada: { tarea, actos: [...actos] } });
            return;
          }
          const actual = estado.mirada;
          if (actual === undefined || actual.tarea !== tarea) return;
          if (via === "alta") {
            mutar({ mirada: { tarea, actos: [...actual.actos, ...actos] } });
            return;
          }
          if (via !== "sustitucion") return;
          // Transcript vacío: el servidor no manda `sustitucion` sin un último acto que
          // sustituir, así que esto solo es la red bajo un cable del que no se fía nada —
          // cae a anexar en vez de perder el mensaje, igual que el `sustitucion` de arriba.
          mutar({
            mirada: { tarea, actos: actual.actos.length === 0 ? [...actos] : [...actual.actos.slice(0, -1), ...actos] },
          });
          return;
        }
        case "bienvenida": {
          const nombre = (mensaje as { nombre?: unknown }).nombre;
          // Ausente o de otro tipo = sin nombre, nunca uno inventado — el mismo trato
          // que ya usa la clase «alta» para este mismo dato. Se fija a `undefined` y no
          // se ignora: una reconexión sin nombre tiene que PODER borrar el de la
          // conexión anterior, no dejarlo colgado.
          mutar({ nombre: typeof nombre === "string" ? nombre : undefined });
          return;
        }
        case "pregunta": {
          const m = mensaje as { texto?: unknown; decision?: unknown };
          if (typeof m.texto !== "string") return;
          // La forma se copia solo si VIAJA y se entiende: ausente es una pregunta de texto
          // libre, que no es «una decisión sin líneas». Es la lista blanca de siempre —
          // `mime`, `recetas`, `ejecutable`, `veredicto`, `deLaSesion`—, y aquí el síntoma
          // sería el peor de todos: una tarjeta con campo de texto donde hacía falta
          // decidir, con todo en verde.
          mutar({
            pregunta: {
              texto: m.texto,
              // Y cada línea se copia NOMBRANDO sus campos —la misma lista blanca, un nivel
              // más abajo—: `{...linea}` arrastraría a la pantalla lo que venga por HTTP, y
              // copiar solo `texto` dejaría el plan entero sin colores con todo en verde.
              ...(esDecision(m.decision)
                ? {
                    decision: {
                      lineas: m.decision.lineas.map((l) => {
                        const cambio = cambioDeLinea(l.cambio);
                        return { texto: l.texto, ...(cambio === undefined ? {} : { cambio }) };
                      }),
                    },
                  }
                : {}),
            },
          });
          return;
        }
        case "selector": {
          const selector = (mensaje as { selector?: unknown }).selector;
          if (!esSelector(selector)) return;
          // Copia a un array MUTABLE: `SelectorDeConsola.opciones` es `readonly` (así
          // llega del transporte, que no quiere que nadie lo reordene por su cuenta) y
          // `EstadoDelCliente.selector.opciones` no lo es — la interfaz del store es la
          // del brief tal cual, y asignar el `readonly` ahí no tipa.
          mutar({
            selector: {
              titulo: selector.titulo,
              opciones: [...selector.opciones],
              // Solo si es texto: lo demás se descarta entero, como el resto del store.
              ...(typeof selector.aviso === "string" ? { aviso: selector.aviso } : {}),
            },
          });
          return;
        }
        case "proyectosDeEntorno": {
          // Los proyectos de UN entorno, guardados por su id: son las casillas de su
          // pestaña en Ajustes. Campo a campo, que es una lista BLANCA — lo que no se
          // nombre aquí no llega al componente aunque venga por el cable.
          //
          // `proyectos` ausente con `error` puesto se guarda ASÍ, sin lista: «no se pudo
          // preguntar» no es «no tiene proyectos», y el componente pinta cosas distintas.
          const m = mensaje as { entorno?: unknown; proyectos?: unknown; error?: unknown };
          if (typeof m.entorno !== "string") return;
          const suyos = Array.isArray(m.proyectos)
            ? m.proyectos
                .filter(
                  (p): p is { id: string; nombre: string; compartido?: boolean; ultimoAcceso?: unknown } =>
                    typeof p === "object" &&
                    p !== null &&
                    typeof (p as { id?: unknown }).id === "string" &&
                    typeof (p as { nombre?: unknown }).nombre === "string"
                )
                .map((p) => ({
                  id: p.id,
                  nombre: p.nombre,
                  ...(typeof p.compartido === "boolean" ? { compartido: p.compartido } : {}),
                  ...(typeof p.ultimoAcceso === "string" ? { ultimoAcceso: p.ultimoAcceso } : {}),
                }))
            : undefined;
          mutar({
            proyectosPorEntorno: {
              ...(estado.proyectosPorEntorno ?? {}),
              [m.entorno]: {
                ...(suyos === undefined ? {} : { proyectos: suyos }),
                ...(typeof m.error === "string" ? { error: m.error } : {}),
              },
            },
          });
          return;
        }
        case "modelos": {
          const m = mensaje as { actual?: unknown; porDefecto?: unknown; proveedores?: unknown; esfuerzo?: unknown };
          if (!Array.isArray(m.proveedores)) return;
          /**
           * El esfuerzo, con la MISMA disciplina de lista blanca campo a campo.
           *
           * Se criban los niveles uno a uno contra el vocabulario en vez de copiar la
           * lista: lo que llega alimenta un desplegable cuyos valores vuelven por el cable
           * y acaban en un parámetro de la API, así que una cadena rara aquí sería un 400
           * dentro de dos saltos. Y una lista que se queda VACÍA tras la criba se descarta
           * entera: `PastillaDeEsfuerzo` no se pinta sin niveles, y propagar `[]` sería
           * pedirle que decida eso a ella.
           */
          const e = m.esfuerzo as { niveles?: unknown; actual?: unknown; nota?: unknown } | undefined;
          const niveles = Array.isArray(e?.niveles)
            ? e.niveles.filter((n): n is Esfuerzo => typeof n === "string" && (ESFUERZOS as readonly string[]).includes(n))
            : [];
          const esfuerzo = niveles.length === 0
            ? undefined
            : {
                niveles,
                ...(typeof e?.actual === "string" && niveles.includes(e.actual as Esfuerzo)
                  ? { actual: e.actual as Esfuerzo }
                  : {}),
                ...(typeof e?.nota === "string" ? { nota: e.nota } : {}),
              };
          const proveedores = m.proveedores.filter(esProveedorDeModelos).map((p) => ({
            id: p.id,
            // Campo a campo, que es una lista BLANCA: lo que no se nombra aquí no llega al
            // componente aunque venga por el cable. Es la trampa que dejó a las imágenes
            // de Ficheros sin `mime` ni `base64` con los tests en verde.
            nombre: p.nombre,
            credencial: p.credencial,
            ...(p.personalizado === undefined ? {} : { personalizado: p.personalizado }),
            ...(p.baseUrl === undefined ? {} : { baseUrl: p.baseUrl }),
            ...(p.enFichero === undefined ? {} : { enFichero: p.enFichero }),
            ...(p.modelos === undefined ? {} : { modelos: [...p.modelos] }),
            ...(p.error === undefined ? {} : { error: p.error }),
          }));
          mutar({
            modelos: {
              // Un `actual` que no sea texto se DESCARTA en vez de pintarse: sin él, el
              // disparador dice «Elige modelo», que es la verdad («no se sabe»), y no una
              // fila inventada.
              ...(typeof m.actual === "string" ? { actual: m.actual } : {}),
              // El defecto, con la misma disciplina y por una razón que se ve en Ajustes:
              // si se colara un `""` o un número, el control del defecto enseñaría «sin
              // elegir» sobre una máquina que sí tiene uno escrito — o peor, una cadena que
              // no es un modelo. Ausente se propaga como ausente.
              ...(typeof m.porDefecto === "string" ? { porDefecto: m.porDefecto } : {}),
              proveedores,
              // Ausente se propaga como ausente: «este modelo no admite esfuerzo» y «aún
              // no se sabe» se pintan igual —sin pastilla—, y un `{niveles: []}` aquí
              // haría que el componente tuviera que distinguir lo que el store ya decidió.
              ...(esfuerzo === undefined ? {} : { esfuerzo }),
            },
          });
          return;
        }
        case "proveedor": {
          const m = mensaje as { hecho?: unknown; motivo?: unknown };
          if (typeof m.hecho !== "boolean") return;
          mutar({
            proveedor: {
              hecho: m.hecho,
              ...(typeof m.motivo === "string" ? { motivo: m.motivo } : {}),
            },
          });
          return;
        }
        case "dispositivos": {
          const m = mensaje as { informe?: unknown; ajustes?: unknown };
          /**
           * Cómo acabó el último «Arrancar». Se nombra aquí porque esta lista es BLANCA: sin
           * esta línea el botón se quedaría sin poder decir si arrancó o no, con todo verde.
           * Campo a campo y solo con las tres formas correctas: media respuesta no es una
           * respuesta.
           */
          const arr = (m as { arranque?: unknown }).arranque;
          const arranque =
            typeof arr === "object" &&
            arr !== null &&
            typeof (arr as { avd?: unknown }).avd === "string" &&
            typeof (arr as { ok?: unknown }).ok === "boolean" &&
            typeof (arr as { detalle?: unknown }).detalle === "string"
              ? (arr as { avd: string; ok: boolean; detalle: string })
              : undefined;
          const informe = m.informe as Partial<InformeDeDispositivos> | undefined;
          if (informe === undefined || informe === null || typeof informe !== "object") return;
          if (!Array.isArray(informe.herramientas) || !Array.isArray(informe.dispositivos) || !Array.isArray(informe.avds)) return;
          if (typeof informe.sistema !== "string" || typeof informe.medido !== "string") return;
          // Campo a campo, como `agentes`: nada que el servidor añada mañana entra sin decidirlo.
          mutar({
            dispositivos: {
              sistema: informe.sistema,
              medido: informe.medido,
              avds: informe.avds.filter((x): x is string => typeof x === "string"),
              // Las recetas, campo a campo como todo lo de aquí. AUSENTE no puede tumbar la
              // foto: Windows y Linux no tienen ninguna todavía, y un servidor anterior
              // tampoco manda el campo — se resuelve en lista vacía, que es la verdad.
              recetas: (Array.isArray(informe.recetas) ? informe.recetas : [])
                .filter(
                  (r): r is Receta =>
                    typeof r === "object" && r !== null && typeof r.id === "string" && Array.isArray(r.pasos)
                )
                .map((r) => ({
                  id: r.id,
                  // Su pestaña. Se copia como `Dispositivo.plataforma`: es un dato del
                  // servidor y la ventana agrupa por él sin deducirlo del `id`.
                  plataforma: r.plataforma,
                  titulo: String(r.titulo ?? ""),
                  descripcion: String(r.descripcion ?? ""),
                  completa: r.completa === true,
                  // El consejo que no es un paso, AUSENTE si no lo hay: la receta de iOS no
                  // tiene ninguno, y un `aparte` inventado le pintaría una sección vacía.
                  ...(typeof r.aparte === "object" &&
                  r.aparte !== null &&
                  typeof r.aparte.titulo === "string" &&
                  Array.isArray(r.aparte.comandos)
                    ? {
                        aparte: {
                          titulo: r.aparte.titulo,
                          comandos: r.aparte.comandos.filter((c): c is string => typeof c === "string"),
                          ...(typeof r.aparte.nota === "string" ? { nota: r.aparte.nota } : {}),
                        },
                      }
                    : {}),
                  despues: String(r.despues ?? ""),
                  pasos: r.pasos
                    .filter(
                      (p): p is PasoDeReceta =>
                        typeof p === "object" && p !== null && typeof p.titulo === "string" && Array.isArray(p.comandos)
                    )
                    .map((p) => ({
                      titulo: p.titulo,
                      comandos: p.comandos.filter((c): c is string => typeof c === "string"),
                      // `hecho` y `ejecutable`, solo con el booleano de verdad: la trampa del
                      // `"false"` de cadena, que es verdadero en JavaScript — marcaría como
                      // hecho un paso que no lo está, y ofrecería un botón que no se puede
                      // cumplir.
                      hecho: p.hecho === true,
                      ejecutable: p.ejecutable === true,
                      ...(typeof p.nota === "string" ? { nota: p.nota } : {}),
                      ...(typeof p.porQueNo === "string" ? { porQueNo: p.porQueNo } : {}),
                      ...(typeof p.acepta === "string" ? { acepta: p.acepta } : {}),
                      // Si repetir un paso ya hecho sirve para algo, y con qué nombre. Sin
                      // esto, el paso se quedaría sin botón cuando ya está — que es lo
                      // correcto por omisión y falso para el que actualiza.
                      ...(typeof p.repetir === "object" &&
                      p.repetir !== null &&
                      typeof p.repetir.etiqueta === "string" &&
                      typeof p.repetir.porQue === "string"
                        ? { repetir: { etiqueta: p.repetir.etiqueta, porQue: p.repetir.porQue } }
                        : {}),
                    })),
                })),
              herramientas: informe.herramientas
                .filter((h): h is Herramienta => typeof h === "object" && h !== null && typeof h.nombre === "string" && typeof h.estado === "string")
                .map((h) => ({
                  nombre: h.nombre,
                  plataforma: h.plataforma,
                  estado: h.estado,
                  // Solo `adb`/`emulator` la llevan —la excepción declarada a `sinRutas`,
                  // como el workspace—; sin nombrarla aquí la lista blanca se la comía y la
                  // ventana enseñaba «no encontrada» con la herramienta en verde al lado,
                  // que es justo la contradicción que este campo existe para evitar.
                  ...(typeof h.ruta === "string" ? { ruta: h.ruta } : {}),
                  ...(h.detalle === undefined ? {} : { detalle: h.detalle }),
                  // `instalar` se copia campo a campo, y solo si viene: es lo que decide
                  // entre un botón «Instalar» y el comando para copiar. No estaba en esta
                  // lista, así que la ventana no lo veía y una herramienta que falta se
                  // quedaba sin decir cómo se instala.
                  ...(typeof h.instalar === "object" &&
                  h.instalar !== null &&
                  typeof h.instalar.comando === "string"
                    ? { instalar: { comando: h.instalar.comando, automatico: h.instalar.automatico === true } }
                    : {}),
                })),
              dispositivos: informe.dispositivos
                .filter(
                  (d): d is Dispositivo =>
                    typeof d === "object" && d !== null && typeof d.id === "string" && typeof d.nombre === "string" && typeof d.estado === "string"
                )
                .map((d) => ({
                  id: d.id,
                  nombre: d.nombre,
                  plataforma: d.plataforma,
                  clase: d.clase,
                  estado: d.estado,
                  // De qué AVD es el emulador. Se nombra aquí porque esta lista es BLANCA: sin
                  // esta línea el campo no llega al inventario aunque el host lo mande, y el
                  // síntoma sería el de antes —el AVD arrancado saliendo también como
                  // apagado— con todo en verde. Solo una cadena de verdad.
                  ...(typeof d.avd === "string" ? { avd: d.avd } : {}),
                  ...(d.detalle === undefined ? {} : { detalle: d.detalle }),
                  // La verificación, campo a campo como todo lo de aquí — y esta lista
                  // blanca ya se ha pagado una vez: `mime` y `base64` se caían en el `case`
                  // de un fichero, así que NINGUNA imagen se enseñaba con los tests en
                  // verde. `ok` solo con el booleano de verdad (la trampa del `"false"` de
                  // cadena, que aquí diría que un dispositivo responde cuando no).
                  ...(typeof d.verificado === "object" &&
                  d.verificado !== null &&
                  typeof d.verificado.detalle === "string" &&
                  typeof d.verificado.medido === "string"
                    ? {
                        verificado: {
                          ok: d.verificado.ok === true,
                          detalle: d.verificado.detalle,
                          medido: d.verificado.medido,
                        },
                      }
                    : {}),
                })),
            },
            // Los cuatro interruptores, campo a campo y solo booleanos: un `"false"` de
            // cadena es verdadero en JavaScript, y esa trampa ya se pagó dos veces en este
            // repo. Lo que no venga como booleano se queda ausente, que significa «se
            // mira» — el lado que no esconde nada.
            ajustesDeDispositivos: ajustesDelCable(m.ajustes),
            // **Se asigna SIEMPRE, también `undefined`.** Una medida pedida a mano («Volver a
            // mirar») llega sin `arranque`, y dejar el anterior puesto repetiría un acuse
            // viejo junto a una foto nueva: el usuario leería «arrancado» de un emulador que
            // acaba de matar.
            arranqueDeEmulador: arranque,
          });
          return;
        }
        case "agentes": {
          const m = mensaje as { agentes?: unknown; problemas?: unknown };
          if (!Array.isArray(m.agentes)) return;
          // Se copia campo a campo y no con un `spread` del mensaje: es lo que impide que
          // un campo de más que alguien añada mañana al servidor entre en el estado del
          // cliente sin que nadie lo haya decidido. Misma postura que `proveedores`.
          mutar({
            agentes: {
              lista: m.agentes.filter(esAgenteDelCable).map((a) => ({
                nombre: a.nombre,
                descripcion: a.descripcion,
                motor: a.motor,
                ...(a.modelo === undefined ? {} : { modelo: a.modelo }),
                soloLectura: a.soloLectura,
                // Por la lista blanca como todo lo demás: un campo que no se nombra aquí no
                // llega al estado. El síntoma de olvidarlo sería una tarjeta sin la pastilla
                // que avisa de que ese agente ejecuta comandos — todo en verde.
                ...(a.ejecucion === true ? { ejecucion: true } : {}),
                skills: [...a.skills],
                instrucciones: a.instrucciones,
                ...(a.origen === undefined ? {} : { origen: a.origen }),
                // La lista blanca otra vez, y aquí el síntoma habría sido los dos grupos
                // fundidos en uno con la papelera puesta en los de serie: todo en verde.
                // Se comprueba el VALOR y no solo que venga, que es una unión de dos
                // literales y un tercero desconocido no puede decidir qué botón se pinta.
                ...(a.semilla === "intacta" || a.semilla === "modificada" ? { semilla: a.semilla } : {}),
              })),
              problemas: Array.isArray(m.problemas)
                ? m.problemas.filter((x): x is string => typeof x === "string")
                : [],
            },
          });
          return;
        }
        case "skills": {
          const m = mensaje as { skills?: unknown; problemas?: unknown };
          if (!Array.isArray(m.skills)) return;
          // Campo a campo, como `agentes`: un campo que alguien añada mañana al servidor no
          // entra en el estado del cliente sin que nadie lo haya decidido.
          mutar({
            skills: {
              lista: m.skills.filter(esSkillDelCable).map((s) => ({
                nombre: s.nombre,
                descripcion: s.descripcion,
                origen: s.origen,
                tokens: s.tokens,
                ficheros: [...s.ficheros],
                ...(typeof s.frontmatter === "string" ? { frontmatter: s.frontmatter } : {}),
                // Ausente es «esta no se edita» (una de serie), no «está vacía».
                ...(typeof s.cuerpo === "string" ? { cuerpo: s.cuerpo } : {}),
              })),
              problemas: Array.isArray(m.problemas)
                ? m.problemas.filter((x): x is string => typeof x === "string")
                : [],
            },
          });
          return;
        }
        case "conectores": {
          const m = mensaje as {
            catalogo?: unknown;
            conectores?: unknown;
            desconocidos?: unknown;
            ilegible?: unknown;
            error?: unknown;
          };
          if (!Array.isArray(m.catalogo) || !Array.isArray(m.conectores)) return;
          // Campo a campo, y hasta el fondo: un conector puede traer `prueba`, y `prueba`
          // puede traer `tools` — la lista blanca de `agentes` y `skills` ya se ha comido un
          // campo nuevo en silencio, y aquí hay TRES niveles donde puede volver a pasar.
          mutar({
            conectores: {
              catalogo: m.catalogo.filter(esEntradaDeCatalogoDeConector).map((c) => ({
                id: c.id,
                nombre: c.nombre,
                descripcion: c.descripcion,
                autenticacion: c.autenticacion,
              })),
              conectores: m.conectores.filter(esConectorDelCable).map((c) => {
                const prueba = pruebaDeConectorDelCable((c as { prueba?: unknown }).prueba);
                return {
                  id: c.id,
                  estado: c.estado,
                  ...(prueba === undefined ? {} : { prueba }),
                  ...(c.autorizando === true ? { autorizando: true as const } : {}),
                };
              }),
              desconocidos: Array.isArray(m.desconocidos)
                ? m.desconocidos.filter((x): x is string => typeof x === "string")
                : [],
              ...(m.ilegible === true ? { ilegible: true as const } : {}),
              ...(typeof m.error === "string" ? { error: m.error } : {}),
            },
          });
          return;
        }
        case "cuerpoDeSkill": {
          const m = mensaje as { nombre?: unknown; cuerpo?: unknown };
          if (typeof m.nombre !== "string") return;
          // Se guarda TAMBIÉN cuando no vino cuerpo: la clave presente con `undefined` es
          // «se pidió y no se pudo leer», y es lo que deja decirlo en vez de quedarse
          // pidiéndolo en bucle o enseñando una ficha en blanco.
          mutar({
            cuerposDeSkill: {
              ...(estado.cuerposDeSkill ?? {}),
              [m.nombre]: typeof m.cuerpo === "string" ? m.cuerpo : undefined,
            },
          });
          return;
        }
        case "tarea": {
          // La única variante que el cliente recibe por esta clase es la respuesta a
          // `augmentar` (las demás son cliente → servidor). Campo a campo y uno de los dos:
          // un mensaje sin ninguno de ellos no cambia nada, en vez de borrar lo que había.
          const m = mensaje as { encargo?: unknown; error?: unknown };
          if (typeof m.encargo === "string") mutar({ encargoPropuesto: { encargo: m.encargo } });
          else if (typeof m.error === "string") mutar({ encargoPropuesto: { error: m.error } });
          return;
        }
        case "workspace": {
          // Lista blanca como todo lo de aquí: una `ruta` que no sea cadena no se cree.
          const m = mensaje as Record<string, unknown>;
          if (typeof m["ruta"] !== "string") return;
          mutar({ workspace: m["ruta"], puedeElegirCarpeta: m["puedeElegir"] === true });
          return;
        }
        case "carpetaElegida": {
          const m = mensaje as Record<string, unknown>;
          const ruta = typeof m["ruta"] === "string" ? m["ruta"] : undefined;
          // El contador sube SIEMPRE, también sin carpeta: es el acuse que apaga el
          // «abriendo…» del botón después de un simple «cancelar».
          const n = (estado.carpetaElegida?.n ?? 0) + 1;
          mutar({ carpetaElegida: ruta === undefined ? { n } : { n, ruta } });
          return;
        }
        case "tareas": {
          // Campo a campo, como todo lo de aquí: esta lista blanca ya se comió `mime`,
          // `recetas` y `ejecutable`, y el síntoma siempre es una interfaz vacía con los
          // tests en verde.
          const m = mensaje as Record<string, unknown>;
          if (!Array.isArray(m["lista"])) return;
          const estados = ["nuevo", "en-proceso", "requiere-atencion", "terminada"] as const;
          mutar({
            tareas: {
              concurrencia: typeof m["concurrencia"] === "number" ? m["concurrencia"] : 2,
              corriendoAqui: m["corriendoAqui"] === true,
              // Los TRES valores se conservan: solo un booleano de verdad se copia, y
              // cualquier otra cosa (ausente, o un `"false"` de cadena) queda como «no se
              // sabe». Sintetizar `false` aquí afirmaría que NADIE las ejecuta.
              ...(typeof m["ejecutaOtroProceso"] === "boolean"
                ? { ejecutaOtroProceso: m["ejecutaOtroProceso"] }
                : {}),
              lista: (m["lista"] as unknown[])
                .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
                .map((t) => ({
                  id: String(t["id"] ?? ""),
                  proyecto: String(t["proyecto"] ?? ""),
                  proyectoNombre: String(t["proyectoNombre"] ?? ""),
                  titulo: String(t["titulo"] ?? ""),
                  peticion: String(t["peticion"] ?? ""),
                  encargo: String(t["encargo"] ?? ""),
                  estado: estados.find((e) => e === t["estado"]) ?? "nuevo",
                  creada: String(t["creada"] ?? ""),
                  adjuntos: Array.isArray(t["adjuntos"])
                    ? (t["adjuntos"] as unknown[])
                        .filter((a): a is { nombre: string; bytes: number } => typeof a === "object" && a !== null)
                        .map((a) => ({
                          nombre: String((a as Record<string, unknown>)["nombre"] ?? ""),
                          bytes: Number((a as Record<string, unknown>)["bytes"] ?? 0),
                          ...(typeof (a as Record<string, unknown>)["mime"] === "string"
                            ? { mime: (a as Record<string, unknown>)["mime"] as string }
                            : {}),
                        }))
                    : [],
                  ...(typeof t["motivo"] === "string" ? { motivo: t["motivo"] } : {}),
                  ...(typeof t["sesion"] === "string" ? { sesion: t["sesion"] } : {}),
                  ...(typeof t["empezada"] === "string" ? { empezada: t["empezada"] } : {}),
                  ...(typeof t["acabada"] === "string" ? { acabada: t["acabada"] } : {}),
                  // Ausente = no consta (no llegó a correr); `[]` = corrió y no autorizó
                  // ninguna. Las dos cosas son distintas, así que solo se copia si LLEGÓ
                  // como array de verdad, nunca se sintetiza `[]`.
                  ...(Array.isArray(t["autorizadas"])
                    ? {
                        autorizadas: (t["autorizadas"] as unknown[]).filter(
                          (x): x is string => typeof x === "string"
                        ),
                      }
                    : {}),
                  // Ausente = nunca se le pidió nada a esta tarea; distinto de una lista
                  // vacía, que aquí no llega nunca (`conFeedback` solo AÑADE). Campo a
                  // campo, como el resto de esta lista blanca.
                  ...(Array.isArray(t["feedback"])
                    ? {
                        feedback: (t["feedback"] as unknown[])
                          .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
                          .map((f) => ({
                            texto: String(f["texto"] ?? ""),
                            creado: String(f["creado"] ?? ""),
                            consumido: f["consumido"] === true,
                          })),
                      }
                    : {}),
                  // El veredicto del juez y su SALVEDAD. Ausente = nunca se le preguntó al
                  // juez, y eso NO es «lo aprobó»: de esa distinción depende que «Terminada»
                  // no signifique tres cosas a la vez. Campo a campo también aquí dentro, y
                  // un veredicto que no es ninguno de los tres se descarta entero en vez de
                  // caer en «verde» por omisión — la dirección de siempre.
                  ...veredictoDeTarea(t["veredicto"]),
                  // Solo el booleano `true`: un `"false"` de cadena es verdadero en
                  // JavaScript y marcaría como dada por buena a mano una entrega del
                  // corredor. La trampa de siempre.
                  ...(t["terminadaAMano"] === true ? { terminadaAMano: true } : {}),
                }))
                .filter((t) => t.id !== ""),
            },
          });
          return;
        }
        case "revision": {
          const m = mensaje as { via?: unknown; ficheros?: unknown; mezclados?: unknown };
          if (
            m.via !== "git" &&
            m.via !== "desde-apertura" &&
            m.via !== "sin-marca" &&
            m.via !== "sin-empezar"
          ) {
            return;
          }
          if (!Array.isArray(m.ficheros)) return;
          const lista = m.ficheros.filter(esFicheroTocado).map((f) => ({ ...f }));
          mutar({
            revision: {
              via: m.via,
              lista,
              ...(typeof m.mezclados === "number" && m.mezclados > 0 ? { mezclados: m.mezclados } : {}),
            },
          });
          return;
        }
        case "parche": {
          const m = mensaje as { ruta?: unknown; texto?: unknown; recortado?: unknown };
          if (typeof m.ruta !== "string" || typeof m.texto !== "string") return;
          mutar({
            parches: {
              ...estado.parches,
              [m.ruta]: { texto: m.texto, recortado: m.recortado === true },
            },
          });
          return;
        }
        case "modeloDelCambio": {
          const m = mensaje as { ruta?: unknown; cambios?: unknown; error?: unknown };
          if (typeof m.ruta !== "string") return;
          const cambios = leerCambiosDelModelo(m.cambios);
          if (cambios === undefined && typeof m.error !== "string") return;
          mutar({
            modelosDelCambio: {
              ...estado.modelosDelCambio,
              [m.ruta]: {
                ...(cambios === undefined ? {} : { cambios }),
                ...(typeof m.error === "string" ? { error: m.error } : {}),
              },
            },
          });
          return;
        }
        case "planes": {
          const m = mensaje as { planes?: unknown; error?: unknown };
          const lista = leerPlanesDelCable(m.planes);
          if (lista === undefined && typeof m.error !== "string") return;
          mutar({
            planes: {
              ...(lista === undefined ? {} : { lista }),
              ...(typeof m.error === "string" ? { error: m.error } : {}),
            },
          });
          return;
        }
        case "colecciones": {
          const m = mensaje as { foto?: unknown; error?: unknown };
          const foto = leerFotoDeColecciones(m.foto);
          // Ni foto que se entienda ni error: no hay nada que decir, y pintar una pestaña
          // vacía afirmaría «el proyecto no tiene colecciones».
          if (foto === undefined && typeof m.error !== "string") return;
          mutar({
            colecciones: {
              ...(foto === undefined ? {} : { foto }),
              ...(typeof m.error === "string" ? { error: m.error } : {}),
            },
          });
          return;
        }
        case "arbol": {
          const m = mensaje as { rutas?: unknown; recortado?: unknown; error?: unknown };
          if (!Array.isArray(m.rutas) || !m.rutas.every((r) => typeof r === "string")) return;
          mutar({
            arbol: {
              rutas: m.rutas as string[],
              recortado: m.recortado === true,
              ...(typeof m.error === "string" ? { error: m.error } : {}),
            },
          });
          return;
        }
        case "sync": {
          // Campo a campo, lista blanca: lo que no se nombra aquí no llega — la trampa que
          // ya mordió con `mime`/`base64` en `fichero`. Y cada uno solo se copia si es del
          // tipo que dice ser: un `pendientes` que llegara como cadena pintaría «NaN
          // ficheros por subir», que es peor que no pintar ninguno.
          const m = mensaje as {
            proyecto?: unknown;
            rama?: unknown;
            pendientes?: unknown;
            deLaSesion?: unknown;
            error?: unknown;
          };
          mutar({
            sync: {
              ...(typeof m.proyecto === "string" ? { proyecto: m.proyecto } : {}),
              ...(typeof m.rama === "string" ? { rama: m.rama } : {}),
              ...(typeof m.pendientes === "number" && Number.isFinite(m.pendientes)
                ? { pendientes: m.pendientes }
                : {}),
              // Ausente se copia como ausente: cero y «no se pudo atribuir» son dos cosas
              // distintas, y rellenar el hueco con un 0 es la cifra inventada de siempre.
              ...(typeof m.deLaSesion === "number" && Number.isFinite(m.deLaSesion)
                ? { deLaSesion: m.deLaSesion }
                : {}),
              ...(typeof m.error === "string" ? { error: m.error } : {}),
            },
          });
          return;
        }
        case "fichero": {
          const m = mensaje as Partial<FicheroDelProyecto>;
          if (typeof m.ruta !== "string" || typeof m.bytes !== "number") return;
          mutar({
            contenidos: {
              ...estado.contenidos,
              [m.ruta]: {
                ruta: m.ruta,
                bytes: m.bytes,
                recortado: m.recortado === true,
                binario: m.binario === true,
                ...(typeof m.texto === "string" ? { texto: m.texto } : {}),
                ...(m.codificacion === "utf-8" || m.codificacion === "latin1" ? { codificacion: m.codificacion } : {}),
                // El fichero se copia campo a campo —lista blanca, no reenvío del mensaje
                // entero— y eso tiene una trampa que ya mordió: un campo NUEVO no llega
                // hasta que se nombra aquí. Las imágenes se pintaban en jsdom y no en el
                // navegador porque `mime` y `base64` se quedaban en este case.
                ...(typeof m.mime === "string" ? { mime: m.mime } : {}),
                ...(typeof m.base64 === "string" ? { base64: m.base64 } : {}),
                // La vista de un markdown con imágenes, por la misma trampa: sin nombrarla aquí,
                // el visor se quedaba con el texto crudo y sus imágenes rotas.
                ...(typeof m.vista === "string" ? { vista: m.vista } : {}),
                ...(typeof m.error === "string" ? { error: m.error } : {}),
              },
            },
          });
          return;
        }
        case "modelosDeMotor": {
          const m = mensaje as Record<string, unknown>;
          if (typeof m["motor"] !== "string" || !Array.isArray(m["modelos"])) return;
          mutar({
            modelosDeMotor: {
              ...estado.modelosDeMotor,
              [m["motor"]]: {
                modelos: (m["modelos"] as unknown[])
                  .filter((x): x is { id: string; nombre?: unknown } => typeof x === "object" && x !== null && typeof (x as { id?: unknown }).id === "string")
                  .map((x) => ({ id: x.id, nombre: typeof x.nombre === "string" ? x.nombre : x.id })),
                ...(typeof m["error"] === "string" ? { error: m["error"] } : {}),
              },
            },
          });
          return;
        }
        case "instalacion": {
          // Campo a campo, como todo lo de aquí. Y los estados por lista blanca: uno que no
          // conozcamos dejaría el botón en un limbo, así que se descarta el mensaje entero.
          const m = mensaje as Record<string, unknown>;
          const estados = ["corriendo", "ok", "fallo", "cancelada", "colgada"] as const;
          const estado = estados.find((e) => e === m["estado"]);
          if (typeof m["receta"] !== "string" || typeof m["paso"] !== "number" || estado === undefined) return;
          mutar({
            instalacion: {
              receta: m["receta"],
              paso: m["paso"],
              titulo: typeof m["titulo"] === "string" ? m["titulo"] : "",
              estado,
              lineas: Array.isArray(m["lineas"]) ? m["lineas"].filter((x): x is string => typeof x === "string") : [],
              ms: typeof m["ms"] === "number" ? m["ms"] : 0,
              ...(typeof m["motivo"] === "string" ? { motivo: m["motivo"] } : {}),
            },
          });
          return;
        }
        case "lanzable": {
          // La forma del `case "instalacion"`, campo a campo. Las cuatro exigencias son las que
          // sostienen el veredicto: sin `proyecto` no se sabe de qué app habla, `listo` y
          // `faltas` son lo que decide si se pinta botón o se pintan las frases, y sin `medido`
          // el veredicto es una promesa sin fecha — la misma regla por la que `dispositivos`
          // descarta su informe sin fecha. Un `listo` que no sea el booleano (la trampa del
          // `"false"` de cadena, que es verdadero en JavaScript), unas `faltas` que no sean
          // cadenas o un `medido` que no sea texto descartan el mensaje ENTERO: un veredicto a
          // medias pintaría un botón que no puede cumplir, o una lista de causas vacía sin decir
          // por qué. Las dos cosas son peores que no tener veredicto.
          const m = mensaje as Record<string, unknown>;
          const faltas = m["faltas"];
          if (typeof m["proyecto"] !== "string" || typeof m["listo"] !== "boolean") return;
          if (typeof m["medido"] !== "string") return;
          if (!Array.isArray(faltas) || !faltas.every((f) => typeof f === "string")) return;
          const d = m["dispositivo"];
          mutar({
            lanzable: {
              proyecto: m["proyecto"],
              listo: m["listo"],
              faltas: faltas as string[],
              medido: m["medido"],
              ...(typeof m["app"] === "string" ? { app: m["app"] } : {}),
              // La foto del dispositivo se copia por sus CAMPOS y no entera: lo que llega por
              // el cable no entra en el estado sin nombre. Una a medias —un id sin nombre—
              // se queda fuera sola, como en el `alta`: el veredicto sigue siendo cierto sin
              // ella, y pintar un serial crudo es justo lo que guardar la foto viene a evitar.
              ...(esDispositivoElegido(d)
                ? { dispositivo: { id: d.id, nombre: d.nombre, plataforma: d.plataforma, clase: d.clase } }
                : {}),
            },
          });
          return;
        }
        case "lanzamiento": {
          // Las FASES y los ESTADOS por lista blanca, como el `estado` de `instalacion`: los dos
          // vienen de una lista CERRADA (`tipos.ts`) y uno que no conozcamos descarta el mensaje
          // entero. Pintar una fase desconocida sería enseñar un paso que este cliente no sabe
          // dibujar; y un estado que no se entiende dejaría el recorrido sin saber si sigue o
          // acabó, que es exactamente el botón apagado sin explicación que `corriendo` existe
          // para evitar.
          const m = mensaje as Record<string, unknown>;
          const fase = FASES_DEL_LANZAMIENTO.find((f) => f === m["fase"]);
          const estadoDelRecorrido = ESTADOS_DEL_LANZAMIENTO.find((e) => e === m["estado"]);
          if (fase === undefined || estadoDelRecorrido === undefined) return;
          if (typeof m["ms"] !== "number") return;
          const lineas = m["lineas"];
          if (!Array.isArray(lineas)) return;
          const d = m["dispositivo"];
          mutar({
            lanzamiento: {
              fase,
              estado: estadoDelRecorrido,
              // Las líneas se filtran en vez de tumbar el mensaje —la forma de `instalacion`—:
              // son la cola de un log, y perder una línea que no es texto no invalida el
              // recorrido. Al revés que `faltas`, donde una frase que falta sí cambia la
              // decisión.
              lineas: lineas.filter((x): x is string => typeof x === "string"),
              ms: m["ms"],
              ...(typeof m["proyecto"] === "string" ? { proyecto: m["proyecto"] } : {}),
              ...(esDispositivoElegido(d)
                ? { dispositivo: { id: d.id, nombre: d.nombre, plataforma: d.plataforma, clase: d.clase } }
                : {}),
              ...(typeof m["motivo"] === "string" ? { motivo: m["motivo"] } : {}),
            },
          });
          return;
        }
        case "artefacto": {
          // Campo a campo, como el fichero, y con la misma trampa detrás: un campo que no se
          // nombre aquí se cae en silencio y el visor se queda sin la mitad del dato.
          const m = mensaje as Partial<FicheroDelProyecto>;
          if (typeof m.ruta !== "string" || typeof m.bytes !== "number") return;
          mutar({
            artefactos: {
              ...estado.artefactos,
              [m.ruta]: {
                ruta: m.ruta,
                bytes: m.bytes,
                recortado: m.recortado === true,
                binario: m.binario === true,
                ...(typeof m.texto === "string" ? { texto: m.texto } : {}),
                ...(m.codificacion === "utf-8" || m.codificacion === "latin1" ? { codificacion: m.codificacion } : {}),
                ...(typeof m.mime === "string" ? { mime: m.mime } : {}),
                ...(typeof m.base64 === "string" ? { base64: m.base64 } : {}),
                ...(typeof m.error === "string" ? { error: m.error } : {}),
              },
            },
          });
          return;
        }
        case "abriendo": {
          const m = mensaje as {
            activo?: unknown;
            proyecto?: unknown;
            sesion?: unknown;
            entorno?: unknown;
            descargando?: unknown;
          };
          if (m.activo !== true) {
            mutar({ abriendo: undefined });
            return;
          }
          mutar({
            abriendo: {
              ...(typeof m.proyecto === "string" ? { proyecto: m.proyecto } : {}),
              ...(typeof m.sesion === "string" ? { sesion: m.sesion } : {}),
              ...(typeof m.entorno === "string" ? { entorno: m.entorno } : {}),
              // Solo el booleano `true`: la cadena `"false"` es verdadera en JavaScript y
              // aquí prometería una descarga que nadie está haciendo.
              ...(m.descargando === true ? { descargando: true as const } : {}),
            },
          });
          return;
        }
        case "consumo": {
          /**
           * Campo a campo, que es la lista blanca de siempre: un campo nuevo del cable no
           * llega hasta que se nombra aquí. Las guardas de número y de cuenta son las del
           * módulo, compartidas con la fila de sesión: dos copias de una guarda es como
           * divergen, y la que se queda vieja es la que deja pasar la cifra inventada.
           */
          const m = mensaje as { modelo?: unknown; externo?: unknown; ventana?: unknown };
          const v = (typeof m.ventana === "object" && m.ventana !== null ? m.ventana : {}) as Record<string, unknown>;
          // `tope` ausente es «no se sabe» y se propaga ausente hasta el componente: con
          // Ollama no hay tope A PROPÓSITO, y un denominador inventado es la misma mentira
          // que un porcentaje sobre un número que nadie midió.
          const tope = typeof v["tope"] === "number" && Number.isFinite(v["tope"]) && v["tope"] > 0 ? v["tope"] : undefined;
          mutar({
            consumo: {
              modelo: cuenta(m.modelo),
              externo: cuenta(m.externo),
              ventana: { usado: numero(v["usado"]), ...(tope === undefined ? {} : { tope }) },
            },
          });
          return;
        }
        case "turno": {
          const activo = (mensaje as { activo?: unknown }).activo;
          if (typeof activo !== "boolean") return;
          mutar({ turnoEnVuelo: activo });
          return;
        }
        case "secreto": {
          const pregunta = (mensaje as { pregunta?: unknown }).pregunta;
          if (typeof pregunta !== "string") return;
          mutar({ secreto: { pregunta } });
          return;
        }
        case "alta": {
          const m = mensaje as {
            pasos?: unknown;
            preparando?: unknown;
            proveedores?: unknown;
            entornos?: unknown;
            registrados?: unknown;
            entornoActivo?: unknown;
            proyectoActivo?: unknown;
            sesionActiva?: unknown;
            dispositivoActivo?: unknown;
            historica?: unknown;
            modoDeEscritura?: unknown;
            trabajoAlAbrir?: unknown;
            proyectos?: unknown;
            ramas?: unknown;
            aviso?: unknown;
            nombre?: unknown;
            proyectoAbierto?: unknown;
            modo?: unknown;
            version?: unknown;
          };
          if (!Array.isArray(m.pasos) || !m.pasos.every((p) => typeof p === "string" && PASOS.has(p))) return;
          if (!sonIdentidades(m.proveedores) || !sonIdentidades(m.proyectos)) return;
          // Las sesiones viajan DENTRO de cada proyecto; `sonIdentidades` solo mira `id` y
          // `nombre`, así que aquí se recogen aparte y se descarta lo que no tenga forma —
          // una sesión inventada sería una fila que al pulsarla no abre nada.
          const proyectos = m.proyectos.map((p) => {
            const sesiones = (p as { sesiones?: unknown }).sesiones;
            return {
              id: p.id,
              nombre: p.nombre,
              ...(sonSesiones(sesiones)
                ? {
                    sesiones: sesiones.map((s) => {
                      // Lo que gastó la sesión entera. `consumoDeSesion` contesta «no consta»
                      // con `undefined`, y entonces el campo NO se escribe: ausente y `{0,0}`
                      // son dos cosas distintas —una sesión anterior a esto y una que salió
                      // gratis— y solo la segunda se pinta.
                      const consumo = consumoDeSesion(s.consumo);
                      return {
                        id: s.id,
                        titulo: s.titulo,
                        ...(typeof s.ultimoTurno === "string" ? { ultimoTurno: s.ultimoTurno } : {}),
                        // `=== true` y no un truthy: la trampa del `"false"` de CloudStudio en
                        // la dirección de aquí sería marcar la conversación de una persona
                        // como sesión de una tarea de fondo.
                        ...(s.deTarea === true ? { deTarea: true as const } : {}),
                        // Y la misma regla, por el mismo motivo: una cadena colada aquí
                        // («trabajando: "false"») pintaría trabajando una sesión que no
                        // trabaja, y con ella un indicador de actividad que nunca se apaga.
                        ...(s.trabajando === true ? { trabajando: true as const } : {}),
                        ...(consumo === undefined ? {} : { consumo }),
                      };
                    }),
                  }
                : {}),
              ...((p as { local?: unknown }).local === true ? { local: true } : {}),
              // La misma regla del booleano de verdad: una cadena colada aquí dejaría el
              // proyecto «trabajando» para siempre, y con él las sesiones sin poder abrirse.
              ...((p as { trabajando?: unknown }).trabajando === true ? { trabajando: true as const } : {}),
              // La MISMA regla que el servidor: solo un booleano de verdad. Ausente se
              // queda ausente, y la interfaz no pinta etiqueta — «no lo dijo» no es
              // «es tuyo». Una cadena colada aquí («shared: "false"») marcaría el
              // proyecto como compartido, porque una cadena no vacía es verdadera.
              ...(typeof (p as { compartido?: unknown }).compartido === "boolean"
                ? { compartido: (p as unknown as { compartido: boolean }).compartido }
                : {}),
              ...(typeof (p as { ultimoAcceso?: unknown }).ultimoAcceso === "string"
                ? { ultimoAcceso: (p as unknown as { ultimoAcceso: string }).ultimoAcceso }
                : {}),
            };
          });
          if (
            !Array.isArray(m.entornos) ||
            !m.entornos.every((e) => typeof (e as { url?: unknown })?.url === "string") ||
            !sonIdentidades(m.entornos)
          ) {
            return;
          }
          // `registrados` sí puede faltar sin invalidar el mensaje: lo que no se entiende
          // se descarta a lista vacía —«todavía no lo sé»— en vez de tirar el alta entera,
          // que es lo que decide si se pinta el wizard o la maqueta.
          const registrados =
            Array.isArray(m.registrados) &&
            m.registrados.every((e) => typeof (e as { url?: unknown })?.url === "string") &&
            sonIdentidades(m.registrados)
              ? (m.registrados as { id: string; nombre: string; url: string; proyectos?: unknown; copias?: unknown }[]).map((e) => ({
                  id: e.id,
                  nombre: e.nombre,
                  url: e.url,
                  // Se conserva la DIFERENCIA entre ausente y vacío: ausente es «no lo he
                  // elegido» y manda la omisión; `[]` es «ninguno». Colapsarlas aquí haría
                  // que elegir ninguno se leyera como no haber elegido.
                  ...(Array.isArray(e.proyectos) && e.proyectos.every((p) => typeof p === "string")
                    ? { proyectos: e.proyectos as string[] }
                    : {}),
                  // Nombrado aquí o no llega: el `case` es lista BLANCA.
                  ...(typeof e.copias === "number" && Number.isInteger(e.copias) && e.copias >= 0
                    ? { copias: e.copias }
                    : {}),
                }))
              : [];
          if (!Array.isArray(m.ramas) || !m.ramas.every((r) => typeof r === "string")) return;
          // Un `proyectoAbierto` que no sea booleano no cuenta como el mensaje válido: es
          // el campo que distingue la maqueta completa del hueco de «elige un proyecto»
          // (`App.tsx`), y un valor inventado ahí mentiría sobre cuál de las dos toca.
          if (typeof m.proyectoAbierto !== "boolean") return;
          // La foto de ficheros es de UNA sesión. Si la que manda el servidor ya no es la
          // misma, se tira: enseñar la lista de la sesión anterior bajo el título de la
          // nueva es peor que no enseñar nada, porque parecería que esta sesión escribió
          // esos ficheros. Misma sesión = se conserva, para no perder los parches ya
          // traídos en cada mensaje de estado (que llega con cada cambio de consola).
          const sesionDeAhora = typeof m.sesionActiva === "string" ? m.sesionActiva : undefined;
          const cambioDeSesion = sesionDeAhora !== estado.alta?.sesionActiva;
          mutar({
            ...(cambioDeSesion ? { revision: undefined, parches: undefined, modelosDelCambio: undefined, arbol: undefined, contenidos: undefined, colecciones: undefined, planes: undefined, artefactos: undefined, sync: undefined } : {}),
            alta: {
              pasos: m.pasos as PasoDelWizard[],
              proveedores: m.proveedores,
              entornos: m.entornos as { id: string; nombre: string; url: string }[],
              registrados,
              proyectos,
              ramas: m.ramas as string[],
              proyectoAbierto: m.proyectoAbierto,
              // Ausente o de otro tipo = no hay aviso/nombre, nunca uno inventado.
              ...(typeof m.aviso === "string" ? { aviso: m.aviso } : {}),
              // La fase del arranque. AUSENTE = listo, y es la diferencia entre quedarse en
              // el lienzo y entrar al Escritorio: si un campo nuevo no se nombra en este
              // `case` no llega nunca, y el síntoma sería entrar en vacío como antes.
              ...(typeof m.preparando === "string" ? { preparando: m.preparando } : {}),
              ...(typeof m.nombre === "string" ? { nombre: m.nombre } : {}),
              ...(typeof m.entornoActivo === "string" ? { entornoActivo: m.entornoActivo } : {}),
              ...(typeof m.proyectoActivo === "string" ? { proyectoActivo: m.proyectoActivo } : {}),
              ...(typeof m.sesionActiva === "string" ? { sesionActiva: m.sesionActiva } : {}),
              // La foto del dispositivo elegido, campo a campo y solo si está entera: media
              // foto —un id sin nombre— pintaría un serial crudo en la pastilla, que es
              // justo lo que guardar la foto viene a evitar.
              ...(esDispositivoElegido(m.dispositivoActivo) ? { dispositivoActivo: m.dispositivoActivo } : {}),
              // Solo si es exactamente `true`: es una afirmación sobre lo que el agente NO
              // recuerda, y cualquier otra cosa se lee como «no».
              ...(m.historica === true ? { historica: true } : {}),
              // Los DOS literales y nada más: un modo nuevo del servidor, o basura, se
              // descarta y entonces no se pinta pastilla — lo mismo que cuando el campo no
              // viene. Aceptar lo desconocido pintaría un control cuyo valor no se sabe
              // leer, y encima sobre la palanca que decide si se escribe sin preguntar.
              ...(m.modoDeEscritura === "supervisado" || m.modoDeEscritura === "autonomo"
                ? { modoDeEscritura: m.modoDeEscritura }
                : {}),
              // Campo a campo, como la foto del dispositivo: media forma no vale. Y una
              // lista VACÍA se descarta aunque venga bien formada — sería un aviso que
              // dice «ya había cambios» sin nombrar ninguno, o sea peor que callarse. El
              // servidor tampoco la manda, pero eso no puede sostenerlo el cliente.
              ...(esTrabajoAlAbrir(m.trabajoAlAbrir) ? { trabajoAlAbrir: m.trabajoAlAbrir } : {}),
              // Solo los dos valores que el tipo admite: cualquier otra cosa (un modo
              // nuevo del servidor, o basura) se descarta y la cabecera no pinta
              // pastilla, que es lo mismo que hace cuando el campo no viene. Aceptar la
              // cadena a ciegas dejaría un modo desconocido escrito en pantalla.
              ...(m.modo === "offline" || m.modo === "cloud" ? { modo: m.modo } : {}),
              ...(typeof m.version === "string" ? { version: m.version } : {}),
            },
          });
          return;
        }
        case "aprobacion": {
          const m = mensaje as { pendientes?: unknown; ficheros?: unknown; diffs?: unknown };
          if (!Array.isArray(m.pendientes) || !esRegistro(m.ficheros) || !esRegistro(m.diffs)) return;
          mutar({
            aprobacion: {
              pendientes: m.pendientes,
              ficheros: m.ficheros as Record<string, string>,
              diffs: m.diffs as Record<string, unknown[]>,
            },
          });
          return;
        }
        default:
          // Clase desconocida: un servidor más nuevo que este cliente, o ruido. Ignorar
          // es la misma postura que el resto de esta función frente a lo malformado.
          return;
      }
    },

    marcarConectado(): void {
      mutar({ conectado: true });
    },

    limpiarEncargoPropuesto(): void {
      mutar({ encargoPropuesto: undefined });
    },

    marcarDesconectado(): void {
      // El servidor resuelve TODO lo pendiente con cadena vacía (o `undefined`) en cuanto
      // se cae el SSE (`web/servidor/consolaWeb.ts#alDesconectar`): una pregunta, selector,
      // secreto o aprobación que el cliente tuviera en pantalla ya está zanjada al otro
      // lado —como rechazo, en el caso de la aprobación—. Dejarla pintada tras reconectar
      // mentiría sobre qué sigue esperando respuesta.
      // `modelos` también se tira: mientras no hay cable, el modelo en vigor no se puede
      // AFIRMAR —pudo cambiarlo otra pestaña, o el proceso pudo morir—, y la reconexión lo
      // vuelve a traer entero (`arranque.ts#adjuntar`). Es la misma regla del harness de
      // DeepSeek: un `connection/reset` tira todas las proyecciones y repide la selección
      // antes de pintarla.
      mutar({
        conectado: false,
        pregunta: undefined,
        selector: undefined,
        secreto: undefined,
        aprobacion: undefined,
        modelos: undefined,
        // Y las listas de proyectos por entorno: cada una es una conexión con CloudStudio
        // que este proceso pudo no llegar a hacer, y al reconectar la pestaña las vuelve a
        // pedir si le faltan. Guardarlas entre conexiones dejaría casillas de una consulta
        // que quizá ya no vale.
        proyectosPorEntorno: undefined,
        // El acuse de un alta o una baja de proveedor es de esa operación, no un estado:
        // guardado entre conexiones, al reconectar reaparecería un error ya resuelto.
        proveedor: undefined,
        // Y lo que se estuviera abriendo, por lo mismo que el turno: sin cable no llega el
        // flanco de bajada, y un indicador de actividad encendido para siempre es peor que
        // no tenerlo. La reconexión trae el estado entero.
        abriendo: undefined,
        // Sin cable no se sabe si el turno sigue: dejarlo en `true` apagaría el compositor
        // para siempre en una pestaña que ya no recibe el «terminó».
        turnoEnVuelo: false,
        // El consumo se TIRA al caerse el cable, como los modelos y por lo mismo: es del
        // servidor, y mientras no hay cable no se puede afirmar. La reconexión lo trae
        // entero en la ráfaga.
        consumo: undefined,
        // Los ficheros y sus parches son una FOTO: mientras no hay cable pueden haber
        // cambiado, y enseñarlos como si siguieran siendo verdad es peor que pedirlos otra
        // vez al volver.
        revision: undefined,
        parches: undefined,
        modelosDelCambio: undefined,
        arbol: undefined,
        contenidos: undefined,
        colecciones: undefined,
        planes: undefined,
        artefactos: undefined,
        // Y la medida de lo que falta por subir: la rama la pudo mover el agente, y arriba
        // —en CloudStudio— pudo cambiar algo desde fuera. Es una foto como las tres de
        // arriba, y el número que la pestaña enseña en su lugar lo vuelve a medir el
        // servidor en cuanto se lo pidan (que es al volver a la pestaña).
        sync: undefined,
        // Los subagentes salen de ficheros en disco: mientras no hay cable pueden haberse
        // editado a mano, y la ventana de ajustes enseñaría una lista que ya no es. La
        // reconexión los trae enteros en la misma ráfaga que los modelos.
        agentes: undefined,
        // Y las skills por lo mismo: son carpetas en disco que pueden haberse tocado a mano
        // mientras no había cable. Los cuerpos ya pedidos se van con ellas: un cuerpo
        // guardado de una skill que ya no está es peor que pedirlo otra vez.
        skills: undefined,
        cuerposDeSkill: undefined,
        // Y los conectores por lo mismo: token y catálogo viven en disco, así que mientras
        // no hay cable pueden haberse tocado a mano. La reconexión los trae enteros en la
        // misma ráfaga.
        conectores: undefined,
        // La mirada a una tarea la sostiene el SERVIDOR: su enganche se va con el SSE
        // (`arranque.ts`, el `close`), así que guardarla dejaría un transcript congelado
        // presentado como si siguiera llegando. La reconexión la vuelve a pedir.
        mirada: undefined,
        // El veredicto y el recorrido del lanzamiento se tiran LOS DOS, y no por simetría con
        // las fotos: sin cable no se puede afirmar en qué estado quedó la operación —el
        // proceso pudo morir, o pudo seguir y acabar sin que este navegador se entere—, y un
        // recorrido guardado en `corriendo` para siempre apagaría el botón de una pestaña que
        // ya no recibe el «terminó». El veredicto es además una medida de hace un rato, y lo
        // que decide es lo que se mida al reconectar: la pestaña lo vuelve a pedir en cuanto
        // `conectado` pasa a `true`.
        lanzable: undefined,
        lanzamiento: undefined,
      });
    },

    /**
     * Lo que el CLIENTE ya ha contestado. No son mensajes del cable: son la otra mitad de
     * `marcarDesconectado`, que retira lo que el servidor ya dio por zanjado. Aquí el
     * zanjado lo produce el usuario, y sin esto la pregunta y el modal se quedarían
     * pintados para siempre después de responder — el servidor no manda ningún «ya está»
     * (`consolaWeb.ts` resuelve la promesa y no emite nada), así que nadie los retiraría.
     *
     * Que el modal se DESMONTE al cerrarlo es además lo que hace de su rechazo-al-desmontar
     * una red y no una segunda decisión: cuando llega aquí, el componente ya ha marcado que
     * decidió.
     *
     * Las cuatro se llaman DESPUÉS de que el envío haya llegado, nunca antes: retirar la
     * interfaz con el `POST` fallido deja al usuario creyendo que contestó mientras el
     * servidor sigue esperando hasta su plazo.
     */
    contestarPregunta(): void {
      mutar({ pregunta: undefined });
    },

    contestarSecreto(): void {
      mutar({ secreto: undefined });
    },

    dejarDeMirar(): void {
      mutar({ mirada: undefined });
    },

    /**
     * Retira el selector CONTESTADO, no «el que haya».
     *
     * Sin el parámetro esto era una carrera de verdad desde que el asistente de cuenta es
     * un lazo (`cli/wizardInicial.ts`): volver atrás o cancelar con la puerta puesta hace
     * que el servidor emita el selector SIGUIENTE sin ningún viaje de red por medio —antes
     * siempre había un `listar` o un OAuth entre dos selectores—, así que el mensaje del
     * SSE y la resolución del `POST` compiten, en sockets distintos y sin orden
     * garantizado. Si ganaba el SSE, este `contestarSelector()` borraba el selector NUEVO:
     * tarjeta vacía en pantalla y el servidor esperando una respuesta que ya nadie podía
     * dar, hasta que venciera el plazo.
     *
     * La comparación es por REFERENCIA y basta: `aplicar` construye un objeto nuevo por
     * cada mensaje «selector», así que dos selectores distintos nunca comparten identidad.
     * Sin argumento se conserva el comportamiento de siempre (borra lo que haya), que es lo
     * que quiere quien no tiene a mano lo que contestó.
     */
    contestarSelector(contestado?: EstadoDelCliente["selector"]): void {
      if (contestado !== undefined && estado.selector !== contestado) return;
      mutar({ selector: undefined });
    },

    cerrarAprobacion(): void {
      mutar({ aprobacion: undefined });
    },

    suscribir(escucha: () => void): () => void {
      suscriptores.push(escucha);
      return () => {
        const indice = suscriptores.indexOf(escucha);
        // Tolerante a doble baja: el `useEffect` de React StrictMode monta y desmonta dos
        // veces en desarrollo, y una segunda baja no debe reventar sobre un índice -1.
        if (indice >= 0) suscriptores.splice(indice, 1);
      };
    },
  };
}
