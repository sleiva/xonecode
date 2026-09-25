/**
 * Convierte la política de depuración YA RESUELTA (`core/settings.ts#depuracionActiva`) en el
 * entorno EFECTIVO que ven las dos trazas opt-in (`XONECODE_TRACE_ERRORES` de
 * `agent/trazaDeErroresEnDisco.ts`, `XONECODE_TRACE_TOOLS` de `diagnosticoDeTools.ts`): la
 * misma pieza, el mismo trato.
 *
 * **Toma un booleano ya resuelto, nunca el campo crudo de `Settings`**: la regla de que
 * «ausente enciende» es de QUIEN LEE `settings.json`, no de esta función — así un llamador que
 * no sabe nada de settings (todo `npm test`) pasa `false` y el entorno sale exactamente igual
 * que entró, sin necesidad de conocer la omisión de la fase de pruebas.
 *
 * **Un env var explícito SIEMPRE gana, en los dos sentidos**: activa solo RELLENA lo que el
 * proceso no ha dicho, nunca pisa lo que alguien ya puso a mano — la misma precedencia que
 * `core/modelos.ts` aplica al resolver un modelo por papel.
 */
import { VARIABLE_TRAZA_ERRORES } from "../trazaDeErroresEnDisco.js";
import { VARIABLE_TRAZA_TOOLS } from "./diagnosticoDeTools.js";

export function entornoConDepuracion(
  activa: boolean,
  entorno: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  if (!activa) return entorno;
  return {
    ...entorno,
    ...(entorno[VARIABLE_TRAZA_ERRORES] === undefined ? { [VARIABLE_TRAZA_ERRORES]: "1" } : {}),
    ...(entorno[VARIABLE_TRAZA_TOOLS] === undefined ? { [VARIABLE_TRAZA_TOOLS]: "1" } : {}),
  };
}
