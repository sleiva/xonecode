/**
 * El puerto LOCAL del túnel de hotswap, uno por AVD.
 *
 * Medido: `adb -s B forward tcp:8443 tcp:8443` le QUITA el puerto a `A` sin error, así que
 * con dos emuladores y un puerto fijo la sesión de uno acaba hablando con el aparato del otro.
 * Dentro de cada aparato el 8443 es independiente; lo que se reparte es el del Mac.
 *
 * Con UN solo AVD el puerto es el de siempre y no hay nada que decidir (decisión suya: la UI
 * no enseña campo). Pero se GUARDA igual (`asignarPuertosPendientes` también siembra al único):
 * si se sembrara solo al aparecer el segundo, por orden alfabético, un AVD nuevo que ordenara
 * antes le quitaría el 8443 al que ya se usaba.
 *
 * **Un móvil FÍSICO también tiene el suyo, por su serie** (IXCODE-32): iba siempre al 8443, que
 * es también el del primer AVD, y con el móvil y el emulador enchufados el último `adb forward`
 * se quedaba el puerto — la sesión del móvil acababa hablando con el emulador sin error. Se
 * siembra igual que el de un AVD (solo AÑADE) y, mientras no está sembrado, es el primero LIBRE
 * (`primerPuertoLibre`), el mismo que la siembra le daría.
 *
 * Puro: ni disco ni red. La copia que LEEN los scripts está en
 * `skills/xone-hotswap/lib/dispositivo.mjs`, y un test compara las dos.
 */
import type { AjustesDeDispositivos } from "./settings.js";

/** El puerto del servidor hotswap DENTRO del aparato, y el local por omisión. */
export const PUERTO_DEL_HOTSWAP = 8443;

/** La consola y el adb de los emuladores viven aquí: un túnel encima los rompería. */
const PUERTOS_DE_EMULADOR = { desde: 5554, hasta: 5585 } as const;

/** La MISMA forma que acepta `arranqueDeEmulador.ts`: lo que puede ser una carpeta de `~/.android/avd`. */
export const FORMA_DE_NOMBRE_DE_AVD = /^[A-Za-z0-9._][A-Za-z0-9._-]*$/;
const LARGO_MAXIMO_DE_NOMBRE = 64;

/** La forma de un serial de adb: USB (`R58M123`), por red (`192.168.1.5:5555`) o mDNS (`adb-…._adb-tls-connect._tcp`). */
export const FORMA_DE_SERIE = /^[A-Za-z0-9._:-]{1,128}$/;

export function puertoDeAvd(ajustes: AjustesDeDispositivos | undefined, avd: string): number {
  return ajustes?.avds?.[avd]?.puerto ?? PUERTO_DEL_HOTSWAP;
}

/** Todos los puertos ya guardados, de AVD y de físicos: los que no se pueden volver a dar. */
function puertosGuardados(ajustes: AjustesDeDispositivos | undefined): Set<number> {
  return new Set(
    [...Object.values(ajustes?.avds ?? {}), ...Object.values(ajustes?.fisicos ?? {})]
      .map((a) => a.puerto)
      .filter((p): p is number => p !== undefined),
  );
}

/** El primer puerto desde el 8443 que no tiene nadie. */
function primerPuertoLibre(usados: ReadonlySet<number>): number {
  let candidato = PUERTO_DEL_HOTSWAP;
  while (usados.has(candidato)) candidato++;
  return candidato;
}

/** El puerto de un móvil físico: el guardado para su serie o, sin él, el primero libre. */
export function puertoDeFisico(ajustes: AjustesDeDispositivos | undefined, serie: string): number {
  return ajustes?.fisicos?.[serie]?.puerto ?? primerPuertoLibre(puertosGuardados(ajustes));
}

/**
 * El puerto local del túnel de un Android, sea emulador o físico. Un emulador cuyo AVD no se pudo
 * identificar va al de siempre, como hasta ahora: no hay de quién leer otro.
 */
export function puertoDeDispositivo(
  ajustes: AjustesDeDispositivos | undefined,
  d: { id: string; clase: "emulador" | "simulador" | "fisico"; avd?: string },
): number {
  if (d.clase === "fisico") return puertoDeFisico(ajustes, d.id);
  return d.avd === undefined ? PUERTO_DEL_HOTSWAP : puertoDeAvd(ajustes, d.avd);
}

