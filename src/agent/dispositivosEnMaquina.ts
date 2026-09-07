/**
 * Detecta en la MÁQUINA lo que `core/dispositivos.ts` describe: el sistema, las
 * herramientas de Android e iOS que hay, y a qué dispositivos y simuladores se llega.
 *
 * Todo lo que toca el sistema —`process.platform`, el entorno, el PATH, si existe un
 * fichero, lanzar un proceso— entra por `DependenciasDeDeteccion`, con las reales por
 * omisión. Es lo que permite que su test recorra los tres sistemas y los casos de fallo sin
 * lanzar ni un adb: `npm test` no puede necesitar un SDK de Android ni Xcode.
 *
 * Reglas medidas o deliberadas:
 * - **En macOS se comprueba `xcode-select -p` ANTES de llamar a `xcrun`.** Un `xcrun` sin
 *   herramientas de desarrollo instaladas levanta el diálogo de «instalar las command line
 *   tools» encima de lo que haya en pantalla; `xcode-select -p` falla sin diálogo.
 * - **iOS fuera de macOS es «no aplica», no «no hay»**: la máquina no puede saberlo.
 * - **Cada proceso lleva timeout** y un cuelgue se dice como «no respondió», nunca se queda
 *   el panel en «consultando…». El de adb es más largo porque `adb devices` ARRANCA el
 *   demonio si no corre (y ese demonio se queda vivo: es un efecto que el escritorio dice).
 * - **adb y emulator se buscan en el PATH y luego en el SDK**: `ANDROID_HOME`,
 *   `ANDROID_SDK_ROOT` y la carpeta por omisión de cada sistema. En Windows los binarios
 *   llevan `.exe`.
 * - Del error de una herramienta viaja UNA línea recortada, no la salida entera.
 * - **Un destino APAGADO en Ajustes no se consulta**, y ahí está el sentido del ajuste:
 *   medir cuesta procesos en el equipo del usuario —`adb devices` arranca el demonio de adb
 *   y lo deja vivo, `xcrun` tarda segundos—, así que apagarlo tiene que dejar de lanzarlos
 *   de verdad, no solo esconder filas. Su herramienta se declara «desactivada»; y las que
 *   sirven a DOS destinos solo se apagan si los dos lo están: `adb devices` lista a la vez
 *   los Android físicos y los emuladores arrancados, así que con emuladores encendidos adb
 *   se sigue llamando y lo que se filtra es la lista.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { seMira, type AjustesDeDispositivos } from "../core/settings.js";
import {
  parsearAdbDevices,
  parsearAvds,
  parsearDevicectl,
  parsearSimctl,
  sistemaDe,
  type Dispositivo,
  type Herramienta,
  type NombreDeHerramienta,
  type InformeDeDispositivos,
} from "../core/dispositivos.js";

const ejecutarReal = promisify(execFile);

export interface Ejecucion {
  stdout: string;
  stderr: string;
}

export interface DependenciasDeDeteccion {
  /** `process.platform`. */
  plataforma?: string;
  /** `process.env`. */
  entorno?: Record<string, string | undefined>;
  /** El home del usuario, para las carpetas de SDK por omisión. */
  home?: string;
  existe?: (ruta: string) => boolean;
  ejecutar?: (binario: string, args: string[], opciones: { timeout: number }) => Promise<Ejecucion>;
  /** Lee el fichero que `devicectl` escribió. */
  leer?: (ruta: string) => Promise<string>;
  /** Lo borra: SIEMPRE, también si `xcrun` falló a medias y lo dejó escrito. */
  borrar?: (ruta: string) => Promise<void>;
  /** Dónde escribir el JSON de `devicectl`. */
  ficheroTemporal?: () => string;
  ahora?: () => Date;
}

/** Cuánto se espera a cada herramienta antes de darla por colgada. */
export const TOPES_MS = {
  /** `adb devices` arranca el demonio si hace falta y eso tarda segundos en frío. */
  adb: 15_000,
  emulator: 10_000,
  xcrun: 20_000,
} as const;

const RAICES_DE_SDK_POR_OMISION: Record<string, (home: string, entorno: Record<string, string | undefined>) => string[]> = {
  darwin: (home) => [join(home, "Library", "Android", "sdk")],
  win32: (_home, entorno) => (entorno.LOCALAPPDATA === undefined ? [] : [join(entorno.LOCALAPPDATA, "Android", "Sdk")]),
  linux: (home) => [join(home, "Android", "Sdk")],
};

