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
 * El inventario, en los DOS grupos que una persona distingue: lo que tiene en la mano y lo
 * que arranca en la máquina. No es `plataforma` (Android/iOS) ni `clase` a secas: un
 * emulador de Android y un simulador de iOS se eligen por lo mismo —no hay que enchufar
 * nada— y un iPhone y un Galaxy también.
 */
export function inventario(informe: InformeDeDispositivos): {
  fisicos: Dispositivo[];
  virtuales: Dispositivo[];
} {
  const fisicos = informe.dispositivos.filter((d) => d.clase === "fisico");
  const medidos = informe.dispositivos.filter((d) => d.clase !== "fisico");
  // Los AVD definidos son emuladores que existen y no están arrancados: `emulator
  // -list-avds` los da por NOMBRE y no aparecen en `adb devices` hasta que arrancan. Son
  // «simuladores disponibles» igual que un simulador de iOS apagado, así que se listan —
  // pero solo los que no estén ya arrancados, que sí vienen de adb con su propio serial.
  const arrancados = new Set(medidos.map((d) => d.nombre));
  const deAvds: Dispositivo[] = informe.avds
    .filter((a) => !arrancados.has(a))
    .map((a) => ({ id: `avd:${a}`, nombre: a, plataforma: "android", clase: "emulador", estado: "apagado" }));
  // Lo que está a mano primero: es lo que se va a elegir el 90% de las veces.
  const orden = (d: Dispositivo): number => (d.estado === "arrancado" || d.estado === "conectado" ? 0 : 1);
  const virtuales = [...medidos, ...deAvds].sort((a, b) => orden(a) - orden(b));
  return { fisicos, virtuales };
}
