import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cuánto se espera, como mucho, a que un «Refrescar» tenga respuesta. Pasado esto el botón deja
 * de girar aunque la respuesta no haya llegado: un servidor que no contesta no puede dejarlo
 * girando para siempre, y entonces el botón vuelve a estar a mano para pedirlo otra vez.
 */
export const TOPE_DE_REFRESCO_MS = 30_000;

/**
 * La espera de un «Refrescar» que pide algo por el cable y se entera de la respuesta por un
 * DATO que cambia (la foto nueva que trae el servidor): `empezar()` al pulsar, y deja de esperar
 * cuando `senal` cambia de identidad, cuando se cae el cable o al vencer `TOPE_DE_REFRESCO_MS`.
 *
 * Es el patrón que ya tenía `Equipo.tsx` (`mirando` hasta un `medido` nuevo), sacado a un solo
 * sitio para que todos los botones de refrescar se porten igual. La `senal` se compara por
 * identidad: el store guarda cada respuesta como un objeto NUEVO, así que llegar es cambiar.
 */
export function useEsperaDeRefresco(
  senal: unknown,
  conectado: boolean | undefined,
  /** Cuánto esperar como mucho. Lo que llama a un MODELO tarda más que una medida de git. */
  tope: number = TOPE_DE_REFRESCO_MS
): {
  esperando: boolean;
  empezar: () => void;
} {
  const [esperando, setEsperando] = useState(false);
  const vista = useRef(senal);

  // Llegó la respuesta: la señal es otra.
  useEffect(() => {
    if (vista.current === senal) return;
    vista.current = senal;
    setEsperando(false);
  }, [senal]);

  // Sin cable la petición se perdió: nada que esperar.
  useEffect(() => {
    if (conectado === false) setEsperando(false);
  }, [conectado]);

  // El tope, mientras se espera.
  useEffect(() => {
    if (!esperando) return;
    const temporizador = setTimeout(() => setEsperando(false), tope);
    return () => clearTimeout(temporizador);
  }, [esperando, tope]);

  const empezar = useCallback(() => setEsperando(true), []);
  return { esperando, empezar };
}