export async function detectarDispositivos(
  deps: DependenciasDeDeteccion = {},
  /** Qué destinos se miran. Ausente = todos (`core/settings.ts#seMira`). */
  ajustes: AjustesDeDispositivos = {}
): Promise<InformeDeDispositivos> {
  const plataforma = deps.plataforma ?? process.platform;
  const entorno = deps.entorno ?? process.env;
  const home = deps.home ?? homedir();
  const existe = deps.existe ?? existsSync;
  const ejecutar = deps.ejecutar ?? ejecutarConTexto;
  const leer = deps.leer ?? ((ruta: string) => readFile(ruta, "utf8"));
  const borrar = deps.borrar ?? ((ruta: string) => rm(ruta, { force: true }).catch(() => undefined));
  const ficheroTemporal =
    deps.ficheroTemporal ?? (() => join(tmpdir(), `xonecode-devicectl-${process.pid}-${Date.now()}.json`));
  const ahora = deps.ahora ?? (() => new Date());

  const herramientas: Herramienta[] = [];
  const dispositivos: Dispositivo[] = [];
  let avds: string[] = [];

  const miraAndroid = seMira(ajustes, "android");
  const miraAndroidEmulador = seMira(ajustes, "androidEmulador");
  const miraIos = seMira(ajustes, "ios");
  const miraIosSimulador = seMira(ajustes, "iosSimulador");
  const APAGADO = "no se mira: está desactivado en Ajustes";

  // --- Android: adb y emulator, en cualquier sistema.
  const ext = plataforma === "win32" ? ".exe" : "";
  const raicesDeSdk = [
    entorno.ANDROID_HOME,
    entorno.ANDROID_SDK_ROOT,
    ...(RAICES_DE_SDK_POR_OMISION[plataforma]?.(home, entorno) ?? []),
  ].filter((r): r is string => r !== undefined && r !== "");
  const enPath = (nombre: string): string | undefined => {
    for (const carpeta of (entorno.PATH ?? entorno.Path ?? "").split(delimiter)) {
      if (carpeta === "") continue;
      const candidato = join(carpeta, nombre + ext);
      if (existe(candidato)) return candidato;
    }
    return undefined;
  };
  const localizar = (nombre: string, subcarpeta: string): string | undefined => {
    const delPath = enPath(nombre);
    if (delPath !== undefined) return delPath;
    for (const raiz of raicesDeSdk) {
      const candidato = join(raiz, subcarpeta, nombre + ext);
      if (existe(candidato)) return candidato;
    }
    return undefined;
  };

  // adb sirve a los DOS destinos de Android, así que solo se salta si los dos están
  // apagados: con los emuladores encendidos hay que llamarlo igual, porque un emulador
  // arrancado aparece en `adb devices` y en ningún otro sitio.
  /**
   * Cómo se instala lo que falta, y solo con comandos que se resuelven por el PATH: el
   * comando se pinta en Ajustes y viaja por el cable, así que no puede llevar una ruta del
   * home del usuario (la misma razón por la que `ruta` se queda en el host).
   *
   * `sdkmanager` primero cuando está: es la herramienta oficial del SDK y no instala nada
   * fuera de él. Homebrew después, y solo para `platform-tools`: el emulador viene con
   * Android Studio, y proponer un cask que no existe sería peor que no proponer nada.
   */
  const comoInstalar = (nombre: NombreDeHerramienta): Herramienta["instalar"] => {
    if (nombre === "xcrun" || nombre === "devicectl") {
      // Solo en macOS, y es el único que xonecode lanza él: devuelve en el acto y abre el
      // diálogo de Apple, sin instalar nada a espaldas de nadie.
      return plataforma === "darwin" ? { comando: "xcode-select --install", automatico: true } : undefined;
    }
    const paquete = nombre === "adb" ? "platform-tools" : "emulator";
    if (enPath("sdkmanager") !== undefined) return { comando: `sdkmanager --install "${paquete}"`, automatico: false };
    if (nombre === "adb" && enPath("brew") !== undefined) {
      return { comando: "brew install --cask android-platform-tools", automatico: false };
    }
    return undefined;
  };

  const adb = miraAndroid || miraAndroidEmulador ? localizar("adb", "platform-tools") : undefined;
  if (!miraAndroid && !miraAndroidEmulador) {
    herramientas.push({ nombre: "adb", estado: "desactivada", detalle: APAGADO });
  } else if (adb === undefined) {
    const instalar = comoInstalar("adb");
    herramientas.push({
      nombre: "adb",
      estado: "no-encontrada",
      detalle: "ni en el PATH ni en platform-tools del SDK de Android",
      ...(instalar === undefined ? {} : { instalar }),
    });
  } else {
    try {
      const { stdout } = await ejecutar(adb, ["devices", "-l"], { timeout: TOPES_MS.adb });
      dispositivos.push(...parsearAdbDevices(stdout));
      herramientas.push({ nombre: "adb", estado: "ok", ruta: adb });
    } catch (error) {
      herramientas.push({ nombre: "adb", estado: "fallo", ruta: adb, detalle: describirFallo(error, TOPES_MS.adb) });
    }
  }

  const emulator = miraAndroidEmulador ? localizar("emulator", "emulator") : undefined;
  if (!miraAndroidEmulador) {
    herramientas.push({ nombre: "emulator", estado: "desactivada", detalle: APAGADO });
  } else if (emulator === undefined) {
    const instalar = comoInstalar("emulator");
    herramientas.push({
      nombre: "emulator",
      estado: "no-encontrada",
      detalle: "ni en el PATH ni en la carpeta emulator del SDK de Android; viene con Android Studio",
      ...(instalar === undefined ? {} : { instalar }),
    });
  } else {
    try {
      const { stdout } = await ejecutar(emulator, ["-list-avds"], { timeout: TOPES_MS.emulator });
      avds = parsearAvds(stdout);
      herramientas.push({ nombre: "emulator", estado: "ok", ruta: emulator });
    } catch (error) {
      herramientas.push({ nombre: "emulator", estado: "fallo", ruta: emulator, detalle: describirFallo(error, TOPES_MS.emulator) });
    }
  }

  // --- iOS: solo en macOS, y solo con herramientas de desarrollo instaladas.
  if (!miraIos && !miraIosSimulador) {
    // Ni `xcode-select -p`: apagar los dos destinos de iOS tiene que ahorrar TODOS los
    // procesos, no solo los dos `xcrun` de después.
    herramientas.push(
      { nombre: "xcrun", estado: "desactivada", detalle: APAGADO },
      { nombre: "devicectl", estado: "desactivada", detalle: APAGADO }
    );
  } else if (plataforma !== "darwin") {
    const detalle = "los simuladores y dispositivos iOS solo se detectan en macOS";
    herramientas.push({ nombre: "xcrun", estado: "no-aplica", detalle }, { nombre: "devicectl", estado: "no-aplica", detalle });
  } else {
    let xcode: string | undefined;
    try {
      xcode = (await ejecutar("xcode-select", ["-p"], { timeout: TOPES_MS.xcrun })).stdout.trim();
    } catch {
      xcode = undefined;
    }
    if (xcode === undefined || xcode === "") {
      const detalle = "no hay herramientas de desarrollo de Xcode (xcode-select -p no devuelve ninguna ruta)";
      const instalar = comoInstalar("xcrun");
      herramientas.push(
        { nombre: "xcrun", estado: "no-encontrada", detalle, ...(instalar === undefined ? {} : { instalar }) },
        { nombre: "devicectl", estado: "no-encontrada", detalle, ...(instalar === undefined ? {} : { instalar }) }
      );
    } else {
      if (!miraIosSimulador) {
        herramientas.push({ nombre: "xcrun", estado: "desactivada", detalle: APAGADO });
      } else {
        try {
          const { stdout } = await ejecutar("xcrun", ["simctl", "list", "-j", "devices", "available"], { timeout: TOPES_MS.xcrun });
          dispositivos.push(...parsearSimctl(stdout));
          herramientas.push({ nombre: "xcrun", estado: "ok", ruta: xcode });
        } catch (error) {
          herramientas.push({ nombre: "xcrun", estado: "fallo", ruta: xcode, detalle: describirFallo(error, TOPES_MS.xcrun) });
        }
      }
      // `devicectl` no imprime el JSON por stdout: solo lo escribe en el fichero que se le
      // pide. Y es de Xcode 15 en adelante: en uno anterior el `xcrun` falla y se dice.
      if (!miraIos) {
        herramientas.push({ nombre: "devicectl", estado: "desactivada", detalle: APAGADO });
      } else {
        const fichero = ficheroTemporal();
        try {
          await ejecutar("xcrun", ["devicectl", "list", "devices", "--json-output", fichero], { timeout: TOPES_MS.xcrun });
          dispositivos.push(...parsearDevicectl(await leer(fichero)));
          herramientas.push({ nombre: "devicectl", estado: "ok", ruta: xcode });
        } catch (error) {
          herramientas.push({ nombre: "devicectl", estado: "fallo", ruta: xcode, detalle: describirFallo(error, TOPES_MS.xcrun) });
        } finally {
          await borrar(fichero);
        }
      }
    }
  }

  // El último filtro, y hace falta aunque cada herramienta lleve su interruptor: `adb
  // devices` no distingue —trae los físicos y los emuladores en la misma lista—, así que
  // con «Android físico» apagado y emuladores encendidos hay que quitarlos aquí. Es filtrar
  // lo que YA se midió, no medir de menos: lo segundo lo hacen las guardas de arriba.
  const visibles = dispositivos.filter((d) => {
    if (d.plataforma === "android") return d.clase === "emulador" ? miraAndroidEmulador : miraAndroid;
    return d.clase === "simulador" ? miraIosSimulador : miraIos;
  });

  return {
    sistema: sistemaDe(plataforma),
    herramientas,
    dispositivos: visibles,
    avds: miraAndroidEmulador ? avds : [],
    medido: ahora().toISOString(),
  };
}

