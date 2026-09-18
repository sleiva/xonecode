/**
 * El APARATO como sensor del bucle de reparación: ¿qué dice la app al arrancar?
 *
 * Es la tercera fuente de hallazgos, y contesta una pregunta que las otras dos no pueden.
 * `xone-simulator validate` mira la estructura y `smoke` ejecuta el ciclo de vida en un
 * runtime de Node; ninguno de los dos sabe si la app ARRANCA en un Android de verdad, con su
 * SQLite, sus recursos y su Rhino. Medido sobre AppDemo: el simulador daba verde y el aparato
 * decía `Invalid resource ID 0x6000000N` cinco veces distintas.
 *
 * CUATRO REGLAS, y las cuatro salieron de medir:
 *
 *  - **Despliega SIEMPRE antes de leer.** Sin eso el log sería de la versión anterior del
 *    proyecto, y devolverle al agente errores que ya arregló es la peor clase de feedback:
 *    plausible y falso. El despliegue en caliente costó 5 s sobre un `pixel8`.
 *  - **El buffer se vacía ANTES de reiniciar.** Es lo que ya hace `xone-desplegar-android` por
 *    su cuenta y por el mismo motivo: si no, lo que se lee es la excepción del intento
 *    anterior, que es la forma más fácil de creer que algo sigue roto cuando ya no lo está.
 *  - **Sin aparato es fallo del ENTORNO, no un rojo.** La misma familia que
 *    `ErrorDelSimulador`: un informe rojo diría «tu proyecto está mal» cuando lo que pasa es
 *    que no hay móvil enchufado. Y **no se arranca uno solo**: levantar un emulador cuesta
 *    minutos de la máquina de alguien, y esa decisión no la toma un sensor — para eso está
 *    `xone-arrancar-android`, que el agente puede llamar.
 *  - **Solo ve la pantalla de ENTRADA, y se declara.** El despliegue reinicia la app, así que
 *    lo que se lee es lo que pasa al arrancar. Para tener hallazgos de una colección concreta
 *    hay que NAVEGAR hasta ella, y eso es trabajo del `device-controller` dentro del turno, no
 *    de un sensor automático.
 *
 * Todo entra por dependencias: `npm test` no puede necesitar un aparato.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { InformeVerificacion } from "../../core/ports.js";
import { hallazgosDeLog } from "../../core/logDeDispositivo.js";
import { RAIZ_SKILLS } from "../grafo/skills.js";
import { localizadorDeAndroid, TOPES_MS } from "./dispositivosEnMaquina.js";
import { parsearAdbDevices } from "../../core/dispositivos.js";

/** No se pudo PREGUNTARLE al aparato. Entorno, no proyecto. */
export class ErrorDelAparato extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "ErrorDelAparato";
  }
}

export interface DependenciasDelSensor {
  /** ¿Hay algún aparato conectado? */
  hayAparato: () => Promise<boolean>;
  /** Vacía el buffer del log. */
  limpiarLog: () => Promise<void>;
  /** Pone el proyecto en el aparato y deja la app arrancada. */
  desplegar: (raiz: string) => Promise<{ ok: boolean; detalle: string }>;
  /** El log del host tras el arranque. */
  leerLog: () => Promise<string>;
}

/**
 * Despliega y devuelve lo que el aparato dijo, en la forma que el bucle ya consume.
 *
 * **Verde es que no hay hallazgos DE LA APP.** Lo de la plataforma viaja en el informe —no se
 * tira nunca, ver `core/logDeDispositivo.ts`— pero como `warning`, así que no pinta el turno
 * de rojo: son quejas de Android sobre sí mismo y nadie las puede arreglar desde un `.xne`.
 */
export async function arranqueEnDispositivo(
  raiz: string,
  deps: DependenciasDelSensor
): Promise<InformeVerificacion> {
  if (!(await deps.hayAparato())) {
    throw new ErrorDelAparato(
      "no hay ningún aparato conectado, así que no se ha podido probar el arranque"
    );
  }

  await deps.limpiarLog();
  const despliegue = await deps.desplegar(raiz);
  if (!despliegue.ok) {
    /**
     * Que el despliegue falle NO es un proyecto roto: puede ser el túnel, el canal o que el
     * host no esté instalado. Se lanza, y quien llama lo dice como aviso — igual que el
     * binario del simulador que falta.
     */
    throw new ErrorDelAparato(`no se pudo desplegar en el aparato: ${despliegue.detalle}`);
  }

  const { aHallazgosDelTurno } = hallazgosDeLog(await deps.leerLog());
  const hallazgos = aHallazgosDelTurno();
  return { verde: !hallazgos.some((h) => h.severidad === "error"), hallazgos };
}


