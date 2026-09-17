/**
 * Arrancar un emulador de Android desde xonecode.
 *
 * Hasta ahora la receta lo confesaba —«para arrancarlo: `emulator -avd pixel8`… arrancarlo
 * desde esta ventana todavía no está cableado»— y la interfaz no prometía botón. Esto es ese
 * botón, y tiene dos particularidades que lo separan de todo lo demás de esta pantalla.
 *
 * **1. Un emulador no TERMINA, así que no puede ocupar la ranura del único trabajo.** La
 * receta de instalación corre con `crearEjecutor`, que vigila el silencio y espera el cierre
 * del proceso (`TOPE_SIN_SALIDA_MS`); un emulador se queda vivo por definición, así que por
 * ahí bloquearía la máquina para siempre. Se lanza DESPEGADO y no se espera su cierre: lo que
 * se espera es que el aparato APAREZCA.
 *
 * **2. «Lanzado» y «arrancado» son dos cosas, y manda la MEDIDA.** Es la misma disciplina que
 * ya aplica la receta —«la foto nueva dice si el paso quedó hecho, no el código de salida»— y
 * aquí es más literal todavía: `emulator` devuelve el control enseguida y la ventana de Android
 * tarda en aparecer. Así que se sondea `adb devices` hasta que el emulador contesta con SU
 * nombre de AVD, que es el único dato que lo ata a lo que se pidió arrancar
 * (`core/dispositivos.ts#nombreDeAvdDeConsola`). Sin esa comprobación, arrancar `pixel8`
 * mientras otro emulador se levantaba diría «ya está» por el aparato equivocado.
 */
import { localizadorDeAndroid, TOPES_MS, type DependenciasDeDeteccion, type Ejecucion } from "./dispositivosEnMaquina.js";
import { lanzarReal, type Lanzar } from "./procesosEnMaquina.js";
import { nombreDeAvdDeConsola, parsearAdbDevices } from "../../core/dispositivos.js";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";

/**
 * Cuánto se espera a que el aparato aparezca.
 *
 * Un arranque en frío de un AVD con `google_apis` tarda decenas de segundos en esta máquina, y
 * con la caché del sistema fría bastante más. Generoso a propósito: cortar pronto diría «no
 * arrancó» de un emulador que estaba arrancando, que es la mentira que este sondeo existe para
 * evitar. Y el proceso sigue vivo cuando el plazo vence — lo que se acota es la ESPERA, no el
 * trabajo, igual que en el resto del repo.
 */
export const TOPE_DE_ARRANQUE_MS = 180_000;

/** Cada cuánto se pregunta. `adb devices` es barato una vez que el demonio está en marcha. */
export const ESPERA_ENTRE_SONDEOS_MS = 2_000;

export interface ResultadoDeArranque {
  ok: boolean;
  /** Una línea, siempre: un fallo mudo aquí sería un botón que no hace nada. */
  detalle: string;
}

export interface DependenciasDeArranque extends DependenciasDeDeteccion {
  /** El `spawn` despegado. Por omisión el único del repo (`procesosEnMaquina.ts#lanzarReal`). */
  lanzar?: Lanzar;
  /** La espera entre sondeos, inyectable: los tests no pueden tardar tres minutos. */
  esperar?: (ms: number) => Promise<void>;
}

/**
 * Arranca el AVD `avd` y espera a que el aparato aparezca.
 *
 * **Nunca lanza**: un botón de esta ventana no puede tumbar el cable, así que todo sale por
 * `ResultadoDeArranque` con su línea.
 */
