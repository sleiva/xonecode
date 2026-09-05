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
 */

import { randomUUID } from "node:crypto";
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
import { anotarActo, crearSesion, listarSesiones, reabrirSesion } from "./sesiones.js";
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
  crear(raiz: string): string;
  /** El índice de sesiones de un proyecto ya bajado. Una carpeta que no existe es una
   *  lista vacía, no un error: el proyecto todavía no se ha abierto nunca. */
  listar(raiz: string): { id: string; titulo: string }[];
  anotar(raiz: string, id: string, acto: Acto): void;
  reabrir(raiz: string, id: string): { id: string; actos: Acto[]; historica: boolean };
}

const SESIONES_EN_DISCO: PuertoDeSesiones = {
  crear: crearSesion,
  listar: listarSesiones,
  anotar: anotarActo,
  reabrir: reabrirSesion,
};

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
    proyectos: Array<{ id: string; nombre: string }>;
    servidor?: { nombre: string };
  }>;
  /** `proyecto` es el NOMBRE, no el id: el servidor abre por nombre y rechaza el
   *  identificador. Ver `clienteCloudStudio`. */
  ramasDeProyecto?: (entorno: Entorno, proyecto: string) => Promise<string[]>;
  sesiones?: PuertoDeSesiones;
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
   * Reabierta y todavía sin turno nuevo. Deja de serlo en el PRIMER turno nuevo, no al
   * primer acto: un `/ayuda` no convierte en presente una conversación que el modelo no
   * recuerda (el hilo vive en un `MemorySaver` que muere con el proceso).
   */
  readonly historica: boolean;
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
  proyectosDe(entorno: string): Promise<Array<{ id: string; nombre: string }>>;
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
  /** El paso 3 completo: escribe el alta y baja la copia local. */
  completarProyecto(eleccion: {
    entorno: string;
    proyecto: string | { id: string; nombre: string };
    rama: string;
  }): Promise<{ raiz: string; ruta: string }>;
  abrirProyecto(apertura: { raiz: string; sesion?: string }): Promise<ConsolaDeProyecto>;
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

  const abrirDeVerdad = async ({ raiz, sesion }: { raiz: string; sesion?: string }): Promise<ConsolaDeProyecto> => {
    await cerrarProyectoAbierto();

    const reabierta = sesion === undefined ? undefined : sesiones.reabrir(raiz, sesion);
    const consolaWeb = crearConsola({
      catalogoModelos: opciones.catalogoModelos,
      guardarModeloGlobal,
      ...(opciones.msDeEspera === undefined ? {} : { msDeEspera: opciones.msDeEspera }),
    });
    // `Partial<Consola>` sobre el objeto recién creado: lo que depende de la raíz (`/sync`,
    // los escritores del proyecto) no lo puede saber `consolaWeb`, que no conoce ninguna.
    Object.assign(consolaWeb.consola, opciones.dependenciasDeProyecto?.(raiz) ?? {});

    let idSesion = sesion;
    let historica = reabierta?.historica ?? false;
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
      if (idSesion === undefined) idSesion = sesiones.crear(raiz);
      for (const acto of todos.slice(volcados)) sesiones.anotar(raiz, idSesion, acto);
      volcados = todos.length;
    };

    const ejecutarTurno: EjecutorDeTurno = async (peticion, estado, consola) => {
      // El primer turno NUEVO es lo que deja de ser histórica una sesión reabierta.
      // `sesiones.ts` no puede hacerlo —`reabrirSesion` es una lectura pura sin estado
      // entre llamadas—, así que lo hace quien es dueño de la sesión viva, que es esto.
      historica = false;
      // Este envoltorio es el ÚNICO sitio que sabe cuándo empieza y cuándo acaba un turno:
      // `correrConsola` solo lo espera y la piel solo ve eventos. De aquí sale lo que apaga
      // el compositor, saca el botón de parar y enciende el borde vivo.
      consolaWeb.turno(true);
      escuchaDeTurno?.(true);
      try {
        await ejecutorEfectivo(peticion, estado, consola);
      } finally {
        // En el `finally`: un turno que revienta o que se cancela también TERMINA, y dejar
        // el compositor apagado para siempre sería peor que no haberlo apagado nunca.
        consolaWeb.turno(false);
        escuchaDeTurno?.(false);
        volcar();
      }
    };

    // El estado con el que arranca el lazo, guardado ANTES de arrancarlo: es lo que
    // `estadoDeSesion` devuelve mientras nadie haya cambiado nada, y sin él quien pinte el
    // modelo en vigor no tendría qué enseñar hasta el primer `/modelo` — que es justo lo
    // que se quiere evitar (enseñar «no se sabe» cuando sí se sabe).
    let estadoDeSesion: EstadoDeSesion = {
      hilo: `xonecode-${randomUUID()}`,
      raiz,
      fuentes: opciones.fuentes ?? {},
    };
    // `/modelo` y `/modelos` cambian el modelo EN CALIENTE y no tocan disco, así que esta
    // es la única forma de enterarse. Ver `Consola.alEstado`.
    consolaWeb.consola.alEstado = (nuevo) => {
      estadoDeSesion = nuevo;
      escuchaDeEstado?.(nuevo);
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
      get sesion() {
        return idSesion;
      },
      get historica() {
        return historica;
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
      terminada,
    };
    abierto = consolaDeProyecto;
    return consolaDeProyecto;
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

    async completarProyecto({ entorno, proyecto, rama }) {
      const registrado = entornoPorId(entorno);
      // El listado remoto trae `{id, nombre}`; un nombre suelto vale porque en CloudStudio
      // el proyecto se abre POR NOMBRE (`studio_open_project`) y el id solo identifica.
      const identidad = typeof proyecto === "string" ? { id: proyecto, nombre: proyecto } : proyecto;
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
      consolaDelVestibulo.cerrar();
    }),
  };
}
