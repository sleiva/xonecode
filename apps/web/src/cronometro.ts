import { useEffect, useState } from "react";

/**
 * Cuántos segundos lleva activo algo: el turno en vuelo, o el PASO en el que está.
 *
 * Medido en pantalla: durante un turno de 116 segundos el pie siguió diciendo «10,7 s»
 * —el tiempo del turno ANTERIOR— y el pulso decía «Trabajando…» sin más. En una pausa de
 * cuarenta segundos sin que cambiara nada no había forma de saber si el agente pensaba o
 * se había colgado. El compositor animado dice «hay algo en marcha»; esto dice desde
 * cuándo, que es lo que permite decidir si esperar o parar.
 *
 * Arranca en el flanco de subida y cuenta con un tic de un segundo; `undefined` mientras
 * no hay nada activo, para que quien pinte no tenga que distinguir «0 s» de «nada».
 *
 * **`clave` lo REARMA sin pararlo.** Con ella se cuenta lo que lleva el PASO actual y no el
 * turno entero, que es otra pregunta: medido con un turno de más de nueve minutos delante,
 * «Trabajando… · 650 s» no distingue un agente que avanza de uno colgado, y lo que lo
 * distingue es si el último paso lleva dos segundos o lleva seis minutos. Ausente = se
 * cuenta el turno, como siempre.
 */
export function useCronometro(activo: boolean, clave?: string): number | undefined {
  const [segundos, setSegundos] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!activo) {
      setSegundos(undefined);
      return;
    }
    const inicio = Date.now();
    setSegundos(0);
    const reloj = setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 1000);
    return () => clearInterval(reloj);
  }, [activo, clave]);
  return segundos;
}
