/**
 * EJECUTAR un paso de una receta de instalación, con su salida en vivo.
 *
 * La receta (`core/dispositivos.ts`) se lee y se copia; esto es la fase que la EJECUTA, y
 * solo para los pasos que se pueden cumplir. El criterio era «lo que no puede pedir
 * ENTRADA», y **se afinó midiendo**: lo que descalifica un paso no es que pueda pedir una
 * contraseña, es que pueda quedarse COLGADO pidiéndola.
 *
 * Medido el 10-09-2026, y con la forma EXACTA con que este módulo lanza (`detached: true` y
 * los tres `stdio` en `pipe`): `sudo` lee la contraseña de `/dev/tty` y no de `stdin`, así que
 * un hijo sin terminal de control **falla en 26 ms** con «a terminal is required to read the
 * password». Lo que lo salva no es cerrar `stdin` —hace falta abierto para `sdkmanager`— sino
 * no tener terminal de control, y con `detached` no lo hereda. O sea que el modo de fallo de un `brew` que
 * pidiera contraseña no es un botón colgado —el miedo que dejó los pasos 1 y 2 sin botón—:
 * es un botón que en dos segundos dice qué hace falta. Con eso:
 *
 * - **`brew` entra en la tabla**, y era el paso que faltaba: los pasos 2 y 3 necesitan
 *   `sdkmanager`, que es justo lo que instala el 1, así que en una máquina nueva la receta
 *   entera no tenía un solo botón vivo. Además, medido: `openjdk@17` es una fórmula y
 *   `android-commandlinetools` un Generic Artifact, así que ninguno instala fuera del
 *   prefijo de Homebrew y en la práctica no piden nada. Se le pasa `NONINTERACTIVE` y
 *   `HOMEBREW_NO_AUTO_UPDATE` para que tampoco pregunte ni se ponga a actualizarse.
 * - **`sdkmanager` y `avdmanager` siguen**: lo único que preguntan son las licencias y el
 *   perfil de hardware, y las dos respuestas se alimentan por `stdin`.
 * - **Lo que sigue fuera** son los `export` del `~/.zshrc` —escribir en la shell de alguien
 *   es lo único de esto que no sabríamos deshacer, y desde que dejaron de ser un paso ya no
 *   se ofrecen ni para copiar desde aquí: van en `Receta.aparte`— y los de la receta de iOS: un `sudo` escrito en
 *   el comando fallaría SIEMPRE, y `xcodebuild -downloadPlatform` pide autorización en una
 *   VENTANA del sistema, que no falla rápido ni se contesta por `stdin`.
 *
 * Y son justo los pasos LARGOS —2-3 GB—, que es donde un botón mudo se lee como que se ha
 * colgado: de ahí que esto emita cada línea en cuanto sale, en vez de devolver al final.
 *
 * **Las rutas se resuelven AQUÍ y no viajan.** El hijo necesita `ANDROID_HOME` y `JAVA_HOME`,
 * que son rutas de la máquina; van en su entorno, que no sale del host. Por el cable viaja
 * el NOMBRE de la receta y el número del paso — nunca un comando ni un binario, que sería
 * una shell abierta en la máquina del usuario.
 *
 * **Y se mata el GRUPO, no el hijo.** Medido: un padre que deja un nieto vivo (`brew` →
 * `curl`, `sdkmanager` → `java`) sobrevive a `child.kill()` — el nieto seguía descargando
 * después de cancelar. Con `detached: true` el hijo es líder de su grupo y `kill(-pid)` se
 * lo lleva entero.
 *
 * **El coste de `detached`, declarado**: el hijo sale del grupo de procesos del servidor, así
 * que un Ctrl-C en la consola web ya NO se lleva la descarga por delante — antes moría con el
 * padre y ahora sigue. No se arregla aquí porque no es un fallo de este módulo: es que nadie
 * cancela el trabajo en curso al apagar el servidor. Y el otro lado sería peor: sin
 * `detached`, «Cancelar» dejaba el nieto descargando 3 GB sin forma de pararlo desde la
 * ventana. Mientras eso no se cablee, la salida es `brew`/`sdkmanager` acabando solos, que es
 * lo que harían en un terminal.
 */
