import { renameSync } from "node:fs";
import { rename } from "node:fs/promises";

/**
 * Renombrar un fichero ENCIMA de otro, que es el último paso de toda escritura atómica del harness
 * (temporal + rename): el índice de sesiones, `settings.json`, `config.json`, los conectores, el
 * estado OAuth, la foto de memoria y el guardado del editor.
 *
 * **Por qué no basta `renameSync`.** En Windows, renombrar encima de un fichero falla con `EPERM`
 * (o `EACCES`/`EBUSY`) si OTRO proceso lo tiene abierto en ese instante sin compartir el borrado.
 * Lo abren solos, y a ráfagas, Windows Defender y el indexador de búsqueda: escanean cada fichero
 * recién escrito durante unos milisegundos. Visto en una máquina real, sobre el índice de sesiones
 * —que se reescribe varias veces por turno—: `EPERM: operation not permitted, rename
 * '…\.indice.json.<uuid>.tmp' -> '…\indice.json'`. No es un permiso que falte: es un bloqueo
 * pasajero, y reintentar un momento basta (es lo que hace `graceful-fs`, el de npm).
 *
 * **Solo en Windows y solo esos tres códigos.** En macOS y Linux un `EPERM` es un permiso de
 * verdad, y reintentarlo solo retrasaría el mismo error. Otro código (`ENOENT`, `EXDEV`) se lanza a
 * la primera. La espera crece y está ACOTADA: si el fichero no se suelta, se lanza el error
 * original, nunca se cuelga la consola. Mientras tanto el temporal sigue intacto y el destino no se
 * ha tocado, así que quien llama limpia como siempre.
 *
 * La versión síncrona duerme con `Atomics.wait`: bloquea el proceso esos milisegundos, que es lo
 * que ya hacía la escritura síncrona; preferible a fallar el turno.
 */

/** Los códigos que en Windows significan «alguien lo tiene abierto ahora mismo». */
const CODIGOS_PASAJEROS = new Set(["EPERM", "EACCES", "EBUSY"]);

/** Esperas entre intentos, en milisegundos: crecen y suman algo más de un segundo. */
export const ESPERAS_DE_RENOMBRADO_MS: readonly number[] = [10, 20, 40, 80, 160, 320, 640];

export interface OpcionesDeRenombrado {
  /** Inyectable para los tests; por omisión `process.platform`. */
  plataforma?: NodeJS.Platform;
  /** Cómo esperar entre intentos (síncrona en `renombrarSobreSync`). */
  dormir?: (ms: number) => void | Promise<void>;
  /** El rename de verdad; inyectable para simular el bloqueo. */
  rename?: (origen: string, destino: string) => void | Promise<void>;
}

function esPasajero(error: unknown, plataforma: NodeJS.Platform): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return plataforma === "win32" && typeof code === "string" && CODIGOS_PASAJEROS.has(code);
}

function dormirSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** `renameSync` que, en Windows, aguanta el bloqueo pasajero de un antivirus o un indexador. */
export function renombrarSobreSync(origen: string, destino: string, opciones: OpcionesDeRenombrado = {}): void {
  const plataforma = opciones.plataforma ?? process.platform;
  const dormir = opciones.dormir ?? dormirSync;
  const renombrar = opciones.rename ?? renameSync;
  for (let intento = 0; ; intento++) {
    try {
      void renombrar(origen, destino);
      return;
    } catch (error) {
      const espera = ESPERAS_DE_RENOMBRADO_MS[intento];
      if (espera === undefined || !esPasajero(error, plataforma)) throw error;
      void dormir(espera);
    }
  }
}

/** La versión asíncrona, para quien ya escribe con `node:fs/promises`. */
export async function renombrarSobre(origen: string, destino: string, opciones: OpcionesDeRenombrado = {}): Promise<void> {
  const plataforma = opciones.plataforma ?? process.platform;
  const dormir = opciones.dormir ?? ((ms: number) => new Promise<void>((listo) => setTimeout(listo, ms)));
  const renombrar = opciones.rename ?? rename;
  for (let intento = 0; ; intento++) {
    try {
      await renombrar(origen, destino);
      return;
    } catch (error) {
      const espera = ESPERAS_DE_RENOMBRADO_MS[intento];
      if (espera === undefined || !esPasajero(error, plataforma)) throw error;
      await dormir(espera);
    }
  }
}
