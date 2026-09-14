import { abreviar } from "../cifras.js";
import { formatearMs } from "../tiempo.js";
import estilos from "./BarraDeEstado.module.css";

/**
 * La barra de estado inferior: turnos, pasos, tiempo del último turno y contexto.
 *
 * Presentacional a propósito, como `Barra`/`Cabecera`/`Compositor`: no lee el store ni
 * calcula nada, solo pinta lo que le pasan por prop. El precedente es
 * `cli/main.ts#formatearBarra` (`PiezasDeBarra`), que ya separa «quien tiene los
 * valores compone» de «quien tiene el color pinta» para poder probar sin TTY — aquí el
 * motivo es el mismo con jsdom en vez de TTY.
 *
 * `contexto`/`tope` llegan sueltos y no como un único número: **el porcentaje solo se
 * pinta si hay tope** (`core/contextos.ts#topeResuelto`) — ollama no tiene tope a
 * propósito, cada modelo local trae el suyo, y un porcentaje sobre un número inventado
 * es una mentira con forma de cifra. Los dos salen hoy del mensaje `consumo`
 * (`ventana {usado, tope?}`), que es lo que hace que esta pieza exista: vivía aquí desde
 * el principio pero estaba MUERTA, porque nadie le pasaba el dato. Se mudó aquí desde el
 * contador del compositor por una razón que no es de sitio: allí compartía fila con los
 * acumulados de la conversación y se leía como una tercera cuenta de lo gastado, cuando
 * contesta la pregunta contraria —cuánto margen queda antes de que toque resumir—.
 */
export interface PiezasDeLaBarraDeEstado {
  turnos: number;
  pasos: number;
  /** Tiempo del ÚLTIMO turno cerrado (`acto.fin.ms`), no un acumulado de la sesión. */
  ms?: number;
  /** Ocupación actual de la ventana del modelo. Ausente antes de la primera respuesta. */
  contexto?: number;
  /** El tope de `topeResuelto`; ausente con ollama u otro modelo sin familia conocida. */
  tope?: number;
  /**
   * Cuántos segundos lleva el turno EN VUELO. Mientras esté puesto sustituye a `ms`: medido
   * en pantalla, durante un turno de 116 segundos el pie decía «10,7 s», el tiempo del turno
   * anterior, y no había forma de saber cuánto llevaba éste.
   */
  segundosEnVuelo?: number;
}

/** El texto de `ctx`: cifra pelada sin tope, con `%` solo si hay tope. Cadena vacía sin contexto que medir. */
function formatearContexto(contexto: number | undefined, tope: number | undefined): string {
  if (contexto === undefined || contexto <= 0) return "";
  // Las DOS cifras con el MISMO abreviador que el contador del compositor
  // (`cifras.ts#abreviar`): el mismo dato escrito de dos formas es como se aprende a
  // desconfiar de las dos, y aquí se juntaban `3269/1000000` con `3,3k` en la misma
  // pantalla. El porcentaje no se abrevia —es un porcentaje, no una cuenta—.
  const porcentaje = tope !== undefined ? ` (${Math.round((contexto / tope) * 100)}%)` : "";
  const sobreTope = tope !== undefined ? `/${abreviar(tope)}` : "";
  return `ctx ${abreviar(contexto)}${sobreTope}${porcentaje}`;
}

export function BarraDeEstado({ turnos, pasos, ms, contexto, tope, segundosEnVuelo }: PiezasDeLaBarraDeEstado) {
  const textoDeContexto = formatearContexto(contexto, tope);
  return (
    <footer className={estilos.barra}>
      <span className={estilos.pieza}>{turnos} turno{turnos === 1 ? "" : "s"}</span>
      <span className={estilos.separador} aria-hidden="true">·</span>
      <span className={estilos.pieza}>{pasos} paso{pasos === 1 ? "" : "s"}</span>
      {segundosEnVuelo !== undefined ? (
        <>
          <span className={estilos.separador} aria-hidden="true">·</span>
          <span className={estilos.pieza}>trabajando · {segundosEnVuelo} s</span>
        </>
      ) : ms !== undefined ? (
        <>
          <span className={estilos.separador} aria-hidden="true">·</span>
          <span className={estilos.pieza}>{formatearMs(ms)}</span>
        </>
      ) : null}
      {textoDeContexto !== "" && (
        <>
          <span className={estilos.separador} aria-hidden="true">·</span>
          <span className={estilos.pieza}>{textoDeContexto}</span>
        </>
      )}
    </footer>
  );
}
