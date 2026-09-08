/**
 * El vestíbulo: lo que hay ANTES de que exista ninguna raíz.
 *
 * `correrConsola` es un lazo sobre UNA `raiz`, y la jerarquía entorno → proyecto → sesión
 * necesita un sitio donde vivir mientras no hay proyecto abierto. De ahí las dos clases de
 * consola: el vestíbulo (sin raíz) y la consola de proyecto (con la suya).
 *
 * Los pasos son los mismos del alta de terminal, y cada uno solo aparece si falta lo que
 * decide. El de cuenta se detecta como siempre: si el papel `trabajo` resuelve por
 * `omision`, nadie eligió nunca. **No hay marca de «primer arranque»**: sería una segunda
 * fuente de verdad sobre algo que el sistema ya sabe.
 *
 * Este fichero NO toca disco ni red por su cuenta. Todo lo que escribe o conecta entra por
 * la opción correspondiente, y las que escriben (`guardarCredencial`, `guardarEntorno`,
 * `guardarConfigDeProyecto`, `descargar`) son OBLIGATORIAS: un valor por omisión que
 * escribiera en el `~/.xonecode` de verdad convertiría cualquier test en una escritura en
 * la casa del usuario, y uno que no escribiera sería el no-op silencioso que este repo
 * evita en todas partes.
 *
 * La única LECTURA de disco con valor por omisión es `esProyecto` («¿hay copia local
 * aquí?»), y sigue la misma regla que `sesiones ?? SESIONES_EN_DISCO`: entra por opción
 * para que un test pueda contestarla sin carpetas, y su omisión es la de verdad porque
 * mentir en esa pregunta abre un proyecto que no existe.
 */

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Acto } from "../../core/actos.js";
import type { Eleccion, FuentesDeEleccion, Proveedor } from "../../core/modelos.js";
import type { CatalogoModelosPort } from "../../core/ports.js";
import { esDoble } from "../../core/ports.js";
import type { Entorno } from "../../core/settings.js";
import { rutaDeWorkspace } from "../../core/settings.js";
import {
  URL_CLOUDSTUDIO_POR_OMISION,
  SCOPES_CLOUDSTUDIO_AGENTE,
  AVISO_DE_URL_DE_MCP,
  adoptarLegadoSiProcede,
  conectarCloudStudio,
  rutaAuthPorDefecto,
  sesionCloudStudio,
  urlDeMcpAceptable,
} from "../../agent/cloudstudioMcp.js";
import type { ProyectoRemoto } from "../../agent/cloudstudioMcp.js";
import { clienteCloudStudio } from "../../agent/cloudstudioClient.js";
import {
  guardarCloudStudioDeProyecto,
  guardarEntornoDeProyecto,
  guardarModeloGlobal as guardarModeloGlobalEnDisco,
  guardarModoDeProyecto,
  guardarProyectoCloudStudioDeProyecto,
  guardarRamaDeProyecto,
} from "../../agent/configEnDisco.js";
import {
  correrConsola,
  ejecutarTurnoGuionizado,
  type Consola,
  type EjecutorDeTurno,
  type EstadoDeSesion,
} from "../../cli/consola.js";
import { asistenteDeModelo, type ResultadoDelAsistente } from "../../cli/wizardInicial.js";
import { crearConsolaWeb, type ConsolaWeb, type OpcionesDeConsolaWeb } from "./consolaWeb.js";
import {
  anotarActo,
  borrarSesion,
  crearSesion,
  elegirDispositivo,
  listarSesiones,
  reabrirSesion,
  renombrarSesion,
  type DispositivoElegido,
} from "./sesiones.js";
import type { MensajeDelCliente, Sumidero } from "./transporte.js";

/**
 * Un paso del alta — o, para «proyecto», una ACCIÓN que ya no es un paso del alta:
 * `pasosPendientes()` nunca la devuelve (cambio de rumbo del usuario: el proyecto se
 * elige en la barra lateral, no bloquea la entrada al dashboard), pero el mensaje
 * `{clase:"alta", paso:"proyecto", …}` del cable (`transporte.ts`) sigue existiendo —es
 * lo que `completarProyecto`/`abrirProyecto` siguen consumiendo—, así que el valor sigue
 * siendo válido aquí para no partir ese tipo en dos. El orden de la lista de PENDIENTES
 * («cuenta», «entorno») ES el orden en que se presentan.
 */
export type PasoDelVestibulo = "cuenta" | "entorno" | "proyecto";

/** Un entorno ofrecido en el paso 2. `url` vacía = el usuario la teclea («otro»). */
export interface OpcionDeEntorno {
  id: string;
  nombre: string;
  url: string;
}

/**
 * Los dos CloudStudio oficiales, pre-rellenados.
 *
 * La URL de WebStudio no se repite aquí: se importa de `agent/cloudstudioMcp.ts`, que es
 * donde vive desde que `adoptarLegadoSiProcede` la necesitó (`cli/consola.ts` la reexporta
 * por compatibilidad). Dos literales de la misma dirección es cómo divergen el día que una
 * se corrige y la otra no — el mismo motivo por el que `segmentoSeguro` no se copió.
 */
export const ENTORNOS_OFICIALES: readonly OpcionDeEntorno[] = [
  { id: "webstudio", nombre: "XOne WebStudio", url: URL_CLOUDSTUDIO_POR_OMISION },
  { id: "manager", nombre: "XOne Manager", url: "https://mcp.xonemanager.com/mcp" },
];

/**
 * El tercero de la lista, y no un botón aparte de la interfaz: un on-premise es un entorno
 * como los otros dos, y presentarlo al mismo nivel es lo que evita que la web tenga dos
 * caminos distintos para registrar lo mismo.
 */
export const ENTORNO_OTRO: OpcionDeEntorno = { id: "otro", nombre: "Otro (on-premise)", url: "" };

/** La base del workspace por omisión: `~/.xonecode`. La disposición de dentro la fija
 *  `rutaDeWorkspace` y no es configurable. */
export function baseDeWorkspacePorOmision(): string {
  return join(homedir(), ".xonecode");
}

/** Lo que define a un proyecto ya elegido: entorno, endpoint, identidad remota y rama origen. */
export interface DatosDeProyecto {
  /** El id del entorno de `settings.json`. */
  entorno: string;
  url: string;
  scopes: readonly string[];
  proyecto: { id: string; nombre: string };
  /** La rama ORIGEN: de la que se baja y contra la que se compara. */
  rama: string;
}

/**
 * La persistencia de sesiones, por puerto: los tests no pueden escribir en el proyecto de
 * verdad y el vestíbulo no puede saber si el `raiz` que le dan existe.
 */
export interface PuertoDeSesiones {
  /** El id lo decide quien abre: es también el `thread_id` del grafo. */
  crear(raiz: string, id?: string): string;
  /** El índice de sesiones de un proyecto ya bajado. Una carpeta que no existe es una
   *  lista vacía, no un error: el proyecto todavía no se ha abierto nunca. */
  listar(raiz: string): { id: string; titulo: string }[];
  anotar(raiz: string, id: string, acto: Acto): void;
  reabrir(raiz: string, id: string): { id: string; actos: Acto[]; historica: boolean; dispositivo?: DispositivoElegido };
  /** Borra una sesión. Devuelve si había algo que borrar; un id desconocido no es un error
   *  (dos pestañas, un doble clic). Opcional: un puerto de prueba puede no saber borrar. */
  borrar?(raiz: string, id: string): boolean;
  /** Le pone nombre. Devuelve si existía; un título vacío se rechaza. */
  renombrar?(raiz: string, id: string, titulo: string): boolean;
  /** Fija el dispositivo preferido. Devuelve si había entrada que tocar: la de una sesión
   *  cuyo id todavía no existe (nace al volcar) no está, y quien llama lo guarda en memoria. */
  elegirDispositivo?(raiz: string, id: string, dispositivo: DispositivoElegido | undefined): boolean;
}

const SESIONES_EN_DISCO: PuertoDeSesiones = {
  crear: crearSesion,
  listar: listarSesiones,
  anotar: anotarActo,
  reabrir: reabrirSesion,
  borrar: borrarSesion,
  renombrar: renombrarSesion,
  elegirDispositivo,
};

/**
 * ¿Hay una copia local de proyecto en esa raíz? Es el MISMO criterio con el que el alta
 * decide `proyectos[].local` (`arranque.ts#hayCopiaLocal`, que tira de aquí): existe su
 * `.xonecode/config.json`. Dos copias del predicado es cómo divergen el día que una se
 * afine — el mismo motivo por el que la regla de URL de MCP vive en un solo sitio.
 *
 * Se lo traga todo y devuelve `false`: una raíz que no se puede ni mirar (permisos, un
 * enlace roto) no es un proyecto sobre el que abrir nada, y esta puerta falla CERRADO.
 */
export function esProyectoEnDisco(raiz: string): boolean {
  // Sin `try`: `existsSync` no lanza nunca —traga cualquier error del sistema y devuelve
  // false—, así que envolverlo sugeriría un peligro que no existe.
  return existsSync(join(raiz, ".xonecode", "config.json"));
}

