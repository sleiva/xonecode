/**
 * SSE del servidor al cliente, `POST /accion` del cliente al servidor.
 *
 * No es WebSocket a propósito: aquí hay UN stream, no un mux de streams lógicos con
 * decenas de clientes hablando a la vez. Con SSE la reconexión es trivial porque el
 * servidor guarda la lista de actos y la reemite entera; con WS habría que reimplementar
 * generaciones y reanudación para no ganar nada.
 *
 * La regla que gobierna este fichero: **el contenido de fichero y el diff viajan en UN
 * solo mensaje**, `aprobacion`, que es el paso donde el humano DECIDE sobre ellos. Ni los
 * actos ni la traza de emisión los tocan, y por eso `emitir` no registra ese mensaje: lo
 * guarda quien lo tiene en vuelo, que lo suelta en cuanto hay decisión.
 */
import type { Herramienta, InformeDeDispositivos, NombreDeHerramienta } from "../../core/dispositivos.js";
import type { AjustesDeDispositivos } from "../../core/settings.js";
import type { Acto } from "../../core/actos.js";
import type { Tarea } from "../../core/tareas.js";
import type { PendienteDeAprobacion } from "../../core/events.js";
import type { LineaDeDiff } from "../../core/diff.js";
import type { SelectorDeConsola } from "../../cli/consola.js";
// Solo TIPO, y por eso no es un ciclo: `vestibulo.ts` importa este módulo para ejecutar,
// y esta importación se borra al compilar. Se traen de allí en vez de redeclararlos aquí
// porque son los MISMOS pasos y los MISMOS entornos que el vestíbulo calcula; una segunda
// declaración en este fichero sería el tipo de copia que diverge sin que nada chiste.
import type { OpcionDeEntorno, PasoDelVestibulo } from "./vestibulo.js";

/**
 * El informe de `core/dispositivos.ts` SIN la ruta de cada herramienta: es una ruta del
 * home del usuario, el panel no la pinta, y este cable puede ir por un túnel
 * (`--anfitrion`). Campo a campo, nada de más.
 */
export type InformeDeDispositivosDelCable = Omit<InformeDeDispositivos, "herramientas"> & {
  herramientas: Omit<Herramienta, "ruta">[];
};