/** El host de XOne en Android. Vive aquí y en los scripts de la skill, que son otro proceso. */
const PAQUETE = "com.xone.android.framework";

/**
 * Cuánto se le da al despliegue. El script hace la cadena entera —túnel, ZIP, subida,
 * reinicio, lanzamiento y comprobación de que la app está VIVA— y sobre un `pixel8` en
 * caliente tardó 5 s con un proyecto de 6,8 MB. El tope es para el caso frío con un proyecto
 * grande, y por debajo del tope de reloj de un comando del harness.
 */
export const TOPE_DE_DESPLIEGUE_MS = 300_000;

/**
 * El sensor de verdad: `adb` para el log y el script de la skill para el despliegue.
 *
 * **El despliegue NO se reimplementa aquí.** `xone-desplegar-android` ya es la cadena medida
 * —y la única que sabe que hay que reiniciar con `SetupActivity` y no con `.mainEntry`, y que
 * el ZIP va sin `.xonecode`—. Reescribirla sería un segundo sitio donde esa secuencia puede
 * divergir, que es como este repo se ha roto siempre.
 */
export function sensorDeArranqueReal(): DependenciasDelSensor {
  const { enSdk } = localizadorDeAndroid({
    plataforma: process.platform,
    entorno: process.env,
    home: process.env["HOME"] ?? "",
    existe: (ruta) => existsSync(ruta),
  });
  const adb = enSdk("adb", "platform-tools");
  const correr = (binario: string, args: string[], ms: number): Promise<string> =>
    new Promise((resolver, rechazar) => {
      execFile(binario, args, { timeout: ms, maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
        if (error !== null) rechazar(error);
        else resolver(stdout);
      });
    });
  const exigirAdb = (): string => {
    if (adb === undefined) throw new ErrorDelAparato("no encuentro «adb»: ni en el PATH ni en el SDK");
    return adb;
  };

  return {
    hayAparato: async () => {
      try {
        return parsearAdbDevices(await correr(exigirAdb(), ["devices"], TOPES_MS.adb)).some(
          (d) => d.estado === "conectado"
        );
      } catch {
        // No poder preguntar no es «no hay»: se dice arriba, con su motivo.
        throw new ErrorDelAparato("no se pudo preguntar a adb qué aparatos hay");
      }
    },

    limpiarLog: async () => {
      await correr(exigirAdb(), ["logcat", "-c"], TOPES_MS.adb);
    },

    desplegar: async (raiz) => {
      const script = join(RAIZ_SKILLS, "xone-hotswap", "scripts", "xone-desplegar-android");
      if (!existsSync(script)) return { ok: false, detalle: "falta xone-desplegar-android en el paquete" };
      try {
        // El `cwd` es la raíz del proyecto: el script empaqueta lo que hay ahí.
        await new Promise<void>((resolver, rechazar) => {
          execFile(
            process.execPath,
            [script],
            { cwd: raiz, timeout: TOPE_DE_DESPLIEGUE_MS, maxBuffer: 16 * 1024 * 1024 },
            (error) => (error === null ? resolver() : rechazar(error))
          );
        });
        return { ok: true, detalle: "" };
      } catch (error) {
        // Una línea, no el volcado: esto va a un aviso del turno.
        const texto = error instanceof Error ? error.message : String(error);
        return { ok: false, detalle: texto.split("\n")[0] ?? "falló el despliegue" };
      }
    },

    leerLog: async () => {
      const pid = (await correr(exigirAdb(), ["shell", "pidof", PAQUETE], TOPES_MS.adb))
        .trim()
        .split(/\s+/)[0];
      if (pid === undefined || pid === "") {
        /**
         * La app NO está viva tras desplegar. Es un hecho del proyecto y no del entorno —el
         * despliegue dijo que sí—, así que no se lanza: se devuelve lo que haya sin acotar por
         * PID, que es donde estará la traza de la muerte. Filtrar por un PID que ya no existe
         * se llevaría por delante justo esa traza.
         */
        return correr(exigirAdb(), ["logcat", "-d", "-t", "400"], TOPES_MS.adb);
      }
      return correr(exigirAdb(), ["logcat", "-d", "--pid", pid], TOPES_MS.adb);
    },
  };
}
