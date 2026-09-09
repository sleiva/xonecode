/**
 * El arranque de la consola web: las comprobaciones, el servidor, las RUTAS y el navegador.
 *
 * Vive aquí y no en `cli/main.ts` —que ya pasa de mil líneas— por lo mismo que
 * `cli/tui/correrTui.ts`: el despachador decide QUÉ piel arranca, y la piel se monta en su
 * propia casa. `main.ts` lo carga con un import dinámico, así que `run`, `describe` y
 * cualquier tubería no pagan el vestíbulo entero.
 *
 * **Aquí es donde `registrarRuta` deja de ser código muerto.** `web/servidor/servidor.ts`
 * la exportaba desde la Task 5 y hasta ahora no la llamaba nadie fuera de sus tests: los
 * dos extremos del cable estaban escritos y sin conectar, de modo que la consola web no se
 * podía abrir aunque `decidirPiel` devolviera «web». Las dos rutas son las que el cliente
 * ya pedía (`apps/web/src/conexion.ts`): el SSE de `/eventos` y el `POST /accion`.
 *
 * **A qué consola habla el cable, y por qué se re-adjunta.** El vestíbulo tiene DOS
 * consolas: la suya (sin raíz, la del alta) y la del proyecto abierto. `consolaWeb.eof()`
 * es `!transporte.conectado()`, y sin cliente conectado toda aprobación sale rechazada y
 * todo `preguntar` responde cadena vacía. Si el SSE se quedara enganchado a la consola del
 * vestíbulo después de abrir un proyecto, el usuario vería su transcript y NADA de lo que
 * decidiera llegaría: fail-closed mudo. Por eso al abrir proyecto se desconecta la anterior
 * y se conecta la nueva, con reemisión entera del transcript.
 *
 * **La clave de API no pasa por el mensaje de alta.** El paso de cuenta lo conduce
 * `vestibulo.pasoDeCuenta()` —o sea `cli/wizardInicial.ts#asistenteDeModelo` sin tocar—
 * sobre `seleccionar` y `leerSecreto`, que el cliente ya pinta. Así la clave sigue viajando
 * por el único mensaje del cable que la lleva y, de propina, el asistente elige TAMBIÉN el
 * modelo y lo guarda: un paso de cuenta que solo guardara la credencial dejaría `trabajo`
 * en la omisión (Ollama local) con una clave de Anthropic recién escrita al lado.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { homedir } from "node:os";
import type { Acto } from "../../core/actos.js";
import { escribirAgente, leerAgente, type Agente } from "../../core/agentes.js";
import { borrarAgente, cargarAgentes, guardarAgente } from "../../agent/agentesEnDisco.js";
import { detectarDispositivos } from "../../agent/dispositivosEnMaquina.js";

import type { InformeDeDispositivos } from "../../core/dispositivos.js";
import { PLATAFORMAS_DE_DISPOSITIVO, type AjustesDeDispositivos } from "../../core/settings.js";
import type { NombreDeHerramienta } from "../../core/dispositivos.js";
import { instalarHerramientaDeDispositivos } from "../../agent/dispositivosEnMaquina.js";
import { correrPasoDeReceta } from "../../agent/instalacionEnMaquina.js";
import { modelosDeMotor } from "../../agent/modelosDeMotor.js";
import {
  parsear,
  compatibleConOpenAi,
  esProveedorPersonalizado,
  idDeProveedorPersonalizado,
  motivoDeEndpointInaceptable,
  motivoDeSlugInaceptable,
  nombreDeProveedor,
  PROVEEDORES,
  slugDesdeNombre,
  resolver,
  SIN_CREDENCIAL,
  type ProveedorDeclarado,
  type FuentesDeEleccion,
  type Proveedor,
} from "../../core/modelos.js";
import { COMANDOS, hayCredencial, type Consola, type EjecutorDeTurno } from "../../cli/consola.js";
import { motivoDeClaveInaceptable } from "../../core/config.js";
import {
  aplicarAuth,
  aplicarCredencialAlProceso,
  cargar,
  guardarModeloGlobal,
} from "../../agent/configEnDisco.js";
import { borrarCredencial, guardarCredencial } from "../../agent/authEnDisco.js";
import {
  borrarProveedorPersonalizado, guardarProveedorPersonalizado, proveedoresPersonalizados,
} from "../../agent/configEnDisco.js";
import {
  crearCheckpointerDeProyecto, hayCheckpoint, olvidarHilo,
} from "../../agent/checkpointer.js";
import {
  cargarSettings,
  guardarConcurrenciaDeTareas,
  guardarDispositivos,
  guardarEntorno as guardarEntornoEnDisco,
} from "../../agent/settingsEnDisco.js";
import { seAplicaSinAprobacion } from "../../core/settings.js";
import { cloudstudioDelProyecto } from "../../agent/configEnDisco.js";
import { abrirEnSistema } from "../../agent/cloudstudioMcp.js";
import { nombreDePersona } from "../../agent/persona.js";
import { cambiosDeSesion, fotoDeApertura, olvidarSesion, parcheDeSesion } from "../../agent/sesionGit.js";
import { trabajoSinCommitear } from "../../agent/gitSync.js";
import { marcarTareaDeSesion } from "./sesiones.js";
import { RUTA_ARTEFACTOS, esRutaDeArtefacto } from "../../core/artefactos.js";
import { arbolDeProyecto, leerFicheroDeProyecto } from "../../agent/arbolDeProyecto.js";
import {
  leerArtefactoCrudo,
  leerArtefactoDeSesion,
  type LecturaCruda,
} from "../../agent/artefactosEnDisco.js";
import type { ProyectoRemoto } from "../../agent/cloudstudioMcp.js";
import { CatalogoModelos } from "../../agent/catalogoModelos.js";
import { Modelos } from "../../agent/modelos.js";
import { crearJuezDeTarea, invocarConModelos } from "../../agent/juezDeTarea.js";
import type { AumentadorPort, JuezDeTareaPort } from "../../core/ports.js";
import { AumentadorGuionizado } from "../../core/ports.js";
import type { Entorno } from "../../core/settings.js";
import { arrancarServidor, type ServidorWeb } from "./servidor.js";
import {
  consolaParaTarea,
  crearCorredorDeTareas,
  type Corredor,
  revisionConGit,
  type RevisionDeSesion,
} from "./corredorDeTareas.js";
import {
  CONCURRENCIA_POR_OMISION,
  conEstado,
  darPorBuenaAMano,
  tituloDeTarea,
  type Tarea,
} from "../../core/tareas.js";
import { aplicarFeedback, TOPE_DE_ADJUNTO, type TareasEnDisco } from "../../agent/tareasEnDisco.js";
import { nombreDeAdjuntoAceptable } from "../../core/adjuntos.js";
import { rutaMemoriaDeProyecto } from "../../agent/memoriaDeProyecto.js";
import { crearAumentador, invocarParaAumentar } from "../../agent/aumentador.js";
import {
  conexionDeVestibulo,
  crearVestibulo,
  escribirProyectoEnDisco,
  esProyectoEnDisco,
  type OpcionDeEntorno,
  type PasoDelVestibulo,
  type OpcionesDelVestibulo,
  type SesionCerrable,
  type Vestibulo,
} from "./vestibulo.js";
import type {
  FicheroTocado,
  FicheroDelProyecto,
  MensajeAlCliente,
  MensajeDelCliente,
  Sumidero,
  InformeDeDispositivosDelCable,
} from "./transporte.js";
// Valor y no tipo: la traducción de una `Tarea` a lo que viaja vive JUNTO al tipo que
// produce y no aquí. Estuvo en este cierre, y ahí se cayó `veredicto` sin que nada se
// pusiera rojo (F1 de la revisión final) — el patrón de fallo que este repo ya tiene
// documentado cinco veces: una composición de producción dentro de algo que los tests
// doblan.
import { filaDeTarea } from "./transporte.js";

/** Las dos rutas del cable. El cliente las tiene escritas en `apps/web/src/conexion.ts`. */
export const RUTA_EVENTOS = "/eventos";
export const RUTA_ACCION = "/accion";
/**
 * El documento de un ARTEFACTO, para el iframe y para la descarga.
 *
 * Tiene que ser HTTP y no cable: un iframe pinta un DOCUMENTO, y por `/eventos` viajan
 * mensajes. El nombre va en la query y no en la ruta porque `registrarRuta` casa por
 * coincidencia EXACTA (`servidor.ts`), así que `/artefacto/<nombre>` no encontraría
 * manejador. Consecuencia asumida: las URLs relativas de dentro del HTML no resuelven —
 * el contrato de las skills que los escriben es «autocontenido».
 */
export const RUTA_ARTEFACTO = "/artefacto";
/**
 * `POST /adjunto?tarea=<id>&nombre=<fichero>` — los BYTES de un adjunto.
 *
 * Por HTTP y no por el cable: el SSE lleva JSON y esto son bytes. El nombre va en la QUERY
 * y no en la ruta por lo mismo que el del artefacto: `registrarRuta` casa por coincidencia
 * EXACTA, así que `/adjunto/<nombre>` no encontraría manejador.
 */
export const RUTA_ADJUNTO = "/adjunto";

/** Cuántas líneas del log de una instalación viajan: la COLA, lo último. */
export const LINEAS_DE_LOG = 12;
/** Cada cuánto se emite el progreso. Ver `atenderReceta`: cada emisión manda la cola entera. */
export const MS_ENTRE_PROGRESOS = 250;

/** Lo que se sirve: el build del cliente. Tres niveles arriba tanto desde `src/web/servidor/`
 *  como desde `dist/web/servidor/`, que es la disposición que se publica en npm. */
export function raizDelClientePorOmision(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "apps", "web", "dist");
}

export const FALTA_EL_BUILD = "falta el build del cliente: ejecuta «npm run build:web»";

/** Tope del cuerpo de `POST /accion`. Generoso para una prosa larga, finito porque el
 *  cuerpo se acumula en memoria y un cliente roto no puede llenarla. */
const TOPE_DE_CUERPO = 1_000_000;

/**
 * El registro de comandos de barra, para el compositor del navegador.
 *
 * Se GENERA recorriendo `COMANDOS` (`cli/consola.ts`), igual que `/ayuda`, la cabecera de
 * stdio y el completador de Tab: una lista escrita a mano se queda vieja en cuanto alguien
 * añade un comando, y el compositor lo sugeriría todo menos el nuevo.
 */
export function comandosDelRegistro(): { nombre: string; descripcion: string }[] {
  return Object.entries(COMANDOS).map(([nombre, c]) => ({
    nombre: `/${nombre}`,
    descripcion: descripcionParaLaWeb(c.descripcion),
  }));
}

/**
 * La descripción de un comando, para el navegador.
 *
 * `COMANDOS` está escrito para la terminal: «config y credenciales, sin claves — como
 * `xonecode config`» remite a la shell y lleva acentos graves que el compositor pinta tal
 * cual. Medido en pantalla. Se quita el «— como `xonecode …`» y las comillas de código; el
 * registro sigue siendo UNO (`cli/consola.ts`), esto es solo cómo se lee aquí.
 */
export function descripcionParaLaWeb(descripcion: string): string {
  return descripcion
    .replace(/\s+—\s+como `xonecode[^`]*`/u, "")
    .replace(/`/g, "")
    .replace(/comandos de barra/u, "comandos");
}

/** Lo mínimo que el cable necesita de una consola, la del vestíbulo o la del proyecto. */
interface DestinoDelCable {
  recibir(mensaje: MensajeDelCliente): void;
  conectar(enviar?: Sumidero): readonly Acto[];
  /** Con sumidero se va ESE cliente; sin él, todos (es lo que hace mudarse de consola). */
  desconectar(enviar?: Sumidero): void;
}

export interface OpcionesDeMontaje {
  /** A dónde van los avisos que no caben en el transcript. Por omisión, a ningún sitio. */
  informar?: (texto: string) => void;
  /**
   * ¿Está confirmada la credencial de ese proveedor? Por omisión NADIE la tiene, que es la
   * dirección honesta: decir «puesta» sin haberlo comprobado es pintar un punto verde que
   * no significa nada. Los que no necesitan credencial (`SIN_CREDENCIAL`) no pasan por
   * aquí.
   */
  hayCredencial?: (proveedor: Proveedor) => boolean;
  /** ¿Está esa credencial en `auth.json`? Solo esas se pueden borrar desde la interfaz. */
  credencialEnFichero?: (proveedor: Proveedor) => boolean;
  /**
   * Borra la credencial de `auth.json`. Ausente = esta ejecución no puede borrar, y la
   * interfaz no ofrece el botón en vez de ofrecer uno que no hace nada.
   */
  borrarCredencial?: (proveedor: Proveedor) => { ruta: string; borrada: boolean; quedaEnEntorno: boolean };
  /**
   * Escribe la credencial en `auth.json`. Entra por opción y no se importa aquí por lo
   * mismo que todo lo que toca el disco en este repo: un valor por omisión que escribiera
   * de verdad convertiría cualquier test de este cable en una escritura en el
   * `~/.xonecode` de quien los corre.
   */
  guardarCredencial?: (proveedor: Proveedor, clave: string) => { ruta: string };
  /**
   * Los proveedores personalizados dados de alta. Es una FUNCIÓN y no una lista porque se
   * dan de alta en caliente desde esta misma ventana: una lista leída al montar las rutas
   * se quedaría vieja hasta reiniciar.
   */
  proveedoresPersonalizados?: () => readonly ProveedorDeclarado[];
  /**
   * Da de alta o reescribe un proveedor personalizado. Ausente = esta ejecución no puede,
   * y la ventana no ofrece el formulario en vez de ofrecer uno que no guarda nada.
   */
  guardarProveedor?: (declarado: ProveedorDeclarado) => { ruta: string };
  /** Retira uno. Su credencial la borra quien llama, con `borrarCredencial`. */
  borrarProveedor?: (slug: string) => { ruta: string; borrado: boolean };
  /**
   * El catálogo VIVO de un proveedor. Ausente = esta ejecución no puede consultarlo, y el
   * menú lo dice en vez de quedarse cargando para siempre.
   */
  catalogoDeModelos?: (proveedor: Proveedor) => Promise<{ id: string; nombre?: string }[]>;
  /** Qué ha tocado la sesión, y el parche de un fichero (`agent/sesionGit.ts`). Ausentes =
   *  esta ejecución no lo puede saber, y la pestaña lo dice. */
  cambiosDeSesion?: (raiz: string, sesion: string) => Promise<{ via: "git" | "sin-marca"; ficheros: FicheroTocado[] }>;
  parcheDeSesion?: (raiz: string, sesion: string, ruta: string) => Promise<{ texto: string; recortado: boolean } | undefined>;
  /**
   * El árbol del proyecto y el contenido de un fichero (`agent/arbolDeProyecto.ts`). Entran
   * por opción porque tocan el disco del proyecto: un test del cable usa dobles.
   */
  arbolDelProyecto?: (raiz: string) => Promise<{ rutas: string[]; recortado: boolean }>;
  leerFichero?: (raiz: string, ruta: string) => Promise<FicheroDelProyecto>;
  /**
   * Los dos lectores de ARTEFACTOS (`agent/artefactosEnDisco.ts`), y son dos porque son dos
   * transportes con necesidades opuestas: el del cable devuelve la forma de un fichero
   * —texto al tope, imagen en base64— y el crudo devuelve los bytes tal cual, que es lo que
   * el iframe necesita (un HTML recortado no abre) y lo que se descarga.
   *
   * Ausentes = esta ejecución no los tiene, y se dice: un visor que se queda «trayendo…»
   * para siempre es peor que uno que explica que aquí no se puede.
   */
  leerArtefacto?: (raiz: string, sesion: string, nombre: string) => Promise<FicheroDelProyecto>;
  leerArtefactoCrudo?: (raiz: string, sesion: string, nombre: string) => Promise<LecturaCruda>;
  /**
   * Qué hay en la máquina para probar la app (`agent/dispositivosEnMaquina.ts`). Ausente =
   * esta ejecución no lo mira, y no se manda ningún `dispositivos`: el escritorio se queda
   * en «consultando…» en vez de afirmar una máquina vacía. Entra por opción porque lanza
   * procesos (adb, xcrun) y un test del cable no puede lanzarlos.
   */
  detectarDispositivos?: () => Promise<InformeDeDispositivos>;
  /**
   * Qué destinos se miran, leídos de `settings.json` en el momento de emitir. Se lee y no
   * se cachea porque el fichero es del usuario y puede cambiar por fuera. Ausente = esta
   * ejecución no los conoce y viaja `{}`, que significa «se miran todos».
   */
  ajustesDeDispositivos?: () => AjustesDeDispositivos;
  /**
   * Guarda esos ajustes. Ausente = la ventana no puede cambiarlos y el cable lo dirá
   * quedándose como estaba: mejor que un interruptor que se mueve y no persiste.
   */
  guardarAjustesDeDispositivos?: (ajustes: AjustesDeDispositivos) => void;
  /**
   * Instala una herramienta que falta. Recibe el NOMBRE, nunca un comando: qué se lanza lo
   * decide el host, porque un comando que llegue por el cable es una shell abierta en la
   * máquina del usuario. Ausente = esta ejecución no instala nada.
   */
  instalarHerramienta?: (herramienta: NombreDeHerramienta) => Promise<void>;
  /**
   * Los modelos que ofrece un motor EXTERNO (`agent/modelosDeMotor.ts`). Ausente = esta
   * ejecución no los sabe, y el desplegable lo dice en vez de quedarse vacío.
   */
  modelosDeMotor?: (motor: string) => Promise<{ modelos: { id: string; nombre: string }[]; error?: string }>;
  /**
   * Ejecuta un paso de una receta (`agent/instalacionEnMaquina.ts`), con su salida en vivo.
   * Ausente = esta ejecución no lanza nada y el botón no se ofrece: el paso se copia, que es
   * lo que la receta hace de todas formas.
   */
  correrPasoDeReceta?: (
    receta: string,
    paso: number,
    alSalirLinea: (linea: string) => void
  ) => { titulo: string; cancelar: () => void; terminado: Promise<{ estado: string; motivo?: string; ms: number }> };
  /**
   * «Vuelve a mirar la cola de tareas» (`corredorDeTareas.ts#revisar`). Ausente = esta
   * ejecución no ejecuta tareas.
   *
   * Hace falta AQUÍ porque abrir un proyecto es lo que BLOQUEA su raíz —gana la persona— y
   * cerrarlo lo que la libera, y el corredor no tiene forma de enterarse: no hay
   * temporizador, se revisa por evento. Sin esta llamada, una tarea que esperaba a que
   * alguien cerrara un proyecto se quedaría esperando hasta el siguiente evento que no
   * tiene nada que ver, y en la pantalla eso se lee como un cuelgue.
   */
  revisarTareas?: () => void;
  /**
   * La cola de tareas: el PUERTO de disco y el corredor, no operaciones sueltas.
   *
   * `crearTarea` no es una opción propia por lo mismo que `registrarEntorno` devuelve el
   * entorno REGISTRADO en vez de que el llamante deduzca el id: **quien tiene el estado
   * hace la resolución.** El cliente manda un id de proyecto y `Tarea.proyecto` necesita
   * `{id, raiz, nombre}` — y esa raíz solo se puede calcular con `proyectos`,
   * `entornoElegido` y `vestibulo.raizDeProyecto`, que son estado de este CIERRE (la misma
   * resolución que ya hace `atenderSesion` para abrir por id). Un `crearTarea` recibido
   * como función de fuera no tendría con qué resolverla — es justo el agujero que un
   * primer intento de este cable dejó pasar. Por eso `montarRutas` construye los
   * manejadores de crear/reintentar/descartar/terminar aquí dentro, con este `colaDeTareas`
   * como único puerto de escritura. **No lo saques a una opción suelta**: quien lo intente
   * se va a topar con la misma resolución que esto ya resuelve.
   *
   * Ausente = esta ejecución no ejecuta tareas, y no se manda ningún `tareas`: el kanban
   * se queda diciendo que no ha llegado, en vez de afirmar que no hay tareas.
   */
  colaDeTareas?: Pick<
    TareasEnDisco,
    "listar" | "guardar" | "borrarTarea" | "guardarAdjunto" | "listarAdjuntos"
  >;
  /**
   * Lo mínimo del corredor que este cable toca: `corriendoAqui` para LEER (el campo del
   * mensaje `tareas`), y `cortar` para escribir — pero acotado a UNA tarea, nunca
   * `arrancar`/`parar` el proceso entero. Task 14: `atenderAccionDeTarea` lo llama ANTES de
   * `borrarTarea` para que descartar una `en-proceso` no deje su turno huérfano escribiendo
   * en el proyecto sin que ninguna pantalla lo diga.
   */
  /**
   * `ejecutaOtroProceso` va en un `Partial` a propósito: es la respuesta a «¿hay dueño?» y
   * un corredor que no la sepa dar deja el campo AUSENTE en el cable, que es «no se sabe» —
   * distinto de «nadie». Los dobles de test que no la implementan ejercitan justo ese caso.
   */
  corredorDeTareas?: Pick<Corredor, "corriendoAqui" | "cortar"> &
    Partial<Pick<Corredor, "ejecutaOtroProceso" | "mirar" | "dejarDeMirar">>;
  /** El tope de concurrencia vigente, para el mensaje `tareas`. Ausente = `CONCURRENCIA_POR_OMISION`. */
  concurrenciaDeTareas?: () => number;
  /** Cambia el tope de concurrencia del corredor. Ausente = Ajustes no puede tocarlo. */
  guardarConcurrencia?: (concurrencia: number) => void;
  /**
   * Augmenta una petición en un encargo revisado (`agent/aumentador.ts`, Task 9). Ausente =
   * el botón «Preparar el encargo» no está disponible.
   */
  augmentar?: (peticion: {
    texto: string;
    /**
     * El proyecto RESUELTO, con su raíz. La resuelve este cierre —igual que al crear una
     * tarea— porque el cliente solo manda el id: nunca ha visto una ruta de la máquina. Y la
     * raíz hace falta para que el papel `trabajo` se resuelva con el `config.json` del
     * proyecto, la misma trampa que `CasoDeJuez.raiz` documenta.
     */
    proyecto: { id: string; raiz: string; nombre: string };
    /** Nombres y tipos, nunca contenido: salen del DISCO, de la carpeta del borrador. */
    adjuntos: readonly { nombre: string; mime?: string }[];
  }) => Promise<string>;
}

