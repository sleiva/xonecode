/**
 * El dispositivo con el que trabaja una sesión, visto desde el AGENTE.
 *
 * La pastilla del chat ya guardaba la elección (`web/servidor/sesiones.ts#DispositivoElegido`),
 * pero solo la usaba la pestaña Ejecutar: al `device-controller` no le llegaba, y con varios
 * aparatos conectados usaba el que adb diera por omisión —o el que el modelo se acordara de
 * pasar con `--serie`—. Pedido por él: que use el que se eligió, y sin elección, un emulador.
 *
 * **Viaja por un FICHERO y no por una variable de entorno con el valor**: la shell del agente
 * fija sus variables al construirse, así que cambiar de dispositivo con la sesión abierta
 * dejaría la variable con el de antes. La variable lleva la RUTA del fichero, que es fija por
 * sesión, y los scripts lo leen en cada ejecución (`skills/xone-hotswap/lib/dispositivo.mjs`).
 *
 * Puro: ni disco ni red.
 */
import { dirname, join } from "node:path";
import { carpetaDeArtefactosDeSesion } from "./artefactos.js";
import { dispositivoDeValor, type DispositivoDeLaSesion } from "./dispositivoElegido.js";

/** La variable que nombra el fichero con el dispositivo de la sesión. */
export const VARIABLE_DE_DISPOSITIVO = "XONECODE_DISPOSITIVO";

/** Lo que se guarda en el fichero: lo mismo que la pastilla, sin el estado en vivo. Vive en un
 *  módulo aparte porque `settings.ts` también lo lee, y desde aquí sería un ciclo. */
export type { DispositivoDeLaSesion } from "./dispositivoElegido.js";

/** El fichero, al lado de la carpeta de artefactos de la sesión y no dentro: lo de dentro se
 *  ANUNCIA como artefacto, y esto no es una salida para nadie. */
export function ficheroDeDispositivo(carpetaDeArtefactos: string): string {
  return join(dirname(carpetaDeArtefactos), "dispositivo.json");
}

export function ficheroDeDispositivoDeSesion(raiz: string, id: string): string {
  return ficheroDeDispositivo(carpetaDeArtefactosDeSesion(raiz, id));
}

/**
 * El contenido del fichero, validado como lo valida `skills/xone-hotswap/lib/dispositivo.mjs`
 * (`dispositivoDeLaSesion`): las dos lecturas tienen que coincidir, o la shell y los scripts
 * creerían en aparatos distintos. Roto o incompleto = no hay elección.
 */
export function dispositivoDeTexto(texto: string): DispositivoDeLaSesion | undefined {
  try {
    return dispositivoDeValor(JSON.parse(texto));
  } catch {
    return undefined;
  }
}

const CLASE: Record<DispositivoDeLaSesion["clase"], string> = {
  emulador: "emulador",
  simulador: "simulador",
  fisico: "dispositivo físico",
  granja: "granja de dispositivos",
};

/**
 * La línea que se le DICE al agente al mandar cada turno. La garantía la ponen los scripts, que
 * leen el fichero; esto es para que el orquestador lo nombre al delegar y el `device-controller`
 * sepa con cuál trabaja en vez de descubrirlo, y no se pelee con él pasando otro `--serie`.
 */
export function lineaDelDispositivo(d: DispositivoDeLaSesion | undefined): string {
  if (d === undefined) {
    return (
      "[Dispositivo de esta sesión: ninguno elegido. Si hay que probar en un aparato, los scripts de " +
      "xone-hotswap prefieren un EMULADOR (o simulador) conectado antes que un dispositivo físico.]"
    );
  }
  if (d.clase === "granja") {
    // Los scripts ya llegan a la copia; adb no. Se DICE para que el agente no busque un aparato de este equipo
    // por su cuenta; la garantía la ponen los scripts.
    return (
      "[Dispositivo de esta sesión: la GRANJA de dispositivos XOne, que este proyecto usa en vez de los " +
      "aparatos de este equipo. La primera vez que un script hable con el aparato, XOneCode pide una copia libre y " +
      "la LIBERA (borrándola) al acabar este turno: lo desplegado no sigue en el siguiente, así que cada turno que " +
      "pruebe empieza por xone-desplegar-android. Los scripts de xone-hotswap (desplegar, recargar, captura, log, " +
      "reiniciar) ya van a esa copia sin --serie; no uses adb, que no llega a ella. Lo cambia la persona en la " +
      "pastilla del chat.]"
    );
  }
  const plataforma = d.plataforma === "android" ? "Android" : "iOS";
  const como = d.plataforma === "android" ? `--serie ${d.id}` : `--udid ${d.id}`;
  return (
    `[Dispositivo de esta sesión: ${d.nombre} (${CLASE[d.clase]} ${plataforma}, id ${d.id}). ` +
    `Los scripts de xone-hotswap ya lo usan por omisión; no hace falta pasar ${como}. ` +
    (d.plataforma === "android" ? `Con \`adb\` a mano pásalo SIEMPRE: \`adb -s ${d.id} …\`. ` : "") +
    "Otro aparato se rechaza: lo cambia la persona en la pastilla del chat.]"
  );
}