export type MensajeAlCliente =
  | { clase: "acto"; acto: Acto }
  /**
   * SUSTITUYE el último acto del cliente. Existe porque `pielWeb.alActo` avisa también
   * de ACTUALIZACIONES: el cierre de una racha de tools reemplaza a su apertura dentro
   * del mismo acto `herramientas` (`core/actos.ts#conLineaDeTool`). Un cliente que
   * anexara a ciegas enseñaría las dos líneas para siempre.
   *
   * Solo se emite cuando el acto que cambia ES el último; si algo se escribió después,
   * el transporte manda una `reemision` entera — sustituir «el último» tocaría otro acto.
   */
  | { clase: "sustitucion"; acto: Acto }
  /** El transcript completo: lo que recibe quien (re)conecta, y el arreglo de cualquier desajuste. */
  | { clase: "reemision"; actos: Acto[] }
  /**
   * El saludo, SUELTO del `alta`. `agent/persona.ts#nombreDePersona` no depende de
   * ninguna cuenta ni de ningún login —es `git config`/`os.userInfo()`, local y ya
   * resuelto al construir el vestíbulo—, pero el `alta` solo se manda DESPUÉS de que
   * `conducirCuenta()` termina (`arranque.ts#anunciarAlta`), que puede tardar lo que
   * tarde un humano en elegir modelo y teclear una clave. Sin este mensaje, medido: la
   * pantalla decía «Hola» a secas durante TODO el paso de cuenta, con el nombre ya
   * resuelto y sin ningún sitio por el que viajar hasta que la cuenta se resolviera —
   * un saludo que se sabe y no se dice. Se manda una vez, al conectar, antes de
   * `conducirCuenta()`. `alta.nombre` (más abajo) sigue llevando el MISMO dato — no
   * porque quede alguna conexión sin ver este mensaje (el SSE arranca de cero en cada
   * conexión y siempre lo manda primero), sino porque quitarlo de `alta` cambiaría ese
   * contrato y su test, y eso no es parte de este arreglo.
   */
  | { clase: "bienvenida"; nombre?: string }
  | { clase: "pregunta"; texto: string }
  | { clase: "selector"; selector: SelectorDeConsola }
  /**
   * Los modelos: cuál está en vigor y qué se puede elegir.
   *
   * `actual` es lo que resuelve el papel `trabajo` con las fuentes de la sesión ABIERTA, no
   * lo que diga un fichero: `/modelo` cambia el modelo en caliente y no escribe nada, así
   * que releer la configuración contaría lo de antes. Ausente = no hay sesión de proyecto
   * y por tanto no hay modelo en vigor que afirmar — el cliente enseña «Elige modelo» en
   * vez de inventarse una fila, que es la regla del harness de DeepSeek: «no stale row is
   * synthesized».
   *
   * `modelos` de un proveedor viaja SOLO cuando alguien lo ha pedido (`clase: "catalogo"`):
   * el catálogo es una llamada de red por proveedor y consultarlos todos al conectar sería
   * gastar cinco peticiones para pintar un menú que quizá nadie abra. `error` es el fallo
   * de ESE proveedor y no tumba a los demás — se lista inservible y el resto sigue
   * elegible.
   */
  | { clase: "modelos"; actual?: string; proveedores: ProveedorDeModelos[] }
  /**
   * Los proyectos de UN entorno registrado, en respuesta a la acción «proyectos» de un
   * mensaje de entorno. Lleva el `entorno` dentro porque el cliente los guarda por
   * entorno: son las casillas de una pestaña concreta de Ajustes, y una lista sin dueño se
   * acabaría pintando bajo el nombre de otro servidor.
   *
   * **`proyectos` ausente y `error` puesto no es una lista vacía**: «no se pudo preguntar»
   * no es «este entorno no tiene proyectos», y la pestaña tiene que poder decir lo primero
   * en vez de afirmar lo segundo. El fallo es de ESE entorno y no tumba a los demás —la
   * regla del catálogo de modelos: un desvío, no un callejón—, así que tampoco se pinta un
   * aviso global ni se toca el entorno activo.
   *
   * No va en el `alta` a propósito, aunque `registrados` viaje ahí: el alta se reemite en
   * los dos flancos de cada turno, y meter estas listas dentro obligaría a cachearlas en el
   * proceso. Sin caché hay UNA sola fuente, así que la pestaña no puede contradecir a la
   * barra cuando alguien cree un proyecto en Studio.
   */
  | {
      clase: "proyectosDeEntorno";
      entorno: string;
      proyectos?: ProyectoDeEntorno[];
      error?: string;
    }
  /**
   * Cómo fue el último alta o baja de proveedor personalizado.
   *
   * El motivo viaja EN un mensaje propio y no por `informar`, por lo mismo que el aviso
   * del selector durante el alta: la ventana de ajustes no pinta el transcript, así que un
   * fallo contado como acto de sistema sería mudo justo donde hay que leerlo. `hecho` es
   * lo que deja al formulario cerrarse solo cuando la cosa salió bien.
   */
  | { clase: "proveedor"; hecho: boolean; motivo?: string }
  /**
   * Hay un turno EN VUELO, o dejó de haberlo.
   *
   * El cliente lo necesita para dos cosas que no puede deducir sin mentir: apagar el
   * compositor mientras el agente trabaja —mandar una segunda petición encima solo la
   * encola sin decirlo— y convertir la flecha de enviar en un botón de parar. Deducirlo de
   * los actos (¿llegó un `fin` después del último `usuario`?) fallaría justo cuando importa:
   * un turno que revienta no siempre deja `fin`.
   */
  | { clase: "turno"; activo: boolean }
  /**
   * Lo que lleva consumido la sesión, en sus DOS cuentas.
   *
   * Separadas y no sumadas: los del grafo van contra la clave de API del usuario y los del
   * agente externo contra su suscripción del producto. Sumar tokens es defendible; sumar su
   * coste sería la cifra que miente, así que aquí solo viajan tokens y viajan aparte.
   *
   * Se emite en cada cambio y también al conectar, porque una pestaña que llega a mitad de
   * sesión no vio los anteriores. Ausente = no consta (no hay sesión, o es el de pega) y
   * entonces el cliente NO pinta un cero.
   */
  | {
      clase: "consumo";
      modelo: { entrada: number; salida: number; cache: number };
      externo: { entrada: number; salida: number; cache: number };
      /**
       * Cuánto ocupa la VENTANA ahora, y su tope si se sabe. Otra pregunta que los
       * acumulados: aquéllos dicen lo que la sesión ha costado y esto cuánto margen queda.
       *
       * `tope` ausente es «no se sabe», y entonces no se pinta denominador ni porcentaje —
       * con Ollama no hay tope A PROPÓSITO (cada modelo local trae el suyo), y un
       * porcentaje sobre un número inventado es una mentira con forma de cifra.
       */
      ventana: { usado: number; tope?: number };
    }
  /**
   * Se está ABRIENDO algo: una sesión, o un proyecto que además hay que descargar.
   *
   * Lo dice el SERVIDOR y no lo deduce el cliente, por el mismo motivo que `turno`: solo
   * este lado sabe cuándo empieza y cuándo acaba, y aquí el rango va de «unos cientos de
   * milisegundos» (abrir una copia local: foto de git, checkpointer, sesiones) a «minutos»
   * (descargar el proyecto entero). Deducirlo de que llegue un `alta` nuevo fallaría justo
   * cuando importa: un fallo al abrir también anuncia alta, y una apertura sobre el
   * proyecto que YA estaba activo no cambia nada en él.
   *
   * `activo: false` es el otro flanco y va en un `finally`, así que salir por un error
   * también lo apaga — un indicador de actividad que se queda encendido para siempre es
   * peor que no tenerlo.
   */
  | {
      clase: "abriendo";
      activo: boolean;
      /** Qué se está abriendo, para poder señalarlo en su fila. Solo con `activo`. */
      proyecto?: string;
      sesion?: string;
      /** Además hay que BAJARLO: es la espera larga, y la que hay que decir con palabras. */
      descargando?: true;
    }
  /**
   * Los subagentes dados de alta, para la ventana de ajustes.
   *
   * Se manda entero cada vez que cambia —son pocos y pequeños— en vez de mandar deltas:
   * una lista de cinco elementos no justifica un protocolo de diferencias, y un delta
   * perdido dejaría la ventana enseñando un agente que ya no existe.
   *
   * `problemas` son los `.md` que no se pudieron leer, con su motivo. Van por el cable y no
   * solo al log del servidor porque quien los tiene que arreglar está mirando ESTA ventana:
   * un agente que no aparece y nadie dice por qué se lee como que la aplicación lo perdió.
   */
  | { clase: "agentes"; agentes: AgenteDelCable[]; problemas: string[] }
  /**
   * La cola de tareas entera. Va a TODOS los clientes, como la foto de la máquina y por lo
   * mismo: la cola es de la máquina. `corriendoAqui` es falso en el segundo proceso, y es lo
   * que deja decir que este kanban no avanza.
   *
   * **Y `ejecutaOtroProceso` es la otra mitad, porque «no soy yo» y «no hay nadie»
   * significan lo contrario**: el primero manda a esperar —una tarea creada aquí arrancará
   * cuando ese proceso mire la cola— y el segundo dice que no va a pasar nada hasta que
   * alguna consola tome el relevo. Con un solo booleano, el aviso mandaba a esperar a un
   * proceso que puede no existir. **Ausente = no se sabe** (el cerrojo ni se pudo mirar, o
   * esta ejecución no tiene corredor), y entonces no se afirma ninguna de las dos.
   * **El pid no viaja**: es un dato de la máquina y no le dice nada a quien lo lee.
   */
  | {
      clase: "tareas";
      lista: TareaDelCable[];
      concurrencia: number;
      corriendoAqui: boolean;
      ejecutaOtroProceso?: boolean;
    }
  /**
   * Cómo fue la última augmentación pedida (`{clase:"tarea", accion:"augmentar"}`): el
   * encargo que propone el modelo, o por qué no se pudo. Nunca los dos a la vez.
   */
  | { clase: "tarea"; accion: "augmentado"; encargo: string }
  | { clase: "tarea"; accion: "augmentado"; error: string }
  /**
   * Un trozo del transcript de la sesión de una TAREA que alguien está mirando en vivo.
   *
   * **No es un segundo registro** (decisión 3 del diseño): son los MISMOS actos que se
   * guardan en el `.jsonl` de esa sesión, los mismos que se leen al abrirla después. La
   * lista sale de los actos y nunca del disco, igual que la de artefactos.
   *
   * Va SOLO al cliente que lo pidió y no a todos: el transcript de una tarea no puede
   * aparecer en el chat de quien está trabajando en otra cosa. Y lleva el `tarea` delante
   * porque por el mismo cable puede llegar el transcript de la sesión propia: sin la
   * etiqueta, los actos de una tarea de fondo se mezclarían con la conversación.
   *
   * Los tres `via` son los tres mensajes del transcript de siempre, con otro nombre:
   * `todos` es la reemisión entera (al empezar a mirar y cuando el servidor reemite),
   * `alta` un acto nuevo al final, y `sustitucion` el último que cambió (el cierre de una
   * racha de tools sustituye a su apertura). `actos` es SIEMPRE una lista: con `alta` y
   * `sustitucion`, de un solo elemento — un campo opcional por cada forma habría sido un
   * «ausente no es vacío» de más en la lista blanca del store.
   */
  | { clase: "mirada"; tarea: string; via: "todos" | "alta" | "sustitucion"; actos: Acto[] }
  /**
   * Qué hay en la MÁQUINA para probar la app: el sistema, las herramientas de Android e
   * iOS (adb, emulator, xcrun/simctl, devicectl) con su estado, y a qué dispositivos y
   * simuladores se llega (`core/dispositivos.ts`).
   *
   * Es una FOTO con su hora (`medido`), no un estado en vivo: se toma al conectar el primer
   * cliente y cuando alguien pide actualizarla (el mensaje «dispositivos» del cliente). No se
   * sondea en bucle porque `adb devices` arranca el demonio de adb y `xcrun` puede tardar
   * segundos — un panel que se refresca solo cada pocos segundos lanzaría procesos en la
   * máquina del usuario sin que nadie lo pidiera.
   */
  | {
      clase: "dispositivos";
      informe: InformeDeDispositivosDelCable;
      /**
       * Qué destinos se miran (`core/settings.ts#AjustesDeDispositivos`). Viaja CON la
       * foto porque las dos cosas se leen juntas: una herramienta «desactivada» solo se
       * entiende sabiendo qué interruptor la apagó. **Ausente = nadie ha elegido**, y
       * entonces se miran todos; un `false` es una elección.
       */
      ajustes: AjustesDeDispositivos;
    }
  /**
   * Los ficheros que ESTA sesión ha tocado, y el parche de uno.
   *
   * `via` no es decoración, y son TRES cosas distintas: «git» es «comparado, y esto es lo
   * que hay»; «sin-empezar» es que la sesión todavía no ha volcado ningún acto, así que no
   * ha tocado nada y se sabe; «sin-marca» es que NO se sabe —la sesión se abrió sin git
   * usable, o antes de que esto existiera—. Fundir las tres en una lista vacía haría que
   * «todavía no has hecho nada» y «no se puede saber» se leyeran igual, y la segunda haría
   * creer que un turno no escribió cuando lo que pasa es que no hay con qué comparar.
   */
  /**
   * Lo que ha tocado la sesión. `via` dice CÓMO se ha medido, y desde el 10-09-2026 son
   * cuatro y no tres: `git` es atribución por COMMIT (lo que hizo esta sesión) y
   * `desde-apertura` es la medida vieja —todo lo que ha cambiado en la copia desde que se
   * abrió, de quien sea—, que es lo único posible en una sesión sin sello. Colapsarlas
   * dejaría la pestaña rotulada «Sesión» sobre el trabajo de una tarea de fondo, que es el
   * fallo que se vio en pantalla.
   */
  | {
      clase: "revision";
      via: "git" | "desde-apertura" | "sin-marca" | "sin-empezar";
      ficheros: FicheroTocado[];
      /** Commits de OTRAS sesiones entre los de esta: la lista es exacta, un parche puede
       *  traer hunks ajenos. Ausente = ninguno, o no se pudo medir. */
      mezclados?: number;
    }
  | { clase: "parche"; ruta: string; texto: string; recortado: boolean }
  /**
   * El árbol del proyecto abierto (pestaña Ficheros): rutas relativas, ordenadas y ya
   * filtradas por la misma regla que ve el agente (`agent/arbolDeProyecto.ts`). `error`
   * solo si no se pudo listar, y entonces `rutas` va vacía. Y el contenido de UN fichero,
   * de solo lectura: sin `texto` si es binario o si la ruta se rechazó, con el motivo.
   */
  | { clase: "arbol"; rutas: string[]; recortado: boolean; error?: string }
  | ({ clase: "fichero" } & FicheroDelProyecto)
  /**
   * El contenido de un ARTEFACTO de la sesión, con la MISMA forma que un fichero del
   * proyecto — a propósito: así los visores del cliente son los de la pestaña Ficheros y no
   * una segunda familia de componentes para lo mismo. La `ruta` que trae es la VIRTUAL
   * (`/artefactos/<nombre>`), que es la que el cliente ya conoce por el acto.
   *
   * El HTML no viaja por aquí para VERSE —eso lo pinta un iframe contra `GET /artefacto`,
   * que es la única forma de darle un documento—, sino para leer su fuente cuando se pide.
   */
  | ({ clase: "artefacto" } & FicheroDelProyecto)
  /**
   * Cómo va el paso de receta que se está EJECUTANDO, o cómo acabó.
   *
   * Va a TODOS los clientes, como la foto de la máquina y por lo mismo: la máquina es la
   * misma para todos, y un `sdkmanager` corriendo lo está para las dos pestañas. `lineas` es
   * la COLA del log —lo último, no todo—: un `sdkmanager` verboso son miles de líneas y el
   * cable no es un sitio donde guardarlas.
   */
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
  /** Lo que ofrece un motor externo. `error` en vez de una lista vacía muda: un desplegable
   *  vacío sin motivo se lee como que la ventana está rota. */
  | { clase: "modelosDeMotor"; motor: string; modelos: { id: string; nombre: string }[]; error?: string }
  | { clase: "secreto"; pregunta: string }
  /**
   * El registro de comandos de barra, para que el compositor sugiera sin llevar una
   * copia: `nombre` va con la «/» delante (lo que el usuario teclea), `descripcion` es
   * la misma que `COMANDOS[nombre].descripcion` en `cli/consola.ts`. Quien registre la
   * ruta de conexión lo arma recorriendo ese registro — no hay lista escrita a mano en
   * ningún punto de este cable.
   */
  | { clase: "comandos"; comandos: { nombre: string; descripcion: string }[] }
  /**
   * El alta que FALTA, para el wizard del navegador. `pasos` sale de
   * `vestibulo.ts#pasosPendientes`, que los calcula preguntándole al sistema y nunca a una
   * marca de «primer arranque»; vacío significa que no hay alta que hacer y el cliente no
   * pinta el wizard — pero puede seguir sin haber proyecto abierto, ver `proyectoAbierto`
   * más abajo. Cambio de rumbo del usuario: «proyecto» ya NO puede aparecer en `pasos`
   * (sigue siendo un `paso` válido del lado del `MensajeDelCliente`, para abrir uno desde
   * la barra lateral, pero no bloquea la entrada al dashboard).
   *
   * `proyectos` y `ramas` llegan vacíos hasta que hay entorno (y proyecto) elegidos: son
   * dos consultas a CloudStudio y no se pueden inventar. Lista vacía es «todavía no lo
   * sé», que es la verdad, y no un dato de relleno.
   *
   * **La clave de API NO viaja aquí.** El paso de cuenta lo conduce
   * `vestibulo.pasoDeCuenta()` sobre `seleccionar` y `leerSecreto`, así que la clave sigue
   * entrando por el mensaje de clase «secreto» y por ninguno más — el mismo trato que
   * documentan `consolaWeb.ts#leerSecreto` y la cabecera de `Wizard.tsx`.
   */
  | {
      clase: "alta";
      pasos: PasoDelVestibulo[];
      proveedores: { id: string; nombre: string }[];
      entornos: OpcionDeEntorno[];
      /**
       * Los entornos REGISTRADOS de verdad (`settings.json`), que no son los OFRECIDOS de
       * `entornos` —esa es la lista fija de los dos oficiales más «otro», y sirve para
       * prerrellenar la URL del alta—. Hacía falta desde que el registro deduce la
       * identidad del host: un on-premise registrado no aparece en la ofrecida por ningún
       * lado, y la barra lateral llevaba enseñando la ofrecida como si fuera ésta.
       */
      registrados: EntornoRegistrado[];
      /**
       * El id del proyecto ABIERTO ahora mismo, y el de su sesión.
       *
       * `proyectoAbierto` (booleano, más abajo) dice SI hay uno; estos dicen CUÁL, que es
       * otra pregunta y la que necesita la barra para marcar la fila. Se resuelven
       * comparando la raíz de la consola abierta con la que le tocaría a cada proyecto
       * (`raizDeProyecto`), no guardando un id aparte: dos fuentes para lo mismo divergen
       * en cuanto una se olvide de actualizarse.
       *
       * `sesionActiva` puede faltar con un proyecto abierto, y no es un fallo: el id de
       * sesión no existe hasta que se vuelca el primer acto (`ConsolaDeProyecto.sesion`),
       * así que una sesión recién empezada todavía no tiene nada que marcar — igual que
       * tampoco aparece en la lista de sesiones guardadas.
       */
      proyectoActivo?: string;
      sesionActiva?: string;
      /**
       * Con qué dispositivo trabaja la sesión abierta. Ausente = ninguno elegido.
       *
       * Viaja la FOTO y no solo el id porque los ids no son estables —`emulator-5554` es un
       * puerto, y un teléfono se desenchufa—: al reabrir una sesión, el selector puede decir
       * «iPhone 16 · no está ahora» en vez de un serial crudo o nada. Si está a mano AHORA
       * no se manda: eso lo resuelve el cliente contra la última medida, que es la única que
       * lo sabe en este instante.
       */
      dispositivoActivo?: { id: string; nombre: string; plataforma: "android" | "ios"; clase: "emulador" | "simulador" | "fisico" };
      /**
       * La sesión abierta es una RELECTURA: se reabrió y del hilo no queda memoria
       * (`ConsolaDeProyecto.historica`, que lo PREGUNTA al checkpointer del proyecto en vez
       * de darlo por hecho — una sesión con checkpoint continúa y no lleva esta marca; la
       * llevan las de antes de que hubiera checkpointer y aquellas cuyo primer turno nunca
       * llegó a correr). Deja de serlo en el primer turno nuevo,
       * y el alta se reanuncia en ese flanco. Solo viaja cuando es cierto: ausente es «no».
       * Sin esto el cliente pintaba una conversación y un compositor activo como si se
       * pudiera seguir hablando, que es lo que el propio `CLAUDE.md` dice que no pasa.
       */
      historica?: boolean;
      /**
       * Las escrituras de este proyecto se aplican SIN pedir aprobación
       * (`core/settings.ts#seAplicaSinAprobacion`). Ausente = se pide, que es lo normal.
       * Viaja en el alta y no solo en el aviso del turno porque quien se sienta hoy tiene
       * que saberlo ANTES de pedir nada, no después con los ficheros ya cambiados.
       */
      sinAprobacion?: boolean;
      /**
       * Lo que YA estaba sin commitear en el proyecto cuando se abrió esta consola
       * (`agent/gitSync.ts#trabajoSinCommitear`, medido en el instante de abrir).
       *
       * Ausente = no hay nada que decir, y son las tres respuestas que se callan a
       * propósito: el árbol estaba limpio, no hay git con qué mirar (todo proyecto
       * OFFLINE), o la medida falló. Ninguna de las tres es un aviso.
       *
       * Va la lista y no un número: quien lo lee tiene que poder reconocer si eso es suyo,
       * de otra sesión o de una tarea, y un contador a secas es el aviso que enseña a
       * ignorar los avisos. `ficheros` viene ACOTADA —el alta se reemite en los dos flancos
       * de cada turno y la frase no puede llevar trescientos nombres— y `total` es la cifra
       * entera, que es lo que impide leer los que caben como si fueran todos.
       *
       * La medida es del instante de ABRIR y no cambia con los reanuncios, a propósito: así
       * no puede contar como «de otro» lo que esta misma sesión —o esta tarea— acabe de
       * escribir.
       */
      trabajoAlAbrir?: { ficheros: string[]; total: number };
      /**
       * De qué entorno son los `proyectos` de este mensaje. Ausente = todavía de ninguno
       * (nadie ha elegido y no había ninguno registrado que poblar). El cliente lo NECESITA
       * para no tener que asumir «el primero de la lista», que es lo que hacía y era una
       * suposición que se rompía en cuanto había dos.
       */
      entornoActivo?: string;
      /**
       * Los proyectos del entorno, con las SESIONES que ya tiene su copia local (vacío si
       * no se ha bajado nunca). Van en el mismo mensaje porque la barra los pinta juntos:
       * un proyecto sin sus sesiones es una fila que no se puede abrir por donde se dejó.
       */
      proyectos: {
        id: string;
        nombre: string;
        /**
         * Compartido CONTIGO por otra persona (`shared` de `studio_list_projects`).
         * **Ausente no es «es tuyo»**: es que el servidor no lo dijo, y entonces no se
         * pinta etiqueta ninguna — afirmar que todos son propios porque un endpoint viejo
         * calló sería la clase de dato inventado que esta consola no consiente.
         *
         * Es un booleano y NO el correo del propietario, que viaja en la misma respuesta
         * (`suser`): para distinguir lo propio de lo compartido basta con esto, y quién lo
         * compartió es un dato de una persona que esta pantalla no necesita.
         */
        compartido?: boolean;
        sesiones?: {
          id: string;
          titulo: string;
          /**
           * Cuándo se tocó por última vez, en ISO. Es lo que ordena la lista y lo que la
           * barra pinta a la derecha de cada fila. Ausente = el índice no lo dice (una
           * entrada corrupta): la fila se pinta sin sello y se ordena la última.
           */
          ultimoTurno?: string;
          /**
           * Esta conversación la abrió una TAREA de fondo, no una persona
           * (`EntradaIndice.tarea`). Viaja un booleano y no el id: la fila lleva una marca
           * y no el nombre de la tarea, así que el id se queda en el host.
           *
           * **Ausente es «no consta», no «es un chat»**: no la lleva ninguna sesión
           * anterior a esta marca. Se pinta liso porque liso es lo conservador, no porque
           * conste que sea de una persona — igual que `compartido` en un proyecto.
           */
          deTarea?: true;
          /**
           * Esa conversación tiene un turno EN MARCHA ahora mismo, sea o no la que se está
           * mirando. Es lo que hace visible que cambiar de sesión ya no interrumpe nada: el
           * agente sigue trabajando en la de antes y la barra lo dice.
           *
           * Va en el ALTA y no en un mensaje propio porque el alta se reemite en los dos
           * flancos de cada turno —de cualquiera de las consolas vivas—, que es exactamente
           * cuando esto cambia.
           *
           * **Ausente es «no consta que esté trabajando»**, y eso incluye dos casos que no
           * se pueden distinguir desde aquí: la sesión no tiene consola viva, o la tiene y
           * está ociosa. Para lo que la barra pinta da igual; afirmar lo contrario, no.
           */
          trabajando?: true;
        }[];
        /** La copia local YA existe: se puede abrir sin bajar nada ni preguntar rama. */
        local?: boolean;
        /**
         * Alguna sesión de este proyecto tiene un turno EN MARCHA ahora mismo.
         *
         * No se DERIVA de `sesiones[].trabajando`, y ahí está el motivo de que exista: una
         * sesión nueva no tiene fila en el índice hasta que vuelca su primer acto —o sea al
         * final del turno—, así que el caso más común (abrir, pedir algo, irse a otro
         * proyecto) no habría marcado ni la fila ni el proyecto, y en la barra no se vería
         * nada en ninguna parte.
         *
         * De aquí cuelga además que las OTRAS sesiones de ese proyecto no se puedan abrir
         * mientras dure: una copia de trabajo no aguanta dos conversaciones, y el servidor
         * lo declina (`motivoDeProyectoTrabajando`). Decirlo antes del clic es lo que evita
         * el botón muerto.
         */
        trabajando?: true;
      }[];
      ramas: string[];
      /**
       * Qué falló en el paso anterior. Ausente = no falló nada.
       *
       * Viaja EN el alta y no solo como acto porque el fallo pertenece al paso que lo
       * produjo. Medido en el navegador: el acto de sistema aterriza en la Trayectoria —la
       * pestaña que el usuario no está mirando— mientras el wizard repinta el mismo paso
       * sin una palabra, que es exactamente el fallo mudo que se quería quitar.
       */
      aviso?: string;
      /**
       * El saludo (`agent/persona.ts#nombreDePersona`). Viaja SUELTO en este mensaje, no
       * dentro de ningún acto: `Bienvenida.tsx` lo pinta y nada más, así que no entra en
       * el `.jsonl` de una sesión ni en el transcript. Ausente = sin nombre que saludar.
       */
      nombre?: string;
      /**
       * Si hay un proyecto abierto AHORA MISMO en esta conexión. Hace falta desde que el
       * paso de proyecto salió del alta: antes, `pasos: []` solo pasaba con un proyecto
       * ya abierto, y esa implicación bastaba para que el cliente supiera si pintar la
       * maqueta completa o el alta. Ahora `pasos: []` pasa en cuanto cuenta y entorno
       * están resueltos, CON o SIN proyecto abierto —el proyecto se elige en la barra—,
       * así que hace falta decirlo aparte para que el centro sepa si esperar una elección
       * o pintar la sesión de verdad.
       */
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
  /** El ÚNICO mensaje que lleva contenido de fichero: es el paso donde se DECIDE sobre él. */
  | {
      clase: "aprobacion";
      pendientes: PendienteDeAprobacion[];
      ficheros: Record<string, string>;
      diffs: Record<string, LineaDeDiff[]>;
    };

/**
 * Un proveedor, tal y como lo ve el selector de modelos.
 *
 * `credencial` es literal y tiene TRES valores porque hay tres cosas distintas que decir:
 * «puesta» solo si la credencial está confirmada, «falta» solo si se sabe que no está, y
 * «nativa» para quien no necesita ninguna (Ollama local). Pintarle un punto rojo a Ollama
 * sería inventarse un problema, y uno verde, un permiso.
 */
/**
 * Un entorno ya registrado, con la elección de qué proyectos suyos se enseñan.
 *
 * `proyectos` AUSENTE no es «ninguno»: es que nadie lo ha dicho, y entonces la barra aplica
 * su omisión (los primeros `PROYECTOS_POR_OMISION`). Una lista vacía sí es una elección.
 */
export interface EntornoRegistrado extends OpcionDeEntorno {
  proyectos?: string[];
}

/**
 * Un proyecto de un entorno, para elegir si se enseña. Es menos de lo que lleva un proyecto
 * del `alta`: sin `sesiones`, porque una sesión es de la COPIA LOCAL y aquí solo se decide
 * qué aparece en la barra. Lo que no hace falta, no viaja.
 */
export interface ProyectoDeEntorno {
  id: string;
  nombre: string;
  /** Compartido contigo por otra persona. Ausente no es «es tuyo»: es que no se dijo. */
  compartido?: boolean;
}

/** Un fichero de la sesión. `mas`/`menos` faltan en un binario: git no cuenta líneas ahí, y
 *  poner cero diría que no cambió nada. */
export interface FicheroTocado {
  ruta: string;
  clase: "nuevo" | "modificado" | "borrado";
  mas?: number;
  menos?: number;
  /** Hay cambios en este fichero que nadie ha commiteado, así que no se pueden atribuir a
   *  esta sesión ni a otra (`agent/sesionGit.ts#FicheroDeSesion`). Viaja para poder DECIRLO
   *  en la fila: el turno en vuelo commitea al terminar, y esta es la única marca que
   *  distingue «lo escribió esta sesión» de «esto está aquí y no consta de quién es». */
  sinCommitear?: true;
}

/** Un fichero del proyecto tal como viaja. Redeclarado en `apps/web/src/tipos.ts`. */
export interface FicheroDelProyecto {
  /** La ruta tal como se pidió, nunca la resuelta en disco. */
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
 * lo que la interfaz necesita — la ruta se queda en el host, igual que `Herramienta.ruta`.
 * Redeclarada en `apps/web/src/tipos.ts`.
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
   * proyecto (`core/tareas.ts#Tarea.autorizadas`). **No es lo mismo que lo que cambió en el
   * disco** —una ruta que las guardas de sitio rechazan sale aquí sin haberse escrito—: la
   * verdad sobre el disco la tiene la pestaña Revisión, con la ref de esta `sesion`. Ausente
   * = no consta (la tarea no llegó a correr un turno); `[]` = corrió y no autorizó ninguna.
   */
  autorizadas?: string[];
  /**
   * El historial de lo que el desarrollador contestó mientras la tarea esperaba feedback
   * (`core/tareas.ts#Tarea.feedback`). Ausente = nunca se le pidió nada. `consumido` dice
   * si ya se le mandó al agente en un turno.
   */
  feedback?: { texto: string; creado: string; consumido: boolean }[];
  /**
   * El veredicto del juez de QA (`core/entrega.ts#VeredictoDeTarea`), y con él la
   * SALVEDAD: con qué condición de menos se entregó.
   *
   * **Sin esto, «Terminada» no distingue tres cosas distintas** —F1 de la revisión final—:
   * que el juez la aprobó con el verificador en verde, que se entregó SIN NADA que
   * verificar (una tarea de solo lectura: la salvedad), y —con `terminadaAMano`— que la dio
   * por buena una persona. El campo se guardaba en el índice de tareas desde que existe la
   * puerta de entrega y se quedaba en el host: la mitad del contrato en `core/` y en disco,
   * y la mitad que una persona lee sin cablear.
   *
   * **Y viaja completo porque no puede llevar nada más que texto para leer.** Medido en
   * `agent/juezDeTarea.ts#promptDelJuez`: el juez recibe el encargo, las rutas RELATIVAS de
   * lo autorizado y los hallazgos del verificador (código, fichero relativo, línea,
   * mensaje) — no hay un solo `readFile` en ese módulo, así que su prosa no puede citar el
   * contenido de un fichero ni una ruta de la máquina. El `resumen` ya cruzaba el cable de
   * todos modos: para un veredicto rojo va dentro del `motivo`.
   */
  veredicto?: {
    veredicto: "verde" | "rojo" | "indeterminado";
    resumen: string;
    hallazgos?: string[];
    salvedad?: string;
  };
  /**
   * La dio por buena una PERSONA («Dar por bueno»), no la puerta de entrega
   * (`core/tareas.ts#Tarea.terminadaAMano`). Ausente = no consta.
   */
  terminadaAMano?: boolean;
}

/**
 * Una `Tarea` del índice traducida a lo que viaja. **La raíz del proyecto se queda aquí.**
 *
 * **Vive en este fichero, exportada, y eso es el arreglo de F1.** Era una copia de campos a
 * mano enterrada en el cierre de `montarRutas` (`arranque.ts`), a mil líneas del tipo que
 * traduce y dentro de algo que todos sus tests doblan — o sea el patrón de fallo que
 * `CLAUDE.md` documenta cinco veces en esta misma tanda: «si una regla de producción se
 * compone dentro de algo que los tests simulan, esa regla no está probada: está escrita».
 * `veredicto` se cayó aquí y en el store del cliente sin que nada se pusiera rojo. Ahora
 * `transporte.test.ts` recorre los campos de `Tarea` y exige decisión explícita por cada
 * uno.
 *
 * Campo a campo, y también DENTRO del veredicto: un `...tarea.veredicto` dejaría pasar sin
 * nombrar el campo que alguien le añada mañana a `VeredictoDeTarea`.
 */
export function filaDeTarea(t: Tarea): TareaDelCable {
  return {
    id: t.id,
    // El ID, que es con lo que la interfaz filtra; el nombre va aparte, para leer. La RAÍZ
    // no viaja: es una ruta de la máquina.
    proyecto: t.proyecto.id,
    proyectoNombre: t.proyecto.nombre,
    titulo: t.titulo,
    peticion: t.peticion,
    encargo: t.encargo,
    adjuntos: t.adjuntos,
    estado: t.estado,
    creada: t.creada,
    ...(t.motivo === undefined ? {} : { motivo: t.motivo }),
    ...(t.sesion === undefined ? {} : { sesion: t.sesion }),
    ...(t.empezada === undefined ? {} : { empezada: t.empezada }),
    ...(t.acabada === undefined ? {} : { acabada: t.acabada }),
    ...(t.autorizadas === undefined ? {} : { autorizadas: t.autorizadas }),
    ...(t.feedback === undefined ? {} : { feedback: t.feedback }),
    ...(t.veredicto === undefined
      ? {}
      : {
          veredicto: {
            veredicto: t.veredicto.veredicto,
            resumen: t.veredicto.resumen,
            ...(t.veredicto.hallazgos === undefined ? {} : { hallazgos: t.veredicto.hallazgos }),
            ...(t.veredicto.salvedad === undefined ? {} : { salvedad: t.veredicto.salvedad }),
          },
        }),
    ...(t.terminadaAMano === undefined ? {} : { terminadaAMano: t.terminadaAMano }),
  };
}

export interface ProveedorDeModelos {
  id: string;
  /**
   * Cómo se ESCRIBE, que no es el id. Lo pone el servidor (`core/modelos.ts#nombreDeProveedor`)
   * y no el cliente: capitalizar un id en el navegador daría «Xai» y «Ollama-cloud».
   */
  nombre: string;
  credencial: "puesta" | "falta" | "nativa";
  /**
   * La credencial está en `auth.json` — o sea, es NUESTRA y se puede borrar desde la
   * interfaz. Una que solo viene del entorno no lleva esta marca: desexportar la shell de
   * nadie no está a nuestro alcance, y ofrecer un botón que no puede cumplir sería peor
   * que no ofrecerlo. Misma disciplina que el harness de DeepSeek, que solo retira la
   * credencial cuya referencia puede demostrar suya.
   */
  enFichero?: boolean;
  /** Lo declaró el usuario (`custom:<slug>`), no viene de serie. */
  personalizado?: boolean;
  /** Su URL base, SOLO en los personalizados: es lo que tecleó el usuario y lo que hay que
   *  ver al lado de su clave para saber a dónde va. Los de serie la tienen en el repo. */
  baseUrl?: string;
  /** Ausente = todavía no se ha consultado su catálogo. Vacío = lo dijo y no ofrece nada. */
  modelos?: { id: string; nombre?: string }[];
  /** El catálogo de ESTE proveedor falló. Nunca lleva la clave ni el cuerpo remoto. */
  error?: string;
}

export type MensajeDelCliente =
  | { clase: "prosa"; texto: string }
  /**
   * «Ponme este modelo», dicho por un control de la interfaz: `proveedor/modelo` y nada
   * más.
   *
   * El cliente NO manda comandos. Podría mandar la prosa `/modelo <id>` —es el mismo
   * efecto— y estuvo escrito así un rato, pero eso son dos mentiras pequeñas: el transcript
   * se apunta un acto de USUARIO que nadie tecleó (y de ahí sale el título de la sesión), y
   * la interfaz queda hablando en la sintaxis de otra piel. Lo que viaja es la intención;
   * CÓMO se aplica es cosa del servidor, y hoy es reusando el manejador de `COMANDOS` que
   * ya comparten el terminal y la TUI — la función se comparte, la sintaxis no se exporta.
   */
  | { clase: "modelo"; id: string }
  /**
   * Abrir una sesión de un proyecto: la que se nombra, o una NUEVA si no se nombra ninguna.
   *
   * Es la acción de la barra lateral, y no pasa por el alta: si la copia local ya existe no
   * hay nada que dar de alta ni rama que preguntar — se abre y ya. Si no existe, el
   * servidor contesta con las ramas por el camino del alta, que es el que sabe bajarla.
   */
  | { clase: "sesion"; proyecto: string; sesion?: string }
  /**
   * Lo que se hace con una sesión GUARDADA desde el menú de su fila: borrarla o ponerle
   * nombre. Va aparte de abrir (arriba) y no como un campo opcional de aquel, porque son
   * verbos distintos con consecuencias distintas: uno abre y los otros dos escriben en el
   * índice del proyecto — y borrar, además, puede cerrar la consola si es la sesión abierta.
   *
   * `titulo` solo lo lleva «renombrar», y vacío se rechaza en el servidor: dejar el título en
   * blanco devolvería la sesión al régimen automático y el siguiente turno la rebautizaría
   * con la primera frase, borrando en silencio el nombre que puso una persona.
   */
  | { clase: "sesionAccion"; accion: "borrar"; proyecto: string; sesion: string }
  | { clase: "sesionAccion"; accion: "renombrar"; proyecto: string; sesion: string; titulo: string }
  /** Qué proyectos de un entorno se enseñan en la barra. Lista vacía = ninguno, que es una
   *  elección; para volver a la omisión no hay mensaje, porque no hay «deshacer» que pedir. */
  | { clase: "entorno"; accion: "visibles"; entorno: string; proyectos: string[] }
  /** Cambiar de entorno ACTIVO: el de cuyos proyectos se habla. Trae su listado consigo. */
  | { clase: "entorno"; accion: "activo"; entorno: string }
  /**
   * «Dime qué proyectos tiene ESTE entorno», sin hacerlo activo. Es lo que necesita la
   * pestaña de un entorno en Ajustes para poder marcar sus casillas, y la diferencia con
   * `activo` es justo lo que la hace usable: abrir Ajustes a elegir proyectos es MIRAR, y
   * mudar el entorno activo le cambiaría la barra lateral —y los proyectos de los que se
   * habla— a quien esté trabajando en otro servidor.
   *
   * Se pide al abrir esa pestaña y no antes, por lo mismo que el catálogo de un proveedor
   * (`clase: "catalogo"`): cada uno es una conexión con CloudStudio (OAuth + `initialize` +
   * `studio_list_projects`), y consultarlos todos al conectar sería gastar una petición por
   * entorno para pintar unas casillas que quizá nadie abra. La respuesta es
   * `proyectosDeEntorno`, con su lista o con su `error`.
   */
  | { clase: "entorno"; accion: "proyectos"; entorno: string }
  | { clase: "respuesta"; texto: string }
  /**
   * La respuesta a `seleccionar`. **Sin `id` (o con `id: null`) es CANCELAR**, que es
   * exactamente lo que `seleccionar` ya devuelve al desconectarse y al vencer su plazo — en
   * el terminal cancelar es una salida de primera clase («número, Enter cancela»), así que
   * la web no puede tener menos. Se aprovecha esta clase en vez de añadir otra: el contrato
   * del cable no crece y la traducción a `undefined` vive en un solo sitio
   * (`consolaWeb.ts#recibir`). `undefined` viaja como la AUSENCIA del campo, porque
   * `JSON.stringify` descarta las claves con ese valor; `null` se admite porque es lo que
   * escribiría un cliente que lo serialice explícitamente, y dice lo mismo.
   *
   * Un `id` vacío o desconocido NO es cancelar: es un id que no existe, y así se lo pasa a
   * quien llamó. Traducirlo aquí a cancelación convertiría el bug de un cliente en un
   * usuario que se echó atrás.
   */
  | { clase: "eleccion"; id?: string | null }
  | { clase: "secreto"; valor: string }
  /**
   * Un paso del alta, resuelto por el wizard. Es UNA clase y no tres porque los tres son
   * el mismo trámite —el alta— y quien la atiende es un solo sitio (`web/servidor/arranque.ts`);
   * tres clases obligarían a mantener tres ramas del cable de acuerdo entre sí sin ganar
   * nada.
   *
   * Con `paso` «proyecto» y SIN `rama` no se abre nada: significa «he elegido proyecto,
   * dime sus ramas», y el servidor contesta con otro mensaje de alta con `ramas` llenas.
   * Es lo que evita inventarse las ramas del primer proyecto de la lista antes de que
   * nadie haya elegido — el mismo «lista vacía, no dato inventado» del otro extremo.
   *
   * Aquí NO hay campo para la clave de API: el paso de cuenta va por «secreto».
   */
  | {
      clase: "alta";
      paso: PasoDelVestibulo;
      entorno?: { id: string; nombre: string; url: string };
      proyecto?: string;
      rama?: string;
    }
  /**
   * El valor es el `Decision["type"]` que el pendiente declara en `decisionesPermitidas`,
   * no una respuesta tecleada: el cliente son botones. `consolaWeb` lo traduce a la
   * respuesta que `interpretAnswer` entiende, en vez de comparar cadenas por su cuenta.
   */
  /**
   * «Dime qué modelos sirve este proveedor.» Se pide al abrir el menú de ese proveedor y no
   * antes: cada uno es una llamada de red. La respuesta es otro mensaje `modelos` con ese
   * proveedor ya relleno — o con su `error` puesto, que también es una respuesta.
   */
  | { clase: "catalogo"; proveedor: string }
  /**
   * Vuelve a mirar qué dispositivos y simuladores hay. La respuesta viaja por el SSE como
   * `dispositivos`, a todos los clientes: la máquina es la misma para todos.
   */
  | {
      clase: "dispositivos";
      /**
       * Con `ajustes` se GUARDAN antes de volver a medir; sin ellos solo se vuelve a medir.
       * Es el mismo mensaje para las dos cosas porque configurar sin remedir dejaría la
       * pantalla enseñando la foto de la configuración anterior.
       */
      ajustes?: AjustesDeDispositivos;
      /**
       * Instala una herramienta que falta, y después se vuelve a medir. El comando NO viaja
       * del cliente: viaja el NOMBRE de la herramienta y el servidor decide qué lanzar
       * (`INSTALADORES`, tabla cerrada) — un comando que llegue por el cable es una shell
       * abierta en la máquina del usuario.
       */
      instalar?: NombreDeHerramienta;
    }
  /**
   * Con qué dispositivo trabaja la sesión abierta. Viaja el ID y nada más: el servidor lo
   * resuelve contra la última medida y guarda la foto — un nombre que llegue del cliente no
   * es una fuente sobre la máquina. Sin `id`, se quita la elección.
   */
  | { clase: "dispositivo"; id?: string }
  /**
   * VERIFICAR la conexión con un dispositivo: hablarle y esperar respuesta.
   *
   * Viaja el ID y nada más, la misma regla que `dispositivo`: el servidor lo resuelve contra
   * la última MEDIDA y de ahí saca la plataforma y la clase, que son las que deciden qué
   * comando se lanza. Un id que no esté en la medida se ignora — es una foto vieja del
   * cliente, no un error.
   *
   * **Es un mensaje propio y no un campo de `dispositivos`**, aunque las dos cosas acaben
   * emitiendo el informe: `dispositivos` significa «vuelve a MEDIR», y una medida nueva se
   * lleva por construcción todas las verificaciones —viven con la foto—. O sea que meterlo
   * ahí habría borrado la verificación que se acaba de hacer.
   */
  | { clase: "conexion"; id: string }
  /**
   * La credencial de un proveedor, desde la ventana de ajustes.
   *
   * «pedir» hace que el servidor PREGUNTE por ella (`leerSecreto`), así que la clave sigue
   * viajando por el ÚNICO mensaje del cable que la lleva («secreto») y este mensaje no la
   * toca. «borrar» la quita de `auth.json`.
   *
   * Podría haber viajado como la prosa `/provider <id>`, que es el mismo diálogo, pero esa
   * ruta necesita el lazo de `correrConsola` — y el lazo solo existe con un proyecto
   * abierto. La ventana de ajustes se abre antes, así que tiene su propio mensaje.
   */
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
   * `ambito` decide en qué carpeta se escribe, y viaja explícito en vez de deducirse de si
   * hay proyecto abierto: con uno abierto valen las dos, y adivinar cuál quiere el usuario
   * es cómo un «revisor» que quería para todos los proyectos acaba escondido en uno.
   */
  | {
      clase: "agente";
      accion: "guardar" | "borrar";
      ambito: "global" | "proyecto";
      agente: AgenteDelCable;
    }
  /** Parar el turno en vuelo. Aborta el `stream` del grafo (`SesionReal.cancelar`) y deja
   *  la sesión viva: es parar ESTO, no cerrar la conversación. */
  | { clase: "cancelar" }
  /** Pide lo que la sesión abierta ha tocado, o el parche de un fichero concreto. */
  | { clase: "revision"; ruta?: string }
  /** Pide el árbol del proyecto abierto, o el contenido de una ruta relativa a su raíz. */
  | { clase: "arbol" }
  | { clase: "fichero"; ruta: string }
  /**
   * El contenido de un artefacto de la sesión abierta. Se pide por NOMBRE y no por ruta: la
   * carpeta la compone el servidor con el id del hilo, y aceptar una ruta del cliente sería
   * abrir a negociación justo la parte que es una barrera.
   */
  | { clase: "artefacto"; nombre: string }
  /**
   * Ejecuta —o cancela— un paso de una receta de instalación.
   *
   * Viajan el NOMBRE de la receta y el NÚMERO del paso, nunca un comando ni un binario: un
   * comando que llegue del cliente es una shell abierta en la máquina del usuario. Qué se
   * lanza lo decide una tabla cerrada del host (`agent/instalacionEnMaquina.ts`).
   */
  | { clase: "receta"; id: string; paso: number; accion: "ejecutar" | "cancelar" }
  /** Los modelos que ofrece un MOTOR externo, para el desplegable de un subagente. Se pide
   *  bajo demanda: el de Codex se le pregunta a él, y eso arranca un proceso. */
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
  /**
   * «Se edita la tarea y se agrega el feedback del usuario» (§0 del diseño): la respuesta a
   * una tarea «esperando feedback», que la devuelve al lazo en su MISMO hilo. Es su propia
   * variante y no un tercer campo opcional en `reintentar` porque lleva `texto` y las otras
   * tres no llevan nada — un campo que solo tiene sentido en una de cuatro acciones es la
   * misma mentira por omisión que una lista vacía rellenada.
   */
  | { clase: "tarea"; accion: "feedback"; id: string; texto: string }
  | { clase: "tarea"; accion: "reintentar" | "descartar" | "terminar"; id: string }
  /** Cambia el tope de concurrencia de la cola de tareas. */
  | { clase: "tareas"; concurrencia: number }
  /**
   * Empezar (`ver: true`) o dejar de mirar en vivo lo que hace una tarea.
   *
   * **`cliente` es lo que hace que esto sea por CLIENTE y no una emisión a todos.** El SSE
   * y el `POST /accion` son dos peticiones distintas, así que el único sitio con un sumidero
   * en la mano es la ruta del SSE: sin un identificador, el servidor no podría saber a qué
   * pestaña engancharle la mirada, y tendría que mandarle el transcript de la tarea a todo
   * el mundo. Lo elige el cliente —una vez por conexión— igual que elige el id de una tarea
   * al subirle un adjunto por `POST /adjunto`, y se valida como un segmento llano; uno que
   * no conste es un fallo de lookup y no un error que contar.
   *
   * `ver` es explícito y no «ausente = dejar de mirar»: son dos intenciones opuestas y
   * confundirlas dejaría un sumidero enganchado a un turno que nadie mira.
   */
  | { clase: "mirar"; tarea: string; ver: boolean; cliente: string }
  | { clase: "decision"; decisiones: Record<string, string> };

/**
 * Un subagente tal y como viaja: los campos del `.md` y de dónde salió.
 *
 * `origen` es de solo lectura —lo pone el servidor al leer— y sirve para que la ventana
 * pueda decir si un agente viene del global o del proyecto, que es lo que explica por qué
 * editarlo aquí no afecta a los demás proyectos.
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

/** A dónde escribe el SSE. Ausente = no hay nadie al otro lado. */
export type Sumidero = (mensaje: MensajeAlCliente) => void;

export interface Transporte {
  /**
   * Un cliente abre el SSE. Devuelve los actos que hay que reemitirLE: quien registra la
   * ruta los manda como una `reemision` con su propia escritura —solo a ese sumidero—, así
   * que esto NO los emite; hacerlo se los mandaría también a los demás clientes, que ya
   * tienen el transcript.
   *
   * **Se admite más de uno.** Antes había UNA ranura y el último en conectar desplazaba al
   * anterior en silencio: la pestaña vieja se quedaba con el SSE abierto y sin recibir
   * nada, así que su interfaz se congelaba en el último estado que le llegó —medido con
   * una pestaña local y otra por un túnel: el menú de modelos se quedaba en «consultando…»
   * para siempre porque la respuesta se la llevaba la otra—. Un servidor que acepta la
   * conexión tiene que hablarle.
   */
  conectar(enviar?: Sumidero): readonly Acto[];
  /**
   * Un SSE se cae, o se cierra una pestaña. Con el sumidero se dice CUÁL se va; sin él se
   * van todos (es lo que hace `cerrar`).
   *
   * Fail-closed sigue significando lo mismo, pero sobre el conjunto: quien espera respuesta
   * deja de esperar cuando se va el ÚLTIMO cliente, no el primero. Cortar a la primera baja
   * rechazaría la aprobación que otra pestaña abierta todavía tiene delante.
   */
  desconectar(enviar?: Sumidero): void;
  /**
   * El cable se MUDA a otra consola: se sueltan los sumideros y NADA más.
   *
   * La diferencia con `desconectar` es toda la razón de que exista, y es de significado, no
   * de implementación: `desconectar` afirma «se ha ido el humano» —despierta con la cadena
   * vacía a todo el que esperaba respuesta y da por rechazada la aprobación que hubiera
   * delante—, y eso es cierto cuando el SSE se cae y FALSO cuando alguien cambia de sesión
   * en la barra teniendo esta con un turno corriendo: la persona sigue ahí, mirando otra
   * cosa. Con `soltar`, `conectado()` sigue diciendo que hay alguien —así que su aprobación
   * espera su plazo en vez de rechazarse sola— y lo que se emita mientras tanto no llega a
   * ningún socket, que es exactamente lo que se quiere: los actos de un turno de segundo
   * plano no pueden aparecer en la conversación que se está mirando.
   *
   * Los MIRONES no se sueltan: los quita `dejarDeMirar`, y aquí la consola no se cierra
   * —su socket sigue vivo—, al contrario que en `desconectar()` sin sumidero.
   */
  soltar(enviar?: Sumidero): void;
  /** ¿Queda alguien al otro lado? Es lo que `consolaWeb.eof()` usa para saber si hay humano. */
  conectado(): boolean;
  /**
   * Alguien MIRA lo que esta consola pinta, sin ser su cliente. Devuelve el transcript de
   * ese instante, igual que `conectar` y por lo mismo: emitirlo aquí se lo mandaría también
   * a los demás, que ya lo tienen.
   *
   * Es un conjunto APARTE del de los clientes, y las dos diferencias son el motivo de que
   * exista en vez de reusar `conectar`:
   *  - **No cuenta como cliente**, así que `conectado()` —y con él `consolaWeb.eof()`— sigue
   *    diciendo la verdad. Medido antes de escribir esto: con un `conectar` de más, el
   *    `eof()` de la consola de una tarea de fondo pasaba de `true` a `false`, o sea «hay un
   *    humano al que preguntar». Y no lo hay: esta vista es de SOLO lectura, no tiene
   *    compositor y nadie puede contestar una pregunta ni aprobar una escritura desde ahí.
   *    Irse el último mirón tampoco dispara `alDesconectar`: no ha dejado a nadie sin
   *    contestar.
   *  - **Recibe SOLO el transcript** (`acto`, `sustitucion`, `reemision`). Por el transporte
   *    de una consola de tarea viaja además el mensaje `turno` de los flancos —lo emite el
   *    envoltorio del ejecutor sin mirar `alCable`, medido—, y ese mensaje apagaría el
   *    compositor de quien mira por un turno que no es suyo. La lista es BLANCA a propósito:
   *    una clase nueva no llega a un mirón hasta que alguien la nombre aquí.
   */
  mirar(enviar: Sumidero): readonly Acto[];
  /** Se va UN mirón. Los demás siguen: dos personas pueden mirar la misma tarea. */
  dejarDeMirar(enviar: Sumidero): void;
  /**
   * Produce un mensaje: lo anota en la traza y, si hay cliente, lo escribe. Anota aunque
   * no haya nadie porque la traza cuenta lo que el servidor PRODUJO — que es lo que los
   * tests de «esto no viaja» tienen que poder mirar.
   */
  emitir(mensaje: MensajeAlCliente): void;
  /**
   * La traza de todo lo producido MENOS la aprobación. No es una lista arbitraria: es la
   * frontera del invariante — el contenido de fichero está en el mensaje de aprobación y
   * en ninguna otra clase de mensaje, y así un test lo puede afirmar sobre todo el resto.
   */
  emitidos(): readonly MensajeAlCliente[];
  /** Se llama al desconectar: por aquí se despierta a todo el que esperaba respuesta. */
  alDesconectar(escucha: () => void): void;
}

/**
 * Las clases de mensaje que SON el transcript, y las únicas que llegan a un mirón.
 *
 * Lista blanca y no negra: con una negra, la clase que alguien añada mañana al cable
 * llegaría permitida a quien mira una tarea de fondo — y por ahí ya pasan hoy el
 * mensaje `turno` que apagaría su compositor y el `aprobacion` que es el único mensaje con
 * contenido de fichero dentro.
 */
const ES_DE_TRANSCRIPT: ReadonlySet<MensajeAlCliente["clase"]> = new Set(["acto", "sustitucion", "reemision"]);

export function crearTransporte(actos: () => readonly Acto[]): Transporte {
  const traza: MensajeAlCliente[] = [];
  const escuchasDeCorte: (() => void)[] = [];
  /** Todos los clientes vivos. `Set` y no lista: conectar dos veces el MISMO sumidero
   *  —una reconexión que se solapa con su propio cierre— no puede duplicar sus mensajes. */
  const sumideros = new Set<Sumidero>();
  /**
   * Quien MIRA sin ser cliente. Ver `Transporte.mirar`: aparte del otro conjunto porque no
   * cuenta como humano y porque no recibe todo lo que se emite.
   */
  const mirones = new Set<Sumidero>();
  /**
   * Hubo cliente alguna vez y todavía no se ha ido el último. Se lleva aparte del `Set`
   * porque `conectar()` sin sumidero (los tests que no miran lo emitido) también cuenta
   * como cliente: `eof()` mira esto, y decir que no hay nadie rechazaría sus aprobaciones.
   */
  let hayCliente = false;

  return {
    conectar(enviar) {
      hayCliente = true;
      if (enviar !== undefined) sumideros.add(enviar);
      return [...actos()];
    },
    desconectar(enviar) {
      if (enviar !== undefined) {
        sumideros.delete(enviar);
        // Queda alguien mirando: no se despierta a nadie ni se corta nada. Lo que se fue
        // es una pestaña, no la conversación.
        if (sumideros.size > 0) return;
      } else {
        sumideros.clear();
        // Sin sumidero es «se van todos»: lo hace `cerrar()` y lo hace mudarse de consola.
        // Un mirón de una consola que se abandona escribe en un socket que ya no está.
        mirones.clear();
      }
      hayCliente = false;
      for (const escucha of escuchasDeCorte) escucha();
    },
    soltar(enviar) {
      if (enviar === undefined) sumideros.clear();
      else sumideros.delete(enviar);
    },
    conectado: () => hayCliente,
    mirar(enviar) {
      mirones.add(enviar);
      return [...actos()];
    },
    dejarDeMirar(enviar) {
      mirones.delete(enviar);
    },
    emitir(mensaje) {
      if (mensaje.clase !== "aprobacion") traza.push(mensaje);
      // A TODOS los clientes vivos. Con una sola ranura, el último en conectar dejaba mudos
      // a los anteriores sin decírselo.
      for (const sumidero of sumideros) sumidero(mensaje);
      // Y a los mirones, solo el TRANSCRIPT. Ver `Transporte.mirar`.
      if (!ES_DE_TRANSCRIPT.has(mensaje.clase)) return;
      for (const miron of mirones) miron(mensaje);
    },
    emitidos: () => traza,
    alDesconectar(escucha) {
      escuchasDeCorte.push(escucha);
    },
  };
}