/**
 * Los instaladores que xonecode lanza ÉL. Tabla CERRADA y de UNA entrada.
 *
 * `xcode-select --install` está aquí porque cumple las tres condiciones: no instala nada por
 * su cuenta —abre el diálogo de Apple y devuelve en el acto—, no necesita contraseña de
 * administrador en el proceso hijo, y se resuelve por el PATH del sistema.
 *
 * Lo demás NO se lanza desde aquí y se ofrece para copiar (`instalar.automatico: false`):
 * `brew install --cask` tarda minutos y puede pedir la contraseña de administrador, y un
 * hijo sin terminal detrás se quedaría esperando esa contraseña para siempre. Un botón que
 * se cuelga es peor que no tener botón.
 */
const INSTALADORES: Partial<Record<NombreDeHerramienta, { binario: string; args: string[]; plataforma: string }>> = {
  xcrun: { binario: "xcode-select", args: ["--install"], plataforma: "darwin" },
  devicectl: { binario: "xcode-select", args: ["--install"], plataforma: "darwin" },
};

/** Cuánto se espera al instalador antes de darlo por colgado. */
export const TOPE_DE_INSTALACION_MS = 60_000;

/**
 * Lanza el instalador de una herramienta, si hay uno para ella en esta plataforma.
 *
 * **Un código de salida distinto de cero NO siempre es un fallo aquí**: `xcode-select
 * --install` sale con error cuando las herramientas YA están instaladas, y eso no es nada
 * que contar. Lo que se propaga es lo que impide seguir —que no exista el binario, o que se
 * cuelgue—; del resto se encarga la medida de después, que es la que dice la verdad sobre si
 * la herramienta está.
 */
