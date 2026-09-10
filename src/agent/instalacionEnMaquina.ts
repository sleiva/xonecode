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
 * - **`brew` entra en la tabla**, y era el paso que faltaba: los pasos 3 y 4 necesitan
 *   `sdkmanager`, que es justo lo que instala el 1, así que en una máquina nueva la receta
 *   entera no tenía un solo botón vivo. Además, medido: `openjdk@17` es una fórmula y
 *   `android-commandlinetools` un Generic Artifact, así que ninguno instala fuera del
 *   prefijo de Homebrew y en la práctica no piden nada. Se le pasa `NONINTERACTIVE` y
 *   `HOMEBREW_NO_AUTO_UPDATE` para que tampoco pregunte ni se ponga a actualizarse.
 * - **`sdkmanager` y `avdmanager` siguen**: lo único que preguntan son las licencias y el
 *   perfil de hardware, y las dos respuestas se alimentan por `stdin`.
 * - **Lo que sigue fuera** es el paso del `~/.zshrc` —escribir en la shell de alguien es lo
 *   único de esto que no sabríamos deshacer— y los de la receta de iOS: un `sudo` escrito en
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
import { spawn } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { jdkDeLaMaquina, localizadorDeAndroid } from "./dispositivosEnMaquina.js";

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
    "android-emulador:3",
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
        { args: ["--install", "emulator", "platforms;android-35", IMAGEN], teclear: [] },
      ],
      titulo: "Descargando el emulador y la imagen del sistema",
    },
  ],
  [
    "android-emulador:4",
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
 * Cuánto se aguanta SIN una sola línea de salida antes de darlo por colgado.
 *
 * No es un tope de duración: `sdkmanager` habla mientras descarga (porcentajes), así que
 * mientras diga algo se le espera lo que haga falta — una descarga de 3 GB por una línea
 * lenta puede tardar media hora, y matarla por eso sería peor que esperarla. Lo que no es
 * normal es el silencio: eso es un prompt esperando a alguien que no está.
 */
export const TOPE_SIN_SALIDA_MS = 5 * 60_000;
/** Y un tope total, para que un proceso que habla sin avanzar no se quede para siempre. */
export const TOPE_DE_TRABAJO_MS = 60 * 60_000;

/** El hijo, visto por este módulo. Entra por parámetro para poder probarlo sin lanzar nada. */
export interface ProcesoHijo {
  stdout: { on: (evento: "data", cb: (dato: unknown) => void) => void };
  stderr: { on: (evento: "data", cb: (dato: unknown) => void) => void };
  stdin: { write: (texto: string) => void; end: () => void };
  on: (evento: "close" | "error", cb: (valor: never) => void) => void;
  kill: (senal?: string) => boolean;
  /**
   * Con `detached` el hijo es LÍDER de su grupo, y su pid es el del grupo. Es lo que
   * permite matar también a los nietos; ausente, se cae a matar solo al hijo.
   */
  pid?: number;
}

export type Lanzar = (
  binario: string,
  args: string[],
  opciones: { env: Record<string, string | undefined> }
) => ProcesoHijo;

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
  const lanzar = deps.lanzar ?? lanzarReal;
  const ahora = deps.ahora ?? (() => Date.now());
  const matarGrupo = deps.matarGrupo ?? ((pid: number, senal: string) => void process.kill(-pid, senal as NodeJS.Signals));
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
  let colgado = false;
  let ultima = "";
  // Declarado ANTES del lazo: `unProceso` le asigna en cuanto lanza, y el cuerpo de la
  // función asíncrona de abajo corre síncrono hasta el primer `await`. Con el `let` después,
  // esa asignación caía en la zona muerta y el trabajo entero reventaba antes de empezar.
  let matar: (() => void) | undefined;

  const terminado = (async (): Promise<ResultadoDeTrabajo> => {
    let ultimo: ResultadoDeTrabajo = { estado: "ok", ms: ahora() - t0 };
    for (const invocacion of paso.invocaciones) {
      if (cancelado) return { estado: "cancelada", ms: ahora() - t0 };
      if (invocacion.anuncio !== undefined) decir(invocacion.anuncio);
      ultimo = await unProceso(binario!, invocacion, env);
      // Cancelada y colgada cortan siempre: no se sigue instalando lo que nadie espera.
      if (ultimo.estado === "cancelada" || ultimo.estado === "colgada") return ultimo;
      // Un fallo corta el paso salvo que esa llamada sea opcional (las licencias).
      if (ultimo.estado === "fallo" && invocacion.opcional !== true) return ultimo;
    }
    return { estado: "ok", ms: ahora() - t0 };
  })();

  function unProceso(
    bin: string,
    invocacion: Invocacion,
    entornoHijo: Record<string, string | undefined>
  ): Promise<ResultadoDeTrabajo> {
    return new Promise<ResultadoDeTrabajo>((resolver) => {
      let hijo: ProcesoHijo;
      try {
        hijo = lanzar(bin, invocacion.args, { env: entornoHijo });
      } catch (error) {
        resolver({ estado: "fallo", motivo: unaLinea(error), ms: ahora() - t0 });
        return;
      }

      /**
       * Matar el GRUPO y no solo al hijo. Medido: `brew` lanza `curl` y `sdkmanager` lanza
       * `java`, y con `child.kill()` el nieto seguía vivo descargando después de cancelar.
       * Sin pid —los dobles de los tests no lo tienen— se cae a matar al hijo, que es lo que
       * este módulo hacía siempre.
       */
      const matarArbol = (senal: string): void => {
        const pid = hijo.pid;
        if (pid !== undefined) {
          try {
            matarGrupo(pid, senal);
            return;
          } catch {
            // El grupo ya no está o el sistema no deja: se intenta con el hijo.
          }
        }
        hijo.kill(senal);
      };

      let sinSalida: ReturnType<typeof setTimeout>;
      const rearmar = (): void => {
        clearTimeout(sinSalida);
        sinSalida = setTimeout(() => {
          colgado = true;
          matarArbol("SIGKILL");
        }, TOPE_SIN_SALIDA_MS);
      };
      const total = setTimeout(() => {
        colgado = true;
        matarArbol("SIGKILL");
      }, TOPE_DE_TRABAJO_MS);
      rearmar();

      matar = () => matarArbol("SIGTERM");
      if (cancelado) matar();

      // Las líneas se parten aquí: un `data` no es una línea —puede traer media o tres—, y
      // emitir trozos dejaría el log cortado por la mitad en la ventana.
      let resto = "";
      const trocear = (dato: unknown): void => {
        rearmar();
        resto += String(dato);
        const partes = resto.split(/\r?\n/);
        resto = partes.pop() ?? "";
        for (const linea of partes) {
          const limpia = linea.trimEnd();
          if (limpia === "") continue;
          ultima = limpia;
          decir(limpia);
        }
      };
      hijo.stdout.on("data", trocear);
      hijo.stderr.on("data", trocear);

      // Lo que hay que teclear, de una vez: el prompt puede aparecer antes de que nadie mire.
      for (let i = 0; i < Math.max(1, invocacion.repetir ?? 1); i++) {
        for (const t of invocacion.teclear) hijo.stdin.write(t);
      }
      hijo.stdin.end();

      hijo.on("error", ((error: Error) => {
        clearTimeout(sinSalida);
        clearTimeout(total);
        resolver({ estado: "fallo", motivo: unaLinea(error), ms: ahora() - t0 });
      }) as never);
      hijo.on("close", ((codigo: number | null) => {
        clearTimeout(sinSalida);
        clearTimeout(total);
        if (colgado) {
          resolver({ estado: "colgada", motivo: `no dijo nada en ${Math.round(TOPE_SIN_SALIDA_MS / 60_000)} min`, ms: ahora() - t0 });
          return;
        }
        if (cancelado) {
          resolver({ estado: "cancelada", ms: ahora() - t0 });
          return;
        }
        if (codigo === 0) {
          resolver({ estado: "ok", ms: ahora() - t0 });
          return;
        }
        resolver({ estado: "fallo", motivo: motivoDelCodigo(codigo, ultima), ms: ahora() - t0 });
      }) as never);
    });
  }

  return {
    titulo: paso.titulo,
    cancelar: () => {
      cancelado = true;
      matar?.();
    },
    terminado,
  };
}

