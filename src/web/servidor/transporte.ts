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
import type { Acto } from "../../core/actos.js";
import type { PendienteDeAprobacion } from "../../core/events.js";
import type { LineaDeDiff } from "../../core/diff.js";
import type { SelectorDeConsola } from "../../cli/consola.js";
// Solo TIPO, y por eso no es un ciclo: `vestibulo.ts` importa este módulo para ejecutar,
// y esta importación se borra al compilar. Se traen de allí en vez de redeclararlos aquí
// porque son los MISMOS pasos y los MISMOS entornos que el vestíbulo calcula; una segunda
// declaración en este fichero sería el tipo de copia que diverge sin que nada chiste.
import type { OpcionDeEntorno, PasoDelVestibulo } from "./vestibulo.js";

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
  /** Parar el turno en vuelo. Aborta el `stream` del grafo (`SesionReal.cancelar`) y deja
   *  la sesión viva: es parar ESTO, no cerrar la conversación. */
  | { clase: "cancelar" }
  | { clase: "decision"; decisiones: Record<string, string> };

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