/** Lo mínimo que el vestíbulo necesita de una `SesionReal` para cambiar de proyecto. */
export interface SesionCerrable {
  cerrar(): void;
  /** Aborta el `stream` del grafo y deja la sesión viva. Opcional: el ejecutor guionizado
   *  no tiene nada que abortar. */
  cancelar?(): void;
}

export interface OpcionesDelVestibulo {
  /**
   * El `origen` con el que resolvió el papel `trabajo`. Es la ÚNICA señal de que nadie ha
   * elegido nunca; no hay marca de primer arranque.
   */
  origenDeTrabajo: Eleccion["origen"];
  catalogoModelos: CatalogoModelosPort;
  /** Escribe en `~/.xonecode/auth.json` y devuelve dónde quedó, como `agent/authEnDisco.ts`. */
  guardarCredencial: (proveedor: Proveedor, clave: string) => { ruta: string };
  /** Pone la clave en el proceso SIN escribirla, para poder probarla antes de guardarla
   *  (`agent/configEnDisco.ts#aplicarCredencialAlProceso`). Ausente = no se prueba antes. */
  aplicarCredencial?: (proveedor: Proveedor, clave: string) => void;
  /** Registra el entorno en `~/.xonecode/settings.json`. */
  guardarEntorno: (entorno: Entorno) => { ruta: string };
  /** Baja la copia local. Recibe la raíz ya calculada: la sincronización no se toca, solo
   *  cambia QUIÉN calcula el `raiz` que siempre recibió por parámetro. */
  descargar: (datos: DatosDeProyecto & { raiz: string }) => Promise<void>;
  /** Escribe el `config.json` del proyecto ENTERO. Ver `escribirProyectoEnDisco`. */
  guardarConfigDeProyecto: (raiz: string, datos: DatosDeProyecto) => { ruta: string };
  /** A dónde van los avisos del vestíbulo. Por omisión, su propia consola. */
  informar?: (texto: string) => void;
  /**
   * Toma el «antes» de la sesión al ABRIR el proyecto y devuelve con qué nombrarlo cuando el
   * id exista (`agent/sesionGit.ts#fotoDeApertura`). Entra por opción como todo lo que toca
   * el sistema: sin ella no se marca nada y la vista de ficheros dirá que no lo sabe, que es
   * mejor que una lista vacía.
   */
  marcarSesion?: (raiz: string) => Promise<(id: string) => Promise<boolean>>;
  /**
   * ¿Queda memoria del agente para ese hilo? El `thread_id` ES el id de la sesión
   * (`agent/checkpointer.ts`), así que preguntarlo es lo que convierte `historica` en un
   * hecho comprobado en vez de en «se reabrió»: una sesión con checkpoint CONTINÚA, y una
   * sin él —las de antes de que esto existiera, o una cuyo turno nunca llegó a correr—
   * sigue siendo una relectura y se dice. Ausente = esta ejecución no persiste memoria, y
   * entonces reabrir es releer, como siempre.
   */
  hayMemoriaDeHilo?: (raiz: string, hilo: string) => Promise<boolean>;
  /**
   * Olvida la memoria de una sesión borrada. Sin esto, borrar una conversación dejaría su
   * checkpoint —con el contenido de los ficheros que se escribieron en ella— vivo en el
   * fichero del proyecto para siempre, invisible desde la interfaz.
   */
  olvidarMemoriaDeHilo?: (raiz: string, hilo: string) => Promise<void>;

  /**
   * Quita la marca de una sesión que se borra (`agent/sesionGit.ts#olvidarSesion`). Va
   * aparejada a `marcarSesion` y por la misma razón que ella entra por opción: este fichero
   * no ejecuta git. Sin ella la ref se queda apuntando al árbol de una sesión que ya no
   * existe, y ese árbol no se lo lleva nunca `git gc`.
   */
  olvidarMarcaDeSesion?: (raiz: string, id: string) => Promise<void>;
  /** Los entornos YA registrados, tal cual los lee `agent/settingsEnDisco.ts#cargarSettings`. */
  entornos?: readonly Entorno[];
  baseDeWorkspace?: string;
  /**
   * Proveedores que ya tienen credencial. Por omisión `false` para todos, que es la
   * dirección segura: preguntar de más molesta, no preguntar deja al usuario sin clave.
   */
  hayCredencial?: (proveedor: Proveedor) => boolean;
  /**
   * La escritura de la elección de modelo. `consolaWeb` LANZA por omisión a propósito
   * (un no-op silencioso mentiría), así que quien monta la consola tiene que inyectarla:
   * eso es este fichero, y por eso aquí la omisión sí es el escritor real.
   */
  guardarModeloGlobal?: Consola["guardarModeloGlobal"];
  /** Adopta el fichero OAuth plano de antes de los entornos. Por omisión, el real. */
  adoptarLegado?: (entorno: Entorno) => void;
  /**
   * El listado de proyectos de un entorno. Ausente = esta ejecución no habla con CloudStudio.
   *
   * Devuelve también cómo se llama el servidor (`serverInfo` del initialize) porque esta es
   * la PRIMERA vez que se habla con él de verdad: el entorno se registró antes con lo único
   * que se le pidió al usuario, la URL. Ver `proyectosDe` para qué se hace con eso.
   */
  proyectosDeEntorno?: (entorno: Entorno) => Promise<{
    proyectos: readonly ProyectoRemoto[];
    servidor?: { nombre: string };
  }>;
  /** `proyecto` es el NOMBRE, no el id: el servidor abre por nombre y rechaza el
   *  identificador. Ver `clienteCloudStudio`. */
  ramasDeProyecto?: (entorno: Entorno, proyecto: string) => Promise<string[]>;
  sesiones?: PuertoDeSesiones;
  /**
   * ¿Es esa raíz un proyecto con copia local? Solo la usa `abrirParaTarea`, que es la
   * puerta sin nadie delante: por la otra, quien abre acaba de pulsar un proyecto de una
   * lista que el servidor le dio. Por omisión, `esProyectoEnDisco`.
   */
  esProyecto?: (raiz: string) => boolean;
  /** Costura de test: por omisión, la consola web de verdad. */
  crearConsola?: (opciones: OpcionesDeConsolaWeb) => ConsolaWeb;
  /** Costura de test: por omisión, `correrConsola`. */
  correr?: typeof correrConsola;
  /**
   * La fábrica del ejecutor REAL (`crearEjecutorReal` de `main.ts`), con la misma forma que
   * consume `cli/tui/correrTui.ts`. Se llama con un aviso de apertura porque el vestíbulo
   * necesita la `SesionReal` para poder CERRARLA al cambiar de proyecto.
   */
  crearEjecutor?: (alAbrirSesion: (sesion: SesionCerrable) => void) => EjecutorDeTurno;
  /** Fuentes del modelo con las que arranca cada consola de proyecto. */
  fuentes?: FuentesDeEleccion;
  /**
   * Lo que la consola de PROYECTO necesita y `consolaWeb` no puede saber: `/sync`, los
   * escritores de config del proyecto, el tema. Depende de la RAÍZ, que no existe hasta
   * que se abre el proyecto, así que entra como función y no como objeto.
   */
  dependenciasDeProyecto?: (raiz: string) => Partial<Consola>;
  /** Plazo de aprobación de las consolas de proyecto; se pasa tal cual a `consolaWeb`. */
  msDeEspera?: number;
  /**
   * El nombre para el saludo de la bienvenida (`agent/persona.ts#nombreDePersona`, o
   * `undefined` en los tests que no lo necesitan). Un dato ya resuelto y no una función:
   * se calcula UNA vez, al arrancar, y no depende de nada que el vestíbulo sepa hacer
   * (no es un puerto caro que haga falta invocar por turno).
   */
  nombre?: string;
}

