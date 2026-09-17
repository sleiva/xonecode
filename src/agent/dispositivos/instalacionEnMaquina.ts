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
import { join } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { jdkDeLaMaquina, localizadorDeAndroid } from "./dispositivosEnMaquina.js";
import {
  crearEjecutor,
  lanzarReal,
  TOPE_DE_TRABAJO_MS,
  TOPE_SIN_SALIDA_MS,
  type FinDeProceso,
  type Lanzar,
  type ProcesoHijo,
} from "./procesosEnMaquina.js";

/**
 * Y esto se REEXPORTA: lo que este módulo exportaba antes de que existiera el ejecutor
 * compartido lo sigue exportando, pero ahora hay UNA sola copia —el `spawn` con `detached`, los
 * dos topes y el hijo—, y la comparten la receta y el lanzamiento en el dispositivo
 * (`procesosEnMaquina.ts`). Un segundo `spawn` allí era un segundo sitio donde el `detached`
 * podía dejar de estar.
 */
export { lanzarReal, TOPE_DE_TRABAJO_MS, TOPE_SIN_SALIDA_MS, type Lanzar, type ProcesoHijo };

/** El paquete de la imagen del sistema, el mismo que nombra la receta. */
const IMAGEN = "system-images;android-35;google_apis;arm64-v8a";

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

/** Lo que hace falta para lanzar un paso: qué binario, con qué llamadas y qué se le teclea. */
interface PasoEjecutable {
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

/**
 * Los pasos que xonecode lanza él. Tabla CERRADA y por `receta:paso`: lo que llega del
 * cliente es un número, y un número que no esté aquí no lanza nada.
 *
 * Tiene que coincidir con lo que `core/dispositivos.ts` marca `ejecutable` — un paso con
 * botón que no esté aquí es un botón muerto, y uno lanzable sin botón es una capacidad que
 * nadie puede usar. Lo ata un test que compara las dos listas.
 */
export const PASOS_EJECUTABLES = new Map<string, PasoEjecutable>([
  [
    "android-emulador:1",
    {
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
    "android-emulador:2",
    {
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
          args: ["--install", "platform-tools", "emulator", "platforms;android-35", IMAGEN],
          teclear: [],
        },
      ],
      titulo: "Descargando el emulador y la imagen del sistema",
    },
  ],
  [
    "android-emulador:3",
    {
      binario: "avdmanager",
      conSdk: true,
      subcarpeta: join("cmdline-tools", "latest", "bin"),
      invocaciones: [
        // «Do you wish to create a custom hardware profile? [no]»: sin respuesta, cuelga.
        { args: ["create", "avd", "-n", "pixel8", "-k", IMAGEN, "-d", "pixel_8"], teclear: ["no\n"] },
      ],
      titulo: "Creando el dispositivo virtual",
    },
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
  const entorno = deps.entorno ?? process.env;
  const home = deps.home ?? homedir();
  const existe = deps.existe ?? existsSync;
  const ahora = deps.ahora ?? (() => Date.now());
  const t0 = ahora();
  const decir = (linea: string): void => deps.alSalirLinea?.(linea);

  const paso = PASOS_EJECUTABLES.get(`${receta}:${numero}`);
  if (paso === undefined) {
    return {
      titulo: "",
      cancelar: () => {},
      terminado: Promise.resolve({ estado: "fallo", motivo: "ese paso no se lanza desde aquí", ms: 0 }),
    };
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
    const jdk = jdkDeLaMaquina(entorno, existe);
    if (binario === undefined || sdk === undefined || jdk === undefined) {
      // Se dice QUÉ falta y dónde se arregla, no «no se pudo»: el paso 1 es el que lo instala.
      const que = binario === undefined || sdk === undefined ? "el SDK de línea de comandos" : "el JDK";
      return fallar(`falta ${que}: hazlo con el paso 1 y vuelve a mirar`);
    }
    env = {
      ...env,
      ANDROID_HOME: sdk,
      ANDROID_SDK_ROOT: sdk,
      JAVA_HOME: jdk,
      PATH: `${entorno.PATH ?? ""}:${join(sdk, "emulator")}:${join(sdk, "platform-tools")}`,
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