/** Una línea, nunca la salida entera ni una traza con rutas. */
function unaLinea(error: unknown): string {
  const e = error as { code?: unknown; message?: unknown } | null;
  if (e !== null && typeof e === "object" && e.code === "ENOENT") return "el ejecutable no existe";
  const mensaje = e !== null && typeof e === "object" && typeof e.message === "string" ? e.message : String(error);
  return mensaje.split(/\r?\n/)[0]!.slice(0, 160);
}

/**
 * El hijo de verdad. Dos decisiones, las dos medidas:
 *
 * - **`detached: true`**, para que sea líder de su grupo y `kill(-pid)` se lleve también a
 *   los nietos: sin ello, cancelar dejaba el `curl` de `brew` descargando.
 * - **`stdio[0]` sigue siendo un `pipe`**, porque `sdkmanager` necesita que se le teclee.
 *   Lo que hace que un `sudo` de dentro no cuelgue no es cerrar `stdin`: es no tener
 *   terminal de CONTROL, que es de donde `sudo` lee la contraseña — y con `detached` no lo
 *   tiene ni por herencia.
 */
const lanzarReal: Lanzar = (binario, args, opciones) =>
  spawn(binario, args, { env: opciones.env, stdio: ["pipe", "pipe", "pipe"], detached: true }) as unknown as ProcesoHijo;

/**
 * El motivo de un código distinto de cero. La última línea si dijo algo, y si no el código
 * — que es todo lo que hay.
 */
function motivoDelCodigo(codigo: number | null, ultima: string): string {
  return ultima === "" ? `terminó con código ${codigo}` : ultima;
}