/** Una consola de proyecto viva. Solo hay una a la vez. */
export interface ConsolaDeProyecto {
  readonly raiz: string;
  /**
   * El estado de sesión de ESTA consola, ahora mismo. Es de dónde sale el modelo en vigor:
   * `/modelo` lo cambia en caliente dentro del lazo y no toca disco, así que releer la
   * configuración diría lo de antes.
   */
  readonly estadoDeSesion: EstadoDeSesion;
  /** El id de la sesión, o `undefined` mientras no se haya volcado ningún acto. */
  readonly sesion: string | undefined;
  /**
   * El id con el que se abrió el HILO, que existe desde el primer instante.
   *
   * No es lo mismo que `sesion` y la diferencia importa: `sesion` contesta «¿hay una fila
   * que la barra pueda marcar?», y para eso hace falta la entrada del índice, que nace al
   * VOLCAR el primer acto — o sea al final del turno. Este contesta «¿con qué id se montó
   * el disco de esta conversación?», y de él cuelgan el hilo del checkpointer y la carpeta
   * de artefactos. Los ARTEFACTOS obligaron a distinguirlos: el acto que anuncia uno se
   * emite a mitad de turno, así que su enlace se pulsa mucho antes de que `sesion` exista,
   * y con el otro id el visor habría contestado «no existe» durante todo el turno.
   */
  readonly idDeHilo: string;
  /**
   * Reabierta, SIN memoria del hilo y todavía sin turno nuevo. Las tres condiciones: desde
   * que hay checkpointer persistente, reabrir una sesión con checkpoint continúa la
   * conversación de verdad y no se marca nada. Deja de serlo en el PRIMER turno nuevo, no al
   * primer acto: un `/ayuda` no convierte en presente una conversación que el modelo no
   * recuerda.
   */
  readonly historica: boolean;
  /**
   * Con qué dispositivo trabaja esta sesión. Ausente = ninguno elegido.
   *
   * Vive AQUÍ y no solo en el índice porque el id de la sesión no existe hasta que se vuelca
   * el primer acto: elegir dispositivo en una sesión recién abierta no tiene entrada que
   * escribir, así que se queda en memoria y se anota en cuanto `volcar()` la crea. Es la
   * misma forma de `sesionActiva` y por el mismo motivo.
   */
  readonly dispositivo: DispositivoElegido | undefined;
  /** Elige —o quita, con `undefined`— el dispositivo preferido de esta sesión. */
  elegirDispositivo(dispositivo: DispositivoElegido | undefined): void;
  readonly cerrada: boolean;
  readonly consola: ConsolaWeb;
  /**
   * Para el turno en vuelo sin cerrar la sesión (`SesionReal.cancelar`). Devuelve si había
   * algo que parar: sin sesión real —el ejecutor guionizado, o un turno que ya terminó— no
   * hay nada, y decirlo es mejor que fingir que se paró algo.
   */
  cancelarTurno(): boolean;
  /** Un mensaje del navegador. Está aquí para que la ruta HTTP tenga UN solo objeto con
   *  el que hablar; quien decide el fin de la marca histórica es el envoltorio del
   *  ejecutor, no esto — una prosa que llega a mitad de turno solo entra en la cola. */
  recibir(mensaje: MensajeDelCliente): void;
  conectar(enviar?: Sumidero): readonly Acto[];
  /** Se va UN cliente (el suyo) o todos. Ver `Transporte`: la consola solo da por perdido
   *  al humano cuando se va el ÚLTIMO. */
  desconectar(enviar?: Sumidero): void;
  actos(): readonly Acto[];
  cerrar(): Promise<void>;
  /**
   * Corre UN turno sobre esta consola con la `Consola` que se le pase.
   *
   * Existe para las tareas de fondo, y por una razón mecánica: el lazo (`correrConsola`)
   * consume LÍNEAS de una conversación, y una tarea no es una conversación — tiene un
   * encargo y nada más. Sin este campo, quien abre por `abrirParaTarea` no tendría forma
   * de correr nada: el lazo vive dentro y desde fuera solo se le pueden meter líneas.
   *
   * Es EXACTAMENTE la función que este objeto le pasó a `correrConsola` —el mismo objeto,
   * y hay un test que lo asegura—, así que una corrección al turno no puede alcanzar a una
   * puerta y no a la otra. Lo que cambia entre las dos es la `Consola` que se le da.
   */
  readonly ejecutarTurno: EjecutorDeTurno;
  /**
   * Espera a que la marca de git de esta sesión esté escrita. Devuelve en el acto si no hay
   * ninguna pendiente (nadie volcó nada, o el proyecto no tiene git usable).
   *
   * Existe para el corredor de tareas, que mide si lo escrito se puede REVISAR y lo mide
   * justo después de cerrar: `volcar()` apunta la ref sin aguardarla, y medido con git de
   * verdad la ref todavía no estaba. La espera NO va dentro de `cerrar()` a propósito —
   * ver `esperarMarca` en la implementación.
   */
  esperarMarca(): Promise<void>;
  /** El retorno de `correrConsola`. Resuelve cuando el lazo termina (EOF o `/salir`). */
  readonly terminada: Promise<number>;
}

export interface Vestibulo {
  /** La consola SIN raíz. Es la que pinta el asistente de cuenta y las preguntas del alta. */
  readonly consola: ConsolaWeb;
  /** El saludo de la bienvenida. Ver `OpcionesDelVestibulo.nombre`. */
  readonly nombre: string | undefined;
  pasosPendientes(): Promise<PasoDelVestibulo[]>;
  opcionesDeEntorno(): readonly OpcionDeEntorno[];
  /**
   * Los entornos YA REGISTRADOS (`settings.json` más lo que este vestíbulo acaba de dar
   * de alta), no los OFRECIDOS de `opcionesDeEntorno()` — esa es la lista fija de
   * (WebStudio, Manager, Otro) para el paso de registro del wizard, y no sirve para saber
   * de qué entorno listar proyectos cuando quien entra ya tiene uno registrado de antes.
   * `arranque.ts` la usa para poblar la barra al conectar sin que nadie haya elegido
   * entorno EN esta conexión.
   */
  entornosRegistrados(): readonly Entorno[];
  /**
   * El paso 1: `asistenteDeModelo` con la consola web detrás, exigiendo elección. Devuelve
   * lo que pasó porque quien lo conduce (`arranque.ts`) lo usa como puerta: dar por hecho
   * un paso que nadie resolvió es exactamente lo que dejaba al usuario con el modelo de
   * omisión sin enterarse.
   */
  pasoDeCuenta(): Promise<ResultadoDelAsistente>;
  guardarCredencialDe(proveedor: Proveedor, clave: string): Promise<{ ruta: string }>;
  /** Devuelve el entorno tal y como quedó REGISTRADO: el id puede no ser el que llegó
   *  (ver `identidadDeEntorno`), y quien registra necesita el bueno para seguir. */
  registrarEntorno(entorno: Entorno): Promise<{ ruta: string; entorno: Entorno }>;
  /**
   * Qué proyectos de un entorno se enseñan en la barra. Se guarda CON el entorno
   * (`settings.json`) porque es una preferencia sobre él, y una lista vacía es una
   * elección —«ninguno»— y no un «no lo he dicho».
   */
  guardarProyectosVisibles(entorno: string, proyectos: readonly string[]): Promise<{ ruta: string }>;
  proyectosDe(entorno: string): Promise<readonly ProyectoRemoto[]>;
  /**
   * Las ramas de un proyecto. Acepta la identidad ENTERA (`{id, nombre}`) además del nombre
   * suelto, por lo mismo que `completarProyecto`: quien llama desde la web tiene el id —es
   * lo que viaja por el cable— y el servidor abre por NOMBRE. Pasarle el id acababa en un
   * «no hay proyecto abierto» que no nombraba al culpable, que era el argumento.
   */
  ramasDe(entorno: string, proyecto: string | { id: string; nombre: string }): Promise<string[]>;
  /**
   * Dónde vive (o viviría) la copia local de un proyecto de ese entorno. Se calcula, no se
   * consulta: `rutaDeWorkspace` es la misma función que usa el alta, y por eso la respuesta
   * vale igual para un proyecto ya bajado que para uno que no.
   */
  raizDeProyecto(entorno: string, proyecto: string): string;
  /** Las sesiones guardadas de una copia local. Sin copia, lista vacía. */
  sesionesDe(raiz: string): { id: string; titulo: string }[];
  /**
   * Borra una sesión guardada, con su marca de git.
   *
   * Si la sesión es la ABIERTA, se cierra primero. El orden no es cosmético: `cerrar()`
   * llama a `volcar()`, que anota los actos pendientes y con ello RESUCITA la entrada del
   * índice que se acaba de borrar. Cerrando antes, lo que se borra ya no lo va a reescribir
   * nadie — y el cliente se queda sin proyecto abierto, que es lo honesto: la conversación
   * que estaba mirando ya no existe.
   *
   * Y si la sesión es la de una TAREA en curso, no se borra: se DECLINA con `motivo`. Es el
   * mismo problema con otro dueño —una consola de tarea tiene la misma `volcar` y no está
   * en `abierto`, así que resucitaría la entrada al siguiente turno— pero no se puede
   * resolver igual: cerrarla sería matar un turno del agente porque alguien limpió una fila
   * de la barra. El `motivo` no lleva ninguna ruta de la máquina: sale por el cable, que
   * puede ir por un túnel (`--anfitrion`).
   */
  borrarSesion(
    raiz: string,
    id: string
  ): Promise<{ borrada: boolean; cerroLaAbierta: boolean; motivo?: string }>;
  /** Le pone nombre a una sesión guardada. `false` si no existe o el título viene vacío. */
  renombrarSesion(raiz: string, id: string, titulo: string): boolean;
  /** El paso 3 completo: escribe el alta y baja la copia local. */
  completarProyecto(eleccion: {
    entorno: string;
    proyecto: string | { id: string; nombre: string };
    rama: string;
  }): Promise<{ raiz: string; ruta: string }>;
  abrirProyecto(apertura: { raiz: string; sesion?: string }): Promise<ConsolaDeProyecto>;
  /**
   * Abrir un proyecto para una TAREA de fondo: la misma construcción, sin registrarlo como
   * el proyecto abierto ni mudar el sumidero del cable. Ver la implementación.
   */
  abrirParaTarea(raiz: string): Promise<ConsolaDeProyecto>;
  proyectoAbierto(): ConsolaDeProyecto | undefined;
  /** El usuario se va sin terminar. No escribe nada; DICE lo que ya quedó escrito. */
  cancelar(): Promise<void>;
  /**
   * Se avisa cuando el estado de sesión de la consola abierta cambia — o sea, cuando
   * cambia el modelo en vigor. UNA sola escucha, que es la del cable; se instala al montar
   * las rutas y vale para todas las consolas de proyecto que se abran después.
   */
  alCambiarEstadoDeSesion(escucha: (estado: EstadoDeSesion) => void): void;
  /**
   * Se avisa cuando empieza y cuando acaba un turno. UNA sola escucha, como la de estado:
   * quien monta las rutas la instala para RECORDARLO, y así puede decírselo también a quien
   * conecte después — el mensaje del cable se emite una vez y una pestaña que llega a mitad
   * de turno no lo vio.
   */
  alCambiarTurno(escucha: (activo: boolean) => void): void;
  /** Cierra el proyecto abierto y el propio vestíbulo. */
  cerrar(): Promise<void>;
}

