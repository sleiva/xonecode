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
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import {
  parsearAdbDevices,
  parsearAvds,
  parsearDevicectl,
  parsearSimctl,
  sistemaDe,
  type Dispositivo,
  type Herramienta,
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

export async function detectarDispositivos(deps: DependenciasDeDeteccion = {}): Promise<InformeDeDispositivos> {
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

  const adb = localizar("adb", "platform-tools");
  if (adb === undefined) {
    herramientas.push({ nombre: "adb", estado: "no-encontrada", detalle: "ni en el PATH ni en platform-tools del SDK de Android" });
  } else {
    try {
      const { stdout } = await ejecutar(adb, ["devices", "-l"], { timeout: TOPES_MS.adb });
      dispositivos.push(...parsearAdbDevices(stdout));
      herramientas.push({ nombre: "adb", estado: "ok", ruta: adb });
    } catch (error) {
      herramientas.push({ nombre: "adb", estado: "fallo", ruta: adb, detalle: describirFallo(error, TOPES_MS.adb) });
    }
  }

  const emulator = localizar("emulator", "emulator");
  if (emulator === undefined) {
    herramientas.push({ nombre: "emulator", estado: "no-encontrada", detalle: "ni en el PATH ni en la carpeta emulator del SDK de Android" });
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
  if (plataforma !== "darwin") {
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
      herramientas.push({ nombre: "xcrun", estado: "no-encontrada", detalle }, { nombre: "devicectl", estado: "no-encontrada", detalle });
    } else {
      try {
        const { stdout } = await ejecutar("xcrun", ["simctl", "list", "-j", "devices", "available"], { timeout: TOPES_MS.xcrun });
        dispositivos.push(...parsearSimctl(stdout));
        herramientas.push({ nombre: "xcrun", estado: "ok", ruta: xcode });
      } catch (error) {
        herramientas.push({ nombre: "xcrun", estado: "fallo", ruta: xcode, detalle: describirFallo(error, TOPES_MS.xcrun) });
      }
      // `devicectl` no imprime el JSON por stdout: solo lo escribe en el fichero que se le
      // pide. Y es de Xcode 15 en adelante: en uno anterior el `xcrun` falla y se dice.
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

  return { sistema: sistemaDe(plataforma), herramientas, dispositivos, avds, medido: ahora().toISOString() };
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