/**
 * Los puertos que faltan, o `undefined` si no falta ninguno. Solo AÑADE: un puerto guardado no
 * se mueve nunca. Entre los que faltan, por orden alfabético (que no dependa del orden de
 * `emulator -list-avds`), desde el 8443 si está libre. Como el único AVD ya queda sembrado, el
 * orden solo decide entre AVD que aparecieron a la vez.
 */
export function asignarPuertosPendientes(
  avds: readonly string[],
  ajustes: AjustesDeDispositivos | undefined,
): Record<string, number> | undefined {
  if (avds.length === 0) return undefined;
  const usados = puertosGuardados(ajustes);
  const nuevos: Record<string, number> = {};
  for (const avd of [...avds].sort()) {
    if (ajustes?.avds?.[avd]?.puerto !== undefined) continue;
    const puerto = primerPuertoLibre(usados);
    nuevos[avd] = puerto;
    usados.add(puerto);
  }
  return Object.keys(nuevos).length === 0 ? undefined : nuevos;
}

/**
 * Lo mismo para los móviles físicos Android medidos, por su serie: solo AÑADE, y salta todo
 * puerto guardado (de AVD o de otro físico). Se llama DESPUÉS de sembrar los AVD, con los ajustes
 * ya releídos, para que un AVD nuevo y un físico nuevo no se lleven el mismo.
 */
export function asignarPuertosDeFisicos(
  series: readonly string[],
  ajustes: AjustesDeDispositivos | undefined,
): Record<string, number> | undefined {
  const usados = puertosGuardados(ajustes);
  const nuevos: Record<string, number> = {};
  for (const serie of [...new Set(series)].sort()) {
    if (!FORMA_DE_SERIE.test(serie) || ajustes?.fisicos?.[serie]?.puerto !== undefined) continue;
    const puerto = primerPuertoLibre(usados);
    nuevos[serie] = puerto;
    usados.add(puerto);
  }
  return Object.keys(nuevos).length === 0 ? undefined : nuevos;
}

export function motivoDePuertoInaceptable(
  puerto: number,
  avd: string,
  ajustes: AjustesDeDispositivos | undefined,
): string | undefined {
  if (!Number.isInteger(puerto) || puerto < 1024 || puerto > 65535) {
    return "el puerto tiene que ser un número entero entre 1024 y 65535";
  }
  if (puerto >= PUERTOS_DE_EMULADOR.desde && puerto <= PUERTOS_DE_EMULADOR.hasta) {
    return `del ${PUERTOS_DE_EMULADOR.desde} al ${PUERTOS_DE_EMULADOR.hasta} los usan los propios emuladores`;
  }
  for (const [otro, a] of Object.entries(ajustes?.avds ?? {})) {
    if (otro !== avd && a.puerto === puerto) return `el ${puerto} ya es de ${otro}`;
  }
  for (const [serie, a] of Object.entries(ajustes?.fisicos ?? {})) {
    if (a.puerto === puerto) return `el ${puerto} ya es del móvil ${serie}`;
  }
  return undefined;
}

export function motivoDeNombreDeAvdInaceptable(nombre: string, existentes: readonly string[]): string | undefined {
  if (nombre === "") return "falta el nombre";
  if (nombre.length > LARGO_MAXIMO_DE_NOMBRE) return `el nombre no puede pasar de ${LARGO_MAXIMO_DE_NOMBRE} caracteres`;
  if (!FORMA_DE_NOMBRE_DE_AVD.test(nombre)) {
    return "solo letras, números, «.», «_» y «-», y sin empezar por «-»";
  }
  if (existentes.includes(nombre)) return `${nombre} ya existe`;
  return undefined;
}

/** Los argumentos de `emulator`. Sin ventana lleva `-no-metrics`: su aviso será una pregunta que nadie ve. */
export function argsDeArranque(avd: string, opciones: { sinVentana?: boolean }): string[] {
  return opciones.sinVentana === true ? ["-avd", avd, "-no-window", "-no-audio", "-no-metrics"] : ["-avd", avd];
}