/**
 * El `config.json` del proyecto, escrito con los escritores que ya existen.
 *
 * El orden importa y `modo` va el ÚLTIMO a propósito: si algo revienta a mitad, lo que
 * queda en disco es un `cloudstudio` sin `modo`, que es exactamente el caso que
 * `crearSincronizador` ya sabe contar («este proyecto no es cloud…»). Al revés dejaría un
 * proyecto declarado cloud sin saber contra qué sincronizar.
 *
 * `entorno` se escribe ADEMÁS de `cloudstudio.url`, nunca en su lugar: conservar la URL es
 * lo que hace literalmente cierto que la sincronización no se toca — `crearSincronizador`
 * y todo lo que cuelga de él la leen igual que hoy.
 */
export function escribirProyectoEnDisco(raiz: string, datos: DatosDeProyecto): { ruta: string } {
  guardarCloudStudioDeProyecto(raiz, datos.url, datos.scopes);
  guardarProyectoCloudStudioDeProyecto(raiz, datos.proyecto);
  guardarRamaDeProyecto(raiz, datos.rama);
  guardarEntornoDeProyecto(raiz, datos.entorno);
  return { ruta: guardarModoDeProyecto(raiz, "cloud").ruta };
}

/**
 * Los dos cables de CloudStudio del vestíbulo, con el id del entorno y la vuelta a la web
 * ya enhebrados.
 *
 * Las dos cosas son deudas que se pagan aquí: sin `entornoId`, un proyecto ya migrado a
 * `webstudio` reautenticaría en un segundo hueco `legado`; y sin `redirigirA`, la página
 * del callback termina diciendo «vuelve a la terminal», que en un navegador es falso.
 */
export function conexionDeVestibulo(urlDeLaWeb?: string): Pick<
  OpcionesDelVestibulo,
  "proyectosDeEntorno" | "ramasDeProyecto"
> {
  const comunes = (entorno: Entorno) => ({
    scopes: entorno.scopes ?? SCOPES_CLOUDSTUDIO_AGENTE,
    entornoId: entorno.id,
    ...(urlDeLaWeb === undefined ? {} : { redirigirA: urlDeLaWeb }),
  });
  return {
    proyectosDeEntorno: async (entorno) => {
      const conexion = await conectarCloudStudio(entorno.url, comunes(entorno));
      return {
        proyectos: conexion.proyectos,
        ...(conexion.servidor === undefined ? {} : { servidor: { nombre: conexion.servidor.nombre } }),
      };
    },
    ramasDeProyecto: async (entorno, proyecto) => {
      const sesion = await sesionCloudStudio(entorno.url, comunes(entorno));
      try {
        const puerto = clienteCloudStudio(sesion.invocar, proyecto);
        await puerto.abrir(proyecto);
        return await puerto.ramas();
      } finally {
        await sesion.cerrar();
      }
    },
  };
}

/**
 * La regla de URL de entorno es la MISMA que la de quien conecta de verdad
 * (`agent/cloudstudioMcp.ts#urlDeMcpAceptable`), importada y no copiada: cuando eran dos
 * criterios, el wizard aceptaba un loopback que este fichero rechazaba, con dos mensajes
 * claros que se contradecían. Ver allí por qué se resolvió por el lado permisivo.
 */
const urlDeEntornoValida = urlDeMcpAceptable;

/**
 * El host de una URL, o la URL entera si no parsea. No debería hacer falta ese segundo caso
 * —`urlDeEntornoValida` corre antes y ya rechaza lo que no parsea—, pero si algún día
 * alguien invierte ese orden, mejor un id feo que una excepción.
 */
function hostDeUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Misma URL, dicha de dos formas (`https://x/mcp` y `https://x/mcp/`), es el mismo sitio. */
function mismaUrl(a: string, b: string): boolean {
  const normal = (u: string): string => u.trim().replace(/\/+$/, "").toLowerCase();
  return normal(a) === normal(b);
}

/**
 * La identidad del entorno, DEDUCIDA de la URL cuando no la trae puesta.
 *
 * El formulario del navegador pide solo la URL: un nombre tecleado a mano es un dato que
 * el usuario se inventa y que después hay que creerse en la barra lateral y en la ruta del
 * workspace. Las dos reglas:
 *
 * - Si la URL es la de un entorno OFICIAL, se usa su identidad (aunque se haya escrito a
 *   mano en el hueco de «otro»): dos entradas para el mismo servidor son dos carpetas de
 *   workspace y dos huecos de OAuth para la misma cuenta.
 * - Si no, el id y el nombre salen del HOST. El id pasa por `segmentoSeguro`
 *   (`core/settings.ts`) porque acaba siendo una carpeta (`rutaDeWorkspace`), así que se
 *   quita todo lo que no sea letra, cifra, punto o guion — los dos puntos del puerto
 *   incluidos, que en Windows parten la ruta. El nombre conserva el host tal cual, que es
 *   para leerlo.
 *
 * Lo que NO se deduce aquí es nada que venga del servidor: eso exige haber hecho OAuth, y
 * el registro pasa antes. Un nombre inventado a partir de la URL es verdad comprobable;
 * uno «bonito» sacado de la nada no lo sería.
 */
export function identidadDeEntorno(entorno: Entorno): Entorno {
  const oficial = ENTORNOS_OFICIALES.find((o) => mismaUrl(o.url, entorno.url));
  if (oficial !== undefined) return { ...entorno, id: oficial.id, nombre: oficial.nombre };
  // Un id y un nombre puestos por quien llama se respetan: el paso de entorno del wizard
  // manda «otro» (o vacío) justo para pedir esta deducción, pero otra piel puede traerlos.
  if (entorno.id !== "" && entorno.id !== ENTORNO_OTRO.id && entorno.nombre !== "") return entorno;
  const host = hostDeUrl(entorno.url);
  const id = host.replace(/[^a-zA-Z0-9.-]+/g, "-").replace(/^-+|-+$/g, "");
  return {
    ...entorno,
    id: id === "" ? "on-premise" : id,
    nombre: entorno.nombre === "" ? host : entorno.nombre,
  };
}

