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
 * es una mentira con forma de cifra. Hoy ningún mensaje del cable trae `contexto`/`tope`
 * (`tipos.ts#Acto` no los declara todavía en `sistema` ni en `fin`); quien llame a este
 * componente pasa `undefined` mientras tanto — listas y campos vacíos en vez de un dato
 * inventado, la misma postura que ya toma `App.tsx` con `<Barra proyectos={[]}>`.
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
}

function formatearMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

/** El texto de `ctx`: cifra pelada sin tope, con `%` solo si hay tope. Cadena vacía sin contexto que medir. */
function formatearContexto(contexto: number | undefined, tope: number | undefined): string {
  if (contexto === undefined || contexto <= 0) return "";
  const porcentaje = tope !== undefined ? ` (${Math.round((contexto / tope) * 100)}%)` : "";
  const sobreTope = tope !== undefined ? `/${tope}` : "";
  return `ctx ${contexto}${sobreTope}${porcentaje}`;
}

export function BarraDeEstado({ turnos, pasos, ms, contexto, tope }: PiezasDeLaBarraDeEstado) {
  const textoDeContexto = formatearContexto(contexto, tope);
  return (
    <footer className={estilos.barra}>
      <span className={estilos.pieza}>{turnos} turno{turnos === 1 ? "" : "s"}</span>
      <span className={estilos.separador} aria-hidden="true">·</span>
      <span className={estilos.pieza}>{pasos} paso{pasos === 1 ? "" : "s"}</span>
      {ms !== undefined && (
        <>
          <span className={estilos.separador} aria-hidden="true">·</span>
          <span className={estilos.pieza}>{formatearMs(ms)}</span>
        </>
      )}
      {textoDeContexto !== "" && (
        <>
          <span className={estilos.separador} aria-hidden="true">·</span>
          <span className={estilos.pieza}>{textoDeContexto}</span>
        </>
      )}
    </footer>
  );
}
