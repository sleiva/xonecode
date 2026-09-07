/**
 * EJECUTAR un paso de una receta de instalación, con su salida en vivo.
 *
 * La receta (`core/dispositivos.ts`) se lee y se copia; esto es la fase que la EJECUTA, y
 * solo para los pasos que se pueden cumplir. El criterio no es «lo que tarda poco» sino **lo
 * que no puede pedir ENTRADA**:
 *
 * - `brew` puede pedir la contraseña de administrador, y un hijo sin terminal detrás se
 *   quedaría esperándola para siempre — un botón que se cuelga es peor que no tener botón.
 *   Los pasos 1 y 2 no están en la tabla, y se siguen copiando.
 * - `sdkmanager` y `avdmanager` sí: lo único que preguntan son las licencias y el perfil de
 *   hardware, y las dos respuestas se pueden alimentar por `stdin` de forma determinista.
 *
 * Y son justo los pasos LARGOS —2-3 GB—, que es donde un botón mudo se lee como que se ha
 * colgado: de ahí que esto emita cada línea en cuanto sale, en vez de devolver al final.
 *
 * **Las rutas se resuelven AQUÍ y no viajan.** El hijo necesita `ANDROID_HOME` y `JAVA_HOME`,
 * que son rutas de la máquina; van en su entorno, que no sale del host. Por el cable viaja
 * el NOMBRE de la receta y el número del paso — nunca un comando ni un binario, que sería
 * una shell abierta en la máquina del usuario.
 */
import { spawn } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { jdkDeLaMaquina, localizadorDeAndroid } from "./dispositivosEnMaquina.js";

/** El paquete de la imagen del sistema, el mismo que nombra la receta. */
const IMAGEN = "system-images;android-35;google_apis;arm64-v8a";

/** Lo que hace falta para lanzar un paso: qué binario, con qué argumentos y qué se le teclea. */
interface PasoEjecutable {
  /** El binario, por nombre; se resuelve en el PATH o dentro del SDK. */
  binario: "sdkmanager" | "avdmanager";
  /** Dentro del SDK, si no está en el PATH. */
  subcarpeta: string;
  args: string[];
  /** Lo que se le escribe por `stdin`; sin TTY, un prompt sin respuesta cuelga el proceso. */
  teclear: string[];
  /** Antes de esto, aceptar las licencias del SDK. Solo el paso que instala. */
  licencias: boolean;
  /** Qué se enseña como título del trabajo. */
  titulo: string;
}

/**
 * Los pasos que xonecode lanza él. Tabla CERRADA y por `receta:paso`: lo que llega del
 * cliente es un número, y un número que no esté aquí no lanza nada.
 */