/** El `Content-Type` con el que se sirve un artefacto inline: al texto se le pone el juego
 *  de caracteres, porque sin él el navegador lo adivina de los bytes y un HTML en UTF-8 sale
 *  con la acentuación rota. A una imagen no se le pone: no lo lleva. */
function tipoServido(mime: string): string {
  return mime.startsWith("text/") || mime === "image/svg+xml" || mime === "application/json"
    ? `${mime}; charset=utf-8`
    : mime;
}

/**
 * Monta `/eventos` y `/accion` sobre un servidor ya levantado.
 *
 * Separada de `arrancarConsolaWeb` para poder probar el cable entero —conexión, registro
 * de comandos, alta, cambio de proyecto— sin puerto, sin disco y sin navegador: los
 * manejadores se invocan con dobles de petición y respuesta.
 *
 * Devuelve `emitirTareas`: el corredor de tareas NACE antes que este cable (lo necesita
 * `arrancarConsolaWeb` para pasarle `corredorDeTareas`), así que su `alCambiar` —un cambio
 * de estado que nace DENTRO del lazo, no de una petición del cliente— no tiene manera de
 * alcanzar el `emitir` de aquí salvo que se lo devuelva. Es la misma costura que
 * `vestibulo.alCambiarEstadoDeSesion`, solo que el emisor nace después que quien lo
 * necesita en vez de antes.
 */
