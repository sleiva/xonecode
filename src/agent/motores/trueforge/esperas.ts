/**
 * Quién espera a quién, entre HIJOS que el orquestador lanzó a la vez.
 *
 * El orquestador delega en paralelo cuando le parece independiente, y no siempre lo es: en una pasada real de la
 * calculadora lanzó a `developer-xone` y a `designer-xone` a la vez, el desarrollador escribió el `.xne` antes de
 * que el diseñador terminara sus recursos y **9 de los 26 recursos del diseñador se quedaron sin usar**. Nada en
 * el arnés lo evitaba: lo único que serializaba dos escritores era la cola por FICHERO, no por dependencia.
 *
 * Es un dato del `.md` (`espera: [designer-xone]`): quien lo declara no hace su PRIMERA llamada al modelo —ni
 * ninguna otra— mientras haya un hilo VIVO de esos especialistas. Solo en un sentido (el que declara espera al
 * otro), así que no hay ciclos posibles entre dos que se declaren mutuamente… salvo que alguien lo escriba en los
 * dos `.md`, y por eso una espera que no se resuelve en `TOPE_DE_ESPERA_MS` se suelta y se dice.
 */

/** Lo máximo que un hijo espera a otro. Un diseñador de recursos tarda del orden de diez minutos. */
export const TOPE_DE_ESPERA_MS = 20 * 60_000;

export interface Esperas {
  /** Nació un hilo de `nombre`. */
  nacio(nombre: string, hilo: string): void;
  /** El hilo terminó (bien o mal). */
  murio(hilo: string): void;
  /**
   * Espera a que no quede vivo ningún hilo de esos especialistas, y devuelve CUÁLES esperó (vacío si no había
   * que esperar). `propio` no cuenta aunque coincida en nombre.
   */
  esperarA(nombres: readonly string[], propio: string): Promise<string[]>;
  /** Los hilos vivos se dieron por muertos (turno cortado, orquestador rehecho, otra conversación). */
  darPorMuertos(): void;
}

export function crearEsperas(tope: number = TOPE_DE_ESPERA_MS): Esperas {
  const vivos = new Map<string, string>(); // hilo → nombre
  const avisar = new Set<() => void>();
  const vivosDe = (nombres: readonly string[], propio: string): string[] => [
    ...new Set([...vivos.entries()].filter(([h, n]) => h !== propio && nombres.includes(n)).map(([, n]) => n)),
  ];
  const despertar = (): void => {
    for (const f of [...avisar]) f();
  };
  return {
    nacio(nombre, hilo) {
      vivos.set(hilo, nombre);
    },
    murio(hilo) {
      if (vivos.delete(hilo)) despertar();
    },
    async esperarA(nombres, propio) {
      const esperadas = vivosDe(nombres, propio);
      if (esperadas.length === 0) return [];
      await new Promise<void>((resolver) => {
        const suelta = (): void => {
          if (vivosDe(nombres, propio).length > 0) return;
          avisar.delete(suelta);
          clearTimeout(reloj);
          resolver();
        };
        const reloj = setTimeout(() => {
          avisar.delete(suelta);
          resolver();
        }, tope);
        avisar.add(suelta);
      });
      return esperadas;
    },
    darPorMuertos() {
      vivos.clear();
      despertar();
    },
  };
}