import { join, relative } from "node:path";
import { constants, existsSync, readFileSync, writeFileSync } from "node:fs";
import { cp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { jdkDeLaMaquina, localizadorDeAndroid, pathConCarpetas, unirRuta } from "./dispositivosEnMaquina.js";
import {
  crearEjecutor,
  lanzarReal,
  TOPE_DE_TRABAJO_MS,
  TOPE_SIN_SALIDA_MS,
  type FinDeProceso,
  type Lanzar,
  type ProcesoHijo,
} from "./procesosEnMaquina.js";
import { descargarYDescomprimir } from "./descargaDeHerramientas.js";
import { motivoDeNombreDeAvdInaceptable } from "../../core/puertosDeAvd.js";
import { hardwareIniDeClon, iniDeClon, leerIni, paqueteDeImagen, perfilDeTelefono, seCopiaEnClon } from "../../core/copiaDeAvd.js";

/**
 * Y esto se REEXPORTA: lo que este módulo exportaba antes de que existiera el ejecutor
 * compartido lo sigue exportando, pero ahora hay UNA sola copia —el `spawn` con `detached`, los
 * dos topes y el hijo—, y la comparten la receta y el lanzamiento en el dispositivo
 * (`procesosEnMaquina.ts`). Un segundo `spawn` allí era un segundo sitio donde el `detached`
 * podía dejar de estar.
 */
export { lanzarReal, TOPE_DE_TRABAJO_MS, TOPE_SIN_SALIDA_MS, type Lanzar, type ProcesoHijo };

/** El paquete de la imagen del sistema en macOS, el mismo que nombra la receta. */
const IMAGEN_DARWIN = "system-images;android-35;google_apis;arm64-v8a";
/** Y en Windows: el caso común es x86_64, no Apple Silicon. Mismo motivo que en `core/dispositivos.ts`. */
const IMAGEN_WIN32 = "system-images;android-35;google_apis;x86_64";

/** Una llamada a un proceso dentro de un paso. Un paso puede ser varias, en orden. */
interface Invocacion {
  args: string[];
  /** Lo que se le escribe por `stdin`; sin TTY, un prompt sin respuesta cuelga el proceso. */
  teclear: string[];
  /** Cuántas veces se repite el tecleo. Las licencias del SDK son una pregunta por licencia. */
  repetir?: number;
  /**
   * Un fallo aquí NO corta el paso. Hoy solo las licencias: si ya estaban aceptadas,
   * `--licenses` puede salir con código distinto de cero y la instalación funciona igual.
   */
  opcional?: boolean;
  /** Lo que se dice en el log antes de lanzarla, si hay algo que declarar. */
  anuncio?: string;
}

/**
 * Lo que hace falta para lanzar un paso: o un PROCESO (lo que ya había: un binario, con qué
 * llamadas y qué se le teclea) o una DESCARGA (nueva, para Windows: adb/JDK/cmdline-tools no
 * tienen un Homebrew equivalente que los instale de un tirón, así que se bajan de una URL
 * fijada y se descomprimen). Las dos comparten el mismo resultado final
 * (`"ok"|"fallo"|"cancelada"|"colgada"`), así que `correrPasoDeReceta` las trata como la
 * MISMA cosa de cara a quien pregunta por el cable.
 */
type PasoEjecutable = PasoDeProceso | PasoDeDescarga;

interface PasoDeProceso {
  tipo: "proceso";
  /** El binario, por nombre. Tabla cerrada: del cliente llega un NÚMERO, nunca un comando. */
  binario: "sdkmanager" | "avdmanager" | "brew";
  /**
   * ¿Necesita el SDK de Android y un JDK?
   *
   * El paso que los INSTALA no puede exigirlos —era el `if` que dejaba al paso 1 sin poder
   * existir— así que esto es lo que separa «lánzalo dentro del SDK, con su entorno» de
   * «búscalo en el PATH y lánzalo a secas».
   */
  conSdk: boolean;
  /** Dentro del SDK, si no está en el PATH. Solo con `conSdk`. */
  subcarpeta?: string;
  invocaciones: Invocacion[];
  /** Variables extra para el hijo, encima de las del entorno. */
  entornoExtra?: Record<string, string>;
  /** Qué se enseña como título del trabajo. */
  titulo: string;
}

interface PasoDeDescarga {
  tipo: "descarga";
  url: string;
  /** Dónde cae, relativo a `%LOCALAPPDATA%` — la única raíz que Windows garantiza y que
   *  `RAICES_DE_SDK_POR_OMISION.win32` ya usa para el SDK. */
  destinoBajoLocalAppData: string[];
  /** Ver `descargaDeHerramientas.ts#OpcionesDeDescarga`. */
  renombrarCarpetaUnicaA?: string;
  titulo: string;
}

/**
 * El paso que crea un AVD. Una función y no dos literales: la receta crea `pixel8`, Ajustes el
 * que se le diga, y la invocación (imagen, perfil, respuesta por `stdin`) tiene que ser LA MISMA.
 * El título de `pixel8` se conserva tal cual; con otro nombre lo lleva detrás.
 */
function pasoDeCrearAvd(nombre: string, imagen: string, perfil = "pixel_8"): PasoDeProceso {
  return {
    tipo: "proceso",
    binario: "avdmanager",
    conSdk: true,
    subcarpeta: join("cmdline-tools", "latest", "bin"),
    invocaciones: [
      // «Do you wish to create a custom hardware profile? [no]»: sin respuesta, cuelga.
      { args: ["create", "avd", "-n", nombre, "-k", imagen, "-d", perfil], teclear: ["no\n"] },
    ],
    titulo: nombre === "pixel8" ? "Creando el dispositivo virtual" : `Creando el dispositivo virtual ${nombre}`,
  };
}

/**
 * Los pasos que xonecode lanza él. Tabla CERRADA y por `receta:plataforma:paso`: lo que
 * llega del cliente es un número, y un número que no esté aquí no lanza nada.
 *
 * **La PLATAFORMA es parte de la clave**, y no un detalle: los pasos 1-3 de Windows
 * (descargas) y los 1-3 de macOS (Homebrew) son acciones completamente distintas bajo el
 * MISMO número — sin la plataforma en la clave, la entrada de una pisaría a la otra en este
 * mapa, o habría que inventar números que no significan nada en la receta que se enseña.
 *
 * Tiene que coincidir con lo que `core/dispositivos.ts` marca `ejecutable` — un paso con
 * botón que no esté aquí es un botón muerto, y uno lanzable sin botón es una capacidad que
 * nadie puede usar. Lo ata un test que compara las dos listas.
 */
export const PASOS_EJECUTABLES = new Map<string, PasoEjecutable>([
  [
    "android-emulador:darwin:1",
    {
      tipo: "proceso",
      binario: "brew",
      // Es el paso que INSTALA el SDK: exigirlo aquí era el círculo que lo dejaba sin botón.
      conSdk: false,
      invocaciones: [
        { args: ["install", "openjdk@17"], teclear: [] },
        { args: ["install", "--cask", "android-commandlinetools", "android-platform-tools"], teclear: [] },
      ],
      // `NONINTERACTIVE` para que no pregunte nada, y sin auto-update para no gastar
      // minutos actualizando Homebrew antes de instalar lo que se le pidió.
      entornoExtra: { NONINTERACTIVE: "1", HOMEBREW_NO_AUTO_UPDATE: "1", HOMEBREW_NO_ENV_HINTS: "1" },
      titulo: "Instalando el JDK y el SDK de línea de comandos",
    },
  ],
  [
    // El 2 desde que los `export` de la shell dejaron de ser un paso: la tabla va por NÚMERO,
    // así que renumerar la receta es renumerar esto — y el test que compara las dos listas
    // en las dos direcciones es lo que hace que no se pueda quedar descolgada en silencio.
    "android-emulador:darwin:2",
    {
      tipo: "proceso",
      binario: "sdkmanager",
      conSdk: true,
      subcarpeta: join("cmdline-tools", "latest", "bin"),
      invocaciones: [
        {
          // Las licencias PRIMERO y en su propio proceso: `sdkmanager --install` pregunta por
          // las que falten y sin TTY se queda esperando. Aceptarlas es la decisión que el
          // usuario tomó al pulsar, y se DICE en el log para que quede constancia.
          args: ["--licenses"],
          teclear: ["y\n"],
          repetir: 100,
          opcional: true,
          anuncio: "Aceptando las licencias del SDK de Android (lo pediste al pulsar).",
        },
        {
          // `platform-tools` va AQUÍ y no es un extra: **el emulador se niega a arrancar si la
          // raíz del SDK no los tiene dentro**, y el cask `android-commandlinetools` no los
          // trae. El porqué medido está en `core/dispositivos.ts`, donde el comando se ENSEÑA;
          // esta es la copia que se LANZA, y por eso hay un test que compara las dos: la lista
          // de paquetes está escrita dos veces y sin él podrían divergir en silencio, con el
          // botón instalando una cosa y la ventana enseñando otra.
          args: ["--install", "platform-tools", "emulator", "platforms;android-35", IMAGEN_DARWIN],
          teclear: [],
        },
      ],
      titulo: "Descargando el emulador y la imagen del sistema",
    },
  ],
  [
    "android-emulador:darwin:3",
    pasoDeCrearAvd("pixel8", IMAGEN_DARWIN),
  ],
  [
    "android-emulador:win32:1",
    {
      tipo: "descarga",
      url: "https://dl.google.com/android/repository/platform-tools-latest-windows.zip",
      // El zip ya trae `platform-tools/` como carpeta de primer nivel: cae DIRECTO bajo el
      // SDK, sin renombrar nada — a diferencia de los dos pasos siguientes.
      destinoBajoLocalAppData: ["Android", "Sdk"],
      titulo: "Descargando adb (platform-tools)",
    },
  ],
  [
    "android-emulador:win32:2",
    {
      tipo: "descarga",
      url: "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse",
      destinoBajoLocalAppData: ["Android"],
      // El zip de Adoptium trae UNA carpeta con la versión en el nombre (`jdk-17.0.20.1+1`),
      // que cambia en cada build: se renombra a una ruta FIJA para que la detección
      // (`dispositivosEnMaquina.ts#jdkDeLaMaquina`) compruebe un sitio conocido.
      renombrarCarpetaUnicaA: "jdk17",
      titulo: "Descargando el JDK",
    },
  ],
  [
    "android-emulador:win32:3",
    {
      tipo: "descarga",
      url: "https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip",
      destinoBajoLocalAppData: ["Android", "Sdk", "cmdline-tools"],
      // El zip trae una carpeta `cmdline-tools/` de primer nivel; Google exige que su
      // contenido viva bajo `…/cmdline-tools/latest/`, o `sdkmanager` no se reconoce a sí
      // mismo. Mismo mecanismo que el JDK: se renombra AL escribir, sin un paso aparte.
      renombrarCarpetaUnicaA: "latest",
      titulo: "Descargando las herramientas del SDK",
    },
  ],
  [
    "android-emulador:win32:4",
    {
      tipo: "proceso",
      binario: "sdkmanager",
      conSdk: true,
      subcarpeta: join("cmdline-tools", "latest", "bin"),
      invocaciones: [
        {
          args: ["--licenses"],
          teclear: ["y\n"],
          repetir: 100,
          opcional: true,
          anuncio: "Aceptando las licencias del SDK de Android (lo pediste al pulsar).",
        },
        {
          // Misma lista de paquetes que en macOS, con la imagen de Windows: ver el
          // comentario del paso equivalente de macOS, arriba.
          args: ["--install", "platform-tools", "emulator", "platforms;android-35", IMAGEN_WIN32],
          teclear: [],
        },
      ],
      titulo: "Descargando el emulador y la imagen del sistema",
    },
  ],
  [
    "android-emulador:win32:5",
    pasoDeCrearAvd("pixel8", IMAGEN_WIN32),
  ],
]);

/**
 * Los dos topes —el del silencio, 5 min, y el total, 60— viven con el ejecutor
 * (`procesosEnMaquina.ts`), que es quien los arma: son la misma regla sobre el mismo tipo de
 * proceso, y aquí se reexportan. **El silencio es el síntoma, no la lentitud**: mientras el
 * hijo diga algo se le espera lo que haga falta; lo que no es normal es que se calle, y eso es
 * un prompt esperando a alguien que no está.
 */

export interface ResultadoDeTrabajo {
  estado: "ok" | "fallo" | "cancelada" | "colgada";
  /** Una línea, nunca la salida entera. Ausente si fue bien. */
  motivo?: string;
  ms: number;
}

export interface Trabajo {
  titulo: string;
  cancelar: () => void;
  terminado: Promise<ResultadoDeTrabajo>;
}

export interface DependenciasDeInstalacion {
  plataforma?: string;
  entorno?: Record<string, string | undefined>;
  home?: string;
  existe?: (ruta: string) => boolean;
  lanzar?: Lanzar;
  /** Cada línea de salida, en cuanto sale. Es lo único que hace usable un paso de 3 GB. */
  alSalirLinea?: (linea: string) => void;
  ahora?: () => number;
  /**
   * Matar un GRUPO de procesos. Entra por parámetro porque el real es `process.kill(-pid)`,
   * y un test que lo llamara de verdad mataría el grupo de quien corre `npm test`.
   */
  matarGrupo?: (pid: number, senal: string) => void;
  /** Solo para los pasos `tipo: "descarga"` — ver `descargaDeHerramientas.ts`. `npm test`
   *  nunca toca la red real: sin esto un test de un paso de Windows la tocaría. */
  fetch?: typeof fetch;
  crearCarpeta?: (ruta: string) => void;
  escribir?: (ruta: string, datos: Uint8Array) => void;
  /**
   * Copiar una carpeta entera filtrando por ruta ABSOLUTA de origen (`clonarAvd`). Entra por
   * parámetro para que un test vea la cancelación sin una carpeta de gigas de por medio.
   */
  copiarCarpeta?: (origen: string, destino: string, filtro: (ruta: string) => boolean) => Promise<void>;
}

/**
 * Lanza el paso `numero` de la receta `receta`, y devuelve el trabajo en curso.
 *
 * Nunca lanza: todo lo que puede ir mal —el paso no es ejecutable, falta el SDK, el proceso
 * no arranca— vuelve como un `ResultadoDeTrabajo` con su motivo de UNA línea. Quien lo llama
 * está atendiendo una petición del navegador y no puede recibir una excepción por algo que
 * es una respuesta.
 */
export function correrPasoDeReceta(
  receta: string,
  numero: number,
  deps: DependenciasDeInstalacion = {}
): Trabajo {
  const plataforma = deps.plataforma ?? process.platform;

  const paso = PASOS_EJECUTABLES.get(`${receta}:${plataforma}:${numero}`);
  if (paso === undefined) {
    return {
      titulo: "",
      cancelar: () => {},
      terminado: Promise.resolve({ estado: "fallo", motivo: "ese paso no se lanza desde aquí", ms: 0 }),
    };
  }
  return correrPaso(paso, deps);
}

const IMAGEN_POR_PLATAFORMA: Partial<Record<string, string>> = { darwin: IMAGEN_DARWIN, win32: IMAGEN_WIN32 };

/** La raíz de los AVD: `ANDROID_AVD_HOME` si está puesta, si no `<casa>/.android/avd` (como el emulador). */
function raizDeAvds(deps: DependenciasDeInstalacion): string {
  const propia = (deps.entorno ?? process.env)["ANDROID_AVD_HOME"];
  return propia !== undefined && propia !== "" ? propia : join(deps.home ?? homedir(), ".android", "avd");
}

function trabajoTerminado(motivo: string): Trabajo {
  return {
    titulo: "",
    cancelar: () => {},
    terminado: Promise.resolve({ estado: "fallo", motivo, ms: 0 }),
  };
}

/**
 * Crear un AVD con nombre, por el mismo corredor que la receta (topes, stdin, SDK). Nunca lanza.
 *
 * Con `base` es el modo CONFIGURACIÓN: la imagen y el perfil salen del `config.ini` de la base
 * (`avdmanager` los pide), y al acabar BIEN se le pone encima ese mismo `config.ini` para que
 * herede RAM, disco y el resto. El AVD nuevo arranca vacío; vale con la base encendida.
 */
export function crearAvd(nombre: string, deps: DependenciasDeInstalacion = {}, opciones: { base?: string } = {}): Trabajo {
  const motivo = motivoDeNombreDeAvdInaceptable(nombre, []);
  if (motivo !== undefined) return trabajoTerminado(motivo);
  // La misma guarda con base y sin ella: sin paso de crear en esta plataforma, no se lanza nada.
  const imagenPorOmision = IMAGEN_POR_PLATAFORMA[deps.plataforma ?? process.platform];
  if (imagenPorOmision === undefined) return trabajoTerminado("crear emuladores no se lanza desde aquí en esta máquina");
  if (opciones.base === undefined) return correrPaso(pasoDeCrearAvd(nombre, imagenPorOmision), deps);
  const base = opciones.base;
  // La base acaba siendo una ruta: pasa por la misma regla de forma que el nombre (sin `..` ni barras).
  const malaBase = motivoDeNombreDeAvdInaceptable(base, []);
  if (malaBase !== undefined) return trabajoTerminado(`la base no vale: ${malaBase}`);
  const carpetaBase = join(raizDeAvds(deps), `${base}.avd`);
  let configBase: string;
  try {
    configBase = readFileSync(join(carpetaBase, "config.ini"), "utf8");
  } catch (e) {
    return trabajoTerminado(`no se pudo leer la configuración de ${base} (${codigoDe(e)})`);
  }
  const config = leerIni(configBase);
  const imagen = paqueteDeImagen(config);
  if (imagen === undefined) return trabajoTerminado(`${base} no dice qué imagen de sistema usa (image.sysdir.1)`);
  const perfil = perfilDeTelefono(config);
  if (perfil === undefined) return trabajoTerminado(`${base} no dice qué perfil de teléfono usa (hw.device.name)`);
  const trabajo = correrPaso(pasoDeCrearAvd(nombre, imagen, perfil), deps);
  return {
    ...trabajo,
    terminado: trabajo.terminado.then((r) => {
      if (r.estado !== "ok") return r;
      try {
        deps.alSalirLinea?.(`Copiando la configuración de ${base}`);
        writeFileSync(join(raizDeAvds(deps), `${nombre}.avd`, "config.ini"), configBase);
        return r;
      } catch (e) {
        return { estado: "fallo" as const, motivo: `se creó ${nombre} pero no se le pudo copiar la configuración (${codigoDe(e)})`, ms: r.ms };
      }
    }),
  };
}

/**
 * Eliminar un AVD por su nombre, por el MISMO corredor que crear (topes, SDK, `JAVA_HOME`):
 * `avdmanager delete avd -n <nombre>` borra la carpeta y el `.ini`, y no toca la imagen del sistema
 * ni los demás. El nombre acaba en un argumento, así que pasa por la regla de forma de siempre
 * (sin `..` ni barras). Nunca lanza. Que sea el último, o que esté en marcha, lo decide quien llama
 * (la última medida): aquí solo se ve el disco.
 */
export function borrarAvd(nombre: string, deps: DependenciasDeInstalacion = {}): Trabajo {
  const motivo = motivoDeNombreDeAvdInaceptable(nombre, []);
  if (motivo !== undefined) return trabajoTerminado(motivo);
  return correrPaso(
    {
      tipo: "proceso",
      binario: "avdmanager",
      conSdk: true,
      subcarpeta: join("cmdline-tools", "latest", "bin"),
      invocaciones: [{ args: ["delete", "avd", "-n", nombre], teclear: [] }],
      titulo: `Eliminando el dispositivo virtual ${nombre}`,
    },
    deps,
  );
}

/** De un error de Node solo el `code`: su mensaje lleva la ruta absoluta (nada de rutas por el cable). */
function codigoDe(e: unknown): string {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === "string" ? c : "error";
}

/** Bytes de lo que SÍ se copiaría, para decirlo antes de empezar (un AVD con datos son gigas). Asíncrono: no bloquea el servidor. */
async function tamanoDeLoQueSeCopia(carpeta: string, filtro: (ruta: string) => boolean): Promise<number> {
  let total = 0;
  const recorrer = async (dir: string): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const ruta = join(dir, e.name);
      if (!filtro(ruta)) continue;
      if (e.isDirectory()) await recorrer(ruta);
      else if (e.isFile()) total += (await stat(ruta)).size;
    }
  };
  await recorrer(carpeta);
  return total;
}

