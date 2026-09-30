/**
 * Las reglas de nombre de AVD y de puerto, REDECLARADAS de `src/core/puertosDeAvd.ts`: el
 * cliente no importa de `src/`. Las negativas del servidor van por `informar`, que no sale del
 * vestíbulo, así que la comprobación se hace AQUÍ antes de enviar y con las mismas reglas (el
 * servidor sigue decidiendo: esto solo evita mandar lo que se sabe que se rechaza).
 */
import type { AjustesDeDispositivos } from "./tipos.js";

export const FORMA_DE_NOMBRE_DE_AVD = /^[A-Za-z0-9._][A-Za-z0-9._-]*$/;
const LARGO_MAXIMO_DE_NOMBRE = 64;
const PUERTOS_DE_EMULADOR = { desde: 5554, hasta: 5585 } as const;

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

/**
 * ¿Se puede ELIMINAR este AVD ahora? Las dos negativas del servidor (`atenderEliminarEmulador`),
 * con sus mismas frases, para aplicarlas ANTES de enviar: la del servidor no llega al navegador.
 * `avds` son todos los que la medida vio; `enMarcha`, los que corren (no «apagado» ni «no disponible»).
 * El último no se elimina nunca —es la base de las copias— y uno encendido tiene sus discos bloqueados.
 */
export function motivoParaNoEliminarAvd(
  avd: string,
  avds: readonly string[],
  enMarcha: readonly string[],
): string | undefined {
  if (avds.length <= 1) return "es el único: siempre tiene que quedar al menos uno";
  if (enMarcha.includes(avd)) return "apágalo para eliminarlo";
  return undefined;
}