export async function instalarHerramientaDeDispositivos(
  herramienta: NombreDeHerramienta,
  deps: Pick<DependenciasDeDeteccion, "plataforma" | "ejecutar"> = {}
): Promise<void> {
  const plataforma = deps.plataforma ?? process.platform;
  const ejecutar = deps.ejecutar ?? ejecutarConTexto;
  const instalador = INSTALADORES[herramienta];
  if (instalador === undefined || instalador.plataforma !== plataforma) return;
  try {
    await ejecutar(instalador.binario, instalador.args, { timeout: TOPE_DE_INSTALACION_MS });
  } catch (error) {
    const e = error as { code?: unknown; killed?: boolean } | null;
    // Un `code` numérico es el instalador diciendo algo (p. ej. «ya están instaladas»); un
    // cuelgue o un binario que no existe sí son fallos que hay que contar.
    if (e !== null && typeof e === "object" && typeof e.code === "number" && e.killed !== true) return;
    throw error;
  }
}

async function ejecutarConTexto(binario: string, args: string[], opciones: { timeout: number }): Promise<Ejecucion> {
  const { stdout, stderr } = await ejecutarReal(binario, args, { timeout: opciones.timeout, encoding: "utf8", windowsHide: true });
  return { stdout: String(stdout), stderr: String(stderr) };
}

/**
 * Una línea sobre por qué falló, sin la salida entera. Un proceso que `execFile` mató por
 * el timeout llega con `killed: true`; lo demás es la primera línea útil de stderr o del
 * mensaje, recortada.
 */
export function describirFallo(error: unknown, topeMs: number): string {
  const e = error as { killed?: boolean; signal?: string; code?: unknown; stderr?: unknown; message?: unknown } | null;
  if (e !== null && typeof e === "object" && (e.killed === true || e.code === "ETIMEDOUT")) {
    return `no respondió en ${Math.round(topeMs / 1000)} s`;
  }
  if (e !== null && typeof e === "object" && e.code === "ENOENT") return "el ejecutable no existe";
  const stderr = e !== null && typeof e === "object" && typeof e.stderr === "string" ? e.stderr : "";
  const mensaje = e !== null && typeof e === "object" && typeof e.message === "string" ? e.message : String(error);
  const linea =
    stderr
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l !== "") ??
    mensaje
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l !== "" && !l.startsWith("Command failed")) ??
    mensaje.split(/\r?\n/)[0] ??
    "fallo desconocido";
  return linea.length > 160 ? `${linea.slice(0, 159)}…` : linea;
}
