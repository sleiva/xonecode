/**
 * Esperar a que alguien pare la consola web, y que pararla sea un cierre ORDENADO.
 *
 * El cierre ordenado ya existía (`arrancarConsolaWeb`: corredor, vestíbulo, servidor): aborta
 * cada turno en vuelo, su `finally` escribe la foto de memoria y la consola vuelca el chat al
 * `.jsonl`. Lo frágil era la ESPERA: con `process.once`, una segunda señal no tenía oyente y
 * node aplicaba su acción por omisión —matar en seco a mitad del cierre—.
 *
 * Cuándo llega esa segunda señal, medido: cuando un `npm run <script>` cuyo comando es `tsx …`
 * A SECAS recibe un Ctrl-C, node recibe dos SIGINT —el del grupo del terminal y el que reenvía
 * npm unos 30 ms después—, y un cierre más largo que eso moría con 130. Con el `npm run web` de
 * hoy (`npm run build:web && tsx …`) NO pasa: el `sh` que el `&&` deja en medio se queda el
 * reenvío, y un cierre de 3 s sobrevive; tampoco con `./bin/xonecode` (`exec tsx`). Es una
 * guarda contra quitar ese `&&`, y lo que añade de verdad es el aviso y la salida forzada.
 *
 * Tres reglas:
 * - La PRIMERA señal empieza el cierre y lo DICE, con la salida forzada al lado.
 * - Una señal dentro de `VENTANA_DE_SENAL_REPETIDA_MS` es el reenvío: se ignora.
 * - Una posterior es alguien que insiste: un cierre colgado tiene que tener salida, y se
 *   FUERZA con el código de la señal (130 SIGINT, 143 SIGTERM).
 *
 * Los oyentes se quedan puestos a propósito hasta que el proceso sale: quitarlos devolvería
 * a node la acción por omisión justo cuando más falta hace no tenerla.
 */

/** Cuánto después de la primera señal una igual se toma por el reenvío de npm (medido: ~30 ms). */
export const VENTANA_DE_SENAL_REPETIDA_MS = 1_000;

type Senal = "SIGINT" | "SIGTERM";

const CODIGO_DE_SENAL: Record<Senal, number> = { SIGINT: 130, SIGTERM: 143 };

export interface OpcionesDeInterrupcion {
  /** De dónde llegan las señales. Por omisión, `process`. */
  fuente?: { on(senal: Senal, oyente: () => void): unknown };
  ahora?: () => number;
  /** Salir YA. Por omisión, `process.exit`. */
  forzar?: (codigo: number) => void;
  avisar?: (texto: string) => void;
}

export function esperarInterrupcion(opciones: OpcionesDeInterrupcion = {}): Promise<void> {
  const fuente = opciones.fuente ?? process;
  const ahora = opciones.ahora ?? Date.now;
  const forzar = opciones.forzar ?? ((codigo: number) => process.exit(codigo));
  const avisar = opciones.avisar ?? (() => undefined);
  return new Promise<void>((resolver) => {
    let primera: number | undefined;
    const alRecibir = (senal: Senal): void => {
      const t = ahora();
      if (primera === undefined) {
        primera = t;
        avisar("cerrando: se guarda lo que estaba en marcha… (Ctrl-C otra vez para forzar)\n");
        resolver();
        return;
      }
      if (t - primera < VENTANA_DE_SENAL_REPETIDA_MS) return;
      avisar("cierre forzado: lo que estaba en marcha puede no haberse guardado\n");
      forzar(CODIGO_DE_SENAL[senal]);
    };
    fuente.on("SIGINT", () => alRecibir("SIGINT"));
    fuente.on("SIGTERM", () => alRecibir("SIGTERM"));
  });
}