export function crearVestibulo(opciones: OpcionesDelVestibulo): Vestibulo {
  const sesiones = opciones.sesiones ?? SESIONES_EN_DISCO;
  const crearConsola = opciones.crearConsola ?? crearConsolaWeb;
  const correr = opciones.correr ?? correrConsola;
  const base = opciones.baseDeWorkspace ?? baseDeWorkspacePorOmision();
  const adoptarLegado =
    opciones.adoptarLegado ??
    // `rutaAuthPorDefecto` y no un `join` propio: el mismo literal en dos ficheros es lo
    // que esta cabecera condena, y `cloudstudioMcp.ts` la exporta justo para esto.
    ((entorno: Entorno) => adoptarLegadoSiProcede(rutaAuthPorDefecto(), entorno));
  const guardarModeloGlobal = opciones.guardarModeloGlobal ?? guardarModeloGlobalEnDisco;
  const esProyecto = opciones.esProyecto ?? esProyectoEnDisco;

  const consolaDelVestibulo = crearConsola({
    catalogoModelos: opciones.catalogoModelos,
    guardarModeloGlobal,
    ...(opciones.msDeEspera === undefined ? {} : { msDeEspera: opciones.msDeEspera }),
  });

  const informar = opciones.informar ?? ((texto: string) => consolaDelVestibulo.consola.escribir(`${texto}\n`));

  /** Los registrados al arrancar MÁS los que este vestíbulo acaba de dar de alta: el paso 3
   *  llega justo después del 2 y `settings.json` no se vuelve a leer entre medias. */
  const registrados: Entorno[] = [...(opciones.entornos ?? [])];

  /** Lo ya escrito, para que `cancelar()` pueda decirlo en vez de fingir que no pasó nada. */
  let credencialEscrita: { proveedor: Proveedor; ruta: string } | undefined;
  let proyectoEscrito: { raiz: string; ruta: string } | undefined;

  let abierto: ConsolaDeProyecto | undefined;
  /** Quien quiera enterarse de que el modelo en vigor cambió. UNA sola: el cable es uno. */
  let escuchaDeEstado: ((estado: EstadoDeSesion) => void) | undefined;
  /** Y de que hay (o deja de haber) un turno corriendo. */
  let escuchaDeTurno: ((activo: boolean) => void) | undefined;

  const entornoPorId = (id: string): Entorno => {
    const encontrado = registrados.find((e) => e.id === id);
    if (encontrado === undefined) {
      throw new Error(`el entorno «${id}» no está registrado en settings.json`);
    }
    return encontrado;
  };

  /** Escribe la credencial y la RECUERDA, sin decir nada: quien llama decide si lo dice,
   *  porque `asistenteDeModelo` ya lo dice por su cuenta y decirlo dos veces es ruido. */
  const registrarCredencial = (proveedor: Proveedor, clave: string): { ruta: string } => {
    const guardada = opciones.guardarCredencial(proveedor, clave);
    credencialEscrita = { proveedor, ruta: guardada.ruta };
    return guardada;
  };

  /**
   * El nombre BUENO del entorno, el que dice el propio servidor, cuando por fin se ha
   * hablado con él.
   *
   * Del alta solo sale la URL, así que hasta aquí el nombre era el host — verdad
   * comprobable, pero fea («mcp.casa.local»). El `serverInfo` del initialize llega en la
   * primera conexión de verdad, que es `proyectosDe`, y solo entonces se puede sustituir.
   *
   * Dos guardas, y las dos importan:
   * - Solo se pisa un nombre DEDUCIDO (el que sigue siendo igual al host). Un nombre que
   *   puso una persona —o el de un entorno oficial, «XOne WebStudio»— no lo cambia un
   *   servidor remoto por su cuenta.
   * - El id NO se toca nunca. Es un segmento de ruta (`rutaDeWorkspace`) y ya hay una copia
   *   local colgando de él: cambiarlo aquí sería mudar la carpeta del proyecto de sitio
   *   porque el servidor decidió llamarse de otra forma.
   */
  const renombrarConElServidor = (entorno: Entorno, nombreDelServidor: string | undefined): void => {
    if (nombreDelServidor === undefined || nombreDelServidor === "") return;
    if (entorno.nombre !== hostDeUrl(entorno.url)) return;
    if (nombreDelServidor === entorno.nombre) return;
    const renombrado: Entorno = { ...entorno, nombre: nombreDelServidor };
    opciones.guardarEntorno(renombrado);
    const donde = registrados.findIndex((e) => e.id === entorno.id);
    if (donde >= 0) registrados.splice(donde, 1, renombrado);
    informar(`entorno «${entorno.id}»: el servidor dice llamarse «${nombreDelServidor}»`);
  };

  const cerrarProyectoAbierto = async (): Promise<void> => {
    if (abierto === undefined) return;
    // Se ESPERA a que el lazo retorne. Dos `correrConsola` vivos sobre el mismo proceso
    // comparten el ejecutor real y se pisarían el hilo.
    await abierto.cerrar();
    abierto = undefined;
  };

  /**
   * La cola de las operaciones que tocan `abierto`.
   *
   * «Una consola de proyecto a la vez» no se sostiene sin serializar: dos `POST` que
   * lleguen a la vez se entrelazan en el `await` de `cerrarProyectoAbierto`, los dos ven
   * `abierto === undefined`, los dos arrancan un `correrConsola` y el primero se queda vivo
   * y sin nadie que lo pueda cerrar nunca. La cola se traga los rechazos —si no, un fallo
   * dejaría la cadena rota para todo lo que venga detrás— y el rechazo de verdad se
   * devuelve sin tragar a quien llamó.
   */
  let cola: Promise<unknown> = Promise.resolve();
  const enCola = <T>(operacion: () => Promise<T>): Promise<T> => {
    const resultado = cola.then(operacion);
    cola = resultado.catch(() => undefined);
    return resultado;
  };

  /**
   * Construye una consola de proyecto — y NADA de la contabilidad del cable.
   *
   * Se extrajo de `abrirDeVerdad` cuando apareció la segunda puerta (`abrirParaTarea`), y
   * la línea del corte es exactamente esa: aquí dentro está TODO lo que decide con qué
   * barreras corre el agente —el ejecutor real por `crearEjecutor`, de donde cuelga el
   * backend con las vistas aplanadas retiradas y la guarda de artefactos; las dependencias
   * de la raíz; la foto del antes; el volcado— y fuera se queda solo quién está enganchado
   * al cable (`abierto`, y el cierre de lo anterior).
   *
   * Que sea UNA función no es comodidad: si las dos puertas divergieran, una tarea correría
   * con menos barreras que una persona, y eso no se ve — se descubre cuando el agente ya
   * escribió. Lo único que `alCable` apaga son los dos AVISOS al navegador; ni una regla.
   */
  const construirConsolaDeProyecto = async ({
    raiz,
    sesion,
    alCable,
  }: {
    raiz: string;
    sesion?: string;
    /**
     * ¿Se le cuentan al cable los flancos del turno y los cambios de modelo?
     *
     * Por la puerta de las personas, sí: son lo que apaga el compositor, saca el botón de
     * parar y reemite el estado de modelos. Por la de las tareas, NO — el mismo aviso
     * apagaría el compositor en el navegador de quien esté trabajando en otra cosa, y le
     * pintaría un turno en vuelo que no es suyo.
     */
    alCable: boolean;
  }): Promise<ConsolaDeProyecto> => {
    const reabierta = sesion === undefined ? undefined : sesiones.reabrir(raiz, sesion);
    const consolaWeb = crearConsola({
      catalogoModelos: opciones.catalogoModelos,
      guardarModeloGlobal,
      ...(opciones.msDeEspera === undefined ? {} : { msDeEspera: opciones.msDeEspera }),
    });
    // `Partial<Consola>` sobre el objeto recién creado: lo que depende de la raíz (`/sync`,
    // los escritores del proyecto) no lo puede saber `consolaWeb`, que no conoce ninguna.
    Object.assign(consolaWeb.consola, opciones.dependenciasDeProyecto?.(raiz) ?? {});

    // La foto del ANTES se toma AQUÍ, al abrir, no en el primer volcado: para entonces el
    // agente ya habría escrito y el «antes» incluiría su trabajo. Se nombra más abajo,
    // cuando el id existe. Se lanza sin esperar —abrir no puede quedarse esperando a git— y
    // el rechazo se traga: sin marca, la vista lo dice.
    const foto = opciones.marcarSesion?.(raiz).catch(() => undefined);
    /**
     * La ref ya APUNTADA, para poder esperarla al cerrar.
     *
     * `volcar()` la lanza y no la aguarda —es síncrono y corre en el `finally` de cada
     * turno—, y eso está bien para quien mira: la pestaña Revisión pregunta cuando alguien
     * la abre, mucho después. Lo que no vale es para quien MIDE: el corredor de tareas
     * comprueba que lo escrito se pueda revisar justo después de cerrar la consola, y
     * medido con git de verdad la ref todavía no estaba —`cambiosDeSesion` devolvía
     * `sin-marca`— así que TODA tarea se habría aparcado diciendo que nadie puede revisarla
     * en un proyecto donde sí se puede. Guardarla aquí y esperarla en `cerrar()` es lo que
     * lo cierra sin que abrir un proyecto tenga que aguardar a git.
     */
    let marcado: Promise<unknown> | undefined;

    /**
     * El id de la sesión, decidido al ABRIR y no en el primer volcado.
     *
     * Es el `thread_id` del grafo, y sin esa igualdad no hay nada que reanudar: al reabrir
     * hay que preguntarle al checkpointer por la misma cadena con la que se escribió. Antes
     * nacía en `volcar()` y el hilo era otro uuid, así que reabrir una sesión abría un hilo
     * que no existía en ninguna parte.
     *
     * Lo que sigue siendo PEREZOSO es la entrada del índice (`anotada`): un uuid en memoria
     * no ensucia nada, pero una entrada escrita al abrir dejaría una sesión vacía en la
     * barra cada vez que alguien mira un proyecto y se va sin decir nada. Y un hilo sin
     * turnos tampoco deja checkpoint: LangGraph solo escribe cuando el grafo corre.
     */
    const idSesion = sesion ?? randomUUID();
    /** ¿Tiene ya entrada en el índice? Reabrir implica que sí. */
    let anotada = sesion !== undefined;
    /**
     * Reabrir ya no implica releer: si el checkpointer guarda ese hilo, la conversación
     * CONTINÚA de verdad y el aviso no sale. Solo se pregunta al reabrir —una sesión nueva
     * no puede tener memoria— y una respuesta negativa deja el aviso puesto, que es el lado
     * conservador: enseñarlo de más es preferible a prometer una memoria que no está.
     */
    let historica = reabierta?.historica ?? false;
    if (historica && (await opciones.hayMemoriaDeHilo?.(raiz, sesion!)) === true) historica = false;
    let dispositivo: DispositivoElegido | undefined = reabierta?.dispositivo;
    let cerrada = false;
    let volcados = 0;
    let sesionReal: SesionCerrable | undefined;
    /**
     * Marcado desde que empieza el cierre. Hace falta porque `crearEjecutorReal` avisa de
     * la sesión DESPUÉS de `inspeccionar` y `abrirSesionReal` —segundos en el primer
     * turno—, así que un cierre en esa ventana encontraba `sesionReal` sin definir, no
     * abortaba nada, y el turno seguía corriendo entero sobre un proyecto que el usuario
     * ya había dejado. La sesión que llega tarde se cierra en cuanto se anuncia.
     */
    let cerrando = false;

    const base = opciones.crearEjecutor?.((s) => {
      sesionReal = s;
      if (cerrando) s.cerrar();
    });
    // El ejecutor que de verdad va a correr los turnos de ESTA consola de proyecto — se
    // fija UNA vez, aquí, para que `volcar` y `ejecutarTurno` miren siempre el mismo valor.
    const ejecutorEfectivo = base ?? ejecutarTurnoGuionizado;

    /**
     * Vuelca al `.jsonl` los actos nuevos.
     *
     * Se llama en las FRONTERAS de turno y al cerrar, nunca a mitad: durante un turno el
     * último acto de la piel todavía muta (el cierre de una racha de tools SUSTITUYE a su
     * apertura dentro del mismo acto, `core/actos.ts#conLineaDeTool`), y un `.jsonl` que
     * solo sabe anexar guardaría las dos líneas. El coste, medido y asumido: un cierre
     * abrupto a mitad de turno pierde ese turno, no la sesión.
     *
     * La sesión se crea PEREZOSAMENTE, en el primer volcado: un proyecto que se abre y se
     * cierra sin decir nada no deja una sesión vacía en el índice.
     *
     * Un ejecutor de PEGA (`--guion`, sin `crearEjecutor`) no vuelca NADA: el `.jsonl` de
     * una sesión es historia del proyecto, y un transcript de pega indistinguible de uno
     * real la ensuciaría — mañana alguien la reabre, lee la respuesta guionizada y no
     * puede saber si fue el agente de pega o un fallo del de verdad. La decisión la toma
     * la marca `ES_DOBLE` sobre `ejecutarTurnoGuionizado` (`cli/consola.ts`), nunca un
     * booleano de este cierre ni la bandera `--guion` del argv: la misma razón por la que
     * el resto del repo marca los dobles con un Symbol y no con un campo que alguien puede
     * olvidar o poner mal. La guarda vive AQUÍ, en el único sitio que escribe a disco, y no
     * repartida en cada llamador — `ejecutarTurno` de abajo y el `cerrar()` de más abajo
     * comparten la misma `volcar`, así que ninguno de los dos puede colarse sin ella.
     */
    const volcar = (): void => {
      if (esDoble(ejecutorEfectivo)) return;
      const todos = consolaWeb.actos();
      if (todos.length <= volcados) return;
      if (!anotada) {
        sesiones.crear(raiz, idSesion);
        anotada = true;
        // Ahora sí hay una sesión en el índice a la que apuntar la foto de la apertura.
        // Se guarda la promesa en vez de tirarla: `cerrar()` la espera. Ver `marcado`.
        marcado = foto?.then((apuntar) => apuntar?.(idSesion));
      }
      for (const acto of todos.slice(volcados)) sesiones.anotar(raiz, idSesion, acto);
      volcados = todos.length;
      // El dispositivo elegido ANTES de que la sesión estuviera en el índice se anota
      // ahora, que es la primera vez que hay una entrada a la que apuntarlo. Sin esto,
      // elegir dispositivo y hablar después perdía la elección al reabrir.
      if (dispositivo !== undefined) sesiones.elegirDispositivo?.(raiz, idSesion, dispositivo);
    };

    const ejecutarTurno: EjecutorDeTurno = async (peticion, estado, consola) => {
      /**
       * La raíz del estado tiene que ser la de ESTA consola, y aquí se comprueba.
       *
       * Desde que `ejecutarTurno` se expone (`ConsolaDeProyecto.ejecutarTurno`, para las
       * tareas), el estado lo puede construir quien llama — y de `estado.raiz` sale el
       * backend del agente (`crearEjecutorReal` → `abrirSesionReal` → `backendDeAgente`).
       * Una raíz equivocada no da error: hace que el agente lea y ESCRIBA en otro proyecto,
       * con la aprobación de ese otro y sin un solo síntoma. Falla cerrado, como todo lo
       * que decide sobre escrituras.
       *
       * Por la puerta de las personas esto no puede saltar nunca: el estado lo lleva
       * `correrConsola` y ningún comando cambia `raiz` (medido en `cli/consola.ts`: solo
       * `fuentes`, `seleccionesDeCatalogo` y `hilo`). Por eso la guarda va en el envoltorio
       * COMPARTIDO y no solo en la puerta nueva — una guarda que solo vigila una puerta es
       * la divergencia que esto viene a evitar.
       */
      if (estado.raiz !== raiz) {
        throw new Error("ese turno trae la raíz de otro proyecto: esta consola solo corre turnos sobre la suya");
      }
      // El primer turno NUEVO es lo que deja de ser histórica una sesión reabierta.
      // `sesiones.ts` no puede hacerlo —`reabrirSesion` es una lectura pura sin estado
      // entre llamadas—, así que lo hace quien es dueño de la sesión viva, que es esto.
      historica = false;
      // Este envoltorio es el ÚNICO sitio que sabe cuándo empieza y cuándo acaba un turno:
      // `correrConsola` solo lo espera y la piel solo ve eventos. De aquí sale lo que apaga
      // el compositor, saca el botón de parar y enciende el borde vivo.
      consolaWeb.turno(true);
      if (alCable) escuchaDeTurno?.(true);
      try {
        // Se DEVUELVE lo que el turno informe. Sin este `return`, el canal que
        // `crearEjecutorReal` acaba de abrir moría en este envoltorio: el corredor de
        // tareas no tendría con qué medir si lo hecho es entregable, y ninguna piel se
        // enteraría — que es exactamente cómo el `terminada` falso pasó desapercibido.
        return await ejecutorEfectivo(peticion, estado, consola);
      } finally {
        // En el `finally`: un turno que revienta o que se cancela también TERMINA, y dejar
        // el compositor apagado para siempre sería peor que no haberlo apagado nunca.
        consolaWeb.turno(false);
        if (alCable) escuchaDeTurno?.(false);
        volcar();
      }
    };

    // El estado con el que arranca el lazo, guardado ANTES de arrancarlo: es lo que
    // `estadoDeSesion` devuelve mientras nadie haya cambiado nada, y sin él quien pinte el
    // modelo en vigor no tendría qué enseñar hasta el primer `/modelo` — que es justo lo
    // que se quiere evitar (enseñar «no se sabe» cuando sí se sabe).
    let estadoDeSesion: EstadoDeSesion = {
      // El hilo ES el id de la sesión: es lo que permite que reabrirla continúe la
      // conversación en vez de releerla. `/nuevo` sigue pudiendo cambiarlo — abre otro hilo
      // dentro de la misma sesión, y eso es exactamente lo que dice que hace.
      hilo: idSesion,
      raiz,
      fuentes: opciones.fuentes ?? {},
    };
    // `/modelo` y `/modelos` cambian el modelo EN CALIENTE y no tocan disco, así que esta
    // es la única forma de enterarse. Ver `Consola.alEstado`.
    consolaWeb.consola.alEstado = (nuevo) => {
      estadoDeSesion = nuevo;
      // Al cable solo por la puerta de las personas: la escucha reemite el estado de
      // modelos a los navegadores conectados, y el modelo de una tarea no es el que está
      // en vigor para quien mira. El estado LOCAL se actualiza igual — `/modelo` dentro de
      // la tarea tiene que surtir efecto en la tarea.
      if (alCable) escuchaDeEstado?.(nuevo);
    };

    const terminada = correr(
      consolaWeb.consola,
      estadoDeSesion,
      ejecutarTurno
    ).finally(() => {
      cerrada = true;
    });
    // Un lazo que revienta sin que nadie espere `terminada` sería un rechazo sin manejar
    // que tumba el proceso. Se cuenta y se sigue: la consola del vestíbulo sigue viva.
    terminada.catch((error: unknown) => {
      informar(`la consola del proyecto terminó con un error: ${error instanceof Error ? error.message : String(error)}`);
    });

    const consolaDeProyecto: ConsolaDeProyecto = {
      raiz,
      get estadoDeSesion() {
        return estadoDeSesion;
      },
      // Ver `ConsolaDeProyecto.idDeHilo`: este es el id crudo, sin esperar al índice.
      idDeHilo: idSesion,
      get sesion() {
        // Solo cuando está en el ÍNDICE. El id existe desde que se abre —es el hilo—, pero
        // hacia fuera «hay sesión» significa «hay una entrada que la barra puede marcar»:
        // devolver un uuid que no está en ninguna lista haría que la barra buscara una fila
        // que no existe, y que Revisión dijera que la sesión ya empezó sin haber empezado.
        return anotada ? idSesion : undefined;
      },
      get historica() {
        return historica;
      },
      get dispositivo() {
        return dispositivo;
      },
      elegirDispositivo: (elegido) => {
        dispositivo = elegido;
        // Si todavía no está en el índice, se queda en memoria: `volcar()` lo anotará en
        // cuanto cree la entrada. Escribir aquí una entrada nueva la enseñaría en la barra
        // como una sesión vacía que nadie ha empezado.
        if (anotada) sesiones.elegirDispositivo?.(raiz, idSesion, elegido);
      },
      get cerrada() {
        return cerrada;
      },
      consola: consolaWeb,
      cancelarTurno: () => {
        if (sesionReal?.cancelar === undefined) return false;
        sesionReal.cancelar();
        return true;
      },
      recibir: (mensaje) => consolaWeb.recibir(mensaje),
      // El transcript del cliente lleva PRIMERO lo releído y después lo de esta ejecución.
      // Lo releído no vuelve a pasar por `volcar`: ya está en el `.jsonl`.
      conectar: (enviar) => [...(reabierta?.actos ?? []), ...consolaWeb.conectar(enviar)],
      desconectar: (enviar) => consolaWeb.desconectar(enviar),
      actos: () => [...(reabierta?.actos ?? []), ...consolaWeb.actos()],
      cerrar: async () => {
        // El orden es el que evita que cerrar cuelgue: `consolaWeb.cerrar()` pone el EOF,
        // pero `correrConsola` no lo mira hasta que el turno en vuelo devuelve, y un turno
        // en vuelo puede tardar minutos. Abortar la sesión real primero es lo que lo
        // desbloquea — y es para lo que existe `SesionReal.cerrar()`.
        cerrando = true;
        sesionReal?.cerrar();
        consolaWeb.cerrar();
        await terminada.catch(() => 0);
        volcar();
      },
      /**
       * Espera a que la ref de la sesión esté ESCRITA, para quien vaya a mirarla.
       *
       * Estuvo un rato dentro de `cerrar()` y era una regresión para quien está sentado
       * delante: cerrar un proyecto pasaba a aguardar un `git add -A` + `write-tree` sobre
       * el árbol entero, o sea una pausa visible en un proyecto grande — y por un camino
       * que no la necesita. Quien la necesita es el CORREDOR de tareas, que mide la
       * condición de «revisable» justo después de cerrar; así que la espera la hace él y no
       * se le cobra a nadie más. Ver `marcado`.
       */
      esperarMarca: async () => void (await marcado?.catch(() => undefined)),
      // El MISMO objeto que se le acaba de pasar a `correr`, no un segundo envoltorio: dos
      // versiones del turno divergen en la primera corrección que solo toque a una.
      ejecutarTurno,
      terminada,
    };
    return consolaDeProyecto;
  };

  const abrirDeVerdad = async (apertura: { raiz: string; sesion?: string }): Promise<ConsolaDeProyecto> => {
    await cerrarProyectoAbierto();
    const consolaDeProyecto = await construirConsolaDeProyecto({ ...apertura, alCable: true });
    abierto = consolaDeProyecto;
    return consolaDeProyecto;
  };

  /**
   * Las consolas abiertas para tareas. No son `abierto` —nadie las mira— pero cada una
   * tiene su `correrConsola` vivo, así que `cerrar()` tiene que llevárselas: un lazo que
   * nadie cierra deja el proceso sin terminar, y «cierra el propio vestíbulo» sería falso.
   *
   * El objeto se guarda TAL CUAL, sin envolver su `cerrar`: `ConsolaDeProyecto` expone
   * captadores (`sesion`, `historica`, `cerrada`) y una copia con `...` los congelaría en
   * el valor que tuvieran al abrir — `sesion` se quedaría en `undefined` para siempre. Las
   * ya cerradas se PODAN al abrir la siguiente, que es cuando puede empezar a crecer.
   */
  const deTareas = new Set<ConsolaDeProyecto>();

  const abrirParaTarea = async (raiz: string): Promise<ConsolaDeProyecto> => {
    // ANTES de construir nada: sin esto, una raíz equivocada dejaba un `correrConsola`
    // vivo, una foto de git lanzada y un id de hilo gastado. Y el motivo no lleva la ruta
    // —puede ser la del home— porque de aquí el error sube al registro de la tarea.
    if (!esProyecto(raiz)) {
      throw new Error("esa raíz no es un proyecto de xonecode: falta su .xonecode/config.json");
    }
    for (const vieja of deTareas) if (vieja.cerrada) deTareas.delete(vieja);
    const consolaDeProyecto = await construirConsolaDeProyecto({ raiz, alCable: false });
    deTareas.add(consolaDeProyecto);
    return consolaDeProyecto;
  };

  /** Cierra las consolas de tarea que queden vivas. Ver `deTareas`. */
  const cerrarLasDeTareas = async (): Promise<void> => {
    for (const consola of [...deTareas]) {
      deTareas.delete(consola);
      // Una que ya cerró el corredor no se vuelve a cerrar, y un fallo al cerrar una no
      // puede dejar a las demás vivas: el cierre es lo último que corre.
      if (!consola.cerrada) await consola.cerrar().catch(() => undefined);
    }
  };

  return {
    consola: consolaDelVestibulo,
    nombre: opciones.nombre,

    async pasosPendientes(): Promise<PasoDelVestibulo[]> {
      const pasos: PasoDelVestibulo[] = [];
      // La MISMA condición que usa `asistenteDeModelo`: si `trabajo` no resolvió por
      // `omision`, alguien eligió (proveedor, modelo, clave si el proveedor la pide,
      // global o bandera) y no se pregunta.
      if (opciones.origenDeTrabajo === "omision") pasos.push("cuenta");
      if (registrados.length === 0) pasos.push("entorno");
      // El proyecto YA NO es un paso del alta — cambio de rumbo del usuario: con cuenta
      // y entorno resueltos se entra directo al dashboard, y el proyecto se elige en la
      // barra lateral (entorno → proyectos → sesiones), no aquí. `abierto` sigue
      // existiendo como estado (`proyectoAbierto()`, más abajo) pero no bloquea nada.
      return pasos;
    },

    alCambiarEstadoDeSesion(escucha) {
      escuchaDeEstado = escucha;
    },

    alCambiarTurno(escucha) {
      escuchaDeTurno = escucha;
    },

    opcionesDeEntorno: () => [...ENTORNOS_OFICIALES, ENTORNO_OTRO],
    entornosRegistrados: () => [...registrados],

    async pasoDeCuenta(): Promise<ResultadoDelAsistente> {
      // Sigue siendo `asistenteDeModelo` con la consola web detrás y nada más. Lo único que
      // esta piel añade es `exigirEleccion`: aquí el paso de cuenta es la PUERTA del
      // dashboard, así que cancelar vuelve a preguntar en vez de dejar entrar con el modelo
      // por omisión. El asistente decide cuándo parar mirando `eof()` — sin cliente, no hay
      // a quién insistirle.
      return asistenteDeModelo(consolaDelVestibulo.consola, {
        origenDeTrabajo: opciones.origenDeTrabajo,
        hayCredencial: opciones.hayCredencial ?? (() => false),
        guardarCredencial: registrarCredencial,
        // La clave se prueba contra el catálogo ANTES de escribirse; esto es lo que la
        // pone en el proceso mientras tanto. Entra por opción como todo lo que toca el
        // sistema: un test no puede escribir en el `process.env` del que corre los tests
        // sin decirlo.
        ...(opciones.aplicarCredencial === undefined ? {} : { aplicarCredencial: opciones.aplicarCredencial }),
        exigirEleccion: true,
      });
    },

    async guardarCredencialDe(proveedor, clave) {
      const guardada = registrarCredencial(proveedor, clave);
      // Se dice AQUÍ, en el momento: si el usuario cancela el paso siguiente, un
      // «cancelado» a secas daría a entender que no se tocó nada, y la clave ya está en
      // disco. Es la misma frase que escribe `/provider` y el asistente de terminal.
      informar(`credencial de ${proveedor} guardada en ${guardada.ruta}`);
      return guardada;
    },

    async registrarEntorno(entorno) {
      if (!urlDeEntornoValida(entorno.url)) {
        throw new Error(AVISO_DE_URL_DE_MCP);
      }
      // Lo ÚNICO que el formulario pide es la URL; la identidad se deduce de ella.
      const identificado = identidadDeEntorno(entorno);
      const guardado = opciones.guardarEntorno(identificado);
      // Justo después de registrar, y no antes: `adoptarLegadoSiProcede` solo actúa si la
      // URL es la oficial por omisión, que es la única que el fichero plano pudo usar.
      adoptarLegado(identificado);
      // SUSTITUYE por id, como hace `settingsEnDisco.guardarEntorno` en el fichero. Con un
      // `push` a secas, registrar dos veces el mismo entorno —cosa que la web hace cada vez
      // que alguien lo elige— dejaba dos entradas para un id, y `entornoPorId` resolvía a la
      // primera: la vieja. Registrar es idempotente aquí igual que en disco.
      const yaEstaba = registrados.findIndex((e) => e.id === identificado.id);
      if (yaEstaba >= 0) registrados.splice(yaEstaba, 1, identificado);
      else registrados.push(identificado);
      informar(`entorno «${identificado.id}» registrado en ${guardado.ruta}`);
      // El entorno YA identificado vuelve con la ruta: quien registró un «otro» no sabe con
      // qué id quedó, y `arranque.ts` necesita ese id exacto para pedirle los proyectos —
      // con el «otro» de la lista, `entornoPorId` no encontraría nada.
      return { ...guardado, entorno: identificado };
    },

    async guardarProyectosVisibles(entorno, proyectos) {
      const registrado = entornoPorId(entorno);
      const conProyectos: Entorno = { ...registrado, proyectos: [...proyectos] };
      const guardado = opciones.guardarEntorno(conProyectos);
      const donde = registrados.findIndex((e) => e.id === registrado.id);
      if (donde >= 0) registrados.splice(donde, 1, conProyectos);
      informar(`proyectos visibles de «${registrado.id}»: ${proyectos.length === 0 ? "ninguno" : proyectos.join(", ")}`);
      return guardado;
    },

    async proyectosDe(entorno) {
      const registrado = entornoPorId(entorno);
      if (opciones.proyectosDeEntorno === undefined) {
        throw new Error("esta ejecución no tiene conexión con CloudStudio");
      }
      const { proyectos, servidor } = await opciones.proyectosDeEntorno(registrado);
      renombrarConElServidor(registrado, servidor?.nombre);
      return proyectos;
    },

    async ramasDe(entorno, proyecto) {
      // El NOMBRE, siempre: es lo único que el servidor sabe abrir.
      const nombre = typeof proyecto === "string" ? proyecto : proyecto.nombre;
      const registrado = entornoPorId(entorno);
      if (opciones.ramasDeProyecto === undefined) {
        throw new Error("esta ejecución no tiene conexión con CloudStudio");
      }
      return opciones.ramasDeProyecto(registrado, nombre);
    },

    raizDeProyecto(entorno, proyecto) {
      return rutaDeWorkspace(base, entornoPorId(entorno).id, proyecto);
    },

    sesionesDe(raiz) {
      // Una carpeta que no existe no es un fallo: es un proyecto que nunca se abrió. El
      // puerto se lo traga y devuelve vacío, que es la verdad.
      try {
        return sesiones.listar(raiz).map((s) => ({ id: s.id, titulo: s.titulo }));
      } catch {
        return [];
      }
    },

    async borrarSesion(raiz, id) {
      // Antes de tocar NADA: si esa conversación es la de una tarea en curso, no se borra.
      // `olvidarMarcaDeSesion` y `olvidarMemoriaDeHilo` no son condicionales, así que
      // borrar aquí se habría llevado la ref de git y el checkpoint de un hilo que el
      // agente sigue escribiendo — y su siguiente `volcar()` habría devuelto la fila a la
      // barra, dejando al usuario con un botón que parece no funcionar. Ver `deTareas`.
      const deUnaTarea = [...deTareas].some(
        (consola) => consola.raiz === raiz && !consola.cerrada && (consola.sesion === id || consola.idDeHilo === id)
      );
      if (deUnaTarea) {
        return {
          borrada: false,
          cerroLaAbierta: false,
          motivo: "esa conversación es la de una tarea en curso: se podrá borrar cuando termine",
        };
      }
      // Cerrar ANTES de borrar: ver el comentario del contrato. Y solo si es ESA sesión —
      // cerrar el proyecto entero porque se borró una conversación vieja de la lista sería
      // llevarse por delante el trabajo en curso.
      const cerroLaAbierta = abierto?.raiz === raiz && abierto.sesion === id;
      if (cerroLaAbierta) await cerrarProyectoAbierto();
      const borrada = sesiones.borrar?.(raiz, id) ?? false;
      // La ref de git de la sesión se va con ella: apunta a un árbol que solo esa vista
      // usaba, y dejarla mantendría ese árbol vivo para siempre (`agent/sesionGit.ts`).
      // No es condicional al `borrada`: una entrada de índice ya perdida no es motivo para
      // dejar la ref colgada.
      await opciones.olvidarMarcaDeSesion?.(raiz, id);
      // Y su memoria: el `thread_id` es el id de la sesión, así que el checkpoint queda
      // huérfano y con el contenido de todo lo que se escribió en ella. Tampoco condicional
      // al `borrada`, por lo mismo que la ref.
      await opciones.olvidarMemoriaDeHilo?.(raiz, id);
      return { borrada, cerroLaAbierta };
    },

    renombrarSesion(raiz, id, titulo) {
      return sesiones.renombrar?.(raiz, id, titulo) ?? false;
    },

    async completarProyecto({ entorno, proyecto, rama }) {
      const registrado = entornoPorId(entorno);
      // El listado remoto trae `{id, nombre}`; un nombre suelto vale porque en CloudStudio
      // el proyecto se abre POR NOMBRE (`studio_open_project`) y el id solo identifica.
      //
      // Se DESESTRUCTURA, y no es estilo: lo que entre aquí acaba en el `config.json` del
      // proyecto (`guardarProyectoCloudStudioDeProyecto`, abajo), y quien llama le pasa una
      // fila del listado remoto — que hoy trae además `compartido` y mañana podría traer
      // otra cosa. TypeScript no avisa: la comprobación de propiedades de más solo salta
      // con un literal, no con un objeto que llega por variable. Copiar los dos campos que
      // SON la identidad es lo que impide que el disco se llene de datos del servidor.
      const identidad =
        typeof proyecto === "string"
          ? { id: proyecto, nombre: proyecto }
          : { id: proyecto.id, nombre: proyecto.nombre };
      const raiz = rutaDeWorkspace(base, registrado.id, identidad.nombre);
      const datos: DatosDeProyecto = {
        entorno: registrado.id,
        url: registrado.url,
        scopes: registrado.scopes ?? SCOPES_CLOUDSTUDIO_AGENTE,
        proyecto: identidad,
        rama,
      };

      // El alta se escribe ENTERA antes de bajar, y no después. No es un descuido: la
      // frase que se dice cuando la descarga falla es «reintenta con /sync bajar», y
      // `/sync` lee del disco el proyecto y la rama — sin el alta escrita, ese consejo
      // sería mentira. «No a medias» significa completa o nada, no «nada».
      const { ruta } = opciones.guardarConfigDeProyecto(raiz, datos);
      proyectoEscrito = { raiz, ruta };
      informar(`proyecto dado de alta en ${ruta}`);

      try {
        await opciones.descargar({ ...datos, raiz });
      } catch (error) {
        const detalle = error instanceof Error ? error.message : String(error);
        informar(`no se pudo descargar el proyecto: ${detalle}`);
        informar(`el alta quedó completa en ${ruta}; reintenta la descarga con «/sync bajar»`);
        // Se propaga: quien llama decide si vuelve al paso de proyecto o abre igualmente
        // la copia vacía. Tragárselo aquí dejaría creer que el proyecto está bajado.
        throw error;
      }
      return { raiz, ruta };
    },

    abrirProyecto: (apertura) => enCola(() => abrirDeVerdad(apertura)),
    /**
     * Abrir un proyecto para una TAREA: la misma construcción, sin registrarlo como el
     * proyecto abierto ni mudar el sumidero del cable.
     *
     * Existe porque el vestíbulo sirve UN proyecto a la vez (`proyectoAbierto()` devuelve
     * uno) y el cable se muda a esa consola (`arranque.ts#adjuntar`): si el corredor
     * reusara `abrirProyecto`, cada tarea que arrancase cerraría la consola de quien esté
     * trabajando y le movería la vista.
     *
     * Va por la misma COLA que la otra puerta aunque no toque `abierto`: la cola es lo que
     * sostiene «una consola de proyecto a la vez», y colarse por delante de un
     * `cerrarProyectoAbierto` a medias sería empezar a construir mientras el lazo anterior
     * todavía vive. El precio, dicho: una tarea que llega mientras se cierra un turno
     * humano de minutos espera a que acabe. Para trabajo de fondo es el lado correcto.
     */
    abrirParaTarea: (raiz) => enCola(() => abrirParaTarea(raiz)),
    proyectoAbierto: () => abierto,

    cancelar: () => enCola(async () => {
      await cerrarProyectoAbierto();
      informar("alta cancelada");
      // Negar lo que ya está en disco sería mentir. Cancelar no BORRA nada: dice qué quedó.
      if (credencialEscrita !== undefined) {
        informar(`la credencial de ${credencialEscrita.proveedor} sigue escrita en ${credencialEscrita.ruta}`);
      }
      if (proyectoEscrito !== undefined) {
        informar(`el alta del proyecto sigue escrita en ${proyectoEscrito.ruta}`);
      }
    }),

    cerrar: () => enCola(async () => {
      await cerrarProyectoAbierto();
      // Y las de las tareas: cada una tiene su `correrConsola` vivo, y dejarlo corriendo
      // deja el proceso sin terminar. Ver `deTareas`.
      await cerrarLasDeTareas();
      consolaDelVestibulo.cerrar();
    }),
  };
}
