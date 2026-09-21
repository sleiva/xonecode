import { invocarConModelos, PAPEL_DEL_JUEZ } from "../tareas/juezDeTarea.js";
import {
  promptDelJuezDelTurno,
  veredictoDelTurnoDeTexto,
  type HechosDelTurno,
  type VeredictoDelTurno,
} from "../../core/juezDelTurno.js";
import type { ModelosPort } from "../../core/ports.js";

/**
 * El juez del turno cableado a un modelo de verdad.
 *
 * Reusa `invocarConModelos` y `PAPEL_DEL_JUEZ` del juez de TAREAS en vez de repetirlos: es
 * la misma pregunta con otro alcance —«¿esto cumple lo que se pidió?»— y el papel `afilado`
 * está reservado justo para eso. Dos caminos para invocar al juez serían dos sitios donde
 * elegir el modelo, y ya pasó con las cuatro copias de `VARIABLES_POR_PROVEEDOR`.
 *
 * **Lo caro de este juez es lo que NO se le manda.** Ve el objetivo, la respuesta y cuatro
 * hechos medidos; nunca el contenido de un fichero ni el transcript. Por eso una llamada
 * suya cuesta del orden de unos cientos de tokens contra los cientos de miles de un turno,
 * y puede correr en todos sin que se note en la cuenta.
 *
 * **Un fallo suyo NO lanza**: devuelve `dudoso` con el motivo. Es una opinión sobre trabajo
 * que ya está hecho, y el turno lo trata como tal — `turnoReal.ts` también tiene su `catch`,
 * porque un juez que se cae no puede llevarse por delante lo que el turno logró. Aquí se
 * prefiere el veredicto degradado al throw: así el aviso dice «no está claro» en vez de
 * «no se pudo consultar», que es más honesto sobre lo que le pasa a quien lee.
 */
export function crearJuezDelTurno(modelos: ModelosPort): (caso: {
  objetivo: string;
  respuesta: string;
  hechos: HechosDelTurno;
}) => Promise<VeredictoDelTurno> {
  const invocar = invocarConModelos(modelos);
  return async (caso) => {
    try {
      const texto = await invocar(PAPEL_DEL_JUEZ, promptDelJuezDelTurno(caso), "");
      return veredictoDelTurnoDeTexto(texto);
    } catch (error) {
      return {
        cumplimiento: "dudoso",
        motivo: `no se pudo preguntar al juez (${error instanceof Error ? error.name : "error"})`,
      };
    }
  };
}
