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
  | { clase: "revision"; via: "git" | "sin-marca" | "sin-empezar"; ficheros: FicheroTocado[] }
  | { clase: "parche"; ruta: string; texto: string; recortado: boolean }
  /**
   * El árbol del proyecto abierto (pestaña Ficheros): rutas relativas, ordenadas y ya
   * filtradas por la misma regla que ve el agente (`agent/arbolDeProyecto.ts`). `error`
   * solo si no se pudo listar, y entonces `rutas` va vacía. Y el contenido de UN fichero,
   * de solo lectura: sin `texto` si es binario o si la ruta se rechazó, con el motivo.
   */
  | { clase: "arbol"; rutas: string[]; recortado: boolean; error?: string }
  | ({ clase: "fichero" } & FicheroDelProyecto)
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
       * La sesión abierta es una RELECTURA: se reabrió de otra sesión de xonecode y el
       * agente no la recuerda (`ConsolaDeProyecto.historica`: el hilo vive en un
       * `MemorySaver` que murió con aquel proceso). Deja de serlo en el primer turno nuevo,
       * y el alta se reanuncia en ese flanco. Solo viaja cuando es cierto: ausente es «no».
       * Sin esto el cliente pintaba una conversación y un compositor activo como si se
       * pudiera seguir hablando, que es lo que el propio `CLAUDE.md` dice que no pasa.
       */
      historica?: boolean;
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
        sesiones?: { id: string; titulo: string }[];
        /** La copia local YA existe: se puede abrir sin bajar nada ni preguntar rama. */
        local?: boolean;
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

/** Un fichero de la sesión. `mas`/`menos` faltan en un binario: git no cuenta líneas ahí, y
 *  poner cero diría que no cambió nada. */
export interface FicheroTocado {
  ruta: string;
  clase: "nuevo" | "modificado" | "borrado";
  mas?: number;
  menos?: number;
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

export interface ProveedorDeModelos {
  id: string;
  credencial: "puesta" | "falta" | "nativa";
  /**
   * La credencial está en `auth.json` — o sea, es NUESTRA y se puede borrar desde la
   * interfaz. Una que solo viene del entorno no lleva esta marca: desexportar la shell de
   * nadie no está a nuestro alcance, y ofrecer un botón que no puede cumplir sería peor
   * que no ofrecerlo. Misma disciplina que el harness de DeepSeek, que solo retira la
   * credencial cuya referencia puede demostrar suya.
   */
  enFichero?: boolean;
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
  /** ¿Queda alguien al otro lado? Es lo que `consolaWeb.eof()` usa para saber si hay humano. */
  conectado(): boolean;
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

export function crearTransporte(actos: () => readonly Acto[]): Transporte {
  const traza: MensajeAlCliente[] = [];
  const escuchasDeCorte: (() => void)[] = [];
  /** Todos los clientes vivos. `Set` y no lista: conectar dos veces el MISMO sumidero
   *  —una reconexión que se solapa con su propio cierre— no puede duplicar sus mensajes. */
  const sumideros = new Set<Sumidero>();
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
      }
      hayCliente = false;
      for (const escucha of escuchasDeCorte) escucha();
    },
    conectado: () => hayCliente,
    emitir(mensaje) {
      if (mensaje.clase !== "aprobacion") traza.push(mensaje);
      // A TODOS los clientes vivos. Con una sola ranura, el último en conectar dejaba mudos
      // a los anteriores sin decírselo.
      for (const sumidero of sumideros) sumidero(mensaje);
    },
    emitidos: () => traza,
    alDesconectar(escucha) {
      escuchasDeCorte.push(escucha);
    },
  };
}
