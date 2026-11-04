import type { EnSerie } from "../../../core/serieDeEscrituras.js";

/**
 * **Las órdenes al MISMO aparato van una detrás de otra, en toda la sesión.** `executeToolCalls` de TrueForge corre las
 * tools de una respuesta con `Promise.all`, y el desarrollador pide varios scripts del aparato en la misma respuesta
 * (medido en la calculadora: `xone-desplegar-android`, `xone-probar …` juntos); y dos especialistas hermanos pueden
 * tocarlo a la vez. El servidor hotswap admite UNA conexión y cierra la anterior (`xone-hotswap --help`), así que dos a la
 * vez se cortan, y una recarga a mitad de otra prueba invalida su captura. `docs/PARALELISMO-TRUEFORGE.md` §5.2.
 *
 * La clave es el aparato RESUELTO (el de la sesión), no el agente: con otro aparato no se esperan. Una orden que falla o
 * se cancela libera la cola igual (`EnSerie` encadena con `finally`). Solo `execute`: lo demás del backend no toca el aparato.
 */
/** Lo que devuelve una orden que esperaba en la cola cuando se canceló el turno: no llegó a correr. */
export const ORDEN_CANCELADA_EN_COLA = { output: "Orden cancelada antes de empezar: el turno se paró mientras esperaba al aparato.", exitCode: 130 };

export function conColaDelAparato<T extends { execute(c: string): unknown }>(
  shell: T,
  enSerie: EnSerie,
  aparato: () => string | undefined,
  /**
   * La señal del turno EN CURSO (`docs/REVISION-PARALELISMO-UN-DISPOSITIVO.md` §4): una orden que esperaba su sitio y llega
   * a él con el turno ya parado NO arranca —ni después, ni en el turno siguiente—. La que estaba corriendo la para su
   * propia señal (la del backend).
   */
  senal: () => AbortSignal | undefined = () => undefined
): T {
  return new Proxy(shell, {
    get(destino, prop) {
      const valor = Reflect.get(destino, prop, destino);
      if (prop !== "execute" || typeof valor !== "function") return typeof valor === "function" ? (valor as (...a: unknown[]) => unknown).bind(destino) : valor;
      const execute = (valor as (c: string) => unknown).bind(destino);
      return async (comando: string) => {
        // La señal se lee al PEDIR: la del turno que la pidió, no la del que esté en marcha cuando le toque.
        const delTurno = senal();
        return await enSerie(`aparato:${aparato() ?? "de-la-sesion"}`, async () => (delTurno?.aborted === true ? ORDEN_CANCELADA_EN_COLA : await execute(comando)));
      };
    },
  });
}