export const PASOS_EJECUTABLES = new Map<string, PasoEjecutable>([
  [
    "android-emulador:3",
    {
      binario: "sdkmanager",
      subcarpeta: join("cmdline-tools", "latest", "bin"),
      args: ["--install", "emulator", "platforms;android-35", IMAGEN],
      teclear: [],
      licencias: true,
      titulo: "Descargando el emulador y la imagen del sistema",
    },
  ],
  [
    "android-emulador:4",
    {
      binario: "avdmanager",
      subcarpeta: join("cmdline-tools", "latest", "bin"),
      args: ["create", "avd", "-n", "pixel8", "-k", IMAGEN, "-d", "pixel_8"],
      // «Do you wish to create a custom hardware profile? [no]»: sin respuesta, cuelga.
      teclear: ["no\n"],
      licencias: false,
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

  const { enSdk, raicesDeSdk } = localizadorDeAndroid({ plataforma, entorno, home, existe });
  const binario = enSdk(paso.binario, paso.subcarpeta);
  const sdk = raicesDeSdk.find((raiz) => existe(raiz));
  const jdk = jdkDeLaMaquina(entorno, existe);
  if (binario === undefined || sdk === undefined || jdk === undefined) {
    // Se dice QUÉ falta y dónde se arregla, no «no se pudo»: el paso 1 es el que lo instala.
    const que = binario === undefined || sdk === undefined ? "el SDK de línea de comandos" : "el JDK";
    return {
      titulo: paso.titulo,
      cancelar: () => {},
      terminado: Promise.resolve({
        estado: "fallo",
        motivo: `falta ${que}: hazlo con el paso 1 y vuelve a mirar`,
        ms: ahora() - t0,
      }),
    };
  }

  // El entorno del hijo. `PATH` se conserva y se le añade el SDK: `avdmanager` llama a
  // `sdkmanager` por su cuenta, y sin eso no se encuentran entre ellos.
  const env: Record<string, string | undefined> = {
    ...entorno,
    ANDROID_HOME: sdk,
    ANDROID_SDK_ROOT: sdk,
    JAVA_HOME: jdk,
    PATH: `${entorno.PATH ?? ""}:${join(sdk, "emulator")}:${join(sdk, "platform-tools")}`,
  };

  let cancelado = false;
  let colgado = false;
  let ultima = "";
  // Declarado ANTES del lazo: `unProceso` le asigna en cuanto lanza, y el cuerpo de la
  // función asíncrona de abajo corre síncrono hasta el primer `await`. Con el `let` después,
  // esa asignación caía en la zona muerta y el trabajo entero reventaba antes de empezar.
  let matar: (() => void) | undefined;

  const terminado = (async (): Promise<ResultadoDeTrabajo> => {
    // Las licencias PRIMERO y en su propio proceso: `sdkmanager --install` pregunta por las
    // que falten y sin TTY se queda esperando. Aceptarlas es la decisión que el usuario tomó
    // al pulsar, y se DICE en el log para que quede constancia de qué se aceptó.
    if (paso.licencias) {
      decir("Aceptando las licencias del SDK de Android (lo pediste al pulsar).");
      const licencias = await unProceso(binario, ["--licenses"], env, ["y\n"], 100);
      if (licencias.estado === "cancelada" || licencias.estado === "colgada") return licencias;
      // Un fallo aquí NO corta: si las licencias ya estaban aceptadas, `--licenses` puede
      // salir con código distinto de cero y la instalación funciona igual.
    }
    if (cancelado) return { estado: "cancelada", ms: ahora() - t0 };
    return unProceso(binario, paso.args, env, paso.teclear, 0);
  })();

  function unProceso(
    bin: string,
    args: string[],
    entornoHijo: Record<string, string | undefined>,
    teclear: string[],
    repetirTecleo: number
  ): Promise<ResultadoDeTrabajo> {
    return new Promise<ResultadoDeTrabajo>((resolver) => {
      let hijo: ProcesoHijo;
      try {
        hijo = lanzar(bin, args, { env: entornoHijo });
      } catch (error) {
        resolver({ estado: "fallo", motivo: unaLinea(error), ms: ahora() - t0 });
        return;
      }

      let sinSalida: ReturnType<typeof setTimeout>;
      const rearmar = (): void => {
        clearTimeout(sinSalida);
        sinSalida = setTimeout(() => {
          colgado = true;
          hijo.kill("SIGKILL");
        }, TOPE_SIN_SALIDA_MS);
      };
      const total = setTimeout(() => {
        colgado = true;
        hijo.kill("SIGKILL");
      }, TOPE_DE_TRABAJO_MS);
      rearmar();

      matar = () => hijo.kill("SIGTERM");
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
      for (let i = 0; i < Math.max(1, repetirTecleo); i++) for (const t of teclear) hijo.stdin.write(t);
      if (paso!.licencias && repetirTecleo > 0) for (let i = 0; i < repetirTecleo; i++) hijo.stdin.write("y\n");
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
        resolver({ estado: "fallo", motivo: ultima === "" ? `terminó con código ${codigo}` : ultima, ms: ahora() - t0 });
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

const lanzarReal: Lanzar = (binario, args, opciones) =>
  spawn(binario, args, { env: opciones.env, stdio: ["pipe", "pipe", "pipe"] }) as unknown as ProcesoHijo;