export async function arrancarEmulador(
  avd: string,
  deps: DependenciasDeArranque = {}
): Promise<ResultadoDeArranque> {
  /**
   * El nombre del AVD se convierte en un ARGUMENTO de proceso, así que se cierra por forma y
   * no por confianza: la misma clase que acepta `nombreDeAvdDeConsola` —lo que puede ser una
   * carpeta de `~/.android/avd`— y nada más. Quien llama además comprueba que ese AVD esté en
   * la última medida; esto es la segunda llave, y está aquí porque este módulo es el que
   * ejecuta.
   */
  // Ojo al guion INICIAL: `-avd` pasaba la clase de caracteres y `emulator` lo habría tomado
  // por una bandera suya. Lo cazó el propio test de esta función, que es la razón de que la
  // lista de nombres malos incluya uno que parece inofensivo.
  if (!/^[A-Za-z0-9._][A-Za-z0-9._-]*$/.test(avd)) {
    return { ok: false, detalle: `«${avd}» no es un nombre de AVD` };
  }

  const plataforma = deps.plataforma ?? process.platform;
  const entorno = deps.entorno ?? process.env;
  const home = deps.home ?? process.env.HOME ?? "";
  const existe = deps.existe ?? ((ruta: string) => existeDeVerdad(ruta));
  const ejecutar = deps.ejecutar ?? ejecutarDeVerdad;
  const lanzar = deps.lanzar ?? lanzarReal;
  // `ahora` es el de `DependenciasDeDeteccion` y devuelve `Date`: se reusa en vez de declarar
  // un segundo reloj con otra forma en el mismo árbol.
  const ahora = (): number => (deps.ahora ?? (() => new Date()))().getTime();
  const esperar = deps.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const { enSdk } = localizadorDeAndroid({ plataforma, entorno, home, existe });
  const emulator = enSdk("emulator", "emulator");
  if (emulator === undefined) {
    return { ok: false, detalle: "no encuentro «emulator»: ni en el PATH ni en la carpeta emulator del SDK" };
  }
  const adb = enSdk("adb", "platform-tools");
  if (adb === undefined) {
    // Sin adb se podría lanzar a ciegas, y entonces no habría forma de decir si arrancó: la
    // medida es la que manda, así que sin medida no se promete nada.
    return { ok: false, detalle: "no encuentro «adb», así que no podría comprobar si arranca" };
  }

  try {
    const hijo = lanzar(emulator, ["-avd", avd], { env: { ...entorno } });
    // No se lee su salida ni se espera su cierre: es un demonio. Pero SÍ se escucha el
    // `error` del propio spawn —un binario que no se puede ejecutar— porque eso sí es un
    // fallo del arranque y no del emulador.
    let fallo: string | undefined;
    hijo.on("error", ((e: unknown) => {
      fallo = e instanceof Error ? e.message : String(e);
    }) as (v: never) => void);
    // Una vuelta de sondeo mínima antes de mirar el `error`: el `spawn` lo emite asíncrono.
    await esperar(ESPERA_ENTRE_SONDEOS_MS);
    if (fallo !== undefined) return { ok: false, detalle: `no pude lanzar el emulador: ${fallo}` };

    const t0 = ahora();
    while (ahora() - t0 < TOPE_DE_ARRANQUE_MS) {
      if (await estaArrancado(avd, adb, ejecutar)) {
        return { ok: true, detalle: `${avd} arrancado` };
      }
      await esperar(ESPERA_ENTRE_SONDEOS_MS);
    }
    // El proceso sigue vivo: se dice lo que se sabe, que es que todavía no aparece.
    return {
      ok: false,
      detalle: `${avd} no ha aparecido todavía; sigue arrancando — vuelve a mirar en un rato`,
    };
  } catch (error) {
    return { ok: false, detalle: error instanceof Error ? error.message : String(error) };
  }
}

/** ¿Hay ya un emulador conectado que diga ser ESE AVD? */
async function estaArrancado(
  avd: string,
  adb: string,
  ejecutar: NonNullable<DependenciasDeDeteccion["ejecutar"]>
): Promise<boolean> {
  let lista: Ejecucion;
  try {
    lista = await ejecutar(adb, ["devices", "-l"], { timeout: TOPES_MS.adb });
  } catch {
    // adb puede estar arrancando su demonio: no es un fallo del arranque, es un sondeo más.
    return false;
  }
  for (const d of parsearAdbDevices(lista.stdout)) {
    if (d.clase !== "emulador" || d.estado !== "conectado") continue;
    try {
      const { stdout } = await ejecutar(adb, ["-s", d.id, "emu", "avd", "name"], { timeout: TOPES_MS.adb });
      if (nombreDeAvdDeConsola(stdout) === avd) return true;
    } catch {
      // Ese emulador no contesta todavía. Se sigue con los demás.
    }
  }
  return false;
}

/* Los dos accesos reales, aparte para que los tests no necesiten ni disco ni procesos. */
const existeDeVerdad = (ruta: string): boolean => existsSync(ruta);

const ejecutarDeVerdad: NonNullable<DependenciasDeDeteccion["ejecutar"]> = (binario, args, opciones) => {
  return new Promise((resolver, rechazar) => {
    execFile(binario, args, { timeout: opciones.timeout }, (error, stdout, stderr) => {
      if (error !== null) rechazar(error);
      else resolver({ stdout, stderr });
    });
  });
};