export function montarRutas(
  servidor: Pick<ServidorWeb, "registrarRuta">,
  vestibulo: Vestibulo,
  opciones: OpcionesDeMontaje = {}
): { emitirTareas: () => void } {
  const informar = opciones.informar ?? (() => {});
  const hayCredencialDe = opciones.hayCredencial ?? (() => false);

  /** Los personalizados dados de alta AHORA: se relee en cada mensaje, porque esta misma
   *  ventana los da de alta y de baja sin reiniciar nada. */
  const personalizados = (): readonly ProveedorDeclarado[] => opciones.proveedoresPersonalizados?.() ?? [];
  const idsPersonalizados = (): Proveedor[] =>
    personalizados().map((d) => idDeProveedorPersonalizado(d.slug));
  const baseUrlDe = (proveedor: Proveedor): string | undefined =>
    compatibleConOpenAi(proveedor, personalizados())?.baseUrl;
  /**
   * ¿Existe ese proveedor? De serie, o personalizado DADO DE ALTA. Una sola función porque
   * había dos puertas con el mismo criterio y una se quedó atrás: la del catálogo devolvía
   * en silencio para un `custom:…`, así que pulsar un proveedor recién dado de alta en la
   * pastilla se quedaba en «consultando…» para siempre — el botón muerto de siempre, y con
   * el modelo pulsándolo.
   */
  const proveedorConocido = (id: string): boolean =>
    (PROVEEDORES as readonly string[]).includes(id)
    || personalizados().some((d) => idDeProveedorPersonalizado(d.slug) === id);

  /** Los tres estados que se pueden AFIRMAR de una credencial. Ver `ProveedorDeModelos`. */
  const credencialDe = (proveedor: Proveedor): "puesta" | "falta" | "nativa" =>
    SIN_CREDENCIAL.has(proveedor) ? "nativa" : hayCredencialDe(proveedor) ? "puesta" : "falta";

  /**
   * Los clientes vivos. Fue una sola ranura y era un fallo: el último en conectar dejaba
   * mudos a los anteriores sin decírselo —medido con una pestaña local y otra por un túnel—.
   * Emitir es escribirle a todos; el transporte hace lo mismo por su lado.
   */
  const clientes = new Set<Sumidero>();
  /**
   * Los clientes por su IDENTIFICADOR, y qué tareas está mirando cada uno.
   *
   * **Existe porque el SSE y el `POST /accion` son dos peticiones distintas.** El único
   * sitio con un sumidero en la mano es la ruta del SSE, así que sin un identificador que
   * el cliente repita en su `{clase:"mirar"}` el servidor no sabría a qué pestaña
   * engancharle la mirada — y tendría que emitirle el transcript de una tarea de fondo a
   * TODO el mundo, que es justo lo que no puede pasar (los actos de una tarea no aparecen
   * en el chat de nadie). Lo elige el cliente, una vez por conexión, igual que elige el id
   * de una tarea al subirle un adjunto por `POST /adjunto`.
   *
   * El id **nunca es una ruta ni un nombre de fichero**: es solo la clave de este mapa, y
   * las entradas nacen y mueren con la conexión del SSE — no crece con los mensajes.
   *
   * `mirando` guarda el ENVOLTORIO que se enganchó al corredor (no el sumidero pelado),
   * porque es el que hay que pasarle a `dejarDeMirar` para quitar ESE y no los demás.
   */
  const porIdDeCliente = new Map<string, { enviar: Sumidero; mirando: Map<string, Sumidero> }>();
  /**
   * La consola a la que está ENGANCHADO el cable ahora mismo. No se recalcula al cerrar:
   * hay que desconectar la que se conectó, no la que sea la actual en ese momento — entre
   * medias puede haberse abierto un proyecto.
   */
  let adjunto: DestinoDelCable | undefined;

  /** Lo elegido en el wizard hasta ahora. Ninguno se inventa: sin elección, no hay lista. */
  let entornoElegido: string | undefined;
  let proyectoElegido: string | undefined;
  let proyectos: readonly ProyectoRemoto[] = [];
  let ramas: string[] = [];
  /**
   * El paso de cuenta ya conducido en ESTE proceso. Hace falta porque `origenDeTrabajo` se
   * congela al construir el vestíbulo: `pasosPendientes()` seguiría diciendo «cuenta»
   * después de haberla dado, y el wizard volvería a pedirla en cada reconexión.
   *
   * Se marca cuando `pasoDeCuenta()` TERMINA, no cuando se lanza — medido: marcarlo antes
   * de esperar significaba que recargar a mitad del selector (o de teclear la clave) daba
   * por «hecho» un paso que en realidad ni se había contestado ni se iba a volver a
   * ofrecer, y el usuario se quedaba con el modelo por omisión sin que nada se lo dijera.
   */
  /**
   * Si hay turno en vuelo AHORA. Se lleva aquí, además de emitirse, porque quien conecta a
   * mitad de turno tiene que enterarse: el mensaje que lo anunció ya pasó.
   */
  let turnoEnVuelo = false;
  let cuentaHecha = false;
  /**
   * El propio `pasoDeCuenta()` en vuelo, compartido entre conexiones. Sin esto, dos
   * conexiones solapadas (dos pestañas, o la reconexión que llega antes de que la vieja
   * se haya desenganchado del todo) verían las dos `cuentaHecha` en `false` y llamarían
   * a `pasoDeCuenta()` cada una la suya — dos `asistenteDeModelo` a la vez apilando DOS
   * resolutores en la MISMA cola FIFO de `consolaWeb.ts#seleccionar`, de forma que la
   * respuesta de una pestaña resolvería la pregunta de la OTRA. Una sola llamada real,
   * y la segunda conexión se limita a esperar la que ya está en marcha.
   */
  let cuentaEnCurso: Promise<void> | undefined;
  /**
   * Lo que falló en el último paso del alta. Viaja en el propio mensaje del alta porque el
   * fallo pertenece al paso que lo produjo: el acto de sistema que `informar` deja aterriza
   * en la Trayectoria —la otra pestaña—, y el wizard repintaba el mismo paso sin decir nada.
   */
  let aviso: string | undefined;

  const destinoActual = (): DestinoDelCable => vestibulo.proyectoAbierto() ?? vestibulo.consola;

  const emitir = (mensaje: MensajeAlCliente): void => {
    for (const cliente of clientes) cliente(mensaje);
  };

  /**
   * El mensaje de alta: qué falta, y con qué elegirlo.
   *
   * Con proyecto YA abierto no falta nada, y se dice con `pasos` vacío SIN mirar
   * `pasosPendientes()` — es el comportamiento de siempre (el atajo de `--guion` sobre un
   * proyecto offline, por ejemplo, abre directo y nunca debería enseñar el alta, tenga o
   * no cuenta/entorno resueltos) y no algo que este cambio deba tocar.
   *
   * Cambio de rumbo del usuario, para cuando NO hay proyecto abierto: el paso de proyecto
   * salió del alta, así que `pasos` sale DIRECTO de `pasosPendientes()` —que ya nunca
   * incluye «proyecto»— en vez de esperar a que se abra uno. Antes de este cambio
   * `pasos: []` solo pasaba con un proyecto abierto, y el cliente usaba esa implicación
   * para pintar la maqueta completa; ahora también pasa sin proyecto (con cuenta y
   * entorno resueltos), así que la implicación ya no basta y `proyectoAbierto` viaja
   * aparte (`transporte.ts` lo documenta) para que el cliente sepa si esperar una
   * elección en la barra o pintar la sesión de verdad.
   *
   * «cuenta» NO se anuncia nunca al wizard: ese paso lo conduce `conducirCuenta` sobre el
   * selector y el secreto, que es lo que mantiene la clave en su único mensaje y lo que
   * hace que se elija TAMBIÉN el modelo. El wizard sigue sabiendo pintarlo por si otra
   * piel se lo manda; esta no.
   */
  const anunciarAlta = async (): Promise<void> => {
    const abierto = vestibulo.proyectoAbierto();
    const proyectoAbierto = abierto !== undefined;
    // Se lee del disco EN CADA anuncio y no se cachea al abrir: `configurarModoInicial`
    // puede escribirlo después de abrir (el alta de un proyecto cloud), y una copia
    // tomada antes se quedaría diciendo lo de antes.
    const modo = abierto === undefined ? undefined : modoDeProyecto(abierto.raiz);
    // CUÁL es el abierto, deducido de su raíz: la que le tocaría a cada proyecto de la
    // lista se calcula con la misma función que la creó. Guardar el id aparte al abrirlo
    // sería una segunda fuente de verdad que se queda vieja el día que alguien abra por
    // otro camino.
    // El `entorno` se copia a una constante porque TypeScript no puede saber que
    // `entornoElegido` —una variable del cierre, que otro mensaje puede cambiar— sigue
    // definida dentro del callback.
    const entorno = entornoElegido;
    const activo =
      abierto === undefined || entorno === undefined
        ? undefined
        : proyectos.find((p) => {
            try {
              return vestibulo.raizDeProyecto(entorno, p.nombre) === abierto.raiz;
            } catch {
              return false;
            }
          })?.id;
    const pendientes = proyectoAbierto ? [] : await vestibulo.pasosPendientes();
    // Lo que ya había sin commitear al ABRIR. `abierto` se capturó arriba, antes de este
    // `await`: `anunciarAlta` no va en la cola del vestíbulo, así que entre medias puede
    // haberse abierto otro proyecto y el dato tiene que ser del que se anuncia. La promesa
    // está cacheada en la consola y no rechaza nunca.
    const trabajo = abierto === undefined ? undefined : await abierto.trabajoAlAbrir;
    const pasos: PasoDelVestibulo[] = pendientes.includes("entorno") ? ["entorno"] : [];
    emitir({
      clase: "alta",
      pasos,
      proveedores: PROVEEDORES.map((p) => ({ id: p, nombre: nombreDeProveedor(p) })),
      entornos: [...vestibulo.opcionesDeEntorno()],
      // Los registrados de verdad, además de los ofrecidos: la ventana de ajustes los
      // lista, y la barra lateral llevaba enseñando la lista OFRECIDA como si fuera ésta.
      registrados: vestibulo.entornosRegistrados().map((e) => ({
        id: e.id,
        nombre: e.nombre,
        url: e.url,
        // Solo si el entorno lo dice: ausente es «no lo he elegido», y el cliente aplica su
        // omisión. Mandar `[]` en su lugar sería decir «ninguno», que es otra cosa.
        ...(e.proyectos === undefined ? {} : { proyectos: [...e.proyectos] }),
      })),
      // Cada proyecto con las sesiones de su copia local. Se recalcula en cada anuncio: una
      // sesión nueva aparece en cuanto se abre, sin que nadie recargue.
      proyectos: proyectos.map((p) => {
        const sesiones = entornoElegido === undefined ? [] : sesionesDelProyecto(p.nombre);
        return {
          ...p,
          ...(sesiones.length === 0 ? {} : { sesiones }),
          // Si ya está bajado, abrirlo no necesita ni rama ni descarga: es lo que decide
          // qué enseña la ventana de sesión nueva, y decidirlo en el cliente exigiría
          // que supiera dónde vive la copia local.
          ...(hayCopiaLocal(p.nombre) ? { local: true } : {}),
        };
      }),
      ramas,
      proyectoAbierto,
      ...(modo === undefined ? {} : { modo }),
      ...(entornoElegido === undefined ? {} : { entornoActivo: entornoElegido }),
      ...(activo === undefined ? {} : { proyectoActivo: activo }),
      ...(abierto?.sesion === undefined ? {} : { sesionActiva: abierto.sesion }),
      ...(abierto?.dispositivo === undefined ? {} : { dispositivoActivo: abierto.dispositivo }),
      ...(abierto?.historica === true ? { historica: true } : {}),
      // Este proyecto escribe sin preguntar. Viaja en el ALTA y no solo en el aviso del
      // turno porque la decisión se tomó una vez, quizá hace meses, y quien se sienta hoy
      // tiene que saberlo ANTES de pedir nada — no después, con los ficheros ya cambiados.
      // Se calcula aquí y no se guarda: las tres condiciones incluyen si hay alguien
      // delante, y eso cambia con la conexión.
      ...(abierto !== undefined &&
      seAplicaSinAprobacion({
        raiz: abierto.estadoDeSesion.raiz,
        sinAprobacion: cargarSettings().settings.sinAprobacion,
        cloudstudio: cloudstudioDelProyecto(abierto.estadoDeSesion.raiz),
        // `true` sin más, y hay que decir por qué no es una simplificación: el alta se
        // EMITE, o sea que solo llega a un cliente conectado, y la consola web declara
        // `interactivo: true` por la misma razón (`consolaWeb.ts`). Quien decide de verdad
        // en cada ronda es el ejecutor, que vuelve a preguntar las tres condiciones.
        interactivo: true,
      })
        ? { sinAprobacion: true }
        : {}),
      // Solo si SE MIRÓ y había algo. Las otras tres respuestas —limpio, sin git, no se
      // pudo— se callan: un mensaje en cada apertura limpia es ruido en casi todas, y el
      // aviso dejaría de leerse justo el día que importa.
      ...(trabajo?.via === "git" && trabajo.ficheros !== undefined && trabajo.ficheros.length > 0
        ? {
            trabajoAlAbrir: {
              ficheros: trabajo.ficheros.slice(0, FICHEROS_DEL_AVISO),
              total: trabajo.ficheros.length,
            },
          }
        : {}),
      ...(vestibulo.nombre === undefined ? {} : { nombre: vestibulo.nombre }),
      ...(aviso === undefined ? {} : { aviso }),
    });
  };

  /**
   * Los catálogos ya consultados en ESTE proceso, por proveedor. Se guardan porque cada
   * uno es una llamada de red: abrir el menú dos veces no la repite. Un fallo también se
   * recuerda —como fallo— hasta que alguien lo vuelva a pedir a propósito.
   */
  const catalogos = new Map<string, { modelos?: { id: string; nombre?: string }[]; error?: string }>();

  /**
   * El estado de modelos: qué está en vigor y qué se puede elegir.
   *
   * `actual` sale del estado de sesión de la consola ABIERTA y de ningún sitio más. Sin
   * proyecto abierto no hay sesión y por tanto no hay modelo que afirmar: el campo se va
   * y el cliente pinta «Elige modelo» en vez de una fila muerta.
   */
  const emitirModelos = (): void => emitir(mensajeDeModelos());

  /**
   * Los subagentes en vigor, compuestos pero sin mandar.
   *
   * `cargarAgentes` cada vez y no una lista cacheada: los `.md` se pueden editar a mano con
   * la consola abierta, y una lista congelada al arrancar haría que el usuario creyera que
   * su cambio no se aplicó — que es exactamente lo que pasa con el agente, que también los
   * relee en cada construcción.
   */
  const mensajeDeAgentes = (): MensajeAlCliente => {
    const abierto = vestibulo.proyectoAbierto();
    const { agentes, problemas } = cargarAgentes(abierto?.raiz);
    return {
      clase: "agentes",
      agentes: agentes.map((a) => ({
        nombre: a.nombre,
        descripcion: a.descripcion,
        motor: a.motor,
        ...(a.modelo === undefined ? {} : { modelo: a.modelo }),
        soloLectura: a.soloLectura,
        skills: a.skills,
        instrucciones: a.instrucciones,
        origen: a.origen,
      })),
      problemas,
    };
  };

  const emitirAgentes = (): void => emitir(mensajeDeAgentes());

  /**
   * Alta, cambio y borrado de un subagente.
   *
   * El ÁMBITO decide la carpeta, y viene del cliente en vez de deducirse: con un proyecto
   * abierto valen las dos, y adivinar cuál quiere el usuario es cómo un «revisor» pensado
   * para todos los proyectos acaba escondido en uno. Sin proyecto abierto solo cabe el
   * global, y pedir el de proyecto se dice en vez de escribirlo en cualquier sitio.
   */
  const atenderAgente = (mensaje: Extract<MensajeDelCliente, { clase: "agente" }>): void => {
    const abierto = vestibulo.proyectoAbierto();
    if (mensaje.ambito === "proyecto" && abierto === undefined) {
      informar("no hay ningún proyecto abierto: ese subagente solo se puede guardar como global");
      return;
    }
    const base = mensaje.ambito === "proyecto" ? abierto!.raiz : homedir();
    try {
      if (mensaje.accion === "borrar") {
        informar(
          borrarAgente(base, mensaje.agente.nombre)
            ? `subagente «${mensaje.agente.nombre}» borrado`
            : `«${mensaje.agente.nombre}» no existía en ${mensaje.ambito}`
        );
      } else {
        // Se valida escribiendo Y VOLVIENDO A LEER, no confiando en el formulario: es el
        // mismo fichero que se puede editar a mano, así que el cargador es la única
        // autoridad sobre si vale. Si no pasara, el agente desaparecería al siguiente
        // arranque sin que nadie hubiera hecho nada raro.
        const candidato = {
          ...mensaje.agente,
          motor: mensaje.agente.motor as Agente["motor"],
          origen: mensaje.ambito,
        } as Agente;
        const comprobado = leerAgente(candidato.nombre, escribirAgente(candidato), mensaje.ambito);
        if ("error" in comprobado) {
          informar(`no se guarda «${candidato.nombre}»: ${comprobado.error}`);
          return;
        }
        guardarAgente(base, candidato);
        informar(`subagente «${candidato.nombre}» guardado en ${mensaje.ambito}`);
      }
    } catch (error) {
      informar(error instanceof Error ? error.message : String(error));
    }
    emitirAgentes();
  };

  /** El mensaje de modelos, compuesto pero sin mandar: `adjuntar` se lo da SOLO al cliente
   *  que acaba de llegar, y el resto de sitios lo emite a todos. */
  const mensajeDeModelos = (): MensajeAlCliente => {
    const abierto = vestibulo.proyectoAbierto();
    const trabajo = abierto === undefined ? undefined : resolver(abierto.estadoDeSesion.fuentes).trabajo;
    return {
      clase: "modelos",
      ...(trabajo === undefined ? {} : { actual: `${trabajo.proveedor}/${trabajo.modelo}` }),
      proveedores: [...PROVEEDORES, ...idsPersonalizados()].map((p) => ({
        id: p,
        nombre: nombreDeProveedor(p, personalizados()),
        credencial: credencialDe(p),
        // Solo se marca lo que se puede afirmar: sin puerto para mirarlo, no se dice que
        // esté en el fichero (y la interfaz no ofrecerá borrarla).
        ...(opciones.credencialEnFichero?.(p) === true && opciones.borrarCredencial !== undefined
          ? { enFichero: true }
          : {}),
        // La URL viaja SOLO en los personalizados, y no es una ruta de la máquina: es lo
        // que tecleó el usuario, y es justo lo que hay que ver al lado de su clave para
        // saber a dónde va. Los de serie no la llevan: su URL está en el repo.
        ...(esProveedorPersonalizado(p)
          ? { personalizado: true as const, ...(baseUrlDe(p) === undefined ? {} : { baseUrl: baseUrlDe(p)! }) }
          : {}),
        ...(catalogos.get(p) ?? {}),
      })),
    };
  };

  /**
   * Engancha el cable a la consola que toque, con el transcript entero por delante.
   *
   * **La invariante es que TODOS los clientes vivos están registrados en `adjunto`**, y por
   * eso hay dos casos y no uno:
   *
   * - Llega un cliente nuevo (`recien`): se registra ÉL en la consola actual y la ráfaga
   *   —transcript, comandos, modelos— es suya sola. Mandársela a todos repetiría el
   *   transcript en las pestañas que ya lo tienen.
   * - Cambia la consola (se abre un proyecto): se registran TODOS los clientes en la nueva
   *   y la ráfaga va a todos, porque todos cambian de transcript.
   *
   * Registrar solo al recién llegado en el primer caso y a nadie en el segundo fue un fallo
   * MEDIDO: al abrir un proyecto, la consola nueva se quedaba sin ningún sumidero, así que
   * el turno corría —el agente trabajaba de verdad— y no salía nada por pantalla. Escribir
   * y que no pasara nada.
   */
  const adjuntar = (recien?: Sumidero): void => {
    if (recien !== undefined && informeDeDispositivos === undefined) void atenderDispositivos().catch(contar);
    if (recien !== undefined) comprobarLosSinClave();
    const destino = destinoActual();
    const cambiaDeConsola = adjunto !== destino;
    if (adjunto !== undefined && cambiaDeConsola) adjunto.desconectar();
    adjunto = destino;

    // A quién hay que registrar y a quién hay que darle la ráfaga: al recién llegado, o a
    // todos si lo que cambió fue la consola.
    const destinatarios = recien !== undefined ? [recien] : cambiaDeConsola ? [...clientes] : [];
    let actos: readonly Acto[] = destino.conectar();
    for (const cliente of destinatarios) actos = destino.conectar(cliente);

    const modelos = mensajeDeModelos();
    // Los subagentes van en la ráfaga por lo mismo que los modelos: la ventana de ajustes
    // se puede abrir en cuanto conecta, y sin esto enseñaría una lista vacía hasta que algo
    // los cambiara — que es indistinguible de «no tienes ninguno».
    const agentes = mensajeDeAgentes();
    // La cola de tareas, si esta ejecución las tiene: la misma regla que `agentes`, sin
    // esto la pestaña de tareas se quedaría vacía hasta el primer cambio de la cola.
    const tareas = mensajeDeTareas();
    for (const cliente of destinatarios) {
      // El orden importa: primero el transcript, luego lo que el compositor necesita para
      // sugerir, y al final el estado de modelos que pinta su disparador. Al reconectar se
      // manda entero: el cliente tira sus proyecciones al caerse el SSE
      // (`store.ts#marcarDesconectado`), así que hay que repoblarlas.
      cliente({ clase: "reemision", actos: [...actos] });
      cliente({ clase: "comandos", comandos: comandosDelRegistro() });
      cliente(modelos);
      cliente(agentes);
      if (tareas !== undefined) cliente(tareas);
      // La foto de la máquina, si ya se tomó. Si no, se dispara abajo UNA vez y llega a
      // todos por el SSE cuando termine: no se espera aquí, que son varios procesos.
      if (informeDeDispositivos !== undefined) {
        cliente({ clase: "dispositivos", informe: informeDeDispositivos, ajustes: ajustesDeDispositivos() });
      }
      // Y si hay turno corriendo, se dice: quien conecta a mitad no vio el mensaje que lo
      // anunció, y sin esto vería el compositor encendido y sin borde —«no pasa nada»—
      // mientras lo que escribiera se quedaba en la cola.
      cliente({ clase: "turno", activo: turnoEnVuelo });
    }
  };

  /**
   * El paso de cuenta, conducido por el asistente de siempre sobre esta consola. Se lanza
   * suelto (no se espera) porque el manejador del SSE tiene que devolver para que el
   * navegador reciba las preguntas que este asistente va a emitir.
   */
  const conducirCuenta = async (porPeticion = false): Promise<void> => {
    const pendientes = await vestibulo.pasosPendientes();
    // Que este alta NO conduzca el modelo es distinto de que ya esté conducido: lo primero
    // pasa cuando el modelo viene de fuera (una bandera, la config global) y entonces no
    // hay nada que volver a preguntar. Callarlo dejaría un botón «Modelo ✓» que al pulsarlo
    // no hace nada — el fallo mudo de siempre.
    const noProcede = !pendientes.includes("cuenta") || vestibulo.proyectoAbierto() !== undefined;
    if (noProcede && porPeticion) {
      aviso =
        "el modelo de esta sesión no lo decide el alta: viene de una bandera o de la configuración. Cámbialo con «/modelo» cuando entres.";
      informar(aviso);
    }
    if (noProcede || cuentaHecha) return;
    if (cuentaEnCurso === undefined) {
      cuentaEnCurso = vestibulo
        .pasoDeCuenta()
        .then((resultado) => {
          // «Hecho» solo si de verdad se resolvió. `cancelado` es lo que devuelve el
          // asistente cuando ya no queda nadie a quien preguntar —con `exigirEleccion`
          // no sale por cancelar, solo por `eof()`—, o sea el silencio de una pestaña
          // que se fue a mitad del selector: la SIGUIENTE conexión tiene que poder
          // intentarlo de verdad, no heredar un «ya se preguntó» que nadie contestó.
          //
          // `sin-preguntar` SÍ cuenta como hecho: significa que no había nada que
          // preguntar (la piel no tiene selector, o ya había elección). Tratarlo como
          // pendiente dejaría fuera para siempre a quien no puede contestar.
          if (resultado !== "cancelado") cuentaHecha = true;
        })
        .finally(() => {
          cuentaEnCurso = undefined;
        });
    }
    await cuentaEnCurso;
  };

  const contar = (error: unknown): void => {
    informar(error instanceof Error ? error.message : String(error));
  };

  /**
   * Quien entra DIRECTO al Dashboard (las tres condiciones ya cumplidas) se salta el paso
   * "entorno" del wizard entero, y con él la única línea que hasta ahora rellenaba
   * `proyectos` (`atenderAlta`, más abajo). Sin esto la barra se quedaba con "Sin
   * proyectos que enseñar aquí todavía" aunque el entorno estuviera registrado de sobra —
   * la puerta que se acaba de abrir dejaba al usuario dentro y sin nada que hacer, peor
   * que el wizard que se quitó. Se resuelve el PRIMERO de `entornosRegistrados()`: la
   * misma asunción que ya hace `App.tsx` del lado cliente para `entornoActivo`, con el
   * mismo motivo — no hay señal de «cuál es el activo» cuando hay más de uno registrado.
   *
   * `entornoElegido` SOLO se fija si `proyectosDe` sale bien: con un token muerto sin
   * refresco o la red caída, la siguiente reconexión tiene que poder reintentarlo, no
   * heredar un «ya se intentó» que se quedó en `proyectos: []` para siempre. Esto puede
   * abrir el navegador de verdad si el token necesita reautenticar —`conectarCloudStudio`
   * ya lo hace así—, y es lo correcto: un token vivo no toca el puerto de callback en
   * absoluto (arreglado en `agent/cloudstudioMcp.ts#abrirCliente`), así que dos conexiones
   * seguidas no chocan por intentarlo cada una.
   */
  const poblarProyectosSiProcede = async (): Promise<void> => {
    if (vestibulo.proyectoAbierto() !== undefined) return;
    if (entornoElegido !== undefined) return;
    const [primero] = vestibulo.entornosRegistrados();
    if (primero === undefined) return;
    try {
      proyectos = await vestibulo.proyectosDe(primero.id);
      entornoElegido = primero.id;
    } catch (error) {
      aviso = error instanceof Error ? error.message : String(error);
      contar(error);
    }
  };

  /**
   * «Dime qué sirve este proveedor.» Una llamada de red por proveedor, cacheada, y el
   * fallo de uno se guarda como suyo: el menú lo lista inservible y los demás siguen
   * elegibles. Nunca lanza — quien pide un catálogo no puede tumbar el cable.
   */
  /**
   * La foto de la máquina y UNA detección en vuelo como mucho. Dos pestañas que conectan a
   * la vez no lanzan dos rondas de adb y xcrun: la segunda se engancha a la promesa de la
   * primera. Y la respuesta va a TODOS —la máquina es la misma para todos—.
   */
  let informeDeDispositivos: InformeDeDispositivosDelCable | undefined;
  /** La ruta de cada herramienta es una ruta del home del usuario: no sale por el cable. */
  const sinRutas = (informe: InformeDeDispositivos): InformeDeDispositivosDelCable => ({
    ...informe,
    herramientas: informe.herramientas.map(({ ruta: _ruta, ...resto }) => resto),
  });
  /** Los cuatro nombres conocidos y nada más: lo que llega por el cable no elige binario. */
  const esNombreDeHerramienta = (v: string): v is NombreDeHerramienta =>
    v === "adb" || v === "emulator" || v === "xcrun" || v === "devicectl";

  const mensajeDeTareas = (): MensajeAlCliente | undefined => {
    if (opciones.colaDeTareas === undefined) return undefined;
    const otro = opciones.corredorDeTareas?.ejecutaOtroProceso?.();
    return {
      clase: "tareas",
      lista: opciones.colaDeTareas.listar().map(filaDeTarea),
      concurrencia: opciones.concurrenciaDeTareas?.() ?? CONCURRENCIA_POR_OMISION,
      corriendoAqui: opciones.corredorDeTareas?.corriendoAqui() ?? false,
      // Ausente = no se sabe, y no se sintetiza: con `false` a la mínima, la pantalla diría
      // «nadie las ejecuta» de una máquina donde sí las ejecuta otro proceso.
      ...(otro === undefined ? {} : { ejecutaOtroProceso: otro }),
    };
  };
  const emitirTareas = (): void => {
    const m = mensajeDeTareas();
    if (m !== undefined) emitir(m);
  };

  /**
   * Un id de proyecto a su tripleta completa, o nada si no se puede resolver.
   *
   * La MISMA resolución que `atenderSesion` ya hace para abrir un proyecto por id
   * (`proyectos.find` + `vestibulo.raizDeProyecto`): crear una tarea necesita la raíz para
   * poder ejecutarla algún día, y esa raíz es una ruta de la máquina que el cliente nunca
   * ha mandado — solo manda el id. Sin entorno elegido, o con un id que no está en la
   * lista vigente de `proyectos`, no hay tripleta que resolver: falla CERRADO, nunca se
   * inventa una raíz.
   */
  const proyectoParaTarea = (id: string): { id: string; raiz: string; nombre: string } | undefined => {
    if (entornoElegido === undefined) return undefined;
    const identidad = proyectos.find((p) => p.id === id);
    if (identidad === undefined) return undefined;
    try {
      return { id: identidad.id, raiz: vestibulo.raizDeProyecto(entornoElegido, identidad.nombre), nombre: identidad.nombre };
    } catch {
      // `entornoElegido` dejó de estar registrado entre medias: no se sabe la raíz.
      return undefined;
    }
  };

  /**
   * Crea una tarea `nueva`. Vive aquí y no en una opción de fuera por lo que documenta
   * `OpcionesDeMontaje.colaDeTareas`: la resolución de `proyecto` necesita el estado de
   * este cierre. Sin proyecto resoluble no se escribe nada, y se DICE — la misma regla que
   * una transición imposible: no se falla en silencio.
   */
  const atenderCrearTarea = (
    proyectoId: string,
    peticion: string,
    encargo: string,
    /**
     * El id del BORRADOR bajo el que el navegador subió los adjuntos, si subió alguno.
     *
     * Los bytes viajan por `POST /adjunto` ANTES de que la tarea exista —hay que tenerlos en
     * disco antes de encolarla, porque crear dispara `revisarTareas()` y el corredor puede
     * arrancarla en el acto—, así que el cliente elige un id y este es el momento de
     * ADOPTARLO. Lo que hace que eso sea seguro son las dos guardas de abajo, y las mismas
     * que la propia ruta de subida aplica: forma de segmento llano, y que no sea ya una
     * tarea.
     */
    borrador?: string
  ): { id: string } | undefined => {
    if (opciones.colaDeTareas === undefined) return undefined;
    const proyecto = proyectoParaTarea(proyectoId);
    if (proyecto === undefined) {
      informar(`no se pudo crear la tarea: el proyecto «${proyectoId}» no se pudo resolver`);
      return undefined;
    }
    const lista = opciones.colaDeTareas.listar();
    if (borrador !== undefined && !esBorradorLibre(borrador, lista)) {
      // **No se cae a un id nuevo en silencio**, y esa es la decisión: seguir con un uuid
      // dejaría los adjuntos que la persona acaba de subir colgando de una carpeta que
      // ninguna tarea nombra — encolaría el trabajo sin ellos y sin decirlo.
      informar("no se pudo crear la tarea: ese borrador de adjuntos no vale (o ya es una tarea)");
      return undefined;
    }
    const id = borrador ?? randomUUID();
    const nueva: Tarea = {
      id,
      proyecto,
      titulo: tituloDeTarea(peticion),
      peticion,
      encargo,
      // Del DISCO y no de lo que diga el cliente: es la única fuente que sabe qué llegó de
      // verdad y cuánto pesa. Ver `TareasEnDisco.listarAdjuntos`.
      adjuntos: opciones.colaDeTareas.listarAdjuntos(id),
      estado: "nuevo",
      creada: new Date().toISOString(),
    };
    opciones.colaDeTareas.guardar([...lista, nueva]);
    return { id: nueva.id };
  };

  /**
   * ¿Se puede adoptar ese id de borrador? Segmento llano Y que no sea ya una tarea.
   *
   * Las dos mitades son la misma regla que la ruta de subida: el id lo elige el CLIENTE, así
   * que la forma es lo que evita que se salga de la carpeta de la cola, y la segunda evita
   * que un borrador aterrice sobre una tarea viva — una que el corredor puede estar
   * ejecutando ahora mismo con su `/adjuntos/` montada.
   */
  const esBorradorLibre = (id: string, lista: readonly Tarea[]): boolean =>
    nombreDeAdjuntoAceptable(id) && !lista.some((t) => t.id === id);

  /**
   * La augmentación: una llamada al modelo, bajo demanda, con el proyecto RESUELTO.
   *
   * Vive aquí y no en el despachador de mensajes por lo mismo que `atenderCrearTarea`: la
   * resolución de `{id, raiz, nombre}` necesita el estado de este cierre, y el cliente solo
   * manda el id. Sin proyecto resoluble no se pregunta a nadie: se contesta el error, que es
   * lo que la ventana pinta — nunca se inventa una raíz.
   */
  const atenderAugmentar = async (
    augmentar: NonNullable<OpcionesDeMontaje["augmentar"]>,
    proyectoId: string,
    texto: string,
    borrador?: string
  ): Promise<void> => {
    const proyecto = proyectoParaTarea(proyectoId);
    if (proyecto === undefined) {
      emitir({
        clase: "tarea",
        accion: "augmentado",
        error: `el proyecto «${proyectoId}» no se pudo resolver`,
      });
      return;
    }
    // Los adjuntos ya subidos, por NOMBRE y tipo. Del disco, igual que al crear.
    const adjuntos =
      borrador === undefined || opciones.colaDeTareas === undefined || !nombreDeAdjuntoAceptable(borrador)
        ? []
        : opciones.colaDeTareas
            .listarAdjuntos(borrador)
            .map((a) => ({ nombre: a.nombre, ...(a.mime === undefined ? {} : { mime: a.mime }) }));
    try {
      const encargo = await augmentar({ texto, proyecto, adjuntos });
      emitir({ clase: "tarea", accion: "augmentado", encargo });
    } catch (error) {
      // **El MENSAJE si lo escribimos nosotros, el CÓDIGO si lo escribió el sistema**, que
      // es la regla de `corredorDeTareas.ts#sinRutas`. Esto era `codigoDe(error)` a secas, y
      // para un `ErrorDelAumentador` eso devuelve su `name`: la ventana enseñaba «No se pudo
      // preparar el encargo (ErrorDelAumentador)», que no dice nada de lo que hay que
      // arreglar. El mensaje de los nuestros está escrito para leerse y no lleva rutas; el de
      // un error de Node sí las lleva, y de ese solo sale el `code`.
      emitir({ clase: "tarea", accion: "augmentado", error: motivoLegible(error) });
    }
  };

  /**
   * Reintentar, descartar o terminar una tarea existente.
   *
   * **Descartar BORRA** y no comprueba el estado —no hay «cancelada» en `core/tareas.ts`—,
   * ni siquiera si está `en-proceso`. Reintentar y terminar pasan por `conEstado`, que LANZA
   * ante una transición imposible; aquí se atrapa y se DICE con `informar` — nunca se
   * propaga al cliente, y nunca se escribe nada a medias.
   *
   * **Descartar CORTA el turno en vuelo ANTES de borrar (Task 14).** Antes de esto, el
   * comentario de aquí decía que «el corredor ya cuenta con que una tarea corriendo se
   * descarte por debajo» — y era cierto que CONTABA con ello (`corredorDeTareas.ts#revisar`
   * no se rompía), pero contarlo no es lo mismo que MANEJARLO: el turno seguía corriendo de
   * verdad, escribiendo en el proyecto de alguien sin que ninguna pantalla lo dijera, y su
   * carpeta de adjuntos —montada viva como `/adjuntos/` para ese turno— se borraba en el
   * acto por debajo suyo. `Corredor.cortar(id)` (medido y cableado en `corredorDeTareas.ts`,
   * reusando `entrada.cortar`, lo mismo que ya usa `parar()`) se espera ANTES de
   * `borrarTarea`, así que la carpeta de adjuntos solo se toca DESPUÉS de que la consola
   * haya soltado su montaje — nunca antes: quitarle el suelo a un turno vivo es un fallo por
   * sí solo, con independencia de todo lo demás.
   *
   * **Y si no se puede cortar a tiempo, NO se borra.** `Corredor.cortar` devuelve `false`
   * cuando la tarea SÍ corría aquí y no soltó el proyecto dentro del plazo — la misma
   * situación que `parar()` ya sabe contar sin mentir. Borrar de todos modos dejaría el
   * turno huérfano exactamente igual que antes de este arreglo, solo que con menos excusa:
   * se prefiere el aviso honesto («sigue en marcha, reinténtalo») a un corte que promete
   * haber parado algo que no paró.
   *
   * **Y si corre en OTRO proceso, tampoco.** `corredorDeTareas?.corriendoAqui() === false`
   * con la tarea `en-proceso` en disco solo puede significar eso —ESTE proceso solo sirve el
   * dashboard, y el que de verdad la ejecuta no está aquí para preguntarle—; `Corredor.cortar`
   * no tiene con qué alcanzarlo (el límite lo pone el sistema operativo, no esta función), así
   * que forzar el borrado sería la misma orfandad de antes, disfrazada de arreglada. Es la
   * MISMA regla que ya sigue `Vestibulo.borrarSesion` con la sesión de una tarea en curso:
   * declinar con el motivo, no matar un turno ajeno porque alguien limpió una fila.
   */
  /**
   * El transcript de una tarea, etiquetado con SU id.
   *
   * La etiqueta no es decoración: por este mismo cable llega el transcript de la sesión
   * propia (`acto`, `sustitucion`, `reemision`), así que sin ella los actos de una tarea de
   * fondo se mezclarían con la conversación de quien mira. Con `mirada` delante, el cliente
   * los pinta en su panel y en ningún otro sitio.
   *
   * Y es una lista BLANCA por segunda vez: el transporte solo le manda a un mirón el
   * transcript (`Transporte.mirar`), y aquí solo se traduce ese transcript. Una clase nueva
   * del cable no llega a esta pantalla hasta que alguien la nombre en los dos sitios.
   */
  const etiquetarComoMirada = (tarea: string, enviar: Sumidero): Sumidero => (mensaje) => {
    if (mensaje.clase === "acto") {
      enviar({ clase: "mirada", tarea, via: "alta", actos: [mensaje.acto] });
      return;
    }
    if (mensaje.clase === "sustitucion") {
      enviar({ clase: "mirada", tarea, via: "sustitucion", actos: [mensaje.acto] });
      return;
    }
    if (mensaje.clase === "reemision") {
      enviar({ clase: "mirada", tarea, via: "todos", actos: mensaje.actos });
    }
  };

  /**
   * Empezar o dejar de mirar en vivo lo que hace una tarea.
   *
   * **Es OPT-IN y de SOLO lectura, y las dos cosas son estructurales aquí.** No se abre
   * ningún proyecto, no se muda el cable y no se le pasa NADA a la consola de la tarea: lo
   * único que ocurre es que un sumidero se engancha a su transporte para recibir el
   * transcript que ya se estaba guardando. El mensaje se ataja en `POST /accion` antes del
   * `recibir` de la consola precisamente por eso — si cayera ahí, `correrConsola` podría
   * acabar corriendo un turno sobre la consola de una tarea, y con un mirón enganchado su
   * `eof()` diría que hay alguien a quien preguntar. Medido: `conectar` volvía ese `eof()`
   * falso; `mirar` (`transporte.ts`) es el conjunto aparte que lo evita.
   *
   * Tres silencios a propósito, y ninguno es un error que contar:
   *  - **Un `cliente` que no consta**: es una pestaña que ya se fue, o un id viejo tras una
   *    reconexión. Un fallo de lookup.
   *  - **Una tarea que no corre AQUÍ** (`mirar` devuelve `undefined`): ya terminó, o la
   *    ejecuta el otro proceso. No se emite `{actos: []}`, que diría «corre y no ha hecho
   *    nada»; lo que esa tarea sí es ya lo cuenta el mensaje de la cola.
   *  - **Mirar dos veces lo mismo**: idempotente. Un doble clic o un efecto que se dispare
   *    dos veces no puede dejar dos sumideros del mismo cliente en el mismo turno.
   */
  const atenderMirar = (mensaje: { tarea: string; ver: boolean; cliente: string }): void => {
    const cliente = porIdDeCliente.get(mensaje.cliente);
    if (cliente === undefined) return;
    const yaEnganchado = cliente.mirando.get(mensaje.tarea);
    if (!mensaje.ver) {
      if (yaEnganchado === undefined) return;
      cliente.mirando.delete(mensaje.tarea);
      // ESE envoltorio y no otro: la otra persona que mire la misma tarea sigue mirándola.
      opciones.corredorDeTareas?.dejarDeMirar?.(mensaje.tarea, yaEnganchado);
      return;
    }
    if (yaEnganchado !== undefined) return;
    const envoltorio = etiquetarComoMirada(mensaje.tarea, cliente.enviar);
    const actos = opciones.corredorDeTareas?.mirar?.(mensaje.tarea, envoltorio);
    if (actos === undefined) return;
    cliente.mirando.set(mensaje.tarea, envoltorio);
    // El transcript de ese instante, SOLO al que lo pidió — el corredor lo devuelve en vez
    // de emitirlo, igual que `conectar`, para no mandárselo a quien ya lo tenga.
    cliente.enviar({ clase: "mirada", tarea: mensaje.tarea, via: "todos", actos: [...actos] });
  };

  const atenderAccionDeTarea = async (accion: "reintentar" | "descartar" | "terminar", id: string): Promise<void> => {
    if (opciones.colaDeTareas === undefined) return;
    if (accion === "descartar") {
      const actual = opciones.colaDeTareas.listar().find((t) => t.id === id);
      if (actual?.estado === "en-proceso" && opciones.corredorDeTareas?.corriendoAqui() === false) {
        informar(`no se pudo descartar «${actual.titulo}»: su turno lo ejecuta otro proceso, y no se puede cortar desde aquí`);
        return;
      }
      // Ausente = no hay corredor cableado en esta ejecución, y entonces no hay ningún
      // turno que pueda estar corriendo: seguro proceder, la misma lectura que «no había
      // nada en vuelo» dentro del propio corredor.
      const cortada = (await opciones.corredorDeTareas?.cortar(id)) ?? true;
      if (!cortada) {
        informar(`no se pudo descartar «${actual?.titulo ?? id}»: su turno no soltó el proyecto a tiempo — sigue en marcha, reinténtalo`);
        return;
      }
      opciones.colaDeTareas.borrarTarea(id);
      return;
    }
    const lista = opciones.colaDeTareas.listar();
    const actual = lista.find((t) => t.id === id);
    if (actual === undefined) {
      informar(`no se pudo ${accion}: la tarea ya no está en la cola`);
      return;
    }
    try {
      // **Terminar a mano pasa por `darPorBuenaAMano` y no por `conEstado` a secas**, y no
      // es cosmético: es la CUARTA forma de llegar a «Terminada» —sin verificador y sin
      // juez—, `conEstado` borra el `motivo`, y sin la marca la tarjeta resultante es
      // indistinguible de una entrega por la puerta completa. Ver `Tarea.terminadaAMano`.
      const siguiente =
        accion === "reintentar" ? conEstado(actual, "nuevo") : darPorBuenaAMano(actual);
      opciones.colaDeTareas.guardar(lista.map((t) => (t.id === id ? siguiente : t)));
    } catch (error) {
      // Una transición imposible SE IGNORA Y SE DICE: nunca se lanza hacia el cliente, y
      // nunca se escribe un estado a medias.
      informar(`no se pudo ${accion} la tarea «${actual.titulo}»: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /**
   * «Se edita la tarea y se agrega el feedback del usuario» (§0 del diseño, textual):
   * añadir un feedback a una tarea «esperando feedback» la devuelve al lazo. Vive detrás de
   * `aplicarFeedback` (`agent/tareasEnDisco.ts`) y no repite su lógica aquí, por el mismo
   * motivo que `atenderCrearTarea`/`atenderAccionDeTarea` no reimplementan `conEstado`: la
   * regla de qué feedback vale y qué transición es legal está en una sola función, probada
   * sola y sin necesitar un servidor de mentira alrededor.
   */
  const atenderFeedbackDeTarea = (id: string, texto: string): void => {
    if (opciones.colaDeTareas === undefined) return;
    const resultado = aplicarFeedback(opciones.colaDeTareas, id, texto);
    if (!resultado.hecho) {
      // Nunca se propaga al cliente, igual que una transición imposible: se DICE, y no se
      // escribe nada a medias.
      informar(`no se pudo añadir el feedback: ${resultado.motivo ?? "motivo desconocido"}`);
    }
  };

  /** Los ajustes de destino, o `{}` —que es «se miran todos»— si esta ejecución no los lee. */
  const ajustesDeDispositivos = (): AjustesDeDispositivos => opciones.ajustesDeDispositivos?.() ?? {};
  let deteccionEnVuelo: Promise<void> | undefined;
  const atenderDispositivos = (): Promise<void> => {
    if (opciones.detectarDispositivos === undefined) return Promise.resolve();
    if (deteccionEnVuelo !== undefined) return deteccionEnVuelo;
    const detectar = opciones.detectarDispositivos;
    deteccionEnVuelo = (async () => {
      try {
        informeDeDispositivos = sinRutas(await detectar());
        emitir({ clase: "dispositivos", informe: informeDeDispositivos, ajustes: ajustesDeDispositivos() });
      } catch (error) {
        // El detector reparte los fallos por herramienta y no lanza por ninguno; que
        // reviente entero es un bug suyo. Aquí solo se cuenta en el terminal: el escritorio
        // se queda en «consultando…» (o el botón en «Mirando…»), que es la verdad —no llegó
        // ninguna foto—, y no se emite una máquina vacía para disimularlo.
        informar(`no se pudo mirar qué dispositivos hay: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        deteccionEnVuelo = undefined;
      }
    })();
    return deteccionEnVuelo;
  };

  const atenderCatalogo = async (proveedor: string): Promise<void> => {
    if (!proveedorConocido(proveedor)) return;
    const id = proveedor as Proveedor;
    if (opciones.catalogoDeModelos === undefined) {
      catalogos.set(id, { error: "esta ejecución no puede consultar catálogos de modelos" });
      emitirModelos();
      return;
    }
    try {
      const modelos = await opciones.catalogoDeModelos(id);
      catalogos.set(id, { modelos: modelos.map((m) => ({ id: m.id, ...(m.nombre === undefined ? {} : { nombre: m.nombre }) })) });
    } catch (error) {
      // `ErrorCatalogoModelos` es publicable por contrato: nunca lleva la clave ni el
      // cuerpo remoto (`agent/catalogoModelos.ts`).
      catalogos.set(id, { error: error instanceof Error ? error.message : String(error) });
    }
    emitirModelos();
  };

  /**
   * Prueba, UNA vez por proceso, los proveedores que no llevan clave.
   *
   * «¿Puedo usar Ollama?» no la contesta ninguna credencial —no lleva ninguna—: la contesta
   * si el demonio responde, y eso solo se sabe pidiéndole el catálogo. Sin esto, el
   * proveedor por OMISIÓN de esta consola no aparecería nunca entre los comprobados, que es
   * lo que la pastilla enseña.
   *
   * **Y solo esos.** La regla de «el catálogo se pide bajo demanda» está escrita porque cada
   * uno es una llamada de red; aquí la excepción se gana sola: Ollama es `localhost` y un
   * personalizado sin clave es el endpoint que el usuario levantó en su máquina. A los de
   * pago no se les pregunta al arrancar — ahí la credencial ya responde.
   *
   * Una vez por PROCESO y no por cliente: la respuesta se guarda en `catalogos`, y una
   * segunda pestaña no vuelve a llamar. Y no se espera: el resultado llega a todos por el
   * SSE cuando esté, igual que la foto de la máquina.
   */
  let comprobados = false;
  const comprobarLosSinClave = (): void => {
    if (comprobados || opciones.catalogoDeModelos === undefined) return;
    comprobados = true;
    for (const p of [...PROVEEDORES, ...idsPersonalizados()]) {
      if (credencialDe(p) === "puesta" || catalogos.has(p)) continue;
      // Los de serie que no llevan clave (`SIN_CREDENCIAL`) y los personalizados a los que
      // nadie se la ha puesto: en los dos casos, preguntar es la única forma de saberlo.
      if (!SIN_CREDENCIAL.has(p) && !esProveedorPersonalizado(p)) continue;
      void atenderCatalogo(p).catch(contar);
    }
  };

  /**
   * Las sesiones guardadas de un proyecto de este entorno. Sin entorno elegido no hay raíz
   * que calcular, y sin copia local la lista es vacía — que es la verdad, no un fallo.
   */
  const sesionesDelProyecto = (
    nombre: string
  ): { id: string; titulo: string; ultimoTurno?: string; deTarea?: true }[] => {
    if (entornoElegido === undefined) return [];
    try {
      // Viaja un BOOLEANO y no el id de la tarea: la fila lleva una marca, no el nombre de
      // la tarea —en 280 px no cabe—, así que el id se queda en el host por la misma regla
      // que la ruta de una herramienta o el pid del corredor. `deTarea` ausente es «no
      // consta» y no «es una conversación»: no la lleva ninguna sesión anterior a la marca.
      return vestibulo.sesionesDe(vestibulo.raizDeProyecto(entornoElegido, nombre)).map((s) => ({
        id: s.id,
        titulo: s.titulo,
        ...(s.ultimoTurno === undefined ? {} : { ultimoTurno: s.ultimoTurno }),
        ...(s.tarea === undefined ? {} : { deTarea: true as const }),
      }));
    } catch {
      return [];
    }
  };

  /**
   * ¿Existe ya la copia local de ese proyecto? Es `.xonecode/config.json` en su raíz: lo
   * que `completarProyecto` escribe ENTERO antes de bajar nada.
   *
   * El predicado es el del vestíbulo (`esProyectoEnDisco`) y no una copia: `abrirParaTarea`
   * decide con él si una tarea puede abrir esa raíz, y dos versiones de «esto es un
   * proyecto» divergen el día que una se afine — con el alta diciendo que hay copia local
   * y la puerta de tareas diciendo que no.
   */
  const hayCopiaLocal = (nombre: string): boolean => {
    if (entornoElegido === undefined) return false;
    try {
      return esProyectoEnDisco(vestibulo.raizDeProyecto(entornoElegido, nombre));
    } catch {
      return false;
    }
  };

  /**
   * Cambiar de entorno activo: el de cuyos proyectos se habla. Trae su listado consigo
   * —eso es una conexión con CloudStudio— y limpia lo del anterior: dejar los proyectos del
   * entorno viejo bajo el nombre del nuevo sería la peor mentira posible en esta barra.
   */
  const atenderEntornoActivo = async (entorno: string): Promise<void> => {
    aviso = undefined;
    try {
      const nuevos = await vestibulo.proyectosDe(entorno);
      entornoElegido = entorno;
      proyectoElegido = undefined;
      ramas = [];
      proyectos = nuevos;
    } catch (error) {
      // `entornoElegido` NO se toca si falla: con un token muerto o la red caída, seguir
      // enseñando lo del entorno anterior es la verdad, y el aviso dice qué pasó.
      aviso = error instanceof Error ? error.message : String(error);
      contar(error);
    } finally {
      await anunciarAlta().catch(contar);
    }
  };

  /**
   * Abrir una sesión: la nombrada, o una nueva.
   *
   * Con copia local ya bajada no hay nada que dar de alta —ni rama que preguntar—, así que
   * se abre directamente y el cable se muda a su consola. Sin copia local se cae al camino
   * del alta, que es el único que sabe bajarla: se contestan las ramas y el cliente elige.
   */
  /**
   * Borrar una sesión guardada, o ponerle nombre.
   *
   * La raíz se CALCULA con `raizDeProyecto`, igual que al abrir, y no se toma del proyecto
   * abierto: se puede borrar una sesión de un proyecto que no es el que se está mirando, y
   * darlo por hecho borraría en el sitio equivocado. Sin entorno elegido no hay raíz que
   * calcular y se dice, en vez de escribir a ciegas.
   */
  const atenderAccionDeSesion = async (
    peticion: Extract<MensajeDelCliente, { clase: "sesionAccion" }>
  ): Promise<void> => {
    aviso = undefined;
    try {
      if (entornoElegido === undefined) {
        aviso = "no sé de qué entorno es ese proyecto";
        informar(aviso);
        return;
      }
      const identidad = proyectos.find((p) => p.id === peticion.proyecto);
      const raiz = vestibulo.raizDeProyecto(entornoElegido, identidad?.nombre ?? peticion.proyecto);
      if (peticion.accion === "borrar") {
        const { borrada, cerroLaAbierta, motivo } = await vestibulo.borrarSesion(raiz, peticion.sesion);
        // Un `motivo` es que el vestíbulo DECLINÓ, y entonces se dice ese motivo y no el
        // «ya no estaba» de siempre: la sesión sigue ahí, y contar lo contrario dejaría al
        // usuario creyendo que la fila se va a ir del listado. Va además a `aviso`, como
        // los demás rechazos de este camino.
        if (motivo !== undefined) {
          aviso = motivo;
          informar(motivo);
          return;
        }
        // Se dice lo que pasó, incluido el «no había nada»: un menú que borra y calla deja
        // dudando de si la fila se fue porque se borró o porque falló el listado.
        informar(
          borrada
            ? cerroLaAbierta
              ? "sesión borrada; era la que estabas mirando, así que se ha cerrado"
              : "sesión borrada"
            : "esa sesión ya no estaba"
        );
        // Al cerrar la abierta, el cable se queda enganchado a una consola muerta: se muda
        // de vuelta al vestíbulo, que es lo que el cliente va a pintar (el escritorio).
        // Y es el TERCER sitio donde cambia qué raíz está bloqueada para las tareas: aquí no
        // se abre nada, así que la raíz queda LIBRE, y sin revisar la cola una tarea que
        // esperaba a esa persona se quedaría esperando al siguiente evento que no tiene nada
        // que ver — que en pantalla se lee como un cuelgue.
        if (cerroLaAbierta) {
          adjuntar();
          opciones.revisarTareas?.();
        }
        return;
      }
      if (!vestibulo.renombrarSesion(raiz, peticion.sesion, peticion.titulo)) {
        aviso = "no se pudo renombrar esa sesión";
        informar(aviso);
      }
    } catch (error) {
      aviso = error instanceof Error ? error.message : String(error);
      contar(error);
    } finally {
      await anunciarAlta().catch(contar);
    }
  };

  const atenderSesion = async (peticion: Extract<MensajeDelCliente, { clase: "sesion" }>): Promise<void> => {
    aviso = undefined;
    try {
      if (entornoElegido === undefined) {
        aviso = "elige antes el entorno del que sale el proyecto";
        informar(aviso);
        return;
      }
      const identidad = proyectos.find((p) => p.id === peticion.proyecto);
      const nombre = identidad?.nombre ?? peticion.proyecto;
      const raiz = vestibulo.raizDeProyecto(entornoElegido, nombre);
      // El MISMO predicado que `hayCopiaLocal` y que la puerta de tareas: era la tercera
      // copia del literal, y la que decide si aquí se abre o se pregunta la rama.
      if (!esProyectoEnDisco(raiz)) {
        // Todavía no está bajado: el alta es quien sabe hacerlo, y necesita la rama.
        proyectoElegido = peticion.proyecto;
        // La identidad ENTERA, no el id: el servidor abre por nombre. `identidad` ya está
        // resuelta unas líneas más arriba contra el listado.
        ramas = await vestibulo.ramasDe(entornoElegido, identidad ?? peticion.proyecto);
        return;
      }
      await vestibulo.abrirProyecto({ raiz, ...(peticion.sesion === undefined ? {} : { sesion: peticion.sesion }) });
      // El cable se muda a la consola del proyecto, como en el alta: sin esto el usuario
      // mira un transcript vivo cuyas aprobaciones se rechazan solas al otro lado.
      adjuntar();
      // Y la cola se vuelve a mirar: este proyecto queda bloqueado para las tareas —gana la
      // persona— y el que estuviera abierto antes acaba de quedar libre.
      opciones.revisarTareas?.();
    } catch (error) {
      aviso = error instanceof Error ? error.message : String(error);
      contar(error);
    } finally {
      await anunciarAlta().catch(contar);
    }
  };

  /**
   * «Ponme este modelo.»
   *
   * Lo que llega del cliente es la intención —`proveedor/modelo`— y no un comando: la
   * interfaz no habla en la sintaxis de otra piel ni se apunta actos de usuario que nadie
   * tecleó. Aplicarlo SÍ reusa el manejador de `/modelo` (`COMANDOS`, `cli/consola.ts`),
   * porque la precedencia entre banderas, ficheros y elecciones en caliente vive ahí y una
   * segunda implementación divergiría el primer día. Se encola la línea en el lazo, que es
   * el único que puede adoptar el estado nuevo, y el acuse que escribe el manejador es lo
   * que el usuario ve.
   *
   * Sin proyecto abierto no hay lazo, y se dice: el disparador vive en el compositor, que
   * solo existe con sesión, pero un mensaje que llegara igual no puede quedarse en una cola
   * que nadie lee.
   */
  const atenderModelo = (id: string): void => {
    try {
      parsear(id);
    } catch (error) {
      informar(error instanceof Error ? error.message : String(error));
      return;
    }
    const abierto = vestibulo.proyectoAbierto();
    if (abierto === undefined) {
      informar("no hay ninguna sesión abierta a la que cambiarle el modelo");
      return;
    }
    abierto.consola.encolar(`/modelo ${id}`);
  };

  /**
   * Pide la clave de un proveedor y la guarda, con la MISMA disciplina que el asistente de
   * cuenta: la criba de balde primero (`motivoDeClaveInaceptable`), y nada se escribe si no
   * pasa. La pregunta sale por la consola a la que está enganchado el cable —la del
   * proyecto si hay uno, la del vestíbulo si no—, así que llega como `clase: "secreto"` y
   * la clave vuelve por ese mismo mensaje y por ninguno más.
   *
   * Lo que NO se hace aquí es probarla contra el catálogo antes de escribir, como sí hace
   * el alta: ahí la elección de modelo obliga a listar de todos modos, y aquí el usuario
   * puede estar poniendo la clave de un proveedor que no va a usar todavía. El menú del
   * compositor la probará cuando toque, y su error se enseña donde se elige.
   */
  const pedirCredencial = async (proveedor: Proveedor): Promise<void> => {
    if (opciones.guardarCredencial === undefined) {
      informar("esta ejecución no puede guardar credenciales");
      return;
    }
    const consola = vestibulo.proyectoAbierto()?.consola.consola ?? vestibulo.consola.consola;
    const clave = (await consola.leerSecreto(`clave de ${proveedor}: `)).trim();
    // Cadena vacía es lo que responde una consola sin nadie al otro lado, y también el
    // usuario que da a Enter sin escribir: en los dos casos no se guarda nada y no se dice
    // nada más — quien canceló no necesita un sermón.
    if (clave === "") return;
    const motivo = motivoDeClaveInaceptable(clave);
    if (motivo !== undefined) {
      informar(`no se guardó nada: ${motivo}`);
      return;
    }
    try {
      const { ruta } = opciones.guardarCredencial(proveedor, clave);
      informar(`credencial de ${proveedor} guardada en ${ruta}`);
    } catch (error) {
      informar(error instanceof Error ? error.message : String(error));
    }
    emitirModelos();
  };

  /**
   * Dar de alta o retirar un proveedor personalizado.
   *
   * Cinco reglas, y ninguna es de formulario:
   * - **El identificador lo DERIVA el servidor** del nombre, con la función de `core/`.
   *   Derivarlo también en el cliente sería una segunda copia de la regla, y divergiría.
   * - **Un slug que ya existe se RECHAZA**, no se pisa: dos endpoints distintos con el
   *   mismo nombre acabarían compartiendo entrada en `auth.json`, o sea que la clave del
   *   segundo viajaría al host del primero. Para cambiar una URL hay que dar de baja y
   *   volver a dar de alta, y la baja dice que se lleva la clave.
   * - **La URL se comprueba con la MISMA regla que un MCP** (`motivoDeEndpointInaceptable`,
   *   hoy en `core/`): https fuera de la máquina, http solo en loopback, sin credenciales
   *   dentro. Loopback es el caso principal, no la excepción: LM Studio, llama.cpp y vLLM
   *   escuchan ahí.
   * - **La baja se lleva la credencial.** Una clave en `auth.json` bajo un proveedor que ya
   *   no existe no se puede mandar a ninguna parte, pero sigue siendo un secreto en disco y
   *   nadie volvería a verla en la interfaz para borrarla.
   * - **El motivo vuelve por el cable**, no por el transcript: esta ventana no lo pinta.
   */
  const atenderProveedor = (mensaje: Extract<MensajeDelCliente, { clase: "proveedor" }>): void => {
    const contestar = (hecho: boolean, motivo?: string): void =>
      emitir({ clase: "proveedor", hecho, ...(motivo === undefined ? {} : { motivo }) });

    if (mensaje.accion === "alta") {
      if (opciones.guardarProveedor === undefined) {
        contestar(false, "esta ejecución no puede dar de alta proveedores");
        return;
      }
      const nombre = typeof mensaje.nombre === "string" ? mensaje.nombre.trim() : "";
      const baseUrl = typeof mensaje.baseUrl === "string" ? mensaje.baseUrl.trim() : "";
      if (nombre === "") {
        contestar(false, "ponle un nombre para reconocerlo");
        return;
      }
      const slug = slugDesdeNombre(nombre);
      const malSlug = motivoDeSlugInaceptable(slug);
      if (malSlug !== undefined) {
        contestar(false, `de ese nombre no sale un identificador válido: ${malSlug}`);
        return;
      }
      const malUrl = motivoDeEndpointInaceptable(baseUrl);
      if (malUrl !== undefined) {
        contestar(false, malUrl);
        return;
      }
      if (personalizados().some((d) => d.slug === slug)) {
        contestar(false, `ya hay un proveedor con el identificador «${slug}»: dale otro nombre, o da de baja el que hay`);
        return;
      }
      try {
        opciones.guardarProveedor({ slug, nombre, baseUrl });
      } catch (error) {
        contestar(false, error instanceof Error ? error.message : String(error));
        return;
      }
      contestar(true);
      emitirModelos();
      return;
    }

    if (opciones.borrarProveedor === undefined) {
      contestar(false, "esta ejecución no puede dar de baja proveedores");
      return;
    }
    const slug = typeof mensaje.slug === "string" ? mensaje.slug : "";
    if (!personalizados().some((d) => d.slug === slug)) {
      // No está: una vista vieja del cliente, no un error que contar. Se contesta «hecho»
      // porque el estado que pedía —que no esté— es el que hay.
      contestar(true);
      emitirModelos();
      return;
    }
    try {
      opciones.borrarProveedor(slug);
      // Y su clave detrás, si esta ejecución puede: ver la regla de arriba.
      opciones.borrarCredencial?.(idDeProveedorPersonalizado(slug));
    } catch (error) {
      contestar(false, error instanceof Error ? error.message : String(error));
      return;
    }
    contestar(true);
    emitirModelos();
  };

  /**
   * Borrar una credencial. Se DICE lo que pasó por el transcript —incluido el caso en que
   * el fichero ya no la tenía— y se reemite el estado de modelos, que es lo que repinta el
   * punto. Si la variable de entorno la sigue llevando, eso también se dice: el punto se
   * quedará verde y callarlo parecería un fallo del botón.
   */
  const atenderCredencial = (mensaje: Extract<MensajeDelCliente, { clase: "credencial" }>): void => {
    // De serie o personalizado DADO DE ALTA: un slug que no consta se ignora en silencio,
    // como un id de dispositivo que ya no está — es una vista vieja del cliente, no un
    // error que contar.
    if (!proveedorConocido(mensaje.proveedor)) return;
    const proveedor = mensaje.proveedor as Proveedor;
    if (mensaje.accion === "pedir") {
      void pedirCredencial(proveedor).catch(contar);
      return;
    }
    if (opciones.borrarCredencial === undefined) {
      informar("esta ejecución no puede borrar credenciales");
      return;
    }
    try {
      const { ruta, borrada, quedaEnEntorno } = opciones.borrarCredencial(proveedor);
      informar(
        borrada
          ? `credencial de ${proveedor} borrada de ${ruta}`
          : `${proveedor} no tenía credencial en ${ruta}`
      );
      if (quedaEnEntorno) {
        informar(`ojo: ${proveedor} sigue con credencial puesta por una variable de entorno`);
      }
    } catch (error) {
      informar(error instanceof Error ? error.message : String(error));
    }
    emitirModelos();
  };

  /**
   * Los ficheros de la sesión abierta, o el parche de uno.
   *
   * Tres respuestas y no dos, porque son tres situaciones distintas y una sola lista vacía
   * las haría indistinguibles:
   *
   * - **`sin-empezar`**: hay proyecto abierto pero la sesión todavía no tiene id (el id
   *   nace al volcar el primer acto, ver `vestibulo.ts`). No ha tocado nada, y eso SE SABE.
   *   Decir «sin-marca» aquí diagnosticaría mal: la vista mandaría a comprobar si el
   *   proyecto es un repo de git cuando lo único que pasa es que acabas de sentarte.
   * - **`sin-marca`**: no hay con qué comparar —sin proyecto abierto, o sin el puerto que
   *   sabe mirar el repo—. No se sabe.
   * - **`git`**: comparado, y esto es lo que hay.
   */
  const atenderRevision = async (ruta?: string): Promise<void> => {
    const abierto = vestibulo.proyectoAbierto();
    const sesion = abierto?.sesion;
    if (abierto === undefined || opciones.cambiosDeSesion === undefined) {
      emitir({ clase: "revision", via: "sin-marca", ficheros: [] });
      return;
    }
    if (sesion === undefined) {
      emitir({ clase: "revision", via: "sin-empezar", ficheros: [] });
      return;
    }
    if (ruta !== undefined) {
      const parche = await opciones.parcheDeSesion?.(abierto.raiz, sesion, ruta);
      // Sin parche que dar se dice con el texto vacío y no callando: el cliente tiene una
      // fila abierta esperando, y el silencio la deja cargando para siempre.
      emitir({
        clase: "parche",
        ruta,
        texto: parche?.texto ?? "",
        recortado: parche?.recortado ?? false,
      });
      return;
    }
    const { via, ficheros } = await opciones.cambiosDeSesion(abierto.raiz, sesion);
    emitir({ clase: "revision", via, ficheros });
  };

  /**
   * Solo el CÓDIGO de un fallo de sistema de ficheros (`EACCES`, `EMFILE`…), nunca su
   * mensaje: el de Node lleva la ruta absoluta del disco, y aquí `informar` acaba en el
   * transcript. Sin código, el nombre del error; sin error, la palabra.
   */
  const codigoDe = (error: unknown): string => {
    if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") return error.code;
    return error instanceof Error ? error.name : "error";
  };

  /**
   * El MENSAJE si lo escribimos nosotros, y el CÓDIGO si lo escribió el sistema.
   *
   * La misma función que `corredorDeTareas.ts#sinRutas`, y por el mismo motivo: un error de
   * Node trae `code` y su mensaje lleva la ruta absoluta, mientras que uno escrito a mano en
   * este repo no trae `code` y su mensaje es justo lo que hay que leer. `codigoDe` a secas
   * convierte «falta la credencial para openai; usa /provider openai» en
   * «ErrorDelAumentador», que es un nombre de clase enseñado a una persona.
   */
  const motivoLegible = (error: unknown): string =>
    typeof error === "object" && error !== null && "code" in error
      ? codigoDe(error)
      : (error instanceof Error ? error.message : String(error)).split(/\r?\n/)[0]!.slice(0, 200);

  /**
   * El árbol del proyecto abierto. Sin proyecto no hay pestaña que lo pida, así que no se
   * contesta nada; sin PUERTO sí se contesta, con error: un árbol que nunca llega deja al
   * cliente en «consultando…» para siempre, y un cargando eterno es un fallo mudo.
   */
  const atenderArbol = async (): Promise<void> => {
    const abierto = vestibulo.proyectoAbierto();
    if (abierto === undefined) return;
    if (opciones.arbolDelProyecto === undefined) {
      emitir({ clase: "arbol", rutas: [], recortado: false, error: "esta ejecución no puede listar el proyecto" });
      return;
    }
    try {
      const { rutas, recortado } = await opciones.arbolDelProyecto(abierto.raiz);
      emitir({ clase: "arbol", rutas, recortado });
    } catch (error) {
      // El mensaje de Node lleva la ruta absoluta del disco, y por el cable no viaja
      // ninguna ruta de la máquina. Eso vale TAMBIÉN para `informar`: en producción escribe
      // un acto de sistema en el transcript, así que a él solo le llega el código (EACCES…).
      informar(`no se pudo listar el proyecto (${codigoDe(error)})`);
      emitir({ clase: "arbol", rutas: [], recortado: false, error: "no se pudo listar el proyecto" });
    }
  };

  /**
   * El contenido de una ruta del proyecto abierto. El lector decide si se puede enseñar.
   *
   * El `try` es por lo mismo que el del árbol: `leerFicheroDeProyecto` devuelve los rechazos
   * como `error` en el resultado, pero después del `realpath` todavía puede LANZAR —un
   * EACCES al hacer `stat` o al abrir—, y esa excepción llegaba al `contar` genérico sin
   * contestar nada, dejando al cliente en «Trayendo…» para siempre. La respuesta lleva la
   * `ruta` porque el cliente indexa los contenidos por ella: sin eso no sabría cuál falló.
   */
  const atenderFichero = async (ruta: string): Promise<void> => {
    const abierto = vestibulo.proyectoAbierto();
    if (abierto === undefined) return;
    if (opciones.leerFichero === undefined) {
      emitir({ clase: "fichero", ruta, recortado: false, binario: false, bytes: 0, error: "esta ejecución no puede leer el proyecto" });
      return;
    }
    try {
      emitir({ clase: "fichero", ...(await opciones.leerFichero(abierto.raiz, ruta)) });
    } catch (error) {
      // Como en el árbol: ni por el cable ni por `informar` viaja el mensaje de Node, que
      // lleva la ruta absoluta; la `ruta` relativa es la que mandó el cliente.
      informar(`no se pudo leer «${ruta}» (${codigoDe(error)})`);
      emitir({
        clase: "fichero",
        ruta,
        recortado: false,
        binario: false,
        bytes: 0,
        error: "no se pudo leer el fichero",
      });
    }
  };

  /**
   * El contenido de un ARTEFACTO de la sesión abierta, por su nombre.
   *
   * El id que se usa es `idDeHilo` y no `sesion`, y la diferencia es la que hace que esto
   * funcione: `sesion` espera a que haya entrada en el índice, o sea al final del turno,
   * mientras que el acto que anuncia un artefacto se emite a MITAD de turno. Con el otro id
   * el visor habría contestado «no existe» justo cuando se acaba de dibujar.
   *
   * El `try` es el de `atenderFichero`, palabra por palabra y por lo mismo: el lector
   * devuelve sus rechazos como `error`, pero después del `realpath` todavía puede LANZAR un
   * EACCES, y esa excepción dejaba al cliente esperando para siempre. Ni por el cable ni por
   * `informar` viaja el mensaje de Node, que lleva la ruta absoluta.
   */
  const atenderArtefacto = async (nombre: string): Promise<void> => {
    const abierto = vestibulo.proyectoAbierto();
    if (abierto === undefined) return;
    const ruta = `${RUTA_ARTEFACTOS}${nombre}`;
    const fallo = (error: string) => emitir({ clase: "artefacto", ruta, recortado: false, binario: false, bytes: 0, error });
    if (opciones.leerArtefacto === undefined) {
      fallo("esta ejecución no puede leer los artefactos");
      return;
    }
    try {
      emitir({ clase: "artefacto", ...(await opciones.leerArtefacto(abierto.raiz, abierto.idDeHilo, nombre)) });
    } catch (error) {
      informar(`no se pudo leer el artefacto «${nombre}» (${codigoDe(error)})`);
      fallo("no se pudo leer el artefacto");
    }
  };

  /**
   * El paso de receta que se está ejecutando, si hay alguno.
   *
   * **Uno a la vez, y para toda la máquina.** Dos `sdkmanager` a la vez sobre el mismo SDK
   * es una carrera con la instalación de por medio, y la máquina es UNA aunque haya dos
   * pestañas — el mismo motivo por el que la detección comparte una sola medida en vuelo. Un
   * segundo «ejecutar» mientras corre no lanza nada: se reenvía el estado, que es lo que la
   * otra pestaña necesita para pintar el log que ya va por dentro.
   */
  let trabajo:
    | { receta: string; paso: number; titulo: string; lineas: string[]; cancelar: () => void; t0: number }
    | undefined;
  /** Cuándo se emitió el último progreso: el log se emite a ritmo, no por línea. */
  let ultimoProgreso = 0;

  const emitirProgreso = (
    estado: "corriendo" | "ok" | "fallo" | "cancelada" | "colgada",
    motivo?: string
  ): void => {
    if (trabajo === undefined) return;
    emitir({
      clase: "instalacion",
      receta: trabajo.receta,
      paso: trabajo.paso,
      titulo: trabajo.titulo,
      estado,
      // La COLA del log y no todo: `sdkmanager` son miles de líneas y el cable no es un sitio
      // donde guardarlas. Lo que hace falta es saber que avanza y en qué va.
      lineas: trabajo.lineas.slice(-LINEAS_DE_LOG),
      ms: Date.now() - trabajo.t0,
      ...(motivo === undefined ? {} : { motivo }),
    });
    ultimoProgreso = Date.now();
  };

  /**
   * Lanza un paso, o cancela el que corre.
   *
   * Al terminar se vuelve a MEDIR, y es lo que decide si el paso queda hecho: lo que diga el
   * instalador es lo que él cree, y la foto es lo que hay. Es la misma regla que ya sigue
   * `instalar`.
   */
  const atenderReceta = (mensaje: Extract<MensajeDelCliente, { clase: "receta" }>): void => {
    if (mensaje.accion === "cancelar") {
      trabajo?.cancelar();
      return;
    }
    if (trabajo !== undefined) {
      // Ya hay uno: se reenvía su estado en vez de lanzar otro.
      emitirProgreso("corriendo");
      return;
    }
    const correr = opciones.correrPasoDeReceta;
    if (correr === undefined) {
      informar("esta ejecución no puede ejecutar pasos de instalación");
      return;
    }
    const enMarcha = correr(mensaje.id, mensaje.paso, (linea) => {
      if (trabajo === undefined) return;
      trabajo.lineas.push(linea);
      // A ritmo: cada emisión manda la cola entera, y por línea sería cuadrático en bytes
      // con un `sdkmanager` que habla cada pocos milisegundos. Es la misma razón que
      // `MS_ENTRE_PARCIALES` en la piel web.
      if (Date.now() - ultimoProgreso >= MS_ENTRE_PROGRESOS) emitirProgreso("corriendo");
    });
    trabajo = {
      receta: mensaje.id,
      paso: mensaje.paso,
      titulo: enMarcha.titulo,
      lineas: [],
      cancelar: enMarcha.cancelar,
      t0: Date.now(),
    };
    emitirProgreso("corriendo");
    void (async () => {
      const resultado = await enMarcha.terminado;
      // El último progreso SIEMPRE se emite, aunque no haya pasado el plazo: es el que
      // completa el log y el que dice cómo acabó.
      ultimoProgreso = 0;
      emitirProgreso(resultado.estado as "ok" | "fallo" | "cancelada" | "colgada", resultado.motivo);
      trabajo = undefined;
      // Y la foto nueva es la que dice si el paso quedó hecho, no el código de salida.
      informeDeDispositivos = undefined;
      await atenderDispositivos().catch(contar);
    })();
  };

  /**
   * Los modelos de un motor externo, para el desplegable de un subagente.
   *
   * Bajo demanda y cacheado por proceso: el de Claude Code es una tabla, pero el de Codex se
   * le PREGUNTA a él —`model/list` sobre su `app-server`—, y eso arranca un proceso. Pedirlo
   * al conectar lo lanzaría en cada arranque para una ventana que casi nadie abre.
   */
  const modelosPorMotor = new Map<string, { modelos: { id: string; nombre: string }[]; error?: string }>();
  const atenderModelosDeMotor = async (motor: string): Promise<void> => {
    const emitirlos = (r: { modelos: { id: string; nombre: string }[]; error?: string }): void =>
      emitir({ clase: "modelosDeMotor", motor, modelos: r.modelos, ...(r.error === undefined ? {} : { error: r.error }) });
    const guardado = modelosPorMotor.get(motor);
    if (guardado !== undefined) {
      emitirlos(guardado);
      return;
    }
    if (opciones.modelosDeMotor === undefined) {
      emitirlos({ modelos: [], error: "esta ejecución no puede consultar los modelos de ese motor" });
      return;
    }
    const r = await opciones.modelosDeMotor(motor);
    // Un fallo NO se cachea: es lo que pasa cuando Codex no estaba instalado todavía, y
    // cachearlo dejaría el desplegable vacío hasta reiniciar la consola aunque lo instale.
    if (r.error === undefined) modelosPorMotor.set(motor, r);
    emitirlos(r);
  };

  /** Un paso del alta resuelto en el navegador. Cada rama termina volviendo a anunciar. */
  const atenderAlta = async (mensaje: Extract<MensajeDelCliente, { clase: "alta" }>): Promise<void> => {
    // Se limpia al empezar: un aviso viejo pegado a un paso que ya salió bien mentiría.
    aviso = undefined;
    try {
      if (mensaje.paso === "cuenta") {
        // Volver al paso de modelo desde la progresión del alta. Se re-arma `cuentaHecha`
        // —lo que impide preguntar dos veces es justo esa marca— y se relanza el asistente
        // SUELTO: pintarlo es cosa suya (`selector` y `secreto`), y el `POST` no puede
        // quedarse abierto mientras un humano elige. Cuando termine, `anunciarAlta` cuenta
        // cómo quedó todo.
        cuentaHecha = false;
        void conducirCuenta(true)
          .catch(contar)
          .finally(() => void anunciarAlta().catch(contar));
        return;
      }
      if (mensaje.paso === "entorno") {
        const elegido = mensaje.entorno;
        if (elegido === undefined || elegido.url.trim() === "") {
          aviso = "el entorno necesita una URL";
          informar(aviso);
          return;
        }
        // SIEMPRE se registra, aunque el entorno ya esté en la lista. La versión anterior
        // se lo saltaba comparando contra `opcionesDeEntorno()`, que es la lista OFRECIDA
        // (los dos oficiales más «otro») y no la registrada: con un `settings.json` recién
        // nacido, elegir WebStudio casaba con el oficial, no se registraba nada, y el
        // `proyectosDe` siguiente moría con «el entorno no está registrado». Registrar dos
        // veces no cuesta nada: en disco `guardarEntorno` sustituye por id y en memoria el
        // vestíbulo hace lo mismo.
        // El id con el que quedó REGISTRADO, no el que llegó: el formulario solo pide la
        // URL, y de un «otro» el vestíbulo deduce id y nombre del host
        // (`identidadDeEntorno`). Con el id de la lista, el `proyectosDe` de la línea
        // siguiente moriría con «el entorno «otro» no está registrado».
        const { entorno: registrado } = await vestibulo.registrarEntorno({
          id: elegido.id,
          nombre: elegido.nombre,
          url: elegido.url,
        });
        entornoElegido = registrado.id;
        proyectoElegido = undefined;
        ramas = [];
        proyectos = await vestibulo.proyectosDe(registrado.id);
        return;
      }

      if (entornoElegido === undefined) {
        aviso = "elige antes el entorno del que sale el proyecto";
        informar(aviso);
        return;
      }
      const proyecto = mensaje.proyecto;
      if (proyecto === undefined || proyecto === "") {
        aviso = "el paso de proyecto necesita un proyecto";
        informar(aviso);
        return;
      }
      if (mensaje.rama === undefined || mensaje.rama === "") {
        // Sin rama todavía no se abre nada: se contestan las ramas de ese proyecto. Es la
        // alternativa a inventarse las del primero de la lista antes de que nadie elija.
        proyectoElegido = proyecto;
        // Igual que arriba: el servidor abre por NOMBRE, y el cable trae el id.
        ramas = await vestibulo.ramasDe(entornoElegido, proyectos.find((p) => p.id === proyecto) ?? proyecto);
        return;
      }
      // El proyecto que viene en ESTE mensaje, no el cacheado: lo enviado es la verdad y
      // `proyectoElegido` puede haberse quedado atrás.
      const identidad = proyectos.find((p) => p.id === proyecto) ?? proyecto;
      const { raiz } = await vestibulo.completarProyecto({
        entorno: entornoElegido,
        proyecto: identidad,
        rama: mensaje.rama,
      });
      await vestibulo.abrirProyecto({ raiz });
      // El cable se muda a la consola del proyecto. Sin esto el usuario mira un transcript
      // vivo cuyas aprobaciones se rechazan solas al otro lado. `adjuntar` reemite también
      // el estado de modelos, que hasta ahora no tenía `actual` que dar: sin sesión abierta
      // no hay modelo en vigor.
      adjuntar();
      // Como en `atenderSesion`: abrir bloquea esta raíz para las tareas y libera la que
      // estuviera abierta antes.
      opciones.revisarTareas?.();
    } catch (error) {
      // El aviso se fija ANTES de anunciar: el `finally` de abajo es quien lo lleva al paso.
      aviso = error instanceof Error ? error.message : String(error);
      contar(error);
    } finally {
      await anunciarAlta().catch(contar);
    }
  };

  // El modelo en vigor cambia DENTRO del lazo de la consola (`/modelo` y `/modelos` no
  // tocan disco), así que la única forma de enterarse es que el vestíbulo lo diga. Sin
  // esto, el disparador del compositor seguiría enseñando el modelo con el que se abrió la
  // sesión después de haberlo cambiado — una cifra con forma de verdad.
  vestibulo.alCambiarEstadoDeSesion(() => emitirModelos());
  // El turno se emite solo (`consolaWeb.turno`), pero además hay que RECORDARLO: una pestaña
  // que conecta a mitad no vio ese mensaje, y necesita saberlo para apagar su compositor.
  vestibulo.alCambiarTurno((activo) => {
    turnoEnVuelo = activo;
    // El alta se reanuncia en los DOS flancos, y DIFERIDO. Medido: una sesión nueva no
    // aparecía en la barra hasta recargar la página, porque su id nace en `volcar()` —al
    // final del turno— y nadie volvía a anunciar. Y `historica` deja de ser cierto al
    // EMPEZAR el primer turno nuevo, que es el otro flanco. Diferido a una microtarea porque
    // `vestibulo.ts` llama a esta escucha ANTES de `volcar()`, en el mismo `finally`
    // síncrono: anunciar en el acto leería la sesión sin id todavía. Una microtarea corre
    // cuando ese bloque ha terminado, o sea con el `.jsonl` ya escrito.
    void Promise.resolve()
      .then(() => anunciarAlta())
      .catch(contar);
  });

  servidor.registrarRuta("GET", RUTA_EVENTOS, (peticion, respuesta) => {
    respuesta.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // Sin esto un proxy intermedio bufferiza el stream y el transcript llega a tirones.
      "X-Accel-Buffering": "no",
    });
    const sumidero: Sumidero = (mensaje) => {
      // El socket se puede haber ido entre el último acto y este: escribir en él lanza, y
      // ese lanzamiento subiría por el emisor del acto hasta el motor de turno.
      try {
        respuesta.write(`data: ${JSON.stringify(mensaje)}\n\n`);
      } catch {
        /* el cliente se fue; el `close` de abajo ya desconecta */
      }
    };
    clientes.add(sumidero);
    /**
     * El identificador que el navegador eligió para ESTA conexión, si lo mandó. Es lo que
     * después le permite decir «engánchame a la tarea t1» por `POST /accion`, que es otra
     * petición y no trae sumidero ninguno. Ausente = un cliente que no va a mirar nada, y
     * entonces no se apunta: nada que limpiar al cerrarse.
     *
     * Se lee de la query a mano y no con `new URL()` por la misma razón que
     * `servidor.ts#manejarPeticion`, aunque aquí no haya segmentos que preservar: es el
     * patrón del fichero. Y no es una ruta ni un nombre de fichero: solo la clave de
     * `porIdDeCliente`.
     */
    const idDeCliente = new URLSearchParams((peticion.url ?? "").split("?")[1] ?? "").get("cliente") ?? undefined;
    if (idDeCliente !== undefined && idDeCliente !== "") {
      /**
       * Si el id ya estaba, es la MISMA pestaña reconectando, y sus envoltorios viejos hay
       * que desengancharlos AQUÍ: el `close` de la conexión anterior puede llegar después
       * —es la carrera que documenta el `close` de abajo— y entonces se salta la limpieza por
       * la guarda de `enviar === sumidero`, que está bien puesta porque si no se llevaría por
       * delante las miradas del recién llegado. Sin esto, esos envoltorios se quedaban en el
       * `mirones` del transporte de la tarea hasta que su consola cerrara, escribiendo en un
       * socket que ya no está (el `try/catch` del sumidero se lo traga: ni se veía). Reclamar
       * el id es el único momento en que consta que la conexión anterior murió, y el cliente
       * vuelve a pedir lo que mirara al reconectar.
       */
      const anterior = porIdDeCliente.get(idDeCliente);
      if (anterior !== undefined) {
        for (const [tarea, envoltorio] of anterior.mirando) {
          opciones.corredorDeTareas?.dejarDeMirar?.(tarea, envoltorio);
        }
      }
      porIdDeCliente.set(idDeCliente, { enviar: sumidero, mirando: new Map() });
    }
    // Un comentario SSE abre el stream de verdad: sin nada escrito, algunos navegadores no
    // disparan `onopen` hasta el primer dato.
    respuesta.write(": xonecode\n\n");
    adjuntar(sumidero);
    // ANTES de `conducirCuenta()`, no después: el nombre ya está resuelto (es local, no
    // depende de ninguna cuenta) y el paso de cuenta puede tardar lo que tarde un humano
    // en elegir modelo y teclear una clave. Mandarlo solo dentro de `alta` —al final de
    // TODO esto— dejaba el saludo en «Hola» a secas mientras tanto (`transporte.ts`
    // documenta la medida).
    // Solo al recién llegado: los demás ya recibieron su saludo al conectar.
    sumidero({ clase: "bienvenida", ...(vestibulo.nombre === undefined ? {} : { nombre: vestibulo.nombre }) });
    void conducirCuenta()
      .catch(contar)
      .then(() => poblarProyectosSiProcede())
      .finally(() => void anunciarAlta().catch(contar));

    peticion.on("close", () => {
      // Se va ESTE cliente, no «el cliente». La guarda de antes (`enviar !== sumidero`)
      // existía porque el `close` de una pestaña recargada puede llegar DESPUÉS de que el
      // SSE nuevo se enganche, y con una sola ranura eso desconectaba al recién llegado;
      // con un conjunto, quitar el suyo es exacto y esa carrera desaparece.
      clientes.delete(sumidero);
      /**
       * Y se desenganchan sus MIRADAS. Sin esto, el envoltorio de una pestaña cerrada se
       * queda enganchado al turno de la tarea para siempre, escribiendo en un socket que ya
       * no está. La guarda de `enviar === sumidero` es la misma carrera que documenta el
       * `close` de aquí arriba: una pestaña recargada puede cerrar DESPUÉS de que su
       * reconexión haya reclamado el mismo id, y sin comparar el sumidero el cierre viejo se
       * llevaría por delante las miradas del recién llegado.
       */
      if (idDeCliente !== undefined) {
        const entrada = porIdDeCliente.get(idDeCliente);
        if (entrada !== undefined && entrada.enviar === sumidero) {
          for (const [tarea, envoltorio] of entrada.mirando) {
            opciones.corredorDeTareas?.dejarDeMirar?.(tarea, envoltorio);
          }
          porIdDeCliente.delete(idDeCliente);
        }
      }
      // Y la consola solo se da por sola cuando se va el ÚLTIMO: el transporte lo decide
      // mirando sus sumideros. Cortar a la primera baja rechazaría la aprobación que otra
      // pestaña todavía tiene delante.
      adjunto?.desconectar(sumidero);
      if (clientes.size === 0) adjunto = undefined;
    });
  });

  /**
   * `GET /artefacto?n=<nombre>` — el documento que pinta el iframe, y la descarga.
   *
   * **Aquí vive la decisión de sandbox que tenía parada esta pantalla.** Lo que se sirve lo
   * escribió un MODELO, y servirlo en el mismo origen que tiene la cookie del token sería
   * darle a ese HTML la consola entera: un `fetch("/accion")` desde dentro podría abrir un
   * proyecto, cambiar el modelo o pedir una clave. Se cierra con dos capas, y las dos hacen
   * falta:
   *  - El iframe va `sandbox="allow-scripts"` SIN `allow-same-origin` (`Artefactos.tsx`),
   *    así que el documento tiene un origen OPACO: no ve la cookie, no ve el padre, y sus
   *    peticiones salen con `Origin: null`, que la comprobación de `servidor.ts` ya contesta
   *    con 403.
   *  - Y la respuesta lleva `Content-Security-Policy: sandbox allow-scripts`, que cubre lo
   *    que el atributo no puede: abrir esta URL en una pestaña del navegador es una
   *    navegación de PRIMER nivel en el origen real, con la cookie puesta. La cabecera hace
   *    que ahí también sea un origen opaco.
   *
   * Lo que NO se pone es una CSP de red. Estos artefactos cargan tipografías y Mermaid de un
   * CDN (es lo que sus skills mandan), y con origen opaco no hay nada que exfiltrar: cerrar
   * la red solo los dejaría sin estilo. La contrapartida se DICE en la pantalla: no se ven
   * sin conexión.
   *
   * Y un mime que no conocemos no se sirve inline. Adivinarlo es cómo un `.txt` acaba
   * ejecutándose como HTML; sin `nosniff` lo adivinaría el navegador.
   */
  servidor.registrarRuta("GET", RUTA_ARTEFACTO, async (peticion, respuesta) => {
    const responder = (codigo: number, texto: string): void => {
      respuesta.writeHead(codigo, { "Content-Type": "text/plain; charset=utf-8" });
      respuesta.end(texto);
    };

    // El nombre sale de la QUERY. `searchParams` decodifica una vez, así que un `%2e%2e`
    // llega ya como `..` y lo caza `esRutaDeArtefacto`; un `%252e%252e` llega con el `%`
    // dentro, que tampoco es texto llano. La ruta no se parsea con `new URL` para nada más:
    // aquí no hay ningún camino que normalizar.
    const query = new URLSearchParams((peticion.url ?? "").split("?")[1] ?? "");
    const nombre = query.get("n");
    if (nombre === null || nombre === "") {
      responder(400, "falta el artefacto");
      return;
    }
    // La MISMA función que decide que escribir ahí no pide aprobación humana. Se comprueba
    // también aquí, antes de llamar al lector —que tiene su propia barrera— porque una ruta
    // que se apoya solo en la barrera de su lector se queda abierta el día que alguien
    // cambie el lector.
    if (!esRutaDeArtefacto(`${RUTA_ARTEFACTOS}${nombre}`)) {
      responder(403, "ese nombre no es de un artefacto");
      return;
    }

    const abierto = vestibulo.proyectoAbierto();
    if (abierto === undefined || opciones.leerArtefactoCrudo === undefined) {
      responder(404, "no hay artefacto");
      return;
    }

    let leido: LecturaCruda;
    try {
      leido = await opciones.leerArtefactoCrudo(abierto.raiz, abierto.idDeHilo, nombre);
    } catch (error) {
      // El mensaje de Node lleva la ruta absoluta: al cliente solo le llega el código, y a
      // `informar` tampoco más, que escribe en el transcript y por tanto viaja.
      informar(`no se pudo servir el artefacto «${nombre}» (${codigoDe(error)})`);
      responder(500, "no se pudo leer");
      return;
    }
    if (!leido.ok) {
      // Un código por motivo: con un 404 para todo no habría forma de distinguir «ese
      // nombre no vale» de «ya no está» ni de «no cabe».
      const codigos = { rechazado: 403, "no-existe": 404, "demasiado-grande": 413 } as const;
      const textos = {
        rechazado: "ese nombre no es de un artefacto",
        "no-existe": "no hay artefacto",
        "demasiado-grande": "el artefacto es demasiado grande",
      } as const;
      responder(codigos[leido.motivo], textos[leido.motivo]);
      return;
    }

    const descargar = query.get("descargar") !== null;
    // Sin mime conocido se descarga en vez de adivinar. El nombre ya pasó la barrera de
    // segmento llano, así que entre comillas no puede romper la cabecera.
    const inline = !descargar && leido.mime !== undefined;
    respuesta.writeHead(200, {
      "Content-Type": inline ? tipoServido(leido.mime!) : "application/octet-stream",
      "Content-Length": leido.datos.length,
      "Content-Security-Policy": "sandbox allow-scripts",
      "X-Content-Type-Options": "nosniff",
      // Un artefacto se sobrescribe con el mismo nombre en el turno siguiente, y una
      // respuesta cacheada enseñaría el dibujo de antes sin decirlo.
      "Cache-Control": "no-store",
      ...(inline ? {} : { "Content-Disposition": `attachment; filename="${leido.nombre}"` }),
    });
    respuesta.end(leido.datos);
  });

  /**
   * `POST /adjunto?tarea=<id>&nombre=<fichero>` — los BYTES de un adjunto de tarea.
   *
   * Por HTTP y no por el cable, que lleva JSON. Las comprobaciones de `Host`, `Origin` y
   * token las hace `servidor.ts` antes de llegar aquí, igual que a todas las rutas. Lo
   * propio de esta son cuatro cosas:
   *
   * - **El nombre pasa la MISMA barrera de segmento llano que un artefacto**
   *   (`nombreDeAdjuntoAceptable`, `core/adjuntos.ts`), y el id de la tarea también: de ellos
   *   se compone una ruta de disco. `searchParams` decodifica una vez, así que un `%2e%2e`
   *   llega ya como `..` y lo caza la lista blanca; un `%252e%252e` llega con el `%` dentro,
   *   que tampoco es texto llano. La barrera se aplica además OTRA vez dentro del puerto
   *   —sobre el texto y sobre el camino real—, que es donde se caza un enlace simbólico.
   * - **Una subida no puede caer en la carpeta de una tarea que ya existe** (409). El id lo
   *   elige el cliente, porque los bytes tienen que estar en disco ANTES de crear la tarea
   *   (crear dispara `revisarTareas()` y el corredor puede arrancarla en el acto). Sin esta
   *   guarda, un adjunto podría aterrizar en la carpeta de una tarea viva que el agente está
   *   leyendo por `/adjuntos/` ahora mismo.
   * - **El cuerpo se lee con el tope del ADJUNTO, no con el del cable** (1 MB): 413 en
   *   cuanto se pasa, y se corta ahí — no se acumulan 20 MB para después rechazarlos.
   * - **Ninguna respuesta lleva una ruta de la máquina** ni nada de lo recibido, que es la
   *   regla de `POST /accion`.
   */
  servidor.registrarRuta("POST", RUTA_ADJUNTO, async (peticion, respuesta) => {
    const responder = (codigo: number, texto: string): void => {
      respuesta.writeHead(codigo, { "Content-Type": "text/plain; charset=utf-8" });
      respuesta.end(texto);
    };
    const query = new URLSearchParams((peticion.url ?? "").split("?")[1] ?? "");
    const tarea = query.get("tarea");
    const nombre = query.get("nombre");
    if (tarea === null || tarea === "" || nombre === null || nombre === "") {
      responder(400, "faltan «tarea» o «nombre»");
      return;
    }
    if (!nombreDeAdjuntoAceptable(tarea) || !nombreDeAdjuntoAceptable(nombre)) {
      responder(403, "ese nombre no vale para un adjunto");
      return;
    }
    if (opciones.colaDeTareas === undefined) {
      responder(404, "esta consola no ejecuta tareas");
      return;
    }
    if (opciones.colaDeTareas.listar().some((t) => t.id === tarea)) {
      responder(409, "ese identificador ya es de una tarea: los adjuntos se suben antes de crearla");
      return;
    }
    let datos: Buffer;
    try {
      datos = await leerCuerpoCrudo(peticion, TOPE_DE_ADJUNTO);
    } catch {
      // Se pasó del tope, o el flujo se cortó. NO se devuelve nada de lo recibido: es la
      // misma regla que `POST /accion`, y aquí lo recibido son los bytes de un documento
      // de una persona.
      responder(413, "el adjunto es demasiado grande");
      return;
    }
    const guardado = opciones.colaDeTareas.guardarAdjunto(tarea, nombre, datos);
    if (!guardado.ok) {
      // El motivo lo escribe el puerto y no lleva ninguna ruta (su test lo vigila). 413 para
      // los dos topes —por fichero y por tarea— porque los dos son «no cabe».
      responder(413, guardado.motivo ?? "no se pudo guardar el adjunto");
      return;
    }
    respuesta.writeHead(204);
    respuesta.end();
  });

  servidor.registrarRuta("POST", RUTA_ACCION, async (peticion, respuesta) => {
    let mensaje: MensajeDelCliente;
    try {
      mensaje = JSON.parse(await leerCuerpo(peticion)) as MensajeDelCliente;
    } catch {
      // Cuerpo ilegible o demasiado grande. NO se devuelve nada de lo recibido: por aquí
      // pasa la clave de API del paso de cuenta, y un eco la dejaría en el log del cliente.
      respuesta.writeHead(400);
      respuesta.end();
      return;
    }
    if (
      typeof mensaje === "object" &&
      mensaje !== null &&
      mensaje.clase === "entorno" &&
      mensaje.accion === "activo"
    ) {
      void atenderEntornoActivo(mensaje.entorno);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (
      typeof mensaje === "object" &&
      mensaje !== null &&
      mensaje.clase === "entorno" &&
      mensaje.accion === "visibles"
    ) {
      void vestibulo
        .guardarProyectosVisibles(mensaje.entorno, mensaje.proyectos)
        .catch(contar)
        .finally(() => void anunciarAlta().catch(contar));
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "revision") {
      void atenderRevision(mensaje.ruta).catch(contar);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "arbol") {
      void atenderArbol().catch(contar);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "fichero" && typeof mensaje.ruta === "string") {
      void atenderFichero(mensaje.ruta).catch(contar);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "artefacto" && typeof mensaje.nombre === "string") {
      void atenderArtefacto(mensaje.nombre).catch(contar);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (
      typeof mensaje === "object" &&
      mensaje !== null &&
      mensaje.clase === "receta" &&
      typeof mensaje.id === "string" &&
      typeof mensaje.paso === "number" &&
      (mensaje.accion === "ejecutar" || mensaje.accion === "cancelar")
    ) {
      atenderReceta(mensaje);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    /**
     * ANTES del `recibir` de la consola, y también antes que las demás clases de tarea: por
     * aquí no entra nada hacia ningún turno. Ver `atenderMirar`.
     */
    if (
      typeof mensaje === "object" &&
      mensaje !== null &&
      mensaje.clase === "mirar" &&
      typeof mensaje.tarea === "string" &&
      typeof mensaje.cliente === "string" &&
      typeof mensaje.ver === "boolean"
    ) {
      atenderMirar(mensaje);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "tarea") {
      if (mensaje.accion === "crear" && opciones.colaDeTareas !== undefined) {
        const creada = atenderCrearTarea(mensaje.proyecto, mensaje.peticion, mensaje.encargo, mensaje.borrador);
        if (creada !== undefined) {
          opciones.revisarTareas?.();
          emitirTareas();
        }
      } else if (mensaje.accion === "augmentar" && opciones.augmentar !== undefined) {
        void atenderAugmentar(opciones.augmentar, mensaje.proyecto, mensaje.peticion, mensaje.borrador);
      } else if (mensaje.accion === "feedback" && opciones.colaDeTareas !== undefined) {
        atenderFeedbackDeTarea(mensaje.id, mensaje.texto);
        opciones.revisarTareas?.();
        emitirTareas();
      } else if (
        mensaje.accion !== "crear" &&
        mensaje.accion !== "augmentar" &&
        mensaje.accion !== "feedback" &&
        opciones.colaDeTareas !== undefined
      ) {
        /**
         * Ya no es `void x(); revisarTareas(); emitirTareas();` seguidas — reintentar y
         * terminar siguen siendo instantáneos, pero descartar puede esperar a que el
         * corredor corte un turno en vuelo (Task 14), y emitir la cola ANTES de que eso
         * termine enseñaría la tarea todavía «en proceso» un instante antes de que
         * `borrarTarea` la quite de verdad. Se secuencia con `.then()`, el mismo patrón que
         * el resto de acciones asíncronas de este manejador (`atenderRevision`,
         * `atenderArbol`…), y el fallo se cuenta y no se propaga: la respuesta HTTP ya se
         * mandó en el acto.
         */
        void atenderAccionDeTarea(mensaje.accion, mensaje.id)
          .then(() => {
            opciones.revisarTareas?.();
            emitirTareas();
          })
          .catch(contar);
      }
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "tareas" && typeof mensaje.concurrencia === "number") {
      // Cambiar el tope no vale nada sin volver a revisar: con la cola llena y hueco nuevo,
      // sin este empujón se quedaría esperando al siguiente evento que no tiene nada que
      // ver — la misma razón por la que crear y accionar revisan tras escribir.
      opciones.guardarConcurrencia?.(mensaje.concurrencia);
      opciones.revisarTareas?.();
      emitirTareas();
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "modelosDeMotor" && typeof mensaje.motor === "string") {
      void atenderModelosDeMotor(mensaje.motor).catch(contar);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "cancelar") {
      // Parar ESTE turno, no cerrar la conversación. Sin proyecto abierto no hay turno que
      // parar y se dice: un botón que no puede cumplir no puede callar.
      const abierto = vestibulo.proyectoAbierto();
      if (abierto === undefined || !abierto.cancelarTurno()) {
        informar("no hay ningún turno en vuelo que parar");
      }
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "sesion") {
      // Suelto: abrir un proyecto arranca una consola entera y el `POST` no se queda
      // esperando. Lo que pase se cuenta por el cable.
      void atenderSesion(mensaje);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "sesionAccion") {
      void atenderAccionDeSesion(mensaje).catch(contar);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "modelo") {
      atenderModelo(mensaje.id);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "agente") {
      atenderAgente(mensaje);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "proveedor") {
      atenderProveedor(mensaje);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "credencial") {
      atenderCredencial(mensaje);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "dispositivo") {
      // **El cliente manda el ID y nada más.** El nombre, la plataforma y la clase salen de
      // la última MEDIDA: son datos sobre la máquina, y el navegador no es fuente sobre la
      // máquina — aceptar su versión dejaría entrar un «iPhone 16» que nadie ha visto. Un id
      // que no esté en la medida se ignora en silencio: es una foto vieja del cliente
      // (desenchufaron el teléfono entre medias), no un error que contar.
      const abierta = vestibulo.proyectoAbierto();
      const pedido = (mensaje as { id?: unknown }).id;
      if (abierta !== undefined) {
        if (pedido === undefined) abierta.elegirDispositivo(undefined);
        else if (typeof pedido === "string") {
          const d = informeDeDispositivos?.dispositivos.find((x) => x.id === pedido);
          if (d !== undefined) {
            abierta.elegirDispositivo({ id: d.id, nombre: d.nombre, plataforma: d.plataforma, clase: d.clase });
          }
        }
        // Suelto: `anunciarAlta` consulta CloudStudio y el `POST` no puede quedarse
        // esperando por eso. El alta nueva llega por el SSE, como siempre.
        void anunciarAlta().catch(contar);
      }
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "dispositivos") {
      // Suelto, como el catálogo: lanza procesos que tardan segundos y la respuesta va por
      // el SSE. Es la ÚNICA forma de volver a medir: no hay sondeo.
      //
      // Con `ajustes` se GUARDAN primero y después se mide, en ese orden y no al revés: el
      // detector los lee de disco en cada medida, así que medir antes de guardar daría la
      // foto de la configuración anterior justo cuando se acaba de cambiar. Un fallo al
      // escribir NO impide medir —se cuenta y se sigue—, porque la foto sigue siendo
      // verdad; lo que no se puede es callarlo.
      const pedidos = (mensaje as { ajustes?: unknown }).ajustes;
      if (typeof pedidos === "object" && pedidos !== null && opciones.guardarAjustesDeDispositivos !== undefined) {
        const limpios: AjustesDeDispositivos = {};
        for (const plataforma of PLATAFORMAS_DE_DISPOSITIVO) {
          const valor = (pedidos as Record<string, unknown>)[plataforma];
          if (typeof valor === "boolean") limpios[plataforma] = valor;
        }
        try {
          opciones.guardarAjustesDeDispositivos(limpios);
        } catch (error) {
          informar(`no se pudieron guardar los destinos de prueba (${codigoDe(error)})`);
        }
      }
      // Instalar va ANTES de medir y por el nombre, nunca por un comando del cliente. Se
      // espera a que termine para que la foto de después cuente la verdad: medir mientras
      // el instalador corre diría que la herramienta sigue sin estar.
      const aInstalar = (mensaje as { instalar?: unknown }).instalar;
      const instalador = opciones.instalarHerramienta;
      if (typeof aInstalar === "string" && instalador !== undefined && esNombreDeHerramienta(aInstalar)) {
        void (async () => {
          try {
            await instalador(aInstalar);
          } catch (error) {
            // Un instalador que falla no puede tumbar nada: se cuenta y se mide igual, que
            // es lo que dirá si la herramienta apareció o no.
            informar(`no se pudo instalar ${aInstalar} (${codigoDe(error)})`);
          }
          informeDeDispositivos = undefined;
          await atenderDispositivos().catch(contar);
        })();
        respuesta.writeHead(204);
        respuesta.end();
        return;
      }
      informeDeDispositivos = undefined;
      void atenderDispositivos().catch(contar);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "catalogo") {
      // Suelto, como el alta: consultar un catálogo es una petición de red y el `POST` no
      // se queda abierto esperándola. La respuesta viaja por el SSE.
      void atenderCatalogo(mensaje.proveedor).catch(contar);
      respuesta.writeHead(204);
      respuesta.end();
      return;
    }
    if (typeof mensaje === "object" && mensaje !== null && mensaje.clase === "alta") {
      // Suelto y sin esperar: el alta hace dos viajes a CloudStudio y una descarga entera,
      // y el `POST` no puede quedarse abierto minutos. Lo que pase se cuenta por el cable.
      void atenderAlta(mensaje);
    } else {
      destinoActual().recibir(mensaje);
    }
    respuesta.writeHead(204);
    respuesta.end();
  });

  return { emitirTareas };
}

export interface CorredorDeTareasCableado {
  /** `undefined` si esta ejecución no tiene cola (`tareasFabrica` ausente): entonces no
   *  hay nada que revisar. Sin `arrancar`: la única forma de arrancar el corredor devuelto
   *  aquí fuera es `arrancarConectado`, que ata el orden puente-antes-que-arranque. Exponer
   *  `arrancar` en este tipo dejaría `corredor?.arrancar()` compilando fuera de esa función
   *  — el mismo fallo que esta extracción existe para hacer imposible. */
  corredor: Omit<Corredor, "arrancar"> | undefined;
  /** Lo que hay que fundir en las opciones de `montarRutas`. */
  opcionesDeMontaje: Pick<
    OpcionesDeMontaje,
    "colaDeTareas" | "corredorDeTareas" | "concurrenciaDeTareas" | "guardarConcurrencia"
  >;
  /**
   * Arranca el corredor YA conectado al cable. Es UNA función y no dos —«conecta el
   * puente» y luego «arranca»— porque separarlas es exactamente el fallo que este
   * cableado puede volver a cometer: un test que las llame en el orden que no toca no
   * falla nunca si nada comprueba el orden, y en producción el corredor puede reconciliar
   * y disparar `alCambiar` antes de que el puente esté puesto. Horneando el orden aquí
   * dentro, quien llame no tiene manera de equivocarse.
   */
  arrancarConectado: (cable: { emitirTareas: () => void }) => Promise<void>;
}

/**
 * Construye el corredor de tareas y la costura que lo conecta al cable.
 *
 * Extraído de `arrancarConsolaWeb` a su propia función por la MISMA razón que
 * `backendDeAgente` (`agent/proyecto.ts`): la composición vivía inline dentro de una
 * función que todos sus tests DOBLAN —`vestibulo`, `crearServidor`, `crearEjecutor`—, así
 * que esta costura concreta podía dejar de estar montada con el resto en verde. Aquí
 * tiene su propio test que la compone de VERDAD: construye un corredor real
 * (`crearCorredorDeTareas`) y comprueba que un cambio que el corredor mueve por su
 * cuenta —nace DENTRO del lazo, no de una petición del cliente— llega a
 * `emitirTareas`, y que si `emitirTareas` revienta el lazo de tareas no se entera.
 */
/**
 * Las fuentes con que se resuelve el papel del JUEZ para una tarea, por la raíz de SU
 * proyecto.
 *
 * Está extraída y exportada por el mismo motivo que `revisionConGit` y que `backendDeAgente`:
 * vivía dentro del cierre de `arrancarConsolaWeb`, que todos sus tests doblan, así que
 * quitarle la capa de proyecto no ponía ni un test en rojo — comprobado por mutación. Es la
 * cuarta vez en esta tanda que una composición de producción escondida en un cierre deja una
 * regla sin montar con todo en verde.
 *
 * Las dos capas salen de `cargar(raiz)`, que trae el `config.json` del proyecto y el global:
 * en la consola web `FuentesDeEleccion.proyecto` no se rellena nunca —el vestíbulo sirve
 * muchos proyectos y las fuentes se construyen una vez al arrancar—, así que sin preguntarle
 * al disco por la raíz de la tarea, un proyecto que apuntara `afilado` a otro modelo se
 * ignoraba en silencio. La misma trampa que `cloudstudioDelProyecto` ya resolvió así.
 *
 * `proyecto` se omite en vez de ponerse a `undefined`: ausente es «este proyecto no dice
 * nada», y la precedencia de `core/modelos.ts` cuenta con eso.
 */
export function fuentesDelJuez(raiz: string): FuentesDeEleccion {
  const { config } = cargar(raiz);
  return {
    ...(config.proyecto === undefined ? {} : { proyecto: config.proyecto }),
    global: config.global,
    entorno: { XONECODE_MODELO: process.env.XONECODE_MODELO },
  };
}

/**
 * Cuánta memoria de proyecto se le da al aumentador.
 *
 * Es CONTEXTO de una llamada, no un fichero que servir: `.xonecode/memoria.md` lo escribe el
 * agente turno tras turno y puede crecer sin tope. Y el árbol del proyecto ya se descartó por
 * lo mismo (§7 del diseño: «el árbol entero sería contexto por gastar»); dejar la memoria sin
 * acotar reintroduciría el problema por la puerta de al lado.
 */
export const TOPE_DE_MEMORIA = 4_000;

/**
 * Lo que se le añade a la petición del aumentador leyendo el DISCO por la raíz: la rama del
 * proyecto y su memoria.
 *
 * **Por la raíz y no por las fuentes**, la trampa que `cloudstudioDelProyecto` ya resolvió:
 * en la consola web `FuentesDeEleccion.proyecto` no se rellena nunca. Y lo que el disco no
 * dice NO se pone —ausente es «no hay»—: un `rama: undefined` o un `memoria: ""` en el prompt
 * harían que el modelo hablara de una rama sin nombre como si fuera un dato.
 *
 * Nada de esto lanza. Que no haya memoria, o que el `config.json` no se pueda leer, no puede
 * impedir redactar un encargo.
 */
export function contextoDelProyecto(raiz: string): { rama?: string; memoria?: string } {
  const rama = cloudstudioDelProyecto(raiz)?.rama;
  let memoria: string | undefined;
  try {
    const leido = readFileSync(rutaMemoriaDeProyecto(raiz), "utf8").trim();
    if (leido !== "") memoria = leido.slice(0, TOPE_DE_MEMORIA);
  } catch {
    // No hay memoria, o no se puede leer: no se afirma ninguna.
  }
  return {
    ...(rama === undefined || rama === "" ? {} : { rama }),
    ...(memoria === undefined ? {} : { memoria }),
  };
}

/**
 * La costura entre el cable y el aumentador: convierte lo que `montarRutas` resuelve
 * —proyecto y adjuntos— en la `PeticionDeTarea` del puerto, añadiéndole lo que solo se sabe
 * mirando el disco.
 *
 * **Extraída y exportada, no inline en `arrancarConsolaWeb`**, por la misma razón que
 * `revisionConGit` y `fuentesDelJuez`: en esta tanda cuatro veces una composición de
 * producción vivía en un cierre que todos sus tests doblan, y una regla se quedó sin montar
 * con todo en verde. Lo que aquí se caería sin dar ni un síntoma es la mitad del contexto: un
 * encargo redactado sin la rama ni la memoria del proyecto se ve perfectamente normal.
 *
 * El error se PROPAGA: quien lo convierte en palabras para la ventana es `atenderAugmentar`,
 * que aplica la regla del mensaje-o-código. Tragárselo aquí dejaría a la ventana con un
 * encargo vacío y sin motivo.
 */
export function augmentacionCableada(opciones: {
  aumentador: AumentadorPort;
  /** Por parámetro para poder probar esta composición sin tocar disco. Por omisión,
   *  `contextoDelProyecto`; ausente del todo = sin rama ni memoria. */
  contexto?: (raiz: string) => { rama?: string; memoria?: string };
}): NonNullable<OpcionesDeMontaje["augmentar"]> {
  return async ({ texto, proyecto, adjuntos }) => {
    const extra = opciones.contexto?.(proyecto.raiz) ?? {};
    return opciones.aumentador.augmentar({
      texto,
      // El `id` del proyecto NO viaja al modelo: es un identificador de CloudStudio y para
      // redactar no aporta nada. Sí la raíz, que es con lo que se resuelve el papel.
      proyecto: { nombre: proyecto.nombre, raiz: proyecto.raiz, ...(extra.rama === undefined ? {} : { rama: extra.rama }) },
      adjuntos,
      ...(extra.memoria === undefined ? {} : { memoria: extra.memoria }),
    });
  };
}

export function construirCorredorDeTareasCableado(opciones: {
  vestibulo: Pick<Vestibulo, "abrirParaTarea" | "proyectoAbierto" | "sesionesDe">;
  /** La fábrica de `OpcionesDeArranque.tareas`. Ausente = esta ejecución no ejecuta tareas. */
  tareasFabrica?: (informar: (texto: string) => void) => TareasEnDisco;
  informar: (texto: string) => void;
  olvidarHiloDeSesion: (raiz: string, hilo: string) => Promise<void>;
  /**
   * Las DOS piezas de la puerta de la entrega, obligatorias porque el corredor las exige por
   * TIPO (ver `crearCorredorDeTareas`): un juez que decida si el trabajo hace lo que se
   * pedía, y con qué se comprueba que lo escrito se puede revisar. Suben hasta aquí para que
   * el test de esta costura las componga de verdad, que es el motivo de que esta función
   * exista.
   */
  juez: JuezDeTareaPort;
  revisable: (raiz: string, sesion: string) => Promise<RevisionDeSesion>;
}): CorredorDeTareasCableado {
  const disco = opciones.tareasFabrica === undefined ? undefined : opciones.tareasFabrica(opciones.informar);

  /**
   * El tope de concurrencia se LEE de `settings.json` en cada llamada, nunca se cachea —la
   * misma disciplina que `ajustesDeDispositivos` (más abajo) y que `sinAprobacion`: la
   * sección «Tareas» de Ajustes escribe con `guardarConcurrenciaDeTareas` mientras el
   * proceso vive, y una copia capturada al construir este corredor no la vería. Ausente en
   * disco = `CONCURRENCIA_POR_OMISION` (2), la misma omisión que ya usaba la variable en
   * memoria que esto sustituye.
   */
  const concurrenciaDeTareas = (): number => cargarSettings().settings.concurrenciaDeTareas ?? CONCURRENCIA_POR_OMISION;

  /**
   * El puente hacia `emitirTareas`. El corredor nace ANTES que el cable —`montarRutas`
   * necesita poder pedirle `revisar()` y `corriendoAqui()`—, pero su `alCambiar` (una
   * tarea que el CORREDOR mueve por su cuenta: empieza, aparca, termina) solo puede
   * alcanzar el cable una vez que existe. `arrancarConectado` es quien la rellena, antes
   * de arrancar. Sin este puente, el kanban solo se movería cuando alguien tocara algo
   * desde el navegador — la peor forma de estar roto: parece que funciona.
   */
  let emitirCambioDeTareas: (() => void) | undefined;

  const corredor =
    disco === undefined
      ? undefined
      : crearCorredorDeTareas({
          disco,
          // La costura de las tres piezas: la segunda puerta del vestíbulo (que no mueve el
          // cable), la consola que APARCA en vez de contestar por nadie, y el ejecutor de
          // siempre con las mismas barreras que el de una persona.
          // `sesion` reenviada: es lo que hace que reanudar (un reintento, o un feedback)
          // reabra el MISMO hilo en vez de uno en blanco. Ver `corredorDeTareas.ts`.
          // `sesion`, `adjuntos` y `tarea` reenviadas TAL CUAL, y las tres por el mismo
          // motivo: quien sabe de qué tarea es esta apertura es el corredor. La primera hace
          // que reanudar siga la MISMA conversación; la segunda es lo que monta `/adjuntos/`
          // en el backend del agente (`core/adjuntos.ts`); la tercera es lo que marca su
          // sesión en el índice del proyecto (`EntradaIndice.tarea`). Dejarse cualquiera no
          // da ningún síntoma —esto es una lambda que reenvía a mano, y TypeScript no se
          // queja de una función que ignora argumentos—: un hilo en blanco, unos adjuntos
          // que el agente no puede abrir, o una fila de la barra que miente para siempre.
          abrirParaTarea: async (raiz, sesion, adjuntos, tarea) =>
            consolaParaTarea(await opciones.vestibulo.abrirParaTarea(raiz, sesion, adjuntos, tarea)),
          // La SIEMBRA de la marca en las sesiones que ya existían. Ver
          // `sesiones.ts#marcarTareaDeSesion`: solo añade, así que correrla en cada arranque
          // no puede convertir una sesión de tarea en una conversación.
          marcarSesionDeTarea: (raiz, sesion, tarea) => void marcarTareaDeSesion(raiz, sesion, tarea),
          // Se lee de disco en cada pasada: cambiar el tope en Ajustes se nota sin
          // reiniciar nada, en la siguiente ronda de planificación.
          concurrencia: concurrenciaDeTareas,
          /**
           * GANA LA PERSONA: en el proyecto que alguien tiene abierto no arranca ninguna
           * tarea. Una tarea y una persona sobre el mismo árbol no tienen aislamiento de
           * ninguna clase, y el cerrojo del corredor no protege de eso — protege de dos
           * corredores. Se pregunta en cada pasada, no al arrancar: abrir un proyecto no
           * reinicia nada.
           */
          bloqueados: () => {
            const abierto = opciones.vestibulo.proyectoAbierto();
            return abierto === undefined ? [] : [abierto.raiz];
          },
          /**
           * `sesion` sobrevive si y solo si hay algo que una persona pueda ABRIR, y esto es
           * lo que lo decide: la sesión está en el índice del proyecto —o sea que su
           * transcript se volcó y se lee desde la barra lateral— o no está. Es exactamente
           * la lista que la barra pinta, no una segunda fuente que pueda contradecirla.
           */
          sesionAbrible: (raiz, sesion) => opciones.vestibulo.sesionesDe(raiz).some((s) => s.id === sesion),
          // Y el hilo del agente de una sesión que no nombra nada abrible se olvida, igual
          // que al borrar una conversación: un checkpoint es la lista de mensajes entera y
          // crece, y ahí seguiría vivo e invisible desde la interfaz para siempre.
          olvidarHilo: opciones.olvidarHiloDeSesion,
          /**
           * La puerta de la ENTREGA: «terminada» ya no significa «el turno acabó». Las tres
           * condiciones las comprueba el código (`core/entrega.ts`) y el juez de QA opina, y
           * hacen falta las dos — es la regla que este repo ya tenía escrita para la subida
           * autónoma, y el mismo motivo por el que los avisos de honestidad son código y no
           * prompt.
           */
          juez: opciones.juez,
          revisable: opciones.revisable,
          /**
           * El puente hacia el cable, y NUNCA puede tumbar el lazo de tareas: un sumidero
           * muerto —o cualquier otra cosa que `emitirTareas` haga mal— es un problema del
           * cable, no de la tarea que el corredor acaba de escribir.
           * `escribirSiSigueSiendoNuestra` llama a este `alCambiar` SIN su propio `try`,
           * así que una excepción de aquí subiría hasta `aparcar`/`correr` y podría hacer
           * que una escritura que SÍ funcionó se cuente como fallida. Se atrapa aquí, en
           * el único sitio que sabe que lo que sigue es «avisar», no «guardar».
           *
           * El mensaje usa `error.message` y no `codigoDe` (la regla de `montarRutas` y de
           * `corredorDeTareas.ts`): esa función existe para tapar la ruta absoluta de un
           * fallo de FICHERO, y lo que puede fallar aquí es `emitirTareas()` — un recorrido
           * de sumideros SSE que ya se protege cada uno por su cuenta (`sumidero` en la
           * ruta `/eventos`), así que en producción esto no lanza nada con un disco detrás.
           * Lo único que llega hasta aquí es un sumidero de mentira que revienta a propósito.
           */
          alCambiar: () => {
            try {
              emitirCambioDeTareas?.();
            } catch (error) {
              opciones.informar(
                `no se pudo avisar del cambio en la cola de tareas (${error instanceof Error ? error.message : String(error)})`
              );
            }
          },
          informar: opciones.informar,
        });

  return {
    corredor,
    opcionesDeMontaje: {
      ...(disco === undefined ? {} : { colaDeTareas: disco }),
      ...(corredor === undefined ? {} : { corredorDeTareas: corredor }),
      concurrenciaDeTareas,
      // Persiste en `settings.json` — `guardarConcurrenciaDeTareas` acota a
      // `0..TOPE_DE_CONCURRENCIA_DE_TAREAS` por su cuenta, así que un valor fuera de rango
      // que llegara por el cable no deja basura en el fichero.
      guardarConcurrencia: (c) => {
        guardarConcurrenciaDeTareas(undefined, c);
      },
    },
    arrancarConectado: async (cable) => {
      emitirCambioDeTareas = cable.emitirTareas;
      await corredor?.arrancar();
    },
  };
}

/**
 * El cuerpo en BYTES, con su propio tope.
 *
 * No se reutiliza `leerCuerpo`: ese acota a `TOPE_DE_CUERPO` (1 MB) y devuelve `utf8`, o sea
 * las dos cosas equivocadas para un adjunto — un PNG de 3 MB se rechazaría, y pasarlo por
 * utf8 lo destrozaría. El tope se corta EN CUANTO se pasa y no al final: acumular 20 MB para
 * después decir que no caben sería pagar la memoria del rechazo.
 */
async function leerCuerpoCrudo(peticion: IncomingMessage, tope: number): Promise<Buffer> {
  const trozos: Buffer[] = [];
  let total = 0;
  for await (const trozo of peticion) {
    const buffer = Buffer.from(trozo as Buffer);
    total += buffer.length;
    if (total > tope) throw new Error("cuerpo demasiado grande");
    trozos.push(buffer);
  }
  return Buffer.concat(trozos);
}

async function leerCuerpo(peticion: IncomingMessage): Promise<string> {
  const trozos: Buffer[] = [];
  let total = 0;
  for await (const trozo of peticion) {
    const buffer = Buffer.from(trozo as Buffer);
    total += buffer.length;
    if (total > TOPE_DE_CUERPO) throw new Error("cuerpo demasiado grande");
    trozos.push(buffer);
  }
  return Buffer.concat(trozos).toString("utf8");
}

export interface OpcionesDeArranque {
  puerto: number;
  abrir: boolean;
  cwd: string;
  /** `--guion`: el agente de pega también en la web, para verla correr sin gastar. */
  guion?: boolean;
  /**
   * `--anfitrion <host>`: un nombre EXTRA que el servidor acepta en la cabecera `Host`,
   * para servir a través de un túnel (ngrok, Tailscale) que apunte a este proceso.
   *
   * Sin esto, un túnel recibe 403 en todas las peticiones y hace bien: la comprobación de
   * `Host` es la única defensa contra el DNS rebinding. Abrirla es una decisión, se pide a
   * mano, y se DICE al arrancar — detrás de esta puerta hay un agente que escribe ficheros
   * en el disco del usuario.
   */
  anfitrion?: string;
  /**
   * La fábrica del ejecutor real (`cli/main.ts#crearEjecutorReal`). Entra por parámetro y
   * no se importa: `cli/main.ts` ya carga este módulo, e importarlo de vuelta sería un
   * ciclo entre el despachador y la piel que monta.
   */
  crearEjecutor?: (
    alAbrirSesion: (sesion: SesionCerrable) => void,
    /** Lo que depende de la CONSOLA y no de su raíz: hoy la carpeta de adjuntos de una
     *  tarea. La misma forma que `OpcionesDelVestibulo.crearEjecutor`, porque esto se le
     *  pasa tal cual. */
    opciones?: { adjuntos?: string }
  ) => EjecutorDeTurno;
  /** Lo que la consola de proyecto necesita y depende de la raíz (`/sync`, los escritores). */
  dependenciasDeProyecto?: (raiz: string) => Partial<Consola>;
  /**
   * La cola de TAREAS de fondo (`agent/tareasEnDisco.ts`), y con ella el corredor.
   *
   * **Ausente = esta ejecución no ejecuta tareas y no toma ningún cerrojo**, que es la
   * omisión obligada y no una comodidad: el cerrojo y el índice viven en el
   * `~/.xonecode/tareas` de la MÁQUINA, así que una omisión que construyera la cola de
   * verdad haría que los tests de este fichero —que llaman a `arrancarConsolaWeb` entero—
   * reconciliaran la cola real de quien los corre y le quitaran el cerrojo a su consola
   * abierta. Es la misma razón por la que `detectarDispositivos` entra por opción.
   *
   * Es una FÁBRICA y no el puerto ya construido para poder darle el `informar` de aquí: el
   * de un índice que no se puede leer tiene que llegar al navegador —es donde se está
   * mirando el kanban—, y ese `informar` no existe hasta que existe el vestíbulo.
   */
  tareas?: (informar: (texto: string) => void) => TareasEnDisco;
  /** Costuras de test: nada de esto toca disco, red ni navegador cuando se inyecta. */
  raizDelCliente?: string;
  escribir?: (texto: string) => void;
  abrirNavegador?: (url: URL) => void;
  crearServidor?: typeof arrancarServidor;
  vestibulo?: Vestibulo;
  /** Cuándo termina. Por omisión, con la primera señal de interrupción. */
  esperarCierre?: () => Promise<void>;
}

/**
 * Levanta la consola web y se queda. Devuelve el código de salida del proceso.
 *
 * El orden de las comprobaciones no es casual: primero lo que hace IMPOSIBLE arrancar
 * (falta el build del cliente → 70, fallo del entorno y no del proyecto), y después lo que
 * solo hay que DECIR (un proyecto offline en el cwd). Lo segundo informa y sigue, porque no
 * es un error: quien abrió aquí un proyecto offline puede querer la web para otro.
 *
 * **`--guion` sobre un proyecto offline lo abre solo, sin pasar por el alta.** Es la única
 * vía para ver la maqueta completa —barra con datos, transcript, compositor— sin
 * credenciales de CloudStudio: el alta de la web solo sabe de entornos y proyectos
 * REMOTOS (`vestibulo.ts`), así que un proyecto offline nunca llega a `proyectoAbierto()`
 * por ese camino, con o sin `--guion`. `vestibulo.abrirProyecto` (`vestibulo.ts#abrirDeVerdad`)
 * no toca red —es local, el mismo turno que corre `--cli`—, así que abrirlo aquí no es un
 * doble de nada: es la operación real, disparada por una bandera que ya existe y ya
 * significa «sin gastar ni conectar». Sin `--guion` esto NO se abre solo —sería magia, no
 * un modo declarado—, y el aviso de abajo sigue mandando a `--cli`.
 */
/**
 * Cuántos nombres de fichero se mandan en el aviso de trabajo sin commitear. El alta se
 * reemite en los DOS flancos de cada turno, así que la lista viaja muchas veces; y la frase
 * que la pinta no puede llevar trescientos nombres de todas formas. Lo que no cabe se
 * cuenta: `total` va siempre entero.
 */
export const FICHEROS_DEL_AVISO = 20;

export async function arrancarConsolaWeb(opciones: OpcionesDeArranque): Promise<number> {
  const escribir = opciones.escribir ?? ((texto: string) => void process.stdout.write(texto));
  const raizDelCliente = opciones.raizDelCliente ?? raizDelClientePorOmision();

  if (!existsSync(join(raizDelCliente, "index.html"))) {
    process.stderr.write(`${FALTA_EL_BUILD}\n`);
    return 70; // EX_SOFTWARE: falta una pieza del entorno, el proyecto no tiene la culpa
  }

  const offline = esProyectoOffline(opciones.cwd);
  if (offline && opciones.guion !== true) {
    escribir("este directorio es un proyecto offline: ábrelo con «xonecode --cli»\n");
  }

  const arrancar = opciones.crearServidor ?? arrancarServidor;
  const servidor = await arrancar({
    puerto: opciones.puerto,
    raizEstaticos: raizDelCliente,
    ...(opciones.anfitrion === undefined ? {} : { anfitrion: opciones.anfitrion }),
  });

  /**
   * El aviso que se ve por los DOS sitios, y es el mismo para el vestíbulo y para las rutas.
   *
   * El vestíbulo se captura perezosamente porque esta función se construye antes que él.
   * Medido antes de este arreglo: `montarRutas` recibía un `informar` que solo escribía en
   * el terminal, así que una URL rechazada o un `fetch failed` durante el alta salían por la
   * consola del proceso y NO llegaban al navegador — el `finally` re-anunciaba el alta, el
   * wizard repintaba el mismo paso, y el usuario no leía ni una palabra. En la piel que
   * ahora es la de omisión, y que vive en un navegador donde el terminal puede ni verse, eso
   * es un fallo mudo. Al revés también hace falta: en cuanto hay proyecto abierto, la consola
   * del vestíbulo ya no la mira nadie, y ahí caería «la consola del proyecto terminó con un
   * error».
   */
  let vestibulo: Vestibulo | undefined;
  const informar = (texto: string): void => {
    escribir(`${texto}\n`);
    vestibulo?.consola.consola.escribir(`${texto}\n`);
  };

  vestibulo = opciones.vestibulo ?? vestibuloReal(opciones, servidor, escribir, informar);
  const conVestibulo = vestibulo;

  /**
   * El corredor de tareas y su costura con el cable — `construirCorredorDeTareasCableado`
   * y no inline: es lo que la hace comprobable de verdad (ver su comentario). Se construye
   * ANTES de `montarRutas` porque las rutas necesitan poder pedirle una revisión —abrir o
   * cerrar un proyecto cambia qué se puede arrancar— y solo necesita el vestíbulo, que ya
   * está. Y ejecutar solo se ejecuta si hay cola: ver `OpcionesDeArranque.tareas`.
   */
  const {
    corredor,
    opcionesDeMontaje: opcionesDeTareas,
    arrancarConectado: arrancarCorredorConectado,
  } = construirCorredorDeTareasCableado({
    vestibulo: conVestibulo,
    tareasFabrica: opciones.tareas,
    informar,
    olvidarHiloDeSesion: async (raiz, hilo) => olvidarHilo(crearCheckpointerDeProyecto(raiz), hilo),
    /**
     * El juez de QA de las tareas, con el papel `afilado` — el que `core/modelos.ts` le
     * reserva.
     *
     * **Los `Modelos` se construyen en CADA consulta**, no una vez al arrancar, y es la
     * misma razón por la que `sinAprobacion` relee los settings en cada ronda: el asistente
     * de cuenta y `/provider` escriben la credencial y la elección de modelo mientras el
     * proceso vive, y un `Modelos` capturado al arrancar dejaría al juez con el reparto de
     * antes. Una consulta por tarea, así que leer el `config.json` ahí no cuesta nada.
     *
     * **Y se lee el del PROYECTO además del global, por la raíz de la tarea.** En la consola
     * web `FuentesDeEleccion.proyecto` no se rellena nunca —el vestíbulo sirve muchos
     * proyectos y las fuentes se construyen una vez al arrancar—, así que sin preguntarle al
     * disco por la raíz, un `config.json` de proyecto que apuntara el papel `afilado` a otro
     * modelo se ignoraba en silencio. Es la misma trampa que `cloudstudioDelProyecto` ya
     * resolvió así, y el mismo motivo: un ajuste escrito que no hace nada es peor que no
     * poder ponerlo, porque quien lo puso se cree servido.
     */
    juez: crearJuezDeTarea({
      invocar: (papel, prompt, raiz) =>
        invocarConModelos(new Modelos(fuentesDelJuez(raiz), proveedoresPersonalizados))(papel, prompt, raiz),
    }),
    /**
     * Que lo escrito se pueda REVISAR es `cambiosDeSesion(...).via === "git"`: la MISMA
     * función que pinta la pestaña Revisión, no una parecida, así que la condición significa
     * literalmente «Revisión lo enseña». Sin aprobación previa ese diff es el único momento
     * en que una persona puede mirar lo que hizo una tarea, y entregar trabajo que nadie
     * puede ver sería dejar vacío el sitio del modal.
     *
     * Y NO es «el árbol de git está limpio»: eso está medido y sería falso siempre — una
     * tarea que escribe un fichero deja el árbol sucio por definición.
     *
     * De la MISMA respuesta sale si la sesión cambió algo, y solo se afirma cuando hay
     * marca: sin ella no es que no escribiera, es que no hay con qué mirarlo. Eso es lo que
     * permite entregar una tarea de solo lectura sin abrir un camino para entregar sin
     * verificar, y lo que impide decidirlo con `autorizadas` — que es la intención del
     * agente y no el hecho.
     */
    revisable: revisionConGit(cambiosDeSesion),
  });

  if (offline && opciones.guion === true) {
    const abierto = await vestibulo.abrirProyecto({ raiz: opciones.cwd });
    // Por los DOS sitios, como el resto de `informar` un poco más abajo: el terminal
    // (quien lanzó el proceso) Y el transcript del proyecto (la Trayectoria, que es
    // donde aterriza un acto de sistema — `anunciarAlta` más arriba documenta el mismo
    // reparto). Es la evidencia de que esto es de pega, por el mismo motivo por el que
    // la marca de doble (`core/ports.ts#ES_DOBLE`) es un símbolo que no se puede omitir
    // por descuido: un aviso que solo viviera en un sitio que nadie mira no avisa nada.
    const aviso =
      "proyecto offline abierto solo, por --guion: el agente que responde es de pega " +
      "(`ejecutarTurnoGuionizado`) y no hubo CloudStudio de por medio — nadie eligió " +
      "este proyecto en un alta.";
    escribir(`${aviso}\n`);
    abierto.consola.consola.escribir(`${aviso}\n`);
  }

  const cable = montarRutas(servidor, vestibulo, {
    informar,
    ...(corredor === undefined ? {} : { revisarTareas: () => corredor.revisar() }),
    // El PUERTO de disco y el corredor, no operaciones sueltas: `montarRutas` resuelve
    // `crearTarea`/`accionDeTarea` con SU propio estado (`proyectos`, `entornoElegido`,
    // `vestibulo.raizDeProyecto`), que es la única forma de convertir un id de proyecto en
    // la raíz que la tarea necesita para poder correr. Ver el comentario de
    // `OpcionesDeMontaje.colaDeTareas`.
    ...opcionesDeTareas,
    // Los dos puertos del selector de modelos, con las piezas reales: quién tiene
    // credencial (`auth.json` o el entorno, leído desde el cwd) y el catálogo VIVO.
    hayCredencial: (proveedor) => hayCredencial(proveedor, opciones.cwd),
    // «Está en auth.json» es una pregunta distinta de «¿puedo usarlo?»: se lee el fichero,
    // sin mirar el entorno, porque es lo único que un botón de borrar puede cumplir.
    credencialEnFichero: (proveedor) => cargar(opciones.cwd).auth[proveedor] !== undefined,
    borrarCredencial,
    guardarCredencial,
    cambiosDeSesion,
    parcheDeSesion,
    // El proyecto tal como lo ve el agente, para la pestaña Ficheros: mismo filtro, misma
    // barrera de rutas (`agent/arbolDeProyecto.ts`).
    arbolDelProyecto: async (raiz) => arbolDeProyecto(raiz),
    leerFichero: leerFicheroDeProyecto,
    leerArtefacto: leerArtefactoDeSesion,
    leerArtefactoCrudo,
    correrPasoDeReceta: (receta, paso, alSalirLinea) => correrPasoDeReceta(receta, paso, { alSalirLinea }),
    modelosDeMotor,
    // La máquina de verdad: adb/emulator del PATH o del SDK, xcrun solo en macOS y solo con
    // herramientas de desarrollo. Cada proceso con su tope.
    detectarDispositivos: () => detectarDispositivos({}, cargarSettings().settings.dispositivos ?? {}),
    // Se lee de disco en cada consulta, no se cachea: `settings.json` es del usuario.
    ajustesDeDispositivos: () => cargarSettings().settings.dispositivos ?? {},
    guardarAjustesDeDispositivos: (ajustes) => void guardarDispositivos(undefined, ajustes),
    instalarHerramienta: instalarHerramientaDeDispositivos,
    catalogoDeModelos: async (proveedor) => {
      const modelos = await new CatalogoModelos(undefined, undefined, proveedoresPersonalizados).listar(proveedor);
      return modelos.map((m) => ({ id: m.id, ...(m.nombre === undefined ? {} : { nombre: m.nombre }) }));
    },
    // Se releen de disco en cada consulta, igual que los ajustes de dispositivos: esta
    // misma ventana los da de alta, y una lista capturada al montar las rutas se quedaría
    // vieja hasta reiniciar el proceso.
    proveedoresPersonalizados: proveedoresPersonalizados,
    guardarProveedor: (declarado) => guardarProveedorPersonalizado(declarado),
    borrarProveedor: (slug) => borrarProveedorPersonalizado(slug),
    /**
     * El AUMENTADOR de la ventana de crear una tarea (`agent/aumentador.ts`), con el papel
     * `trabajo` — es una tarea de redacción, no una clasificación.
     *
     * Tres cosas que se deciden aquí:
     * - **La composición vive en `augmentacionCableada` y no inline**, por lo mismo que
     *   `revisionConGit` y `fuentesDelJuez`: es la quinta vez en esta tanda que hace falta
     *   decirlo, y lo que se caería sin síntoma es la mitad del contexto del encargo.
     * - **Los `Modelos` se construyen en CADA llamada**, igual que los del juez: el
     *   asistente de cuenta y `/provider` escriben la credencial mientras el proceso vive, y
     *   uno capturado al arrancar se quedaría con el reparto de antes. Y con
     *   `fuentesDelJuez(raiz)`, que es «las fuentes de ESE proyecto»: sin la capa de
     *   proyecto, un `config.json` que apunte `trabajo` a otro modelo se ignoraría.
     * - **Con `--guion` se monta el DOBLE**, no el real: esa bandera significa «sin gastar
     *   ni conectar», y el doble dice en el propio encargo que es de pega (`[DOBLE]`).
     */
    augmentar: augmentacionCableada({
      aumentador:
        opciones.guion === true
          ? new AumentadorGuionizado()
          : crearAumentador({
              invocar: (papel, prompt, raiz) =>
                invocarParaAumentar(new Modelos(fuentesDelJuez(raiz), proveedoresPersonalizados))(papel, prompt, raiz),
            }),
      contexto: contextoDelProyecto,
    }),
  });

  // Con las rutas ya montadas: la reconciliación y el primer despacho cambian la cola, y
  // quien conecte después la recibe entera en su ráfaga de bienvenida.
  // `arrancarConectado` es la ÚNICA forma de arrancar el corredor: conecta el puente hacia
  // `cable.emitirTareas` y arranca en el orden correcto, así que no hay manera de llamarlo
  // mal desde aquí.
  await arrancarCorredorConectado(cable);

  escribir(`consola web en ${servidor.url}\n`);
  if (opciones.anfitrion !== undefined) {
    // Se dice SIEMPRE y con lo que hay detrás nombrado. Una puerta abierta que solo consta
    // en la línea de comandos que alguien tecleó hace media hora no consta.
    escribir(
      `ATENCIÓN: también se acepta «${opciones.anfitrion}» como Host, así que esta consola es alcanzable por ese túnel.\n` +
        `Detrás hay un agente que escribe ficheros en este equipo y las credenciales de ~/.xonecode. ` +
        `Lo único que lo separa de quien tenga la URL es el token.\n`
    );
  }
  if (opciones.abrir) {
    // Lo accesorio: la URL ya está impresa, así que un fallo aquí no puede tumbar nada.
    // `abrirEnSistema` escucha el `error` del spawn justo por esto.
    try {
      (opciones.abrirNavegador ?? abrirEnSistema)(new URL(servidor.url));
    } catch (error) {
      escribir(`no se pudo abrir el navegador (${error instanceof Error ? error.message : String(error)}); abre la URL a mano\n`);
    }
  }

  await (opciones.esperarCierre ?? esperarInterrupcion)();
  /**
   * El corredor PRIMERO, y el orden es load-bearing: `parar()` corta los turnos en vuelo y
   * los deja aparcados diciendo que la consola se cerró a mitad. Al revés, el
   * `cerrarLasDeTareas` del vestíbulo abortaría esos mismos turnos por debajo del corredor,
   * que lo contaría como un fallo del turno —«el turno falló (AbortError)»— cuando lo que
   * pasó es que alguien paró el proceso. El motivo se lee en el kanban, así que la
   * diferencia no es interna.
   */
  await corredor?.parar();
  await vestibulo.cerrar();
  await servidor.cerrar();
  return 0;
}

/**
 * El `modo` que declara el `.xonecode/config.json` de una raíz, o `undefined`.
 *
 * `undefined` es «no se sabe», no «offline»: cubre el fichero que no está, el JSON roto y
 * el valor que no es ninguno de los dos. Quien pregunta decide qué hacer con no saber —
 * `esProyectoOffline` lo trata como «no es offline» y la cabecera de la consola web no
 * pinta pastilla—, y ninguno de los dos afirma sobre lo que no ha leído.
 *
 * Del config no sale nada más: ni la URL del entorno, ni el proyecto, ni la rama. Es lo
 * mismo que ya hace `proyectosDeResultado` con la respuesta de CloudStudio (CLAUDE.md),
 * quedarse SOLO con lo que hace falta enseñar.
 */
export function modoDeProyecto(raiz: string): "offline" | "cloud" | undefined {
  try {
    const crudo: unknown = JSON.parse(readFileSync(join(raiz, ".xonecode", "config.json"), "utf8"));
    if (typeof crudo !== "object" || crudo === null) return undefined;
    const modo = (crudo as { modo?: unknown }).modo;
    return modo === "offline" || modo === "cloud" ? modo : undefined;
  } catch {
    return undefined;
  }
}

/** Un `.xonecode/config.json` con `modo: "offline"` en el cwd. Lo que no se pueda leer no
 *  es un proyecto offline: no se afirma sobre lo que no se sabe. */
function esProyectoOffline(cwd: string): boolean {
  return modoDeProyecto(cwd) === "offline";
}

/**
 * La espera por omisión: hasta que alguien interrumpa. Sin ella `arrancarConsolaWeb`
 * devolvería en cuanto el servidor está en pie, y `bin.ts` hace `process.exit(codigo)` —
 * o sea que el servidor recién levantado moriría antes de servir una sola petición.
 */
function esperarInterrupcion(): Promise<void> {
  return new Promise<void>((resolver) => {
    process.once("SIGINT", () => resolver());
    process.once("SIGTERM", () => resolver());
  });
}

/** El vestíbulo con todas sus piezas reales. Se construye DESPUÉS del servidor porque el
 *  callback de OAuth necesita saber a qué URL devolver al navegador. */
function vestibuloReal(
  opciones: OpcionesDeArranque,
  servidor: ServidorWeb,
  escribir: (texto: string) => void,
  informar: (texto: string) => void
): Vestibulo {
  // Lo PRIMERO, antes de leer nada de disco: si esto va a fallar, que falle sin haber
  // aplicado credenciales al proceso ni construido medio vestíbulo.
  const ejecutor = banderaDeEjecutor(opciones);
  const cargado = cargar(opciones.cwd);
  aplicarAuth(cargado.auth);
  const fuentes: FuentesDeEleccion = {
    global: cargado.config.global,
    entorno: { XONECODE_MODELO: process.env.XONECODE_MODELO },
  };
  const settings = cargarSettings().settings;
  const dependenciasDeProyecto = opciones.dependenciasDeProyecto;
  return crearVestibulo({
    informar,
    origenDeTrabajo: resolver(fuentes).trabajo.origen,
    fuentes,
    // Se resuelve UNA vez, aquí, y no en cada `anunciarAlta`: `git config`/`os.userInfo`
    // no cambian a media conexión, y repetir el subproceso en cada anuncio del alta sería
    // gastar sin motivo. Nunca viaja hacia CloudStudio ni hacia ningún acto —
    // `agent/persona.ts` lo documenta—.
    nombre: nombreDePersona(opciones.cwd),
    catalogoModelos: new CatalogoModelos(),
    guardarCredencial,
    aplicarCredencial: aplicarCredencialAlProceso,
    // Los proveedores que YA tienen clave no se vuelven a pedir. Sin esto la omisión del
    // vestíbulo es `false` para todos —la dirección segura, pero molesta— y el asistente
    // pediría de nuevo una credencial que está escrita.
    hayCredencial: (proveedor) => hayCredencial(proveedor, opciones.cwd),
    guardarEntorno: (entorno: Entorno) => guardarEntornoEnDisco(undefined, entorno),
    guardarModeloGlobal,
    guardarConfigDeProyecto: escribirProyectoEnDisco,
    // El «antes» de cada sesión: se fotografía al abrir el proyecto y se nombra cuando la
    // sesión tiene id. Ver `agent/sesionGit.ts` para por qué es una ref y no un tag.
    marcarSesion: fotoDeApertura,
    // Lo que ya había sin commitear al abrir, para poder decirlo. Comparte el hueco
    // declarado de `marcarSesion`: esta composición vive en un cierre que `vestibuloReal`
    // no expone y que ningún test construye —lee el `settings.json` REAL del usuario—, así
    // que lo que está probado es que el vestíbulo la usa por las dos puertas, no que aquí
    // siga puesta.
    sinCommitear: trabajoSinCommitear,
    olvidarMarcaDeSesion: olvidarSesion,
    // La memoria del agente por hilo. `historica` deja de ser «se reabrió» para ser «no hay
    // checkpoint que cargar», y borrar una sesión se lleva también su checkpoint.
    hayMemoriaDeHilo: async (raiz, hilo) => hayCheckpoint(crearCheckpointerDeProyecto(raiz), hilo),
    olvidarMemoriaDeHilo: async (raiz, hilo) => olvidarHilo(crearCheckpointerDeProyecto(raiz), hilo),
    entornos: settings.entornos,
    ...(settings.workspace === undefined ? {} : { baseDeWorkspace: settings.workspace }),
    // La URL de la web para que la página del callback devuelva AQUÍ y no diga «vuelve a
    // la terminal», que en un navegador es falso.
    ...conexionDeVestibulo(servidor.url),
    // La descarga es la de siempre, la del `/sync bajar` del proyecto ya dado de alta:
    // `completarProyecto` escribe el `config.json` ENTERO antes de llamar aquí, así que el
    // sincronizador lee del disco exactamente lo que leería después. Nada de la
    // sincronización se toca ni se duplica.
    descargar: async ({ raiz }) => {
      const sincronizar = dependenciasDeProyecto?.(raiz).sincronizar;
      // Un `return` a secas aquí sería el no-op silencioso que este repo evita en todas
      // partes: el alta quedaría escrita y el usuario creyendo que su proyecto está bajado.
      if (sincronizar === undefined) {
        throw new Error("esta consola web se montó sin `dependenciasDeProyecto`: no hay con qué descargar");
      }
      const bajada = await sincronizar("bajar", raiz, undefined, escribir);
      if (bajada.tipo === "texto") {
        escribir(bajada.texto);
        return;
      }
      // El árbol sucio para la copia local. Bajar SOBRESCRIBE el disco, así que se dice
      // qué hay y no se baja nada — igual que en el alta de terminal.
      throw new Error(
        `hay trabajo local sin commitear (${bajada.pendientes.join(", ")}); la descarga sobrescribe el disco`
      );
    },
    // Sin `crearEjecutor` el vestíbulo cae en `ejecutarTurnoGuionizado` — el agente de
    // PEGA— y no habría forma de notarlo desde el navegador: los turnos correrían, las
    // fases se pintarían y nada de lo que dijera sería de un modelo. Se exige, igual que
    // `descargar` exige su sincronizador. `--guion` es la única forma de pedir el de pega,
    // y ahí se pide a propósito.
    ...ejecutor,
    ...(dependenciasDeProyecto === undefined ? {} : { dependenciasDeProyecto }),
  });
}

/**
 * O el ejecutor real, o el de pega PEDIDO con `--guion`, o un error. Lo que no hay es una
 * tercera opción muda.
 */
function banderaDeEjecutor(opciones: OpcionesDeArranque): Pick<OpcionesDelVestibulo, "crearEjecutor"> {
  if (opciones.guion === true) return {};
  if (opciones.crearEjecutor === undefined) {
    throw new Error(
      "esta consola web se montó sin `crearEjecutor`: correría el agente de pega sin decirlo (usa --guion si es lo que quieres)"
    );
  }
  return { crearEjecutor: opciones.crearEjecutor };
}

/** Los pasos, reexportados para quien monte otra piel sobre el mismo vestíbulo. */
export type { OpcionDeEntorno, PasoDelVestibulo };
