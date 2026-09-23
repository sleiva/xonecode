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
export function serieAndroid(explicita, { entorno = process.env, adb = "adb" } = {}) {
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