function enTexto(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

/**
 * Modo CLON: copia la carpeta del AVD `base` a `nombre` (lo instalado incluido), sin lo que
 * `seCopiaEnClon` excluye, y SOLO al acabar bien escribe `<nombre>.ini` —un AVD sin `.ini` no
 * existe para el emulador, así que una copia a medias nunca aparece en la lista—. Un fallo o una
 * cancelación BORRAN la carpeta a medias. Nunca lanza. `snapshots/` viaja con la identidad reescrita
 * (`core/copiaDeAvd.ts`): sin ella un clon pierde lo que el original aún no había volcado al disco. La base tiene que estar apagada: lo comprueba
 * quien llama (la medida de dispositivos), aquí solo se ve el disco.
 */
export function clonarAvd(base: string, nombre: string, deps: DependenciasDeInstalacion = {}): Trabajo {
  const titulo = `Clonando el dispositivo virtual ${base} como ${nombre}`;
  const ahora = deps.ahora ?? (() => Date.now());
  const t0 = ahora();
  const decir = (linea: string): void => deps.alSalirLinea?.(linea);
  const termina = (estado: ResultadoDeTrabajo["estado"], motivo?: string): ResultadoDeTrabajo => ({
    estado,
    ...(motivo === undefined ? {} : { motivo }),
    ms: ahora() - t0,
  });
  const fallo = (motivo: string): Trabajo => ({
    titulo,
    cancelar: () => {},
    terminado: Promise.resolve(termina("fallo", motivo)),
  });

  const malNombre = motivoDeNombreDeAvdInaceptable(nombre, []);
  if (malNombre !== undefined) return fallo(malNombre);
  const malaBase = motivoDeNombreDeAvdInaceptable(base, []);
  if (malaBase !== undefined) return fallo(`la base no vale: ${malaBase}`);
  if (base === nombre) return fallo("el clon no puede llamarse como su base");

  const raiz = raizDeAvds(deps);
  const origen = join(raiz, `${base}.avd`);
  const destino = join(raiz, `${nombre}.avd`);
  const iniOrigen = join(raiz, `${base}.ini`);
  const iniDestino = join(raiz, `${nombre}.ini`);
  const existe = deps.existe ?? existsSync;
  if (!existe(origen) || !existe(iniOrigen)) return fallo(`${base} no existe en disco`);
  if (existe(destino) || existe(iniDestino)) return fallo(`${nombre} ya existe`);

  let cancelado = false;
  // Cancelar corta por el filtro: `fs.cp` no admite señal, y lanzar desde el filtro lo aborta.
  const CANCELADO = new Error("cancelado");
  const filtro = (ruta: string): boolean => {
    if (cancelado) throw CANCELADO;
    return seCopiaEnClon(relative(origen, ruta));
  };
  const copiar =
    deps.copiarCarpeta ??
    // COPYFILE_FICLONE: en APFS el clon es instantáneo y no gasta disco; donde no se puede, copia normal.
    ((o: string, d: string, f: (r: string) => boolean) =>
      cp(o, d, { recursive: true, filter: f, mode: constants.COPYFILE_FICLONE }));

  const terminado = (async (): Promise<ResultadoDeTrabajo> => {
    try {
      try {
        decir(`Se copiarán ${enTexto(await tamanoDeLoQueSeCopia(origen, (r) => seCopiaEnClon(relative(origen, r))))} de ${base}`);
      } catch {
        // El tamaño es un dato de cortesía: no poder medirlo no impide clonar.
      }
      decir("Copiando lo instalado, la configuración y la instantánea…");
      await copiar(origen, destino, filtro);
      if (cancelado) throw CANCELADO;
      // Las instantáneas llevan la identidad del original: sin reescribirla el emulador las rechaza.
      const instantaneas = join(destino, "snapshots");
      if (existe(instantaneas)) {
        for (const e of await readdir(instantaneas, { withFileTypes: true })) {
          if (!e.isDirectory()) continue;
          const hw = join(instantaneas, e.name, "hardware.ini");
          if (!existe(hw)) continue;
          await writeFile(hw, hardwareIniDeClon(await readFile(hw, "utf8"), base, nombre));
        }
      }
      decir("Registrando el dispositivo nuevo");
      const ini = readFileSync(iniOrigen, "utf8");
      await writeFile(iniDestino, iniDeClon(ini, nombre, destino), { flag: "wx" });
      decir("Listo.");
      return termina("ok");
    } catch (e) {
      await rm(destino, { recursive: true, force: true }).catch(() => {});
      if (cancelado || e === CANCELADO) return termina("cancelada");
      return termina("fallo", `no se pudo clonar ${base} (${codigoDe(e)})`);
    }
  })();

  return { titulo, cancelar: () => void (cancelado = true), terminado };
}

/** El cuerpo común: resolver el entorno y correr las invocaciones de un paso ya elegido. */
function correrPaso(paso: PasoEjecutable, deps: DependenciasDeInstalacion): Trabajo {
  const plataforma = deps.plataforma ?? process.platform;
  const entorno = deps.entorno ?? process.env;
  const home = deps.home ?? homedir();
  const existe = deps.existe ?? existsSync;
  const ahora = deps.ahora ?? (() => Date.now());
  const t0 = ahora();
  const decir = (linea: string): void => deps.alSalirLinea?.(linea);

  // La DESCARGA es un camino aparte y mucho más corto: no hay binario que resolver ni SDK que
  // exigir, solo dónde cae. `descargaDeHerramientas.ts` ya devuelve el MISMO vocabulario
  // (`"ok"|"fallo"|"cancelada"|"colgada"`), así que de aquí para afuera esto es indistinguible
  // de un paso de proceso — ni el cable ni `Receta.tsx` se enteran de que detrás hay un
  // `fetch` y no un `spawn`.
  if (paso.tipo === "descarga") {
    if (entorno.LOCALAPPDATA === undefined) {
      return {
        titulo: paso.titulo,
        cancelar: () => {},
        terminado: Promise.resolve({
          estado: "fallo",
          motivo: "falta %LOCALAPPDATA%: no se sabe dónde descargar",
          ms: ahora() - t0,
        }),
      };
    }
    const destino = join(entorno.LOCALAPPDATA, ...paso.destinoBajoLocalAppData);
    const descarga = descargarYDescomprimir(
      paso.url,
      destino,
      paso.renombrarCarpetaUnicaA === undefined ? {} : { renombrarCarpetaUnicaA: paso.renombrarCarpetaUnicaA },
      {
        alSalirLinea: decir,
        ahora,
        ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
        ...(deps.crearCarpeta === undefined ? {} : { crearCarpeta: deps.crearCarpeta }),
        ...(deps.escribir === undefined ? {} : { escribir: deps.escribir }),
      }
    );
    return { titulo: paso.titulo, cancelar: descarga.cancelar, terminado: descarga.terminado };
  }

  const { enPath, enSdk, raicesDeSdk } = localizadorDeAndroid({ plataforma, entorno, home, existe });
  const fallar = (motivo: string): Trabajo => ({
    titulo: paso.titulo,
    cancelar: () => {},
    terminado: Promise.resolve({ estado: "fallo", motivo, ms: ahora() - t0 }),
  });

  // El entorno del hijo. Con SDK se le montan `ANDROID_HOME` y `JAVA_HOME` y se le añade el
  // SDK al PATH: `avdmanager` llama a `sdkmanager` por su cuenta, y sin eso no se encuentran
  // entre ellos. Sin SDK —el paso que lo instala— basta el entorno de siempre.
  let binario: string | undefined;
  let env: Record<string, string | undefined> = { ...entorno, ...paso.entornoExtra };
  if (paso.conSdk) {
    binario = enSdk(paso.binario, paso.subcarpeta ?? "");
    const sdk = raicesDeSdk.find((raiz) => existe(raiz));
    const jdk = jdkDeLaMaquina(entorno, existe, plataforma);
    if (binario === undefined || sdk === undefined || jdk === undefined) {
      // Se dice QUÉ falta y dónde se arregla, no «no se pudo». En macOS el paso 1 instala
      // las DOS cosas de un tirón (Homebrew); en Windows son pasos distintos —el 2 el JDK,
      // el 3 las cmdline-tools—, así que el número que se dice depende de QUÉ falta y de la
      // plataforma, no de una frase fija.
      const faltaElSdk = binario === undefined || sdk === undefined;
      const que = faltaElSdk ? "el SDK de línea de comandos" : "el JDK";
      const paso = plataforma === "win32" ? (faltaElSdk ? "el paso 3" : "el paso 2") : "el paso 1";
      return fallar(`falta ${que}: hazlo con ${paso} y vuelve a mirar`);
    }
    // Con el separador y el NOMBRE de variable de la plataforma: con `:` a mano, en Windows
    // las dos carpetas se pegaban a la última del `Path` y `avdmanager` no encontraba a
    // `sdkmanager` aunque el SDK estuviera entero.
    const path = pathConCarpetas(
      entorno,
      [unirRuta(plataforma, sdk, "emulator"), unirRuta(plataforma, sdk, "platform-tools")],
      plataforma
    );
    env = {
      ...env,
      ANDROID_HOME: sdk,
      ANDROID_SDK_ROOT: sdk,
      JAVA_HOME: jdk,
      [path.nombre]: path.valor,
    };
  } else {
    binario = enPath(paso.binario);
    if (binario === undefined) {
      return fallar(`falta ${paso.binario}: instálalo y vuelve a mirar`);
    }
  }

  let cancelado = false;
  // El ejecutor es el MISMO de `procesosEnMaquina.ts`, que es el que usa también el lanzamiento
  // en el dispositivo: los topes, el troceado por líneas y el `kill` del GRUPO viven una sola
  // vez. `lanzar` y `matarGrupo` siguen siendo PUERTOS de este módulo, y entran por aquí.
  const ejecutor = crearEjecutor({ lanzar: deps.lanzar, matarGrupo: deps.matarGrupo, entorno });

  const terminado = (async (): Promise<ResultadoDeTrabajo> => {
    let ultimo: ResultadoDeTrabajo = { estado: "ok", ms: ahora() - t0 };
    for (const invocacion of paso.invocaciones) {
      if (cancelado) return { estado: "cancelada", ms: ahora() - t0 };
      if (invocacion.anuncio !== undefined) decir(invocacion.anuncio);
      // Se espera AQUÍ mismo, sin envolver la llamada en una función `async`: el ejecutor
      // resuelve en el CIERRE del hijo, y un `await` de más metería un tick entre el proceso de
      // las licencias y el de la descarga, que son los dos del paso 2 y van encadenados.
      ultimo = unResultado(
        await ejecutor.correr(binario!, invocacion.args, {
          env,
          teclear: invocacion.teclear,
          repetir: invocacion.repetir,
          alSalirLinea: decir,
        })
      );
      // Cancelada y colgada cortan siempre: no se sigue instalando lo que nadie espera.
      if (ultimo.estado === "cancelada" || ultimo.estado === "colgada") return ultimo;
      // Un fallo corta el paso salvo que esa llamada sea opcional (las licencias).
      if (ultimo.estado === "fallo" && invocacion.opcional !== true) return ultimo;
    }
    return { estado: "ok", ms: ahora() - t0 };
  })();

  /**
   * Lo que dijo el ejecutor, en el vocabulario de esta receta. El `ms` se mide desde que empezó
   * el PASO, no desde que arrancó el proceso: lo que la ventana enseña es lo que lleva el paso.
   */
  function unResultado(fin: FinDeProceso): ResultadoDeTrabajo {
    const ms = ahora() - t0;
    if (fin.estado !== "colgada") {
      return { estado: fin.estado, ...(fin.estado === "fallo" ? { motivo: fin.motivo } : {}), ms };
    }
    // Los DOS topes salen con la frase del silencio, que es la que este módulo dice desde
    // siempre: aquí el tope total es la red de seguridad de una descarga que habla, y no hay
    // una medida que pida dos frases. El lanzamiento SÍ las distingue, y por eso el ejecutor
    // devuelve la causa y no la frase.
    return { estado: "colgada", motivo: `no dijo nada en ${Math.round(TOPE_SIN_SALIDA_MS / 60_000)} min`, ms };
  }

  return {
    titulo: paso.titulo,
    cancelar: () => {
      cancelado = true;
      ejecutor.cancelar();
    },
    terminado,
  };
}

