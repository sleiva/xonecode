/**
 * A qué aparato apuntan los scripts de esta skill, cuando nadie se lo dice con `--serie`/`--udid`.
 *
 * Es UNA regla para todos los scripts, y por eso vive aquí y no copiada en cada uno: con cinco
 * copias, la del día que alguien la afine sería la única que cambia.
 *
 * El orden, de más explícito a menos:
 *   1. Lo que se pasó a mano (`--serie` / `--udid`).
 *   2. El dispositivo ELEGIDO en la sesión: XOneCode deja en `XONECODE_DISPOSITIVO` la ruta de un
 *      fichero con la elección de la pastilla del chat, y se lee AHORA, en cada ejecución — así un
 *      cambio de aparato con la sesión abierta alcanza al siguiente comando.
 *   3. Sin elección: un EMULADOR antes que un dispositivo físico. Con uno solo conectado, ése.
 *      Con varios físicos y ningún emulador no se adivina: se devuelve `undefined` y adb dirá
 *      que hay más de uno, que es verdad.
 *
 * Fuera de `scripts/` a propósito: esa carpeta va al PATH y cada fichero suyo es un comando.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** El dispositivo elegido en la sesión, o `undefined`. Un fichero roto es «no hay elección». */
export function dispositivoDeLaSesion(entorno = process.env) {
  const fichero = entorno.XONECODE_DISPOSITIVO;
  if (!fichero || !existsSync(fichero)) return undefined;
  try {
    const d = JSON.parse(readFileSync(fichero, "utf8"));
    if (typeof d?.id !== "string" || d.id === "") return undefined;
    if (d.plataforma !== "android" && d.plataforma !== "ios") return undefined;
    return d;
  } catch {
    return undefined;
  }
}

/**
 * De la salida de `adb devices`, el serial a usar sin elección: un emulador primero. Pura, para
 * poder probarla sin adb delante. Solo cuentan las líneas en estado `device`: uno `offline` o
 * `unauthorized` no se puede usar.
 */
/** El `adb` a ejecutar: `XONECODE_ADB` (lo pone el harness) o el del PATH. */
export function rutaDeAdb(entorno = process.env) {
  return entorno.XONECODE_ADB || "adb";
}

/** El `node` que YA corre este script: no depende de que esté en el PATH (en Windows a menudo no lo está). */
export const NODE = process.execPath;

/** Espera síncrona sin lanzar procesos: `sleep` no existe en Windows. */
export function dormir(segundos) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(segundos) * 1000);
}

export function preferirEmulador(salidaDeAdbDevices) {
  const listos = String(salidaDeAdbDevices)
    .split("\n")
    .map((l) => l.trim().split(/\s+/))
    .filter((partes) => partes.length >= 2 && partes[1] === "device")
    .map((partes) => partes[0]);
  if (listos.length === 1) return listos[0];
  return listos.find((serial) => serial.startsWith("emulator-"));
}

/** El serial de Android: `--serie`, el de la sesión o un emulador. Y dice de dónde salió. */
export function serieAndroid(explicita, { entorno = process.env, adb = rutaDeAdb(entorno) } = {}) {
  if (explicita) return { serie: explicita, porque: "pasado con --serie" };
  const elegido = dispositivoDeLaSesion(entorno);
  if (elegido?.plataforma === "android") return { serie: elegido.id, porque: `el de la sesión: ${elegido.nombre}` };
  try {
    const serie = preferirEmulador(execFileSync(adb, ["devices"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
    if (serie !== undefined) {
      return { serie, porque: serie.startsWith("emulator-") ? "sin elegir en la sesión: un emulador" : "el único conectado" };
    }
  } catch {
    // Sin adb que conteste, el script sigue sin `-s` y su propia comprobación dirá qué falta.
  }
  return { serie: undefined, porque: "sin elegir" };
}

/** El UDID de iOS: `--udid`, o el SIMULADOR elegido en la sesión. Un iPhone físico no: estos
 *  scripts solo hablan con simuladores (`xcrun simctl`). */
export function udidIos(explicito, entorno = process.env) {
  if (explicito) return explicito;
  const elegido = dispositivoDeLaSesion(entorno);
  return elegido?.plataforma === "ios" && elegido.clase === "simulador" ? elegido.id : undefined;
}

/** El puerto del hotswap DENTRO del aparato y el local por omisión. Copia de `core/puertosDeAvd.ts#PUERTO_DEL_HOTSWAP`. */
export const PUERTO_DEL_HOTSWAP = 8443;

// Con tope: un adb colgado cae en el `catch` de quien llama (puerto por omisión) en vez de colgar el script.
const ejecutarAdb = (binario, args) =>
  execFileSync(binario, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 });

/** El AVD detrás de un emulador en marcha, por su consola. Un físico no tiene: `undefined` sin preguntar. */
export function avdDeLaSerie(serie, { entorno = process.env, ejecutar = ejecutarAdb } = {}) {
  if (!serie || !serie.startsWith("emulator-")) return undefined;
  try {
    return ejecutar(rutaDeAdb(entorno), ["-s", serie, "emu", "avd", "name"])
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l !== "" && l !== "OK");
  } catch {
    return undefined;
  }
}

/**
 * Lo guardado para ese AVD en `~/.xonecode/settings.json` (`dispositivos.avds`). Se lee en CADA
 * ejecución, como el dispositivo de la sesión: cambiar el puerto en Ajustes alcanza al siguiente
 * comando. Un fichero ausente o roto es «nada guardado».
 */
export function ajusteDelAvd(avd, { casa = homedir(), leer = (r) => readFileSync(r, "utf8") } = {}) {
  if (!avd) return {};
  try {
    const s = JSON.parse(leer(join(casa, ".xonecode", "settings.json")));
    const a = s?.dispositivos?.avds?.[avd];
    return typeof a === "object" && a !== null ? a : {};
  } catch {
    return {};
  }
}

/**
 * El puerto LOCAL del túnel. De más explícito a menos: `--puerto`, el guardado del AVD de esta
 * serie, 8443. Misma regla que `core/puertosDeAvd.ts#puertoDeAvd` (un test compara las dos).
 */
export function puertoAndroid(explicito, serie, deps = {}) {
  const n = Number(explicito);
  if (explicito !== undefined && Number.isInteger(n) && n >= 1024 && n <= 65535) return n;
  const guardado = ajusteDelAvd(avdDeLaSerie(serie, deps), deps).puerto;
  return Number.isInteger(guardado) ? guardado : PUERTO_DEL_HOTSWAP;
}
