/**
 * Quién no arranca hasta que otro termine, entre HIJOS que el orquestador lanzó a la vez.
 *
 * El orquestador delega en paralelo cuando le parece independiente, y no siempre lo es: en una pasada real lanzó a
 * `developer-xone` y a `designer-xone` a la vez, el desarrollador escribió el `.xne` antes de que el diseñador
 * terminara y **9 de los 26 recursos del diseñador se quedaron sin usar**. La cola por FICHERO solo evita que dos
 * escriban el mismo; no sabe de dependencias.
 *
 * ## Por qué NO se espera bloqueando (y la primera versión lo hacía)
 *
 * Es un dato del `.md` (`espera: [designer-xone]`). La primera versión paraba al desarrollador ANTES de cada
 * llamada al modelo mientras el diseñador estuviera vivo, y **atascó la pasada**: la librería ejecuta todos los hilos
 * activos juntos y solo devuelve el control cuando TODOS terminan su paso, y una aprobación de escritura del
 * diseñador solo se atiende al devolver el control. El desarrollador, parado dentro de su espera, impedía que
 * volviera, y el diseñador no podía acabar sin aprobación: un bloqueo mutuo, con la CPU a cero y sin ningún error. Los
 * tests con dobles no lo vieron porque el diseñador doble no pedía aprobación.
 *
 * Así que ahora **no bloquea nunca**: si al crear el hijo hay uno vivo —o anunciado por el mismo mensaje del
 * orquestador— de los que declara, el hijo **no arranca** y su llamada se devuelve al instante diciéndolo. El
 * orquestador, que ya tiene el informe del otro cuando lo recibe, vuelve a llamarlo con él en el encargo.
 */

export interface Esperas {
  /** El orquestador acaba de pedir un hilo de `nombre`; todavía no ha nacido. */
  anunciar(nombre: string): void;
  /** Nació un hilo de `nombre` (deja de estar solo anunciado). */
  nacio(nombre: string, hilo: string): void;
  /** El hilo terminó (bien o mal): deja de estar vivo y consta que `nombre` terminó. */
  murio(hilo: string): void;
  /** De esos nombres, cuáles hay vivos o anunciados ahora, sin contar `propio`. */
  vivos(nombres: readonly string[], propio?: string): string[];
  /** De esos nombres, cuáles han terminado en esta conversación. */
  terminados(nombres: readonly string[]): string[];
  /** Los hilos vivos y los anunciados se dieron por muertos (turno cortado, orquestador rehecho). Lo terminado consta. */
  darPorMuertos(): void;
  /** Otra conversación: se olvida todo. */
  olvidar(): void;
}

export function crearEsperas(): Esperas {
  const vivos = new Map<string, string>(); // hilo → nombre
  const anunciados: string[] = [];
  const terminados = new Set<string>();
  return {
    anunciar(nombre) {
      anunciados.push(nombre);
    },
    nacio(nombre, hilo) {
      const i = anunciados.indexOf(nombre);
      if (i >= 0) anunciados.splice(i, 1);
      vivos.set(hilo, nombre);
    },
    murio(hilo) {
      const nombre = vivos.get(hilo);
      if (nombre === undefined) return;
      vivos.delete(hilo);
      terminados.add(nombre);
    },
    vivos(nombres, propio) {
      const entre = [...vivos.entries()].filter(([h, n]) => h !== propio && nombres.includes(n)).map(([, n]) => n);
      return [...new Set([...entre, ...anunciados.filter((n) => nombres.includes(n))])];
    },
    terminados(nombres) {
      return nombres.filter((n) => terminados.has(n));
    },
    darPorMuertos() {
      vivos.clear();
      anunciados.length = 0;
    },
    olvidar() {
      vivos.clear();
      anunciados.length = 0;
      terminados.clear();
    },
  };
}
