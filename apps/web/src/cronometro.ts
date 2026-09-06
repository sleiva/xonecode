import { useEffect, useState } from "react";

/**
 * Cuántos segundos lleva activo algo: el turno en vuelo.
 *
 * Medido en pantalla: durante un turno de 116 segundos el pie siguió diciendo «10,7 s»
 * —el tiempo del turno ANTERIOR— y el pulso decía «Trabajando…» sin más. En una pausa de
 * cuarenta segundos sin que cambiara nada no había forma de saber si el agente pensaba o
 * se había colgado. El compositor animado dice «hay algo en marcha»; esto dice desde
 * cuándo, que es lo que permite decidir si esperar o parar.
 *
 * Arranca en el flanco de subida y cuenta con un tic de un segundo; `undefined` mientras
 * no hay nada activo, para que quien pinte no tenga que distinguir «0 s» de «nada».
 */
export function useCronometro(activo: boolean): number | undefined {
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
  }, [activo]);
  return segundos;
}
