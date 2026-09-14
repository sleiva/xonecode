import type { ConsumoDeTurno } from "../tipos.js";
import { CosteDelTurno } from "./CosteDelTurno.js";
/**
 * El cierre de un turno: lo que duró y lo que costó, en una sola cosa.
 *
 * Van juntos porque se leen juntos —«2,6 s · ↑8,8k ↓24»— y porque los dos son del turno
 * ENTERO, no de cada trozo: se los queda el último tramo de trabajo, o el cierre propio si el
 * turno no tuvo ninguno. Componerlos en un solo sitio es lo que impide que un día la duración
 * y el coste salgan por caminos distintos y uno de los dos se quede atrás.
 *
 * Las dos mitades son opcionales y ausente es «no consta», no cero: un turno que no llegó a
 * cerrar no midió su duración, y una sesión escrita antes de que esto existiera no midió su
 * gasto. Sin ninguna de las dos no se pinta nada — quien llama ya lo comprueba, y aquí se
 * devuelve `null` por si acaso.
 */
export function CierreDelTurno({ ms, consumo }: { ms?: number; consumo?: ConsumoDeTurno }): React.ReactElement | null {
  const duracion = ms === undefined ? null : `${Math.round(ms / 100) / 10}s`;
  const coste = consumo === undefined ? null : <CosteDelTurno consumo={consumo} />;
  if (duracion === null && coste === null) return null;
  return (
    <>
      {duracion}
      {duracion !== null && coste !== null ? " · " : null}
      {coste}
    </>
  );
}
