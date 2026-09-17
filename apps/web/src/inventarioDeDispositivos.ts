/**
 * El inventario de la máquina, agrupado como lo distingue una persona: lo que se enchufa y
 * lo que se arranca. Lo comparten la sección Dispositivos de Ajustes —donde se ve— y la
 * pastilla del compositor —donde se elige—; una segunda copia divergiría el día que una de
 * las dos aprendiera algo que la otra no.
 */
import type { Dispositivo, InformeDeDispositivos } from "./tipos.js";

/** Las mismas palabras que el panel «Tu equipo»: dos vocabularios para un estado divergen. */
export const ETIQUETA_DE_ESTADO: Record<Dispositivo["estado"], string> = {
  conectado: "conectado",
  arrancado: "arrancado",
  apagado: "apagado",
  "sin-autorizar": "sin autorizar",
  offline: "offline",
  "no-disponible": "no disponible",
};

/**
 * **Se LLEGA al dispositivo**, que es el único hecho que importa para pintarlo en verde.
 *
 * Los dos parsers del host le dan dos nombres al mismo hecho —`parsearAdbDevices` dice
 * `conectado` y `parsearSimctl` dice `arrancado`— y el tipo admite los dos a propósito. El
 * render los tenía partidos: la lista de simuladores y emuladores miraba solo `arrancado`, así
 * que un emulador de Android en marcha salía con el punto GRIS en la misma lista donde un
 * simulador de iOS ponía el verde. Mismo árbol, mismo vocabulario partido en dos.
 *
 * Aquí, una vez: quien pinte pregunta por el hecho y no por su nombre.
 */
export function seLlegaAlDispositivo(d: Pick<Dispositivo, "estado">): boolean {
  return d.estado === "conectado" || d.estado === "arrancado";
}

/**
 * Una fila del inventario: un dispositivo del informe, o un AVD que solo existe como
 * DEFINICIÓN.
 *
 * `soloDefinicion` marca las filas que este módulo INVENTA a partir de `informe.avds`, y es
 * la diferencia que importa: el servidor resuelve el dispositivo elegido contra
 * `informe.dispositivos`, donde esas filas no están, así que elegirlas no encontraba nada, no
 * hacía nada y no lo decía — un control sin dato detrás.
 *
 * Va como DATO y no se deduce del prefijo `avd:` del id: ese prefijo es vocabulario de este
 * módulo, y preguntarle a una cadena por su forma es lo que aquí ya salió mal una vez.
 */
export type FilaDeInventario = Dispositivo & { soloDefinicion?: true };

/**
 * El inventario, en los DOS grupos que una persona distingue: lo que tiene en la mano y lo
 * que arranca en la máquina. No es `plataforma` (Android/iOS) ni `clase` a secas: un
 * emulador de Android y un simulador de iOS se eligen por lo mismo —no hay que enchufar
 * nada— y un iPhone y un Galaxy también.
 */
export function inventario(informe: InformeDeDispositivos): {
  fisicos: FilaDeInventario[];
  virtuales: FilaDeInventario[];
} {
  const fisicos = informe.dispositivos.filter((d) => d.clase === "fisico");
  const medidos = informe.dispositivos.filter((d) => d.clase !== "fisico");
  /**
   * Los AVD definidos son emuladores que existen y no están arrancados: `emulator -list-avds`
   * los da por NOMBRE y no aparecen en `adb devices` hasta que arrancan. Son «simuladores
   * disponibles» igual que un simulador de iOS apagado, así que se listan — pero solo los que
   * no estén ya arrancados.
   *
   * **Y eso se empareja por `avd`, nunca por el nombre visible.** Los dos lados no podían
   * coincidir jamás: `emulator -list-avds` da `pixel8` y el nombre de `adb devices -l` sale de
   * `model:`, que con la imagen `google_apis` es `sdk gphone64 arm64`. Así que el filtro no
   * filtraba y el AVD arrancado se añadía además como «apagado»: dos filas para un aparato, y
   * una afirmando lo contrario de la verdad. El `avd` lo mide el HOST
   * (`core/dispositivos.ts#nombreDeAvdDeConsola`) porque el cliente no habla con la máquina.
   *
   * **Límite declarado**: un emulador sin `avd` medido no se puede atribuir, y entonces su AVD
   * se sigue listando —el comportamiento de antes para ese caso—. Se prefiere una fila de más a
   * esconder un AVD que sí se puede arrancar, y solo pasa si la consola del emulador no
   * contesta o si es un emulador de terceros.
   */
  const arrancados = new Set(
    medidos.map((d) => d.avd).filter((a): a is string => a !== undefined)
  );
  const deAvds: FilaDeInventario[] = informe.avds
    .filter((a) => !arrancados.has(a))
    .map((a) => ({
      id: `avd:${a}`,
      nombre: a,
      plataforma: "android",
      clase: "emulador",
      estado: "apagado",
      // No hay aparato al que hablar: quien ofrezca esta fila tiene que decirlo.
      soloDefinicion: true,
    }));
  // Lo que está a mano primero: es lo que se va a elegir el 90% de las veces.
  const orden = (d: FilaDeInventario): number => (seLlegaAlDispositivo(d) ? 0 : 1);
  const virtuales = [...medidos, ...deAvds].sort((a, b) => orden(a) - orden(b));
  return { fisicos, virtuales };
}
